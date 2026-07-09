import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isAuthorizedInternalRequest } from "@/lib/telephony/internal-auth";

// Tenant (client_id) is derived from the signed-in Clerk session on the
// server for dashboard requests — same pattern as /api/providers, /api/calls.
async function getClientIdFromSession(): Promise<string | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const fromToken = (sessionClaims?.metadata as { clientId?: string } | undefined)?.clientId;
  if (fromToken) return fromToken;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return (user.publicMetadata.clientId as string | undefined) ?? null;
}

const DEFAULTS = {
  agentName: "Priya",
  welcomeMessage: "Hello. This is Priya from RegenOrthoSport",
  systemPrompt: `You are Priya, the AI front-desk receptionist for RegenOrthoSport, an orthopedic and sports medicine clinic.

- Greet callers warmly and confirm the reason for their call.
- Help schedule, reschedule, or cancel appointments.
- Answer basic questions about clinic hours, location, and accepted insurance.
- Never provide medical advice or diagnoses — offer to connect the caller with clinical staff instead.
- If the caller sounds distressed or describes an emergency, direct them to call 911 immediately.
- Keep responses concise and speak in a calm, professional tone.`,
};

/**
 * GET: Fetch the persisted agent persona (name, welcome message, system
 * prompt) for a tenant. Used by the dashboard (Clerk-authed) to populate the
 * Agent Settings form, and by the standalone agent worker (internal-secret
 * authed, ?client_id=... query param since it has no Clerk session) to load
 * live call behavior.
 */
export async function GET(request: NextRequest) {
  try {
    let clientId: string | null;

    if (isAuthorizedInternalRequest(request)) {
      clientId = request.nextUrl.searchParams.get("client_id");
      if (!clientId) {
        return NextResponse.json(
          { success: false, error: "Missing client_id query param." },
          { status: 400 }
        );
      }
    } else {
      clientId = await getClientIdFromSession();
      if (!clientId) {
        return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
      }
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_settings")
      .select("agent_name, welcome_message, system_prompt")
      .eq("client_id", clientId)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        agentName: data?.agent_name ?? DEFAULTS.agentName,
        welcomeMessage: data?.welcome_message ?? DEFAULTS.welcomeMessage,
        systemPrompt: data?.system_prompt ?? DEFAULTS.systemPrompt,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST: Persist the Agent Settings form's persona fields for the signed-in
 * clinic workspace.
 */
export async function POST(request: NextRequest) {
  try {
    const clientId = await getClientIdFromSession();
    if (!clientId) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const { agentName, welcomeMessage, systemPrompt } = body;

    if (
      typeof agentName !== "string" ||
      typeof welcomeMessage !== "string" ||
      typeof systemPrompt !== "string" ||
      !agentName ||
      !welcomeMessage ||
      !systemPrompt
    ) {
      return NextResponse.json(
        { success: false, error: "agentName, welcomeMessage, and systemPrompt are required." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("agent_settings").upsert(
      {
        client_id: clientId,
        agent_name: agentName,
        welcome_message: welcomeMessage,
        system_prompt: systemPrompt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" }
    );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
