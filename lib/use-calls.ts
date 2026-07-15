// lib/use-calls.ts
// Frontend hook: loads the signed-in tenant's calls from /api/calls.
// Zero dependencies — plain fetch with loading / error / refresh states.
// The hook talks only to our own API route; it never sees Supabase
// credentials or other tenants' data.

"use client";

import { useCallback, useEffect, useState } from "react";
import type { CallLatencyMetrics } from "@/lib/observability/call-latency";
import type { SentimentLabel, CallLanguage, CallIntent, CallOutcome } from "@/lib/call-classification";

export type Call = {
  uuid: string;
  clientId: string;
  phone: string;
  callDirection: "inbound" | "outbound" | null; // null for calls made before this was tracked
  durationSec: number;
  recordingUrl: string;
  transcript: string;
  summary: string;
  sentiment: SentimentLabel | null; // null for calls made before this was tracked, or if classification failed
  callLanguage: CallLanguage | null;
  callIntent: CallIntent | null;
  callOutcome: CallOutcome | null;
  rating: number; // 1–5, 0 when analysis hasn't arrived yet
  costInr: number; // estimated Gemini + Sarvam STT/TTS + LiveKit cost, in INR
  llmCostInr: number;
  sttCostInr: number;
  ttsCostInr: number;
  livekitCostInr: number;
  latencyMetrics: CallLatencyMetrics | null; // null for calls made before this was tracked
  at: string; // ISO datetime
};

type State =
  | { status: "loading"; calls: Call[] }
  | { status: "ready"; calls: Call[] }
  | { status: "error"; calls: Call[]; message: string };

export function useCalls(pollMs?: number) {
  const [state, setState] = useState<State>({ status: "loading", calls: [] });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calls", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { calls } = (await res.json()) as { calls: Call[] };
      setState({ status: "ready", calls });
    } catch (err) {
      setState((prev) => ({
        status: "error",
        calls: prev.calls, // keep showing the last good data
        message: err instanceof Error ? err.message : "Something went wrong.",
      }));
    }
  }, []);

  useEffect(() => {
    load();
    if (!pollMs) return;
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return {
    calls: state.calls,
    loading: state.status === "loading",
    error: state.status === "error" ? state.message : null,
    refresh: load,
  };
}

/* ------------------------------------------------------------------
   Wiring it into app/(portal)/dashboard/page.tsx — three edits:

   1. Add the import and delete the MOCK_CALLS array + local Call type:
        import { useCalls, type Call } from "@/lib/use-calls";

   2. At the top of DashboardPage():
        const { calls: allCalls, loading, error, refresh } = useCalls(30_000);
      (30_000 = refresh every 30s so new calls appear on their own.)

   3. Replace both `MOCK_CALLS` references in the useMemo blocks with
      `allCalls`, and add `allCalls` to each dependency array.

   Empty/error states worth adding to the table body:
     loading  → a few skeleton rows (animate-pulse divs)
     error    → the message + a "Try again" button calling refresh()
     no rows  → "No calls yet. Your AI receptionist's first call will
                 appear here automatically."
------------------------------------------------------------------- */
