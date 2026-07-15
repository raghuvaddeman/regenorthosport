// app/api/calls/route.ts
// Server-only data gateway between the browser and Supabase.
//
// Security model (the whole point of this file):
//   1. SUPABASE_SERVICE_ROLE_KEY lives in env and never reaches the browser.
//   2. The tenant (client_id) is derived from the signed-in Clerk session on the
//      server — NEVER from a query param or request body. Accepting a
//      client-supplied tenant id would let any logged-in user read any
//      tenant's calls by editing the URL (classic IDOR hole).
//   3. Supabase is queried with .eq("client_id", clientId), so isolation
//      happens at the data source, not in the UI.
//
// Vercel / .env.local:
//   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        (publishable; not used here)
//   SUPABASE_SERVICE_ROLE_KEY=eyJ...            (secret key — server only)
//   SUPABASE_CALLS_TABLE=calls                  (optional, defaults to "calls")
//   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_xxx
//   CLERK_SECRET_KEY=sk_xxx

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isAuthorizedInternalRequest } from "@/lib/telephony/internal-auth";
import { computeCallCost, type CallUsage } from "@/lib/pricing/call-cost";
import type { CallLatencyMetrics } from "@/lib/observability/call-latency";
import { isSentimentLabel, type SentimentLabel } from "@/lib/sentiment";

export const dynamic = "force-dynamic";

/* ------------------------- session → tenant ------------------------- */

async function getClientIdFromSession(): Promise<string | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const fromToken = (
    sessionClaims?.metadata as { clientId?: string } | undefined
  )?.clientId;
  if (fromToken) return fromToken;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return (user.publicMetadata.clientId as string | undefined) ?? null;
}

/* --------------------------- Supabase fetch -------------------------- */

type DbCallRow = {
  id?: string;
  uuid?: string | null;
  call_uuid?: string | null;
  client_id?: string | null;
  phone?: string | null;
  customer_phone?: string | null;
  call_direction?: string | null;
  duration_sec?: number | null;
  call_duration?: number | null;
  recording_url?: string | null;
  transcript?: string | null;
  summary?: string | null;
  ai_summary?: string | null;
  sentiment?: string | null;
  rating?: number | null;
  ai_rating?: number | null;
  call_at?: string | null;
  call_date_time?: string | null;
  created_at?: string | null;
  total_cost_inr?: number | null;
  llm_cost_inr?: number | null;
  stt_cost_inr?: number | null;
  tts_cost_inr?: number | null;
  livekit_cost_inr?: number | null;
  latency_metrics?: CallLatencyMetrics | null;
};

function normalizeRow(row: DbCallRow) {
  const id = row.id ?? row.uuid ?? row.call_uuid ?? crypto.randomUUID();

  return {
    uuid: row.uuid ?? row.call_uuid ?? id,
    clientId: row.client_id ?? "",
    phone: row.phone ?? row.customer_phone ?? "",
    callDirection:
      row.call_direction === "inbound" || row.call_direction === "outbound" ? row.call_direction : null,
    durationSec: Number(row.duration_sec ?? row.call_duration ?? 0),
    recordingUrl: row.recording_url ?? "",
    transcript: row.transcript ?? "",
    summary: row.summary ?? row.ai_summary ?? "",
    sentiment: isSentimentLabel(row.sentiment) ? row.sentiment : null,
    rating: Number(row.rating ?? row.ai_rating ?? 0),
    costInr: Number(row.total_cost_inr ?? 0),
    llmCostInr: Number(row.llm_cost_inr ?? 0),
    sttCostInr: Number(row.stt_cost_inr ?? 0),
    ttsCostInr: Number(row.tts_cost_inr ?? 0),
    livekitCostInr: Number(row.livekit_cost_inr ?? 0),
    latencyMetrics: row.latency_metrics ?? null,
    at:
      row.call_at ??
      row.call_date_time ??
      row.created_at ??
      new Date().toISOString(),
  };
}

