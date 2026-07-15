// components/call-slide-over.tsx
"use client";

import { useRef, useState } from "react";
import { Play, Pause, X, Sparkles, Star, ChevronDown, Gauge } from "lucide-react";
import type { Call } from "@/lib/use-calls";
import type { CallLatencyMetrics } from "@/lib/observability/call-latency";
import type { SentimentLabel } from "@/lib/call-classification";

/* ------------------------------- Utilities ------------------------------ */

export const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// Display-only overrides — the underlying client_id (Supabase row isolation,
// Clerk tenant metadata) is left untouched; this only controls what's rendered.
const CLIENT_DISPLAY_NAMES: Record<string, string> = {
  CLIENT_SUNRISE_REALTY: "RegenOrthoSport",
};

export const clientLabel = (id: string) => {
  if (!id) return "unknown";
  return (
    CLIENT_DISPLAY_NAMES[id] ??
    id.replace(/^CLIENT_/, "").replaceAll("_", " ").toLowerCase()
  );
};

/* ----------------------------- Small pieces ----------------------------- */

export function RatingBadge({ value }: { value: number }) {
  const tone =
    value >= 4
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : value === 3
      ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${tone}`}
    >
      <Star className="h-3 w-3 fill-current" />
      {value || 0}.0
    </span>
  );
}

export function CallTypeBadge({ direction }: { direction: "inbound" | "outbound" | null }) {
  if (!direction) {
    return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  }
  const tone =
    direction === "inbound"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
      : "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${tone}`}
    >
      {direction}
    </span>
  );
}

