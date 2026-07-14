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
import { CONDITIONS, type Condition } from "@/lib/campaigns/prompt-template";

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
    fromSipTrunkId: c.from_sip_trunk_id,
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

  // Pause/Resume/Cancel send only { status } — handled below unchanged.
  // Anything else is a full-field edit from the Edit Campaign form, which
  // is only allowed while the campaign hasn't started dialing yet.
  const b = body as Record<string, unknown>;
  if (typeof b.status !== "string") {
    return handleCampaignEdit(id, b, clientId);
  }

  const { status } = b as { status?: string };
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

/**
 * Full-field edit from the Edit Campaign form. Only allowed while the
 * campaign is still "scheduled" — once dialing has started (in_progress),
 * been paused, or finished, contacts may already reflect the old script/
 * schedule, so editing underlying fields would be misleading rather than
 * useful.
 *
 * `contacts` is optional: omit it to leave the existing contact list
 * untouched (e.g. just fixing a typo in the doctor's name); include it to
 * fully replace the list (delete + re-insert), same as a fresh upload.
 */
async function handleCampaignEdit(
  id: string,
  b: Record<string, unknown>,
  clientId: string | null
): Promise<NextResponse> {
  if (!clientId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const {
    name,
    doctorName,
    condition,
    webinarDate,
    webinarTime,
    meetingLink,
    scheduledCallDate,
    scheduledCallTime,
    resolvedPrompt,
    sipTrunkId,
    fromNumber,
    concurrentCallLimit,
    contacts,
  } = b as {
    name?: string;
    doctorName?: string;
    condition?: string;
    webinarDate?: string;
    webinarTime?: string;
    meetingLink?: string;
    scheduledCallDate?: string;
    scheduledCallTime?: string;
    resolvedPrompt?: string;
    sipTrunkId?: string;
    fromNumber?: string;
    concurrentCallLimit?: number;
    contacts?: { name?: string; phone: string }[];
  };

  if (
    !name?.trim() ||
    !doctorName?.trim() ||
    !condition ||
    !CONDITIONS.includes(condition as Condition) ||
    !webinarDate ||
    !webinarTime ||
    !scheduledCallDate ||
    !scheduledCallTime ||
    !resolvedPrompt?.trim() ||
    !sipTrunkId
  ) {
    return NextResponse.json(
      {
        error:
          "name, doctorName, condition (Knee/Hip/Spine/Other), webinarDate, webinarTime, scheduledCallDate, " +
          "scheduledCallTime, resolvedPrompt, and sipTrunkId are required.",
      },
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
  if (existing.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot edit a campaign that is already "${existing.status}". Only scheduled campaigns can be edited.` },
      { status: 400 }
    );
  }

  let cleanContacts: { name: string | null; phone: string }[] | null = null;
  if (Array.isArray(contacts)) {
    cleanContacts = contacts
      .map((c) => ({ name: c.name?.trim() || null, phone: c.phone?.trim() }))
      .filter((c): c is { name: string | null; phone: string } => !!c.phone);
    if (cleanContacts.length === 0) {
      return NextResponse.json({ error: "No valid phone numbers found in the contact list." }, { status: 400 });
    }
  }

  const updatePayload: Record<string, unknown> = {
    name: name.trim(),
    doctor_name: doctorName.trim(),
    condition,
    webinar_date: webinarDate,
    webinar_time: webinarTime,
    meeting_link: meetingLink?.trim() || null,
    scheduled_call_date: scheduledCallDate,
    scheduled_call_time: scheduledCallTime,
    resolved_prompt: resolvedPrompt.trim(),
    from_sip_trunk_id: sipTrunkId,
    from_number: fromNumber ?? null,
    concurrent_call_limit: Math.max(1, Math.min(20, concurrentCallLimit ?? 1)),
    updated_at: new Date().toISOString(),
  };
  if (cleanContacts) updatePayload.total_contacts = cleanContacts.length;

  const { data: updated, error } = await supabase
    .from(TABLE_CAMPAIGNS)
    .update(updatePayload)
    .eq("id", id)
    .eq("client_id", clientId)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: `Failed to update campaign: ${error?.message ?? "unknown error"}` },
      { status: 502 }
    );
  }

  if (cleanContacts) {
    await supabase.from(TABLE_CONTACTS).delete().eq("campaign_id", id);
    const rows = cleanContacts.map((c) => ({
      campaign_id: id,
      name: c.name,
      phone_number: c.phone,
      call_status: "pending",
    }));
    const { error: contactsError } = await supabase.from(TABLE_CONTACTS).insert(rows);
    if (contactsError) {
      return NextResponse.json(
        { error: `Campaign updated, but failed to save the new contact list: ${contactsError.message}` },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ campaign: mapCampaign(updated) });
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
