// app/api/campaigns/bulk-call/route.ts
// Dashboard-facing CRUD for bulk-call campaigns. Same tenant-isolation pattern
// as app/api/calls/route.ts: client_id comes from the signed-in Clerk session,
// never from the request body, and every query is scoped to it.

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

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

const TABLE_CAMPAIGNS = "bulk_call_campaigns";
const TABLE_CONTACTS = "bulk_call_contacts";

/** GET: list this tenant's campaigns, each annotated with contact-status counts. */
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
    console.error("Supabase error (list campaigns)", error);
    return NextResponse.json({ error: "Upstream data source rejected the request." }, { status: 502 });
  }

  const campaignIds = (campaigns ?? []).map((c) => c.id);
  const countsByCampaign: Record<string, { pending: number; calling: number; completed: number; failed: number }> = {};

  if (campaignIds.length > 0) {
    const { data: contacts, error: contactsError } = await supabase
      .from(TABLE_CONTACTS)
      .select("campaign_id, status")
      .in("campaign_id", campaignIds);

    if (contactsError) {
      console.error("Supabase error (campaign contact counts)", contactsError);
      return NextResponse.json({ error: "Upstream data source rejected the request." }, { status: 502 });
    }

    for (const row of contacts ?? []) {
      const bucket = (countsByCampaign[row.campaign_id] ??= { pending: 0, calling: 0, completed: 0, failed: 0 });
      if (row.status === "pending") bucket.pending++;
      else if (row.status === "calling") bucket.calling++;
      else if (row.status === "completed") bucket.completed++;
      else if (row.status === "failed") bucket.failed++;
    }
  }

  const result = (campaigns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    fromSipTrunkId: c.from_sip_trunk_id,
    fromNumber: c.from_number,
    concurrentCallLimit: c.concurrent_call_limit,
    totalContacts: c.total_contacts,
    createdAt: c.created_at,
    counts: countsByCampaign[c.id] ?? { pending: 0, calling: 0, completed: 0, failed: 0 },
  }));

  return NextResponse.json({ campaigns: result });
}

/** POST: create a new (draft) campaign plus its contact list. */
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

  const { name, sipTrunkId, fromNumber, concurrentCallLimit, contacts } = body as {
    name?: string;
    sipTrunkId?: string;
    fromNumber?: string;
    concurrentCallLimit?: number;
    contacts?: { name?: string; phone: string }[];
  };

  if (!name?.trim() || !sipTrunkId || !Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json(
      { error: "name, sipTrunkId, and a non-empty contacts list are required." },
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

  const { data: campaign, error: campaignError } = await supabase
    .from(TABLE_CAMPAIGNS)
    .insert({
      client_id: clientId,
      name: name.trim(),
      from_sip_trunk_id: sipTrunkId,
      from_number: fromNumber ?? null,
      concurrent_call_limit: Math.max(1, Math.min(20, concurrentCallLimit ?? 1)),
      status: "draft",
      total_contacts: cleanContacts.length,
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    console.error("Supabase error (create campaign)", campaignError);
    return NextResponse.json({ error: "Failed to create campaign." }, { status: 502 });
  }

  const contactRows = cleanContacts.map((c) => ({
    campaign_id: campaign.id,
    name: c.name,
    phone: c.phone,
    status: "pending",
  }));

  const { error: contactsError } = await supabase.from(TABLE_CONTACTS).insert(contactRows);
  if (contactsError) {
    console.error("Supabase error (insert campaign contacts)", contactsError);
    // Roll back the campaign row so we don't leave an empty, permanently-broken campaign behind.
    await supabase.from(TABLE_CAMPAIGNS).delete().eq("id", campaign.id);
    return NextResponse.json({ error: "Failed to save the contact list." }, { status: 502 });
  }

  return NextResponse.json({ campaign });
}
