// lib/sentiment.ts
// Single source of truth for the 5 sentiment categories Gemini classifies each
// call into (agent/worker.ts's buildTranscriptAndSummary). Keep in sync with
// SENTIMENT_LABELS there if this list ever changes.

export const SENTIMENT_LABELS = ["neutral", "anxious", "frustrated", "curious", "satisfied"] as const;

export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export function isSentimentLabel(value: unknown): value is SentimentLabel {
  return typeof value === "string" && (SENTIMENT_LABELS as readonly string[]).includes(value);
}
