import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isAuthorizedInternalRequest } from "@/lib/telephony/internal-auth";
import { DEFAULT_VOICE_PIPELINE, isVoicePipeline } from "@/lib/voice-pipeline";
import { getSessionInfo } from "@/lib/auth/session";
import { isManagerOrAbove } from "@/lib/roles";
import { DEFAULTS } from "@/lib/agent-settings-defaults";

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
      const session = await getSessionInfo();
      if (!session || !isManagerOrAbove(session.role)) {
        return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
      }
      clientId = session.clientId;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_settings")
      .select(
        "agent_name, welcome_message, system_prompt, outbound_system_prompt, voice_pipeline, knowledge_base, system_prompt_sections, greeting_audio_url"
      )
      .eq("client_id", clientId)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        agentName: data?.agent_name ?? DEFAULTS.agentName,
        welcomeMessage: data?.welcome_message ?? DEFAULTS.welcomeMessage,
        systemPrompt: data?.system_prompt ?? DEFAULTS.systemPrompt,
        // Empty (not defaulted) on purpose — an empty outbound prompt means
        // "fall back to the inbound prompt", decided where the call actually
        // happens (agent/worker.ts), not baked in here.
        outboundSystemPrompt: data?.outbound_system_prompt ?? "",
        voicePipeline: isVoicePipeline(data?.voice_pipeline) ? data.voice_pipeline : DEFAULT_VOICE_PIPELINE,
        // Empty (not defaulted) on purpose — no knowledge base configured means
        // the lookup tool just isn't offered to the LLM (see agent/worker.ts).
        knowledgeBase: data?.knowledge_base ?? "",
        // The Agent Script "Sections" editor's structured view of systemPrompt —
        // null until the tenant first uses it, at which point the UI auto-splits
        // the flat systemPrompt into sections. systemPrompt itself stays the
        // single source of truth agent/worker.ts reads; this is UI-only metadata
        // (which sections exist, their order, and which are enabled) so toggle
        // state survives a reload instead of being re-guessed every time.
        systemPromptSections: data?.system_prompt_sections ?? null,
        // null means "use the fixed default clip in agent/worker.ts" — see
        // app/api/agent-settings/greeting-audio/route.ts for how this gets set.
        greetingAudioUrl: data?.greeting_audio_url ?? null,
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
    const session = await getSessionInfo();
    if (!session || !isManagerOrAbove(session.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }
    const { clientId } = session;

    const body = await request.json();
    const { agentName, welcomeMessage, systemPrompt, outboundSystemPrompt, voicePipeline, knowledgeBase, systemPromptSections } = body;

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

    // Optional — an empty/omitted outbound prompt means "fall back to the inbound one".
    if (outboundSystemPrompt !== undefined && typeof outboundSystemPrompt !== "string") {
      return NextResponse.json(
        { success: false, error: "outboundSystemPrompt must be a string." },
        { status: 400 }
      );
    }

    // Optional — an empty/omitted knowledge base means the lookup tool isn't offered at all.
    if (knowledgeBase !== undefined && typeof knowledgeBase !== "string") {
      return NextResponse.json(
        { success: false, error: "knowledgeBase must be a string." },
        { status: 400 }
      );
    }

    // Optional — UI-only metadata for Agent Script's structured section editor
    // (see GET's comment). Not used by agent/worker.ts, which only reads systemPrompt.
    function isPromptSection(s: unknown): s is { id: string; title: string; content: string; enabled: boolean } {
      if (typeof s !== "object" || s === null) return false;
      const r = s as Record<string, unknown>;
      return typeof r.id === "string" && typeof r.title === "string" && typeof r.content === "string" && typeof r.enabled === "boolean";
    }
    const isValidSections =
      systemPromptSections === undefined ||
      systemPromptSections === null ||
      (Array.isArray(systemPromptSections) && systemPromptSections.every(isPromptSection));
    if (!isValidSections) {
      return NextResponse.json(
        { success: false, error: "systemPromptSections must be an array of {id, title, content, enabled}." },
        { status: 400 }
      );
    }

    if (voicePipeline !== undefined && !isVoicePipeline(voicePipeline)) {
      return NextResponse.json({ success: false, error: "Invalid voicePipeline." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("agent_settings").upsert(
      {
        client_id: clientId,
        agent_name: agentName,
        welcome_message: welcomeMessage,
        system_prompt: systemPrompt,
        outbound_system_prompt: outboundSystemPrompt?.trim() || null,
        voice_pipeline: voicePipeline ?? DEFAULT_VOICE_PIPELINE,
        knowledge_base: knowledgeBase?.trim() || null,
        system_prompt_sections: systemPromptSections ?? null,
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
