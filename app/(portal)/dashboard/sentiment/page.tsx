"use client";

import { useMemo, useState } from "react";
import { BrainCircuit, Smile, PhoneCall } from "lucide-react";
import { useCallsContext } from "@/lib/calls-context";
import { CallSlideOver, SentimentBadge } from "@/components/call-slide-over";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { filterByRange, type TimeRange } from "@/lib/time-range";
import { SENTIMENT_LABELS, type SentimentLabel } from "@/lib/sentiment";
import type { Call } from "@/lib/use-calls";

const SENTIMENT_BAR_COLORS: Record<SentimentLabel, string> = {
  satisfied: "#10b981",
  curious: "#0ea5e9",
  neutral: "#a1a1aa",
  anxious: "#f59e0b",
  frustrated: "#f43f5e",
};

function KpiCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</span>
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums capitalize text-zinc-900 dark:text-white">{value}</div>
      {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

export default function SentimentPage() {
  const { calls, loading } = useCallsContext();
  const [range, setRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [openCall, setOpenCall] = useState<Call | null>(null);

  const scoped = useMemo(() => filterByRange(calls, range, customFrom, customTo), [calls, range, customFrom, customTo]);
  const analyzed = useMemo(() => scoped.filter((c) => c.sentiment), [scoped]);

  const counts = useMemo(() => {
    const map = new Map<SentimentLabel, number>(SENTIMENT_LABELS.map((l) => [l, 0]));
    for (const c of analyzed) {
      if (c.sentiment) map.set(c.sentiment, (map.get(c.sentiment) ?? 0) + 1);
    }
    return map;
  }, [analyzed]);

  const topSentiment = useMemo(() => {
    let best: SentimentLabel | null = null;
    let bestCount = 0;
    for (const label of SENTIMENT_LABELS) {
      const n = counts.get(label) ?? 0;
      if (n > bestCount) {
        best = label;
        bestCount = n;
      }
    }
    return best;
  }, [counts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sentiment Analysis</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Priya's read on each caller's emotional state, classified by AI from the call transcript.
          </p>
        </div>
        <TimeRangeFilter
          range={range}
          onRangeChange={setRange}
          customFrom={customFrom}
          onCustomFromChange={setCustomFrom}
          customTo={customTo}
          onCustomToChange={setCustomTo}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard icon={PhoneCall} label="Calls analyzed" value={String(analyzed.length)} sub={`of ${scoped.length} in range`} />
        <KpiCard icon={Smile} label="Most common" value={topSentiment ?? "—"} />
        <KpiCard
          icon={BrainCircuit}
          label="Coverage"
          value={scoped.length ? `${Math.round((analyzed.length / scoped.length) * 100)}%` : "—"}
          sub="calls with a sentiment classification"
        />
      </div>

      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Sentiment breakdown</h3>
        <p className="mt-0.5 text-xs text-zinc-400">Share of analyzed calls in each category.</p>
        <div className="mt-4 space-y-4">
          {analyzed.length === 0 ? (
            <p className="text-sm text-zinc-400">No sentiment data in this range yet.</p>
          ) : (
            SENTIMENT_LABELS.map((label) => {
              const n = counts.get(label) ?? 0;
              const pct = analyzed.length > 0 ? Math.round((n / analyzed.length) * 100) : 0;
              return (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium capitalize text-zinc-600 dark:text-zinc-300">{label}</span>
                    <span className="font-mono tabular-nums text-zinc-400">
                      {n} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: SENTIMENT_BAR_COLORS[label] }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-600 dark:bg-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/70 text-zinc-500 dark:border-zinc-600 dark:bg-zinc-700/50">
                <th className="p-4 font-medium">Timestamp</th>
                <th className="p-4 font-medium">Customer Phone</th>
                <th className="p-4 font-medium">Sentiment</th>
                <th className="p-4 font-medium">AI Insight Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-600">
              {loading && scoped.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-zinc-400 animate-pulse">
                    Loading sentiment data…
                  </td>
                </tr>
              ) : scoped.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-zinc-400">No calls in this range.</td>
                </tr>
              ) : (
                scoped.map((c) => (
                  <tr
                    key={c.uuid}
                    onClick={() => setOpenCall(c)}
                    className="cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-700/30"
                  >
                    <td className="p-4 font-medium whitespace-nowrap">{new Date(c.at).toLocaleString()}</td>
                    <td className="p-4 font-mono">{c.phone || "Anonymous"}</td>
                    <td className="p-4">
                      <SentimentBadge sentiment={c.sentiment} />
                    </td>
                    <td className="p-4 max-w-md truncate text-zinc-600 dark:text-zinc-400" title={c.summary}>{c.summary}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openCall && <CallSlideOver call={openCall} onClose={() => setOpenCall(null)} />}
    </div>
  );
}
