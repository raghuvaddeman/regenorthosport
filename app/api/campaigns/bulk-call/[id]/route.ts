// app/api/campaigns/bulk-call/[id]/route.ts
//
// Dual-authed, same pattern as /api/agent-settings:
//   - Clerk session (dashboard): full campaign detail + contact list, tenant-scoped.
//   - x-internal-secret (agent/worker.ts): fetches resolved_prompt for an
//     outbound bulk call. No client_id scoping needed there — the campaign
//     id is a UUID the worker only learns from a room name it dialed itself.

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isAuthorizedInternalRequest } from "@/lib/telephony/internal-auth";

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

const TABLE_CAMPAIGNS = "bulk_campaigns";
const TABLE_CONTACTS = "bulk_campaign_contacts";

const ALLOWED_STATUSES = ["in_progress", "paused", "cancelled"] as const;

function mapCampaign(c: any) {
  return {
    id: c.id,
    name: c.name,
    doctorName: c.doctor_name,
    condition: c.condition,
    webinarDate: c.webinar_date,
    webinarTime: c.webinar_time,
    meetingLink: c.meeting_link,
    scheduledCallDate: c.scheduled_call_date,
    scheduledCallTime: c.scheduled_call_time,
    resolvedPrompt: c.resolved_prompt,
    status: c.status,
    fromNumber: c.from_number,
    concurrentCallLimit: c.concurrent_call_limit,
    totalContacts: c.total_contacts,
    createdAt: c.created_at,
  };
}

function mapContact(c: any) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone_number,
    callStatus: c.call_status,
    rsvpStatus: c.rsvp_status,
    feedbackNote: c.feedback_note,
    retryCount: c.retry_count,
    lastAttemptAt: c.last_attempt_at,
    errorMessage: c.error_message,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  if (isAuthorizedInternalRequest(request)) {
    const { data: campaign, error } = await supabase.from(TABLE_CAMPAIGNS).select("*").eq("id", id).single();
    if (error || !campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    return NextResponse.json({ campaign: mapCampaign(campaign) });
  }

  const clientId = await getClientIdFromSession();
  if (!clientId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: campaign, error } = await supabase
    .from(TABLE_CAMPAIGNS)
    .select("*")
    .eq("id", id)
    .eq("client_id", clientId)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const { data: contacts, error: contactsError } = await supabase
    .from(TABLE_CONTACTS)
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  if (contactsError) {
    return NextResponse.json({ error: "Failed to load contacts." }, { status: 502 });
  }

  return NextResponse.json({ campaign: mapCampaign(campaign), contacts: (contacts ?? []).map(mapContact) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clientId = await getClientIdFromSession();
  if (!clientId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { status } = body as { status?: string };
  if (!status || !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from(TABLE_CAMPAIGNS)
    .select("status")
    .eq("id", id)
    .eq("client_id", clientId)
    .single();
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const validTransitions: Record<string, string[]> = {
    in_progress: ["scheduled", "paused"], // resume, or the scheduler flips scheduled->in_progress itself
    paused: ["scheduled", "in_progress"],
    cancelled: ["scheduled", "in_progress", "paused"],
  };
  if (!validTransitions[status]?.includes(existing.status)) {
    return NextResponse.json(
      { error: `Cannot move a "${existing.status}" campaign to "${status}".` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from(TABLE_CAMPAIGNS)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("client_id", clientId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  return NextResponse.json({ campaign: mapCampaign(data) });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clientId = await getClientIdFromSession();
  if (!clientId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from(TABLE_CAMPAIGNS).delete().eq("id", id).eq("client_id", clientId);
  if (error) {
    return NextResponse.json({ error: "Failed to delete campaign." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
