// Per-call cost estimation across all voice pipelines (lib/voice-pipeline.ts):
// Gemini LLM + Sarvam STT/TTS, Gemini Native Audio (realtime), OpenAI
// Whisper + GPT + TTS, Sarvam LLM + STT/TTS, xAI Grok Voice (realtime), and
// GPT-4.1 Mini + Soniox + Cartesia — plus LiveKit infra cost, common to all of them.
//
// Rates verified against official pricing pages / vendor docs on 2026-07-15
// (xAI added 2026-07-18, Soniox/Cartesia added 2026-07-20):
//   Gemini (text + Live API): https://ai.google.dev/gemini-api/docs/pricing
//   Sarvam:                   https://docs.sarvam.ai/api-reference-docs/pricing
//   OpenAI:                   https://developers.openai.com/api/docs/pricing
//   xAI:                      https://docs.x.ai/developers/pricing
//   Soniox:                   https://soniox.com/pricing
//   Cartesia:                 https://www.cartesia.ai/pricing
//   LiveKit:                  https://livekit.com/pricing
//
// Does NOT include Vobiz's own PSTN/telephony billing — that's separate from
// LiveKit and untrackable from this codebase. The `livekit` cost line only
// covers LiveKit Cloud's own agent-session + SIP-trunk infrastructure.

export const PRICING_VERSION = "2026-07";

// TODO(cost): update when FX moves meaningfully.
export const INR_PER_USD = 95.5;

// Text-generation LLM pricing, keyed by model name — covers the Gemini text
// model (gemini_sarvam pipeline, and the classification/translation calls
// every pipeline makes), OpenAI's chat model (openai_full pipeline), Sarvam's
// LLM (sarvam_full pipeline), and GPT-4.1 Mini (soniox_cartesia pipeline).
export const LLM_PRICING: Record<string, { inputPerMTokUsd: number; outputPerMTokUsd: number }> = {
  "gemini-3.1-flash-lite": { inputPerMTokUsd: 0.25, outputPerMTokUsd: 1.5 },
  "gpt-5-mini": { inputPerMTokUsd: 0.25, outputPerMTokUsd: 2.0 },
  // Sarvam publishes these in INR (₹2.5/₹10 per 1M input/output tokens as of 2026-07-16,
  // per docs.sarvam.ai) — converted to USD/1M here to match this table's unit, so the
  // conversion undoes itself back to the original INR rate in computeStandardCallCost().
  "sarvam-30b": { inputPerMTokUsd: 2.5 / INR_PER_USD, outputPerMTokUsd: 10 / INR_PER_USD },
  // ₹4/₹16 per 1M input/output tokens.
  "sarvam-105b": { inputPerMTokUsd: 4 / INR_PER_USD, outputPerMTokUsd: 16 / INR_PER_USD },
  // $0.40/$1.60 per 1M input/output tokens (soniox_cartesia pipeline) — per
  // developers.openai.com/api/docs/models/gpt-4.1-mini as of 2026-07-20.
  "gpt-4.1-mini": { inputPerMTokUsd: 0.40, outputPerMTokUsd: 1.60 },
};

// STT pricing, keyed by model name — Sarvam (gemini_sarvam), OpenAI Whisper (openai_full),
// and Soniox (soniox_cartesia).
export const STT_PRICING: Record<string, { inrPerHour: number }> = {
  "saaras:v3": { inrPerHour: 30 },
  // $0.006/min = $0.36/hr.
  "whisper-1": { inrPerHour: 0.36 * INR_PER_USD },
  // $0.12/hr for Soniox's real-time streaming endpoint (soniox_cartesia pipeline uses
  // stt-rt-v4) — per soniox.com/pricing as of 2026-07-20. Async/file transcription is
  // cheaper ($0.10/hr) but not what a live call uses.
  "stt-rt-v4": { inrPerHour: 0.12 * INR_PER_USD },
};

// TTS pricing, keyed by model name — Sarvam (gemini_sarvam), OpenAI (openai_full),
// and Cartesia (soniox_cartesia).
export const TTS_PRICING: Record<string, { inrPer10kChars: number }> = {
  "bulbul:v2": { inrPer10kChars: 15 },
  // 2x bulbul:v2's rate, and explicitly "beta pricing" per Sarvam's pricing page as of
  // 2026-07-16 — re-verify if it looks off, more likely to move than the v2 rate.
  "bulbul:v3": { inrPer10kChars: 30 },
  // $15/1M chars = $0.15/10k chars.
  "tts-1": { inrPer10kChars: 0.15 * INR_PER_USD },
  // TODO(cost): Cartesia (soniox_cartesia pipeline, sonic-3) doesn't publish a flat
  // pay-as-you-go per-character rate — it bills via monthly subscription credits
  // (1 credit/char) at a tier-dependent rate. Using the entry paid tier's rate ($5/mo
  // for 100k credits = $0.05/1k chars = $0.50/10k chars) as of cartesia.ai/pricing on
  // 2026-07-20 — revisit if the actual plan tier in use differs.
  "sonic-3": { inrPer10kChars: 0.50 * INR_PER_USD },
};

