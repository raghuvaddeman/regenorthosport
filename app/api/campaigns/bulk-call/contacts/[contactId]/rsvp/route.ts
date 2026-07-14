// app/api/campaigns/bulk-call/contacts/[contactId]/rsvp/route.ts
//
// Called directly by the agent's record_rsvp function-tool (agent/worker.ts)
// during a live outbound call — this is the structured-capture path the
// requirements call for, not transcript parsing after the fact.

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/telephony/internal-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE_CONTACTS = "bulk_campaign_contacts";
const RSVP_VALUES = ["yes", "no", "unclear"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { contactId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { rsvpStatus, feedbackNote } = body as { rsvpStatus?: string; feedbackNote?: string };
  if (!rsvpStatus || !RSVP_VALUES.includes(rsvpStatus as (typeof RSVP_VALUES)[number])) {
    return NextResponse.json(
      { error: `rsvpStatus must be one of: ${RSVP_VALUES.join(", ")}.` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from(TABLE_CONTACTS)
    .update({
      rsvp_status: rsvpStatus,
      feedback_note: rsvpStatus === "no" ? feedbackNote?.trim() || null : null,
    })
    .eq("id", contactId);

  if (error) {
    console.error("Supabase error (record rsvp)", error);
    return NextResponse.json({ error: "Failed to record RSVP." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
