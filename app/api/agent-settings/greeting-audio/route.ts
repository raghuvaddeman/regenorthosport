import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionInfo } from "@/lib/auth/session";
import { isManagerOrAbove } from "@/lib/roles";
import { parseWavPcm16 } from "@/lib/audio/wav";
import { DEFAULTS } from "@/lib/agent-settings-defaults";

const STORAGE_BUCKET = "greeting-audio";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — a greeting clip is a few seconds, this is generous headroom.

function storagePath(clientId: string) {
  return `${clientId}/greeting.wav`;
}

/**
 * POST: Upload a tenant's own greeting audio, replacing the fixed default
 * clip agent/worker.ts otherwise plays. Validated with the exact same
 * parseWavPcm16 parser worker.ts uses for actual playback, so a file that
 * passes here is guaranteed to play at call time — not just "looks like a
 * WAV file" but "meets the codebase's 16-bit-PCM-only requirement".
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionInfo();
    if (!session || !isManagerOrAbove(session.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }
    const { clientId } = session;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: `File too large — max ${MAX_FILE_BYTES / (1024 * 1024)}MB.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      parseWavPcm16(buffer);
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: `Not a usable greeting file: ${err.message} Must be a 16-bit PCM WAV.` },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const path = storagePath(clientId);
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, { contentType: "audio/wav", upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    const url = `${publicUrlData.publicUrl}?v=${Date.now()}`; // cache-bust so a re-upload isn't served stale

    // agent_name/welcome_message/system_prompt are NOT NULL columns. If this tenant has never
    // saved Agent Script before, there's no row to update yet — an upsert touching only
    // greeting_audio_url would try to INSERT a row missing those and get rejected by the DB.
    // Update first; only insert (with full defaults) if no row existed to update.
    const { data: updated, error: updateError } = await supabase
      .from("agent_settings")
      .update({ greeting_audio_url: url, updated_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .select("client_id");
    if (updateError) throw updateError;

    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase.from("agent_settings").insert({
        client_id: clientId,
        agent_name: DEFAULTS.agentName,
        welcome_message: DEFAULTS.welcomeMessage,
        system_prompt: DEFAULTS.systemPrompt,
        greeting_audio_url: url,
        updated_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true, url });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** DELETE: Revert to the fixed default greeting clip. */
export async function DELETE() {
  try {
    const session = await getSessionInfo();
    if (!session || !isManagerOrAbove(session.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }
    const { clientId } = session;

    const supabase = getSupabaseAdmin();
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath(clientId)]);
    // update(), not upsert() — if no row exists yet there's nothing to reset, and inserting one
    // here would hit the same NOT NULL problem the POST handler above works around.
    const { error } = await supabase
      .from("agent_settings")
      .update({ greeting_audio_url: null, updated_at: new Date().toISOString() })
      .eq("client_id", clientId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
