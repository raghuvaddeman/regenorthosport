// Per-call cost estimation for Gemini LLM + Sarvam STT/TTS + LiveKit.
//
// Rates verified against official pricing pages on 2026-07-12:
//   Gemini:  https://ai.google.dev/gemini-api/docs/pricing
//   Sarvam:  https://docs.sarvam.ai/api-reference-docs/pricing
//   LiveKit: https://livekit.com/pricing
//
// Does NOT include Vobiz's own PSTN/telephony billing — that's separate from
// LiveKit and untrackable from this codebase. The `livekit` cost line only
// covers LiveKit Cloud's own agent-session + SIP-trunk infrastructure.

export const PRICING_VERSION = "2026-07";

// TODO(cost): update when FX moves meaningfully.
export const INR_PER_USD = 95.5;

export const GEMINI_PRICING: Record<string, { inputPerMTokUsd: number; outputPerMTokUsd: number }> = {
  "gemini-3.1-flash-lite": { inputPerMTokUsd: 0.25, outputPerMTokUsd: 1.5 },
};

export const SARVAM_STT_PRICING: Record<string, { inrPerHour: number }> = {
  "saaras:v3": { inrPerHour: 30 },
};

export const SARVAM_TTS_PRICING: Record<string, { inrPer10kChars: number }> = {
  "bulbul:v2": { inrPer10kChars: 15 },
};

// TODO(cost): confirm actual LiveKit plan tier — sipTrunkUsdPerMin is the
// midpoint of the $0.003-0.004/min range, which varies by plan.
export const LIVEKIT_PRICING = {
  agentSessionUsdPerMin: 0.01,
  sipTrunkUsdPerMin: 0.0035,
};

const DEFAULT_GEMINI_RATE = GEMINI_PRICING["gemini-3.1-flash-lite"];
const DEFAULT_SARVAM_STT_RATE = SARVAM_STT_PRICING["saaras:v3"];
const DEFAULT_SARVAM_TTS_RATE = SARVAM_TTS_PRICING["bulbul:v2"];

export type CallUsage = {
  geminiModel: string;
  llmPromptTokens: number;
  llmCompletionTokens: number;
  sttModel: string;
  sttAudioDurationMs: number;
  ttsModel: string;
  ttsCharactersCount: number;
  callDurationSec: number;
};

export type CallCostBreakdown = {
  llmCostInr: number;
  sttCostInr: number;
  ttsCostInr: number;
  livekitCostInr: number;
  totalCostInr: number;
  pricingVersion: string;
};

export function computeCallCost(usage: CallUsage): CallCostBreakdown {
  const geminiRate = GEMINI_PRICING[usage.geminiModel];
  if (!geminiRate) {
    console.warn(`No Gemini pricing entry for model "${usage.geminiModel}", falling back to gemini-3.1-flash-lite rate.`);
  }
  const { inputPerMTokUsd, outputPerMTokUsd } = geminiRate ?? DEFAULT_GEMINI_RATE;
  const llmCostUsd =
    (usage.llmPromptTokens / 1_000_000) * inputPerMTokUsd + (usage.llmCompletionTokens / 1_000_000) * outputPerMTokUsd;

  const sttRate = SARVAM_STT_PRICING[usage.sttModel];
  if (!sttRate) {
    console.warn(`No Sarvam STT pricing entry for model "${usage.sttModel}", falling back to saaras:v3 rate.`);
  }
  const { inrPerHour } = sttRate ?? DEFAULT_SARVAM_STT_RATE;
  const sttCostInr = (usage.sttAudioDurationMs / 3_600_000) * inrPerHour;

  const ttsRate = SARVAM_TTS_PRICING[usage.ttsModel];
  if (!ttsRate) {
    console.warn(`No Sarvam TTS pricing entry for model "${usage.ttsModel}", falling back to bulbul:v2 rate.`);
  }
  const { inrPer10kChars } = ttsRate ?? DEFAULT_SARVAM_TTS_RATE;
  const ttsCostInr = (usage.ttsCharactersCount / 10_000) * inrPer10kChars;

  const callDurationMin = usage.callDurationSec / 60;
  const livekitCostUsd = callDurationMin * (LIVEKIT_PRICING.agentSessionUsdPerMin + LIVEKIT_PRICING.sipTrunkUsdPerMin);

  const llmCostInr = llmCostUsd * INR_PER_USD;
  const livekitCostInr = livekitCostUsd * INR_PER_USD;

  return {
    llmCostInr,
    sttCostInr,
    ttsCostInr,
    livekitCostInr,
    totalCostInr: llmCostInr + sttCostInr + ttsCostInr + livekitCostInr,
    pricingVersion: PRICING_VERSION,
  };
}
