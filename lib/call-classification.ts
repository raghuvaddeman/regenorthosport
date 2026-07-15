// lib/call-classification.ts
// Single source of truth for the categories Gemini classifies each call into,
// in one structured-output call (agent/worker.ts's buildTranscriptAndSummary,
// CLASSIFICATION_RESPONSE_SCHEMA). Keep these lists in sync with the matching
// constants there if they ever change.

export const SENTIMENT_LABELS = ["neutral", "anxious", "frustrated", "curious", "satisfied"] as const;
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export const CALL_LANGUAGES = ["mixed", "english", "hindi", "telugu", "marathi", "kannada"] as const;
export type CallLanguage = (typeof CALL_LANGUAGES)[number];

export const CALL_INTENTS = [
  "appointment",
  "knee_pain",
  "follow_up",
  "neck_pain",
  "other",
  "back_pain",
  "general_inquiry",
  "hip_pain",
  "shoulder_pain",
  "pricing",
  "location",
] as const;
export type CallIntent = (typeof CALL_INTENTS)[number];

export const CALL_OUTCOMES = [
  "booked",
  "info_shared",
  "callback_promised",
  "appointment",
  "call_dropped",
  "other",
  "no_answer",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

function isOneOf<T extends readonly string[]>(labels: T, value: unknown): value is T[number] {
  return typeof value === "string" && (labels as readonly string[]).includes(value);
}

export const isSentimentLabel = (value: unknown): value is SentimentLabel => isOneOf(SENTIMENT_LABELS, value);
export const isCallLanguage = (value: unknown): value is CallLanguage => isOneOf(CALL_LANGUAGES, value);
export const isCallIntent = (value: unknown): value is CallIntent => isOneOf(CALL_INTENTS, value);
export const isCallOutcome = (value: unknown): value is CallOutcome => isOneOf(CALL_OUTCOMES, value);
