// app/api/campaigns/bulk-call/dispatch/route.ts
//
// The bulk-call engine's "tick". Internal-secret authed (no Clerk session) —
// called every ~15s by agent/worker.ts's startBulkCallDispatcher(), the same
// persistent-process-as-clock pattern already used for the heartbeat POST.
//
// Runs across ALL clients' "running" campaigns in one pass:
//   1. Reconcile in-flight ("calling") contacts — if their LiveKit room has
//      ended, the call is over; mark it completed. If it's been ringing/
//      connected far longer than any real call should, force-end it.
//   2. Fill any free concurrency slots by dialing the next "pending" contacts.
//   3. Mark a campaign "completed" once it has no pending/calling contacts left.
//
// Deliberately simple for v1: call outcome is just "the room ended" — no
// answered/no-answer/busy disposition. That level of detail would need a
// LiveKit webhook subscription, which is a separate piece of infrastructure.

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/telephony/internal-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dispatchOutboundCall, bulkCallRoomIsActive, endBulkCallRoom } from "@/lib/telephony/livekit-sip";

const TABLE_CAMPAIGNS = "bulk_call_campaigns";
const TABLE_CONTACTS = "bulk_call_contacts";

// Safety net: a real call shouldn't ring/talk this long. If a contact is still
// "calling" past this, something's stuck (e.g. the room never got cleaned up) —
// force-end it so the campaign doesn't stall forever on one bad contact.
const MAX_CALL_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: campaigns, error: campaignsError } = await supabase
    .from(TABLE_CAMPAIGNS)
    .select("*")
    .eq("status", "running");

  if (campaignsError) {
    console.error("[bulk-call-dispatch] Failed to load running campaigns:", campaignsError);
    return NextResponse.json({ error: "Failed to load campaigns." }, { status: 502 });
  }

  const summary: Record<string, unknown>[] = [];

  for (const campaign of campaigns ?? []) {
    const campaignSummary = await tickCampaign(supabase, campaign);
    summary.push(campaignSummary);
  }

  return NextResponse.json({ success: true, campaigns: summary });
}

async function tickCampaign(supabase: ReturnType<typeof getSupabaseAdmin>, campaign: any) {
  // 1. Reconcile in-flight contacts.
  const { data: callingContacts } = await supabase
    .from(TABLE_CONTACTS)
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("status", "calling");

  for (const contact of callingContacts ?? []) {
    const startedAt = contact.attempted_at ? new Date(contact.attempted_at).getTime() : 0;
    const ageMs = Date.now() - startedAt;

    let active = false;
    try {
      active = contact.room_name ? await bulkCallRoomIsActive(contact.room_name) : false;
    } catch (err: any) {
      console.warn(`[bulk-call-dispatch] Room check failed for contact ${contact.id}:`, err.message);
      active = true; // assume still active rather than mis-marking a live call as done
    }

    if (!active) {
      await supabase
        .from(TABLE_CONTACTS)
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", contact.id);
    } else if (ageMs > MAX_CALL_MS) {
      if (contact.room_name) await endBulkCallRoom(contact.room_name);
      await supabase
        .from(TABLE_CONTACTS)
        .update({ status: "failed", error_message: "Call exceeded the maximum duration and was ended.", completed_at: new Date().toISOString() })
        .eq("id", contact.id);
    }
  }

  // 2. Fill free concurrency slots with new calls.
  const { count: activeCount } = await supabase
    .from(TABLE_CONTACTS)
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("status", "calling");

  const freeSlots = campaign.concurrent_call_limit - (activeCount ?? 0);

  if (freeSlots > 0) {
    const { data: pendingContacts } = await supabase
      .from(TABLE_CONTACTS)
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(freeSlots);

    for (const contact of pendingContacts ?? []) {
      const roomName = `bulk_${campaign.id}_${contact.id}`;
      try {
        await dispatchOutboundCall(campaign.from_sip_trunk_id, contact.phone, roomName);
        await supabase
          .from(TABLE_CONTACTS)
          .update({ status: "calling", room_name: roomName, attempted_at: new Date().toISOString() })
          .eq("id", contact.id);
      } catch (err: any) {
        console.warn(`[bulk-call-dispatch] Dispatch failed for contact ${contact.id}:`, err.message);
        await supabase
          .from(TABLE_CONTACTS)
          .update({ status: "failed", error_message: err.message || "Failed to place call.", completed_at: new Date().toISOString() })
          .eq("id", contact.id);
      }
    }
  }

  // 3. Wrap up the campaign once nothing is left to do.
  const { count: remaining } = await supabase
    .from(TABLE_CONTACTS)
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "calling"]);

  if ((remaining ?? 0) === 0) {
    await supabase.from(TABLE_CAMPAIGNS).update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", campaign.id);
  }

  return { id: campaign.id, name: campaign.name, freeSlots: Math.max(0, freeSlots), remaining: remaining ?? 0 };
}
