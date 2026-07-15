// Per-call cost estimation across all three voice pipelines (lib/voice-pipeline.ts):
// Gemini LLM + Sarvam STT/TTS, Gemini Native Audio (realtime), and OpenAI
// Whisper + GPT + TTS — plus LiveKit infra cost, common to all three.
//
// Rates verified against official pricing pages / OpenAI's own docs on 2026-07-15:
//   Gemini (text + Live API): https://ai.google.dev/gemini-api/docs/pricing
//   Sarvam:                   https://docs.sarvam.ai/api-reference-docs/pricing
//   OpenAI:                   https://developers.openai.com/api/docs/pricing
//   LiveKit:                  https://livekit.com/pricing
//
// Does NOT include Vobiz's own PSTN/telephony billing — that's separate from
// LiveKit and untrackable from this codebase. The `livekit` cost line only
// covers LiveKit Cloud's own agent-session + SIP-trunk infrastructure.

export const PRICING_VERSION = "2026-07";

// TODO(cost): update when FX moves meaningfully.
export const INR_PER_USD = 95.5;

// Text-generation LLM pricing, keyed by model name — covers both the Gemini
// text model (gemini_sarvam pipeline, and the classification/translation
// calls every pipeline makes) and OpenAI's chat model (openai_full pipeline).
export const LLM_PRICING: Record<string, { inputPerMTokUsd: number; outputPerMTokUsd: number }> = {
  "gemini-3.1-flash-lite": { inputPerMTokUsd: 0.25, outputPerMTokUsd: 1.5 },
  "gpt-5-mini": { inputPerMTokUsd: 0.25, outputPerMTokUsd: 2.0 },
};

// STT pricing, keyed by model name — Sarvam (gemini_sarvam) and OpenAI Whisper (openai_full).
export const STT_PRICING: Record<string, { inrPerHour: number }> = {
  "saaras:v3": { inrPerHour: 30 },
  // $0.006/min = $0.36/hr.
  "whisper-1": { inrPerHour: 0.36 * INR_PER_USD },
};

// TTS pricing, keyed by model name — Sarvam (gemini_sarvam) and OpenAI (openai_full).
export const TTS_PRICING: Record<string, { inrPer10kChars: number }> = {
  "bulbul:v2": { inrPer10kChars: 15 },
  // $15/1M chars = $0.15/10k chars.
  "tts-1": { inrPer10kChars: 0.15 * INR_PER_USD },
};

// Gemini Live API (native audio, gemini_native pipeline) — a single realtime
// model, so it has its own audio+text input/output token rates instead of the
// separate LLM/STT/TTS split above. Per-minute equivalents from the pricing
// page ($0.005/min in, $0.018/min out) aren't used here since we get exact
// token counts from RealtimeModelMetrics.
export const GEMINI_LIVE_PRICING: Record<
  string,
  { textInputPerMTokUsd: number; audioInputPerMTokUsd: number; textOutputPerMTokUsd: number; audioOutputPerMTokUsd: number }
> = {
  "gemini-3.1-flash-live-preview": {
    textInputPerMTokUsd: 0.75,
    audioInputPerMTokUsd: 3.0,
    textOutputPerMTokUsd: 4.5,
    audioOutputPerMTokUsd: 12.0,
  },
};

// TODO(cost): confirm actual LiveKit plan tier — sipTrunkUsdPerMin is the
// midpoint of the $0.003-0.004/min range, which varies by plan.
export const LIVEKIT_PRICING = {
  agentSessionUsdPerMin: 0.01,
  sipTrunkUsdPerMin: 0.0035,
};

const DEFAULT_LLM_RATE = LLM_PRICING["gemini-3.1-flash-lite"];
const DEFAULT_STT_RATE = STT_PRICING["saaras:v3"];
const DEFAULT_TTS_RATE = TTS_PRICING["bulbul:v2"];
const DEFAULT_GEMINI_LIVE_RATE = GEMINI_LIVE_PRICING["gemini-3.1-flash-live-preview"];

export type StandardCallUsage = {
  kind: "standard";
  llmModel: string;
  llmPromptTokens: number;
  llmCompletionTokens: number;
  sttModel: string;
  sttAudioDurationMs: number;
  ttsModel: string;
  ttsCharactersCount: number;
  callDurationSec: number;
};

// gemini_native's usage shape: one fused model, so there's no meaningful way
// to split "STT" vs "TTS" cost — computeRealtimeCallCost() puts it all under
// llmCostInr and leaves sttCostInr/ttsCostInr at 0.
export type RealtimeCallUsage = {
  kind: "realtime";
  llmModel: string;
  inputTextTokens: number;
  inputAudioTokens: number;
  outputTextTokens: number;
  outputAudioTokens: number;
  callDurationSec: number;
};