// Gemini Live API (native audio, gemini_native pipeline) — a single realtime
// model, so it has its own audio+text input/output token rates instead of the
// separate LLM/STT/TTS split above. Per-minute equivalents from the pricing
// page ($0.005/min in, $0.018/min out) aren't used here since we get exact
// token counts from RealtimeModelMetrics.
export const REALTIME_MODEL_PRICING: Record<
  string,
  { textInputPerMTokUsd: number; audioInputPerMTokUsd: number; textOutputPerMTokUsd: number; audioOutputPerMTokUsd: number }
> = {
  // gemini-3.1-flash-live-preview dropped as the pinned model (agent/worker.ts) — it
  // silently breaks the welcome greeting (see GEMINI_LIVE_PIPELINE_DEFAULTS comment
  // there) — but its rate stays here in case a call still reports it (e.g. one placed
  // before this fix deployed).
  "gemini-3.1-flash-live-preview": {
    textInputPerMTokUsd: 0.75,
    audioInputPerMTokUsd: 3.0,
    textOutputPerMTokUsd: 4.5,
    audioOutputPerMTokUsd: 12.0,
  },
  "gemini-2.5-flash-native-audio-preview-12-2025": {
    textInputPerMTokUsd: 0.5,
    audioInputPerMTokUsd: 3.0,
    textOutputPerMTokUsd: 2.0,
    audioOutputPerMTokUsd: 12.0,
  },
};

// xAI Grok Voice (realtime, grok_voice pipeline) — unlike Gemini Live, xAI
// bills this purely by connection duration ($0.05/min = $3/hr as of
// docs.x.ai/developers/pricing on 2026-07-18), not by token counts, so it
// gets its own flat-rate table and cost function below rather than reusing
// REALTIME_MODEL_PRICING's per-token shape.
export const REALTIME_DURATION_PRICING: Record<string, { usdPerHour: number }> = {
  "grok-voice-think-fast-1.0": { usdPerHour: 3.0 },
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
const DEFAULT_REALTIME_RATE = REALTIME_MODEL_PRICING["gemini-2.5-flash-native-audio-preview-12-2025"];
const DEFAULT_REALTIME_DURATION_RATE = REALTIME_DURATION_PRICING["grok-voice-think-fast-1.0"];

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

// grok_voice's usage shape: also a fused model, but billed by connection
// duration rather than tokens (see REALTIME_DURATION_PRICING) — no token
// counts needed here even though the [LATENCY] logs still capture them for
// visibility.
export type RealtimeDurationCallUsage = {
  kind: "realtime_duration";
  llmModel: string;
  callDurationSec: number;
};

export type CallUsage = StandardCallUsage | RealtimeCallUsage | RealtimeDurationCallUsage;

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
  const rate = REALTIME_MODEL_PRICING[usage.llmModel];
  if (!rate) {
    console.warn(`No realtime-model pricing entry for model "${usage.llmModel}", falling back to gemini-2.5-flash-native-audio-preview-12-2025 rate.`);
  }
  const { textInputPerMTokUsd, audioInputPerMTokUsd, textOutputPerMTokUsd, audioOutputPerMTokUsd } = rate ?? DEFAULT_REALTIME_RATE;

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

function computeRealtimeDurationCallCost(usage: RealtimeDurationCallUsage): CallCostBreakdown {
  const rate = REALTIME_DURATION_PRICING[usage.llmModel];
  if (!rate) {
    console.warn(`No realtime-duration pricing entry for model "${usage.llmModel}", falling back to grok-voice-think-fast-1.0 rate.`);
  }
  const { usdPerHour } = rate ?? DEFAULT_REALTIME_DURATION_RATE;

  const llmCostInr = (usage.callDurationSec / 3600) * usdPerHour * INR_PER_USD;
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
  if (usage.kind === "realtime") return computeRealtimeCallCost(usage);
  if (usage.kind === "realtime_duration") return computeRealtimeDurationCallCost(usage);
  return computeStandardCallCost(usage);
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
