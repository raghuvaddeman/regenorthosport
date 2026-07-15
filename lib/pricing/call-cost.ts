// Per-call cost estimation for the Gemini Live API (unified STT+LLM+TTS) +
// plain Gemini text (post-call transcript translation/summary) + LiveKit.
//
// Rates verified against official pricing pages on 2026-07-15:
//   Gemini Live: https://ai.google.dev/gemini-api/docs/pricing (gemini-3.1-flash-live-preview row)
//   Gemini text: https://ai.google.dev/gemini-api/docs/pricing
//   LiveKit:     https://livekit.com/pricing
//
// Does NOT include Vobiz's own PSTN/telephony billing — that's separate from
// LiveKit and untrackable from this codebase. The `livekit` cost line only
// covers LiveKit Cloud's own agent-session + SIP-trunk infrastructure.
//
// Sarvam STT/TTS pricing was removed when the voice pipeline switched to the
// Gemini Live API (unified STT+LLM+TTS) — see agent/worker.ts. The `sttCostInr`/
// `ttsCostInr` field names are kept (they map directly to existing `calls` table
// columns of the same name, avoiding a schema migration) but now represent the
// Live API's input-audio-token cost and output-audio-token cost respectively,
// not literal Sarvam STT/TTS charges.

export const PRICING_VERSION = "2026-07-realtime";

// TODO(cost): update when FX moves meaningfully.
export const INR_PER_USD = 95.5;

// Plain text-in/text-out Gemini, used only for post-call transcript
// translation + AI summary (agent/worker.ts's buildTranscriptAndSummary).
export const GEMINI_PRICING: Record<string, { inputPerMTokUsd: number; outputPerMTokUsd: number }> = {
  "gemini-3.1-flash-lite": { inputPerMTokUsd: 0.25, outputPerMTokUsd: 1.5 },
};

// The Live API's conversational model: audio tokens (32/sec in, 25/sec out) are
// priced well above text tokens. See node_modules/@livekit/agents-plugin-google/
// dist/realtime/api_proto.d.ts for the model's token-count metric shape.
export const GEMINI_REALTIME_PRICING: Record<
  string,
  { inputAudioPerMTokUsd: number; outputAudioPerMTokUsd: number; inputTextPerMTokUsd: number; outputTextPerMTokUsd: number }
> = {
  "gemini-3.1-flash-live-preview": {
    inputAudioPerMTokUsd: 3.0,
    outputAudioPerMTokUsd: 12.0,
    inputTextPerMTokUsd: 0.75,
    outputTextPerMTokUsd: 4.5,
  },
};

// TODO(cost): confirm actual LiveKit plan tier — sipTrunkUsdPerMin is the
// midpoint of the $0.003-0.004/min range, which varies by plan.
export const LIVEKIT_PRICING = {
  agentSessionUsdPerMin: 0.01,
  sipTrunkUsdPerMin: 0.0035,
};

const DEFAULT_GEMINI_RATE = GEMINI_PRICING["gemini-3.1-flash-lite"];
const DEFAULT_REALTIME_RATE = GEMINI_REALTIME_PRICING["gemini-3.1-flash-live-preview"];

export type CallUsage = {
  realtimeModel: string;
  inputAudioTokens: number;
  inputTextTokens: number;
  outputAudioTokens: number;
  outputTextTokens: number;
  // Separate plain-text Gemini usage from the post-call translate/summary pass.
  geminiModel: string;
  summaryPromptTokens: number;
  summaryCompletionTokens: number;
  callDurationSec: number;
};

export type CallCostBreakdown = {
  llmCostInr: number;
  sttCostInr: number; // Live API input-audio-token cost (see file header).
  ttsCostInr: number; // Live API output-audio-token cost (see file header).
  livekitCostInr: number;
  totalCostInr: number;
  pricingVersion: string;
};

export function computeCallCost(usage: CallUsage): CallCostBreakdown {
  const realtimeRate = GEMINI_REALTIME_PRICING[usage.realtimeModel];
  if (!realtimeRate) {
    console.warn(
      `No Gemini Live pricing entry for model "${usage.realtimeModel}", falling back to gemini-3.1-flash-live-preview rate.`
    );
  }
  const { inputAudioPerMTokUsd, outputAudioPerMTokUsd, inputTextPerMTokUsd, outputTextPerMTokUsd } =
    realtimeRate ?? DEFAULT_REALTIME_RATE;

  const inputAudioCostUsd = (usage.inputAudioTokens / 1_000_000) * inputAudioPerMTokUsd;
  const outputAudioCostUsd = (usage.outputAudioTokens / 1_000_000) * outputAudioPerMTokUsd;
  const realtimeTextCostUsd =
    (usage.inputTextTokens / 1_000_000) * inputTextPerMTokUsd + (usage.outputTextTokens / 1_000_000) * outputTextPerMTokUsd;

  const geminiRate = GEMINI_PRICING[usage.geminiModel];
  if (!geminiRate) {
    console.warn(`No Gemini pricing entry for model "${usage.geminiModel}", falling back to gemini-3.1-flash-lite rate.`);
  }
  const { inputPerMTokUsd, outputPerMTokUsd } = geminiRate ?? DEFAULT_GEMINI_RATE;
  const summaryCostUsd =
    (usage.summaryPromptTokens / 1_000_000) * inputPerMTokUsd + (usage.summaryCompletionTokens / 1_000_000) * outputPerMTokUsd;

  const llmCostUsd = realtimeTextCostUsd + summaryCostUsd;

  const callDurationMin = usage.callDurationSec / 60;
  const livekitCostUsd = callDurationMin * (LIVEKIT_PRICING.agentSessionUsdPerMin + LIVEKIT_PRICING.sipTrunkUsdPerMin);

  const llmCostInr = llmCostUsd * INR_PER_USD;
  const sttCostInr = inputAudioCostUsd * INR_PER_USD;
  const ttsCostInr = outputAudioCostUsd * INR_PER_USD;
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
