// lib/observability/call-latency.ts
// Shared shape for per-call latency data — written once by agent/worker.ts at
// call end, read by the dashboard (Call Logs column + call detail drawer).
// Stored as a single JSONB column (calls.latency_metrics) rather than flat
// columns, so adding a new field here never requires a migration or a
// coordinated change across worker.ts + the API route + a new dashboard
// surface — every consumer already reads/writes the whole object.

export type CallLatencyTurn = {
  speechId: string;
  eouDelayMs: number;
  llmTtftMs: number;
  ttsTtfbMs: number;
  totalMs: number;
};

export type CallLatencyMetrics = {
  config: {
    voicePipeline?: string;
    llmModel: string;
    // null for the gemini_native pipeline — Gemini's realtime model fuses
    // STT/LLM/TTS into one, so there's no separate STT/TTS stage or
    // endpointing window to report.
    sttModel: string | null;
    ttsModel: string | null;
    thinkingBudget: number;
    thinkingLevel: string;
    endpointingMinDelayMs: number | null;
    endpointingMaxDelayMs: number | null;
  };
  summary: {
    turnCount: number;
    avgTotalMs: number | null;
    minTotalMs: number | null;
    maxTotalMs: number | null;
    avgLlmTtftMs: number | null;
  };
  perTurn: CallLatencyTurn[];
};
