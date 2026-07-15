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
    llmModel: string;
    sttModel: string;
    ttsModel: string;
    thinkingBudget: number;
    thinkingLevel: string;
    endpointingMinDelayMs: number;
    endpointingMaxDelayMs: number;
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
