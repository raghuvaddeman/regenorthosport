// app/api/campaigns/bulk-call/dispatch/route.ts
//
// The bulk-call engine's tick. Internal-secret authed, called every ~15s by
// agent/worker.ts's startBulkCallDispatcher() — same persistent-process-as-
// clock pattern as the heartbeat POST.
//
// Each tick, across ALL clients:
//   1. Scheduler — any "scheduled" campaign whose scheduled_call_date/time
//      has arrived flips to "in_progress". (Ticking every 15s comfortably
//      covers the "check every 5 minutes" requirement with margin to spare.)
//   2. For every "in_progress" campaign:
//      a. Reconcile in-flight ("calling") contacts — if the LiveKit room has
//         ended, the call is over. If the agent's record_rsvp tool already
//         set an rsvp_status during the call, that's a genuine completion.
//         Otherwise (never answered, or answered but no clear RSVP captured)
//         it's retry-eligible: one retry after a ~30 minute cooldown, then
//         final "no_answer". A call still ringing/connected far longer than
//         any real call should is force-ended the same way.
//      b. Fill free concurrency slots with the next eligible "pending"
//         contacts (first attempt, or past their retry cooldown).
//      c. Mark the campaign "completed" once nothing is pending/calling.

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/telephony/internal-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dispatchOutboundCall, bulkCallRoomIsActive, endBulkCallRoom } from "@/lib/telephony/livekit-sip";

const TABLE_CAMPAIGNS = "bulk_campaigns";
const TABLE_CONTACTS = "bulk_campaign_contacts";

// Safety net: a real webinar-RSVP call shouldn't run this long. If a contact
// is still "calling" past this, force-end it rather than stall the campaign.
const MAX_CALL_MS = 10 * 60 * 1000;
const RETRY_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_RETRIES = 1;

export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  await runScheduler(supabase);

  const { data: campaigns, error: campaignsError } = await supabase
    .from(TABLE_CAMPAIGNS)
    .select("*")
    .eq("status", "in_progress");

  if (campaignsError) {
    console.error("[bulk-call-dispatch] Failed to load in-progress campaigns:", campaignsError);
    return NextResponse.json({ error: "Failed to load campaigns." }, { status: 502 });
  }

  const summary: Record<string, unknown>[] = [];
  for (const campaign of campaigns ?? []) {
    summary.push(await tickCampaign(supabase, campaign));
  }

  return NextResponse.json({ success: true, campaigns: summary });
}

/** Flips any "scheduled" campaign whose scheduled call time has arrived to "in_progress". */
async function runScheduler(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: due, error } = await supabase
    .from(TABLE_CAMPAIGNS)
    .select("id, scheduled_call_date, scheduled_call_time")
    .eq("status", "scheduled");

  if (error || !due) return;

  const now = Date.now();
  const dueIds = due
    .filter((c) => new Date(`${c.scheduled_call_date}T${c.scheduled_call_time}`).getTime() <= now)
    .map((c) => c.id);

  if (dueIds.length > 0) {
    await supabase
      .from(TABLE_CAMPAIGNS)
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .in("id", dueIds);
  }
}

async function tickCampaign(supabase: ReturnType<typeof getSupabaseAdmin>, campaign: any) {
  // 1. Reconcile in-flight contacts.
  const { data: callingContacts } = await supabase
    .from(TABLE_CONTACTS)
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("call_status", "calling");

  for (const contact of callingContacts ?? []) {
    const startedAt = contact.last_attempt_at ? new Date(contact.last_attempt_at).getTime() : 0;
    const ageMs = Date.now() - startedAt;

    let active = false;
    try {
      active = contact.room_name ? await bulkCallRoomIsActive(contact.room_name) : false;
    } catch (err: any) {
      console.warn(`[bulk-call-dispatch] Room check failed for contact ${contact.id}:`, err.message);
      active = true; // assume still active rather than mis-marking a live call as done
    }

    if (active && ageMs > MAX_CALL_MS) {
      if (contact.room_name) await endBulkCallRoom(contact.room_name);
      active = false;
    }

    if (!active) {
      await finishContact(supabase, contact);
    }
  }

  // 2. Fill free concurrency slots with eligible pending contacts.
  const { count: activeCount } = await supabase
    .from(TABLE_CONTACTS)
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("call_status", "calling");

  const freeSlots = campaign.concurrent_call_limit - (activeCount ?? 0);

  if (freeSlots > 0) {
    const retryCutoffIso = new Date(Date.now() - RETRY_COOLDOWN_MS).toISOString();
    const { data: pendingContacts } = await supabase
      .from(TABLE_CONTACTS)
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("call_status", "pending")
      .or(`retry_count.eq.0,last_attempt_at.lte.${retryCutoffIso}`)
      .order("created_at", { ascending: true })
      .limit(freeSlots);

    for (const contact of pendingContacts ?? []) {
      const roomName = `bulk_${campaign.id}_${contact.id}`;
      try {
        await dispatchOutboundCall(campaign.from_sip_trunk_id, contact.phone_number, roomName);
        await supabase
          .from(TABLE_CONTACTS)
          .update({ call_status: "calling", room_name: roomName, last_attempt_at: new Date().toISOString() })
          .eq("id", contact.id);
      } catch (err: any) {
        console.warn(`[bulk-call-dispatch] Dispatch failed for contact ${contact.id}:`, err.message);
        await finishContact(supabase, { ...contact, error_message: err.message || "Failed to place call." });
      }
    }
  }

  // 3. Wrap up the campaign once nothing is left to do.
  const { count: remaining } = await supabase
    .from(TABLE_CONTACTS)
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .in("call_status", ["pending", "calling"]);

  if ((remaining ?? 0) === 0) {
    await supabase
      .from(TABLE_CAMPAIGNS)
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
  }

  return { id: campaign.id, name: campaign.name, freeSlots: Math.max(0, freeSlots), remaining: remaining ?? 0 };
}

/**
 * A "calling" contact's room has ended (or the dial attempt itself failed).
 * If the agent already recorded an RSVP during the call, that's a genuine
 * completion. Otherwise it's retry-eligible once, then a final no_answer.
 */
async function finishContact(supabase: ReturnType<typeof getSupabaseAdmin>, contact: any) {
  // Re-read rsvp_status fresh — the agent's tool call may have set it moments
  // ago, after `contact` was first loaded for this tick.
  const { data: latest } = await supabase
    .from(TABLE_CONTACTS)
    .select("rsvp_status, retry_count")
    .eq("id", contact.id)
    .single();

  if (latest?.rsvp_status) {
    await supabase
      .from(TABLE_CONTACTS)
      .update({ call_status: "completed" })
      .eq("id", contact.id);
    return;
  }

  const retryCount = latest?.retry_count ?? contact.retry_count ?? 0;
  if (retryCount < MAX_RETRIES) {
    await supabase
      .from(TABLE_CONTACTS)
      .update({
        call_status: "pending",
        retry_count: retryCount + 1,
        last_attempt_at: new Date().toISOString(),
        error_message: contact.error_message ?? null,
      })
      .eq("id", contact.id);
  } else {
    await supabase
      .from(TABLE_CONTACTS)
      .update({
        call_status: "no_answer",
        rsvp_status: "no_answer",
        error_message: contact.error_message ?? null,
      })
      .eq("id", contact.id);
  }
}