export async function GET() {
  const clientId = await getClientIdFromSession();
  if (!clientId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json(
      { error: "Server is missing Supabase configuration." },
      { status: 500 }
    );
  }

  const table = process.env.SUPABASE_CALLS_TABLE ?? "calls";
  const pageSize = 500;
  const rows: DbCallRow[] = [];
  let from = 0;

  try {
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false, nullsFirst: false })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("Supabase error", error);
        return NextResponse.json(
          { error: "Upstream data source rejected the request." },
          { status: 502 }
        );
      }

      const page = (data ?? []) as DbCallRow[];
      rows.push(...page);

      if (page.length < pageSize) break;
      from += pageSize;
    }
  } catch (err) {
    console.error("Supabase fetch failed", err);
    return NextResponse.json(
      { error: "Could not reach the data source." },
      { status: 502 }
    );
  }

  const calls = rows.map(normalizeRow);
  return NextResponse.json({ calls });
}

/* --------------------------- worker call-cost report --------------------------- */

/**
 * POST: Creates a `calls` row with usage-derived cost, called once by the
 * standalone agent worker at the end of each call. Internal-secret authed only
 * (?client_id=... query param, no Clerk session) — the dashboard never writes
 * calls, only reads them. Cost is recomputed here from raw usage, never trusted
 * from the worker, so pricing-constant changes take effect without redeploying it.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const clientId = request.nextUrl.searchParams.get("client_id");
  if (!clientId) {
    return NextResponse.json(
      { success: false, error: "Missing client_id query param." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const {
      clientId: bodyClientId,
      callUuid,
      customerPhone,
      callDirection,
      durationSec,
      ttsAudioDurationMs,
      usage,
      recordingUrl,
      transcript,
      aiSummary,
      sentiment,
      latencyMetrics,
    } = body as {
      clientId?: string;
      callUuid?: string;
      customerPhone?: string;
      callDirection?: "inbound" | "outbound";
      durationSec?: number;
      ttsAudioDurationMs?: number;
      usage?: CallUsage;
      recordingUrl?: string | null;
      transcript?: string | null;
      aiSummary?: string | null;
      sentiment?: SentimentLabel | null;
      latencyMetrics?: CallLatencyMetrics | null;
    };

    if (bodyClientId !== clientId) {
      return NextResponse.json(
        { success: false, error: "client_id query param and body do not match." },
        { status: 400 }
      );
    }
    if (!callUuid || !usage) {
      return NextResponse.json(
        { success: false, error: "callUuid and usage are required." },
        { status: 400 }
      );
    }

    const cost = computeCallCost(usage);

    const supabase = getSupabaseAdmin();
    const table = process.env.SUPABASE_CALLS_TABLE ?? "calls";
    const { error } = await supabase.from(table).insert({
      client_id: clientId,
      call_uuid: callUuid,
      customer_phone: customerPhone ?? "",
      call_direction: callDirection ?? null,
      duration_sec: durationSec ?? usage.callDurationSec,
      llm_prompt_tokens: usage.llmPromptTokens,
      llm_completion_tokens: usage.llmCompletionTokens,
      stt_audio_duration_ms: usage.sttAudioDurationMs,
      tts_characters_count: usage.ttsCharactersCount,
      tts_audio_duration_ms: ttsAudioDurationMs ?? null,
      recording_url: recordingUrl ?? null,
      transcript: transcript ?? null,
      ai_summary: aiSummary ?? null,
      sentiment: sentiment ?? null,
      latency_metrics: latencyMetrics ?? null,
      llm_cost_inr: cost.llmCostInr,
      stt_cost_inr: cost.sttCostInr,
      tts_cost_inr: cost.ttsCostInr,
      livekit_cost_inr: cost.livekitCostInr,
      total_cost_inr: cost.totalCostInr,
      pricing_version: cost.pricingVersion,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Call cost insert failed", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
