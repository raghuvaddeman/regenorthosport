// app/api/campaigns/bulk-call/[id]/route.ts
// Start/pause/cancel a campaign, or delete it. Tenant-scoped the same way as
// the parent route — every query filters on the signed-in Clerk session's
// client_id, so one tenant can't touch another's campaign by guessing an id.

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

const ALLOWED_STATUSES = ["draft", "running", "paused", "cancelled"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // A campaign can only be *resumed into* "running" from draft/paused — not from a
  // terminal state — so a stray retry can't accidentally restart a cancelled campaign.
  if (status === "running") {
    const { data: existing } = await supabase
      .from(TABLE_CAMPAIGNS)
      .select("status")
      .eq("id", id)
      .eq("client_id", clientId)
      .single();
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    if (!["draft", "paused"].includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot start a campaign that is already "${existing.status}".` },
        { status: 400 }
      );
    }
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

  return NextResponse.json({ campaign: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
