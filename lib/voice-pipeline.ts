// lib/voice-pipeline.ts
// The voice-pipeline configurations agent/worker.ts can run, selected
// per-tenant via agent_settings.voice_pipeline. Keep in sync with the branch
// in worker.ts's entrypoint that constructs the AgentSession for each.

export const VOICE_PIPELINES = ["gemini_sarvam", "gemini_native", "openai_full", "sarvam_full", "grok_voice"] as const;
export type VoicePipeline = (typeof VOICE_PIPELINES)[number];

export const VOICE_PIPELINE_INFO: Record<VoicePipeline, { label: string; description: string }> = {
  gemini_sarvam: {
    label: "Gemini + Sarvam (current)",
    description: "Gemini LLM with Sarvam speech-to-text and text-to-speech. Best Indian-language support, in production today.",
  },
  gemini_native: {
    label: "Gemini Native Audio",
    description:
      "Gemini's single realtime audio model handles listening and speaking together, instead of separate STT/TTS steps. Lower latency in theory, but Indian-language/accent quality is unverified — test before relying on it for real patients.",
  },
  openai_full: {
    label: "OpenAI (Whisper + GPT + TTS)",
    description: "OpenAI Whisper for speech-to-text, GPT for the LLM, and OpenAI TTS for the voice — a fully separate stack from Gemini/Sarvam.",
  },
  sarvam_full: {
    label: "Sarvam (LLM + STT + TTS)",
    description:
      "Sarvam-30B for the LLM, alongside Sarvam's own speech-to-text and text-to-speech. Roughly 10x cheaper per token than Gemini, but Indian-language instruction-following and booking-flow reliability are unverified — test thoroughly before relying on it for real patients.",
  },
  grok_voice: {
    label: "xAI Grok Voice",
    description:
      "xAI's single realtime voice model (like Gemini Native Audio) handles listening and speaking together. Billed by call duration ($3/hr) rather than tokens. Supports Hindi, but not the broader regional-language spread Sarvam covers — test before relying on it for real patients.",
  },
};

export function isVoicePipeline(value: unknown): value is VoicePipeline {
  return typeof value === "string" && (VOICE_PIPELINES as readonly string[]).includes(value);
}

export const DEFAULT_VOICE_PIPELINE: VoicePipeline = "gemini_sarvam";