export type CallUsage = StandardCallUsage | RealtimeCallUsage;

export type CallCostBreakdown = {
  llmCostInr: number;
  sttCostInr: number;
  ttsCostInr: number;
  livekitCostInr: number;
  totalCostInr: number;
  pricingVersion: string;
};

function computeLivekitCostInr(callDurationSec: number): number {
  const callDurationMin = callDurationSec / 60;
  const livekitCostUsd = callDurationMin * (LIVEKIT_PRICING.agentSessionUsdPerMin + LIVEKIT_PRICING.sipTrunkUsdPerMin);
  return livekitCostUsd * INR_PER_USD;
}

function computeStandardCallCost(usage: StandardCallUsage): CallCostBreakdown {
  const llmRate = LLM_PRICING[usage.llmModel];
  if (!llmRate) {
    console.warn(`No LLM pricing entry for model "${usage.llmModel}", falling back to gemini-3.1-flash-lite rate.`);
  }
  const { inputPerMTokUsd, outputPerMTokUsd } = llmRate ?? DEFAULT_LLM_RATE;
  const llmCostUsd =
    (usage.llmPromptTokens / 1_000_000) * inputPerMTokUsd + (usage.llmCompletionTokens / 1_000_000) * outputPerMTokUsd;

  const sttRate = STT_PRICING[usage.sttModel];
  if (!sttRate) {
    console.warn(`No STT pricing entry for model "${usage.sttModel}", falling back to saaras:v3 rate.`);
  }
  const { inrPerHour } = sttRate ?? DEFAULT_STT_RATE;
  const sttCostInr = (usage.sttAudioDurationMs / 3_600_000) * inrPerHour;

  const ttsRate = TTS_PRICING[usage.ttsModel];
  if (!ttsRate) {
    console.warn(`No TTS pricing entry for model "${usage.ttsModel}", falling back to bulbul:v2 rate.`);
  }
  const { inrPer10kChars } = ttsRate ?? DEFAULT_TTS_RATE;
  const ttsCostInr = (usage.ttsCharactersCount / 10_000) * inrPer10kChars;

  const llmCostInr = llmCostUsd * INR_PER_USD;
  const livekitCostInr = computeLivekitCostInr(usage.callDurationSec);

  return {
    llmCostInr,
    sttCostInr,
    ttsCostInr,
    livekitCostInr,
    totalCostInr: llmCostInr + sttCostInr + ttsCostInr + livekitCostInr,
    pricingVersion: PRICING_VERSION,
  };
}

function computeRealtimeCallCost(usage: RealtimeCallUsage): CallCostBreakdown {
  const rate = GEMINI_LIVE_PRICING[usage.llmModel];
  if (!rate) {
    console.warn(`No Gemini Live pricing entry for model "${usage.llmModel}", falling back to gemini-3.1-flash-live-preview rate.`);
  }
  const { textInputPerMTokUsd, audioInputPerMTokUsd, textOutputPerMTokUsd, audioOutputPerMTokUsd } = rate ?? DEFAULT_GEMINI_LIVE_RATE;

  const llmCostUsd =
    (usage.inputTextTokens / 1_000_000) * textInputPerMTokUsd +
    (usage.inputAudioTokens / 1_000_000) * audioInputPerMTokUsd +
    (usage.outputTextTokens / 1_000_000) * textOutputPerMTokUsd +
    (usage.outputAudioTokens / 1_000_000) * audioOutputPerMTokUsd;

  const llmCostInr = llmCostUsd * INR_PER_USD;
  const livekitCostInr = computeLivekitCostInr(usage.callDurationSec);

  return {
    llmCostInr,
    sttCostInr: 0,
    ttsCostInr: 0,
    livekitCostInr,
    totalCostInr: llmCostInr + livekitCostInr,
    pricingVersion: PRICING_VERSION,
  };
}

export function computeCallCost(usage: CallUsage): CallCostBreakdown {
  return usage.kind === "realtime" ? computeRealtimeCallCost(usage) : computeStandardCallCost(usage);
}

// buildTranscriptAndSummary (agent/worker.ts) always runs post-call translation/
// classification on a fixed Gemini model, independent of which pipeline drove the
// live call — priced here at that fixed rate rather than usage.llmModel's rate,
// which varies by pipeline.
const CLASSIFICATION_MODEL = "gemini-3.1-flash-lite";

export function computeClassificationCostInr(promptTokens: number, completionTokens: number): number {
  const rate = LLM_PRICING[CLASSIFICATION_MODEL];
  const usd = (promptTokens / 1_000_000) * rate.inputPerMTokUsd + (completionTokens / 1_000_000) * rate.outputPerMTokUsd;
  return usd * INR_PER_USD;
}