const SENTIMENT_STYLES: Record<SentimentLabel, string> = {
  satisfied: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  curious: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  neutral: "border-zinc-400/30 bg-zinc-400/10 text-zinc-600 dark:text-zinc-400",
  anxious: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  frustrated: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export function SentimentBadge({ sentiment }: { sentiment: SentimentLabel | null }) {
  if (!sentiment) {
    return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  }
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${SENTIMENT_STYLES[sentiment]}`}
    >
      {sentiment}
    </span>
  );
}

/** Plain neutral-styled pill for the higher-cardinality classifications (language/intent/outcome) — too many
 * distinct values for per-category colors to stay meaningful, unlike sentiment's fixed 5. */
export function TagPill({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  }
  return (
    <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium capitalize text-zinc-600 dark:border-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300">
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function LatencyBadge({ latencyMetrics }: { latencyMetrics: CallLatencyMetrics | null }) {
  const avgTotalMs = latencyMetrics?.summary.avgTotalMs;
  if (avgTotalMs == null) {
    return <span className="font-mono text-zinc-300 dark:text-zinc-600">—</span>;
  }
  const tone =
    avgTotalMs <= 1500
      ? "text-emerald-600 dark:text-emerald-400"
      : avgTotalMs <= 2500
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";
  return (
    <span
      className={`font-mono ${tone}`}
      title={`avg over ${latencyMetrics!.summary.turnCount} turns (min ${latencyMetrics!.summary.minTotalMs}ms, max ${latencyMetrics!.summary.maxTotalMs}ms)`}
    >
      {(avgTotalMs / 1000).toFixed(1)}s
    </span>
  );
}

/* ------------------------------ Slide-over ------------------------------ */

export function CallSlideOver({ call, onClose }: { call: Call; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [perfExpanded, setPerfExpanded] = useState(false);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    playing ? a.pause() : a.play();
    setPlaying(!playing);
  };

  const turns = (call.transcript || "").split("\n").map((line, i) => {
    const isAgent = line.startsWith("Agent:");
    return (
      <div key={i} className={`flex ${isAgent ? "" : "justify-end"}`}>
        <div
          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
            isAgent
              ? "border-l-2 border-indigo-500 bg-zinc-100 dark:bg-zinc-600/80"
              : "border-r-2 border-emerald-500 bg-white dark:bg-zinc-700"
          } border border-zinc-200 dark:border-zinc-600`}
        >
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {isAgent ? "AI agent" : "Caller"}
          </span>
          {line.replace(/^(Agent|Caller):\s*/, "")}
        </div>
      </div>
    );
  });

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Call detail ${call.uuid}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-zinc-50 shadow-2xl dark:border-zinc-600 dark:bg-zinc-800"
      >
        <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-600">
          <div>
            <div className="font-mono text-xs text-zinc-400">{call.uuid}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-sm">{call.phone}</span>
              <RatingBadge value={call.rating} />
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {shortDate(call.at)} · {mmss(call.durationSec)} ·{" "}
              <span className="capitalize">{clientLabel(call.clientId)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close call detail"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-600">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
            <Sparkles className="h-3.5 w-3.5" /> AI summary
          </div>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {call.summary}
          </p>
        </div>

        {call.latencyMetrics && (
          <div className="border-b border-zinc-200 dark:border-zinc-600">
            <button
              type="button"
              onClick={() => setPerfExpanded((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-6 py-3 text-left"
            >
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
                <Gauge className="h-3.5 w-3.5" /> Performance
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  avg {call.latencyMetrics.summary.avgTotalMs != null ? `${(call.latencyMetrics.summary.avgTotalMs / 1000).toFixed(1)}s` : "—"} ·{" "}
                  {call.latencyMetrics.summary.turnCount} turns
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${perfExpanded ? "rotate-180" : ""}`} />
              </div>
            </button>
            {perfExpanded && (
              <div className="space-y-3 px-6 pb-4">
                <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <div>
                    Model: <span className="font-mono text-zinc-700 dark:text-zinc-300">{call.latencyMetrics.config.llmModel}</span>
                  </div>
                  <div>
                    STT/TTS:{" "}
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                      {call.latencyMetrics.config.sttModel} / {call.latencyMetrics.config.ttsModel}
                    </span>
                  </div>
                  <div>
                    Endpointing:{" "}
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                      {call.latencyMetrics.config.endpointingMinDelayMs}-{call.latencyMetrics.config.endpointingMaxDelayMs}ms
                    </span>
                  </div>
                  <div>
                    Min/max total:{" "}
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                      {call.latencyMetrics.summary.minTotalMs}-{call.latencyMetrics.summary.maxTotalMs}ms
                    </span>
                  </div>
                </div>
                {call.latencyMetrics.perTurn.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-600">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">Turn</th>
                          <th className="px-2 py-1.5 font-medium">EOU</th>
                          <th className="px-2 py-1.5 font-medium">LLM</th>
                          <th className="px-2 py-1.5 font-medium">TTS</th>
                          <th className="px-2 py-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 font-mono dark:divide-zinc-700">
                        {call.latencyMetrics.perTurn.map((t, i) => (
                          <tr key={t.speechId}>
                            <td className="px-2 py-1 text-zinc-400">{i + 1}</td>
                            <td className="px-2 py-1">{t.eouDelayMs}ms</td>
                            <td className="px-2 py-1">{t.llmTtftMs}ms</td>
                            <td className="px-2 py-1">{t.ttsTtfbMs}ms</td>
                            <td className="px-2 py-1 font-semibold text-zinc-700 dark:text-zinc-300">{t.totalMs}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">{turns}</div>

        <div className="flex items-center gap-3 border-t border-zinc-200 bg-white px-6 py-3 dark:border-zinc-600 dark:bg-zinc-700">
          <button
            onClick={toggle}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500"
            aria-label={playing ? "Pause recording" : "Play recording"}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 pl-0.5" />
            )}
          </button>
          <div className="min-w-0">
            <div className="text-sm font-medium">Call recording</div>
            <div className="font-mono text-xs text-zinc-400">
              {mmss(call.durationSec)}
            </div>
          </div>
          <audio
            ref={audioRef}
            src={call.recordingUrl}
            onEnded={() => setPlaying(false)}
            preload="none"
          />
        </div>
      </aside>
    </>
  );
}
