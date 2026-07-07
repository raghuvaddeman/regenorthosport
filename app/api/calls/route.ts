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

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

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
  duration_sec?: number | null;
  call_duration?: number | null;
  recording_url?: string | null;
  transcript?: string | null;
  summary?: string | null;
  ai_summary?: string | null;
  rating?: number | null;
  ai_rating?: number | null;
  call_at?: string | null;
  call_date_time?: string | null;
  created_at?: string | null;
};

function normalizeRow(row: DbCallRow) {
  const id = row.id ?? row.uuid ?? row.call_uuid ?? crypto.randomUUID();

  return {
    uuid: row.uuid ?? row.call_uuid ?? id,
    clientId: row.client_id ?? "",
    phone: row.phone ?? row.customer_phone ?? "",
    durationSec: Number(row.duration_sec ?? row.call_duration ?? 0),
    recordingUrl: row.recording_url ?? "",
    transcript: row.transcript ?? "",
    summary: row.summary ?? row.ai_summary ?? "",
    rating: Number(row.rating ?? row.ai_rating ?? 0),
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
