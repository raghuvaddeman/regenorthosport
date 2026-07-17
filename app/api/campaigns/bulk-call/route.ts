// app/api/campaigns/bulk-call/route.ts
// Dashboard-facing CRUD for webinar-RSVP bulk-call campaigns. Same tenant
// isolation pattern as app/api/calls/route.ts: client_id comes from the
// signed-in Clerk session, never from the request body.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { CONDITIONS, resolvePromptTemplate, type Condition } from "@/lib/campaigns/prompt-template";
import { getSessionInfo } from "@/lib/auth/session";
import { isManagerOrAbove } from "@/lib/roles";

async function getClientIdFromSession(): Promise<string | null> {
  const session = await getSessionInfo();
  if (!session || !isManagerOrAbove(session.role)) return null;
  return session.clientId;
}

const TABLE_CAMPAIGNS = "bulk_campaigns";
const TABLE_CONTACTS = "bulk_campaign_contacts";

const FALLBACK_OUTBOUND_TEMPLATE =
  "You are Priya, calling on behalf of RegenOrthoSport about a webinar on {{condition}} conditions " +
  "hosted by {{doctor_name}} on {{webinar_date}} at {{webinar_time}}. Thank the lead for registering, " +
  "confirm the webinar details, and ask if they'll be joining. If they say no, briefly and politely ask why. " +
  "Keep the call short, warm, and professional, then close politely.";

/** GET: list this tenant's campaigns, each annotated with rsvp/call-status counts. */
export async function GET() {
  const clientId = await getClientIdFromSession();
  if (!clientId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: campaigns, error } = await supabase
    .from(TABLE_CAMPAIGNS)
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase error (list bulk campaigns)", error);
    return NextResponse.json({ error: "Upstream data source rejected the request." }, { status: 502 });
  }

  const campaignIds = (campaigns ?? []).map((c) => c.id);
  const countsByCampaign: Record<
    string,
    { pending: number; calling: number; yes: number; no: number; noAnswer: number; unclear: number }
  > = {};

  if (campaignIds.length > 0) {
    const { data: contacts, error: contactsError } = await supabase
      .from(TABLE_CONTACTS)
      .select("campaign_id, call_status, rsvp_status")
      .in("campaign_id", campaignIds);

    if (contactsError) {
      console.error("Supabase error (bulk campaign contact counts)", contactsError);
      return NextResponse.json({ error: "Upstream data source rejected the request." }, { status: 502 });
    }

    for (const row of contacts ?? []) {
      const bucket = (countsByCampaign[row.campaign_id] ??= {
        pending: 0,
        calling: 0,
        yes: 0,
        no: 0,
        noAnswer: 0,
        unclear: 0,
      });
      if (row.call_status === "pending") bucket.pending++;
      else if (row.call_status === "calling") bucket.calling++;
      if (row.rsvp_status === "yes") bucket.yes++;
      else if (row.rsvp_status === "no") bucket.no++;
      else if (row.rsvp_status === "no_answer") bucket.noAnswer++;
      else if (row.rsvp_status === "unclear") bucket.unclear++;
    }
  }

  const result = (campaigns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    doctorName: c.doctor_name,
    condition: c.condition,
    webinarDate: c.webinar_date,
    webinarTime: c.webinar_time,
    meetingLink: c.meeting_link,
    scheduledCallDate: c.scheduled_call_date,
    scheduledCallTime: c.scheduled_call_time,
    status: c.status,
    fromNumber: c.from_number,
    concurrentCallLimit: c.concurrent_call_limit,
    totalContacts: c.total_contacts,
    createdAt: c.created_at,
    counts: countsByCampaign[c.id] ?? { pending: 0, calling: 0, yes: 0, no: 0, noAnswer: 0, unclear: 0 },
  }));

  return NextResponse.json({ campaigns: result });
}

/**
 * POST: create a new webinar-RSVP campaign and its contact list.
 *
 * resolvedPrompt is authored client-side (the "Call Script" section on the
 * creation form pre-fills it from the outbound/inbound template and
 * live-updates it as Doctor/Condition/Webinar fields change, until the user
 * edits it directly) and saved verbatim here — this route no longer re-runs
 * placeholder substitution, since the client may have hand-edited the text
 * in ways a second pass shouldn't touch.
 */
export async function POST(request: NextRequest) {
  const clientId = await getClientIdFromSession();
  if (!clientId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
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
  } = body as {
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
    !sipTrunkId ||
    !Array.isArray(contacts) ||
    contacts.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "name, doctorName, condition (Knee/Hip/Spine/Other), webinarDate, webinarTime, scheduledCallDate, " +
          "scheduledCallTime, sipTrunkId, and a non-empty contacts list are required.",
      },
      { status: 400 }
    );
  }

  const cleanContacts = contacts
    .map((c) => ({ name: c.name?.trim() || null, phone: c.phone?.trim() }))
    .filter((c): c is { name: string | null; phone: string } => !!c.phone);

  if (cleanContacts.length === 0) {
    return NextResponse.json({ error: "No valid phone numbers found in the contact list." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Defensive fallback only — the form always pre-fills the Call Script box,
  // so this should be unreachable in practice.
  let finalPrompt = resolvedPrompt?.trim();
  if (!finalPrompt) {
    const { data: agentSettings } = await supabase
      .from("agent_settings")
      .select("system_prompt, outbound_system_prompt")
      .eq("client_id", clientId)
      .maybeSingle();
    const template =
      (agentSettings?.outbound_system_prompt as string | null)?.trim() ||
      (agentSettings?.system_prompt as string | null)?.trim() ||
      FALLBACK_OUTBOUND_TEMPLATE;
    finalPrompt = resolvePromptTemplate(template, {
      doctorName: doctorName.trim(),
      condition,
      webinarDate,
      webinarTime,
    });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from(TABLE_CAMPAIGNS)
    .insert({
      client_id: clientId,
      name: name.trim(),
      doctor_name: doctorName.trim(),
      condition,
      webinar_date: webinarDate,
      webinar_time: webinarTime,
      meeting_link: meetingLink?.trim() || null,
      scheduled_call_date: scheduledCallDate,
      scheduled_call_time: scheduledCallTime,
      resolved_prompt: finalPrompt,
      from_sip_trunk_id: sipTrunkId,
      from_number: fromNumber ?? null,
      concurrent_call_limit: Math.max(1, Math.min(20, concurrentCallLimit ?? 1)),
      status: "scheduled",
      total_contacts: cleanContacts.length,
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    console.error("Supabase error (create bulk campaign)", campaignError);
    return NextResponse.json(
      { error: `Failed to create campaign: ${campaignError?.message ?? "unknown error"}` },
      { status: 502 }
    );
  }

  const contactRows = cleanContacts.map((c) => ({
    campaign_id: campaign.id,
    name: c.name,
    phone_number: c.phone,
    call_status: "pending",
  }));

  const { error: contactsError } = await supabase.from(TABLE_CONTACTS).insert(contactRows);
  if (contactsError) {
    console.error("Supabase error (insert bulk campaign contacts)", contactsError);
    await supabase.from(TABLE_CAMPAIGNS).delete().eq("id", campaign.id);
    return NextResponse.json(
      { error: `Failed to save the contact list: ${contactsError.message}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ campaign });
}
