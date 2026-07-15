"use client";

import { useMemo, useRef, useState } from "react";
import { Play, Pause, Search, Sparkles, FileText } from "lucide-react";
import { useCallsContext } from "@/lib/calls-context";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { filterByRange, type TimeRange } from "@/lib/time-range";
import { RatingBadge, mmss, shortDate } from "@/components/call-slide-over";
import type { Call } from "@/lib/use-calls";

function TranscriptTurns({ transcript }: { transcript: string }) {
  const lines = (transcript || "").split("\n").filter(Boolean);
  if (lines.length === 0) {
    return <p className="text-sm text-zinc-400">No transcript captured for this call.</p>;
  }
  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
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
      })}
    </div>
  );
}

function DetailPane({ call }: { call: Call }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    playing ? a.pause() : a.play();
    setPlaying(!playing);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-600">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{call.phone || "Anonymous"}</span>
          <RatingBadge value={call.rating} />
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {shortDate(call.at)} · {mmss(call.durationSec)}
        </p>
      </div>

      {call.summary && (
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-600">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
            <Sparkles className="h-3.5 w-3.5" /> AI summary
          </div>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{call.summary}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <TranscriptTurns transcript={call.transcript} />
      </div>

      {call.recordingUrl && (
        <div className="flex items-center gap-3 border-t border-zinc-200 bg-white px-6 py-3 dark:border-zinc-600 dark:bg-zinc-700">
          <button
            onClick={toggle}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
            aria-label={playing ? "Pause recording" : "Play recording"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 pl-0.5" />}
          </button>
          <div className="min-w-0">
            <div className="text-sm font-medium">Call recording</div>
            <div className="font-mono text-xs text-zinc-400">{mmss(call.durationSec)}</div>
          </div>
          <audio ref={audioRef} src={call.recordingUrl} onEnded={() => setPlaying(false)} preload="none" />
        </div>
      )}
    </div>
  );
}

export default function TranscriptsPage() {
  const { calls, loading } = useCallsContext();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);

  const rangeCalls = useMemo(() => filterByRange(calls, range, customFrom, customTo), [calls, range, customFrom, customTo]);

  const filtered = useMemo(() => {
    const withTranscript = rangeCalls.filter((c) => c.transcript);
    if (!search) return withTranscript;
    const q = search.toLowerCase();
    return withTranscript.filter(
      (c) => c.phone.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q) || c.transcript.toLowerCase().includes(q)
    );
  }, [rangeCalls, search]);

  const selected = filtered.find((c) => c.uuid === selectedUuid) ?? filtered[0] ?? null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transcripts &amp; Summaries</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Browse every call's AI summary and full transcript.</p>
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

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
          <div className="border-b border-zinc-100 p-3 dark:border-zinc-700">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search transcripts…"
                className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex-1 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-700">
            {loading && filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-zinc-400 animate-pulse">Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center">
                <FileText className="mx-auto h-6 w-6 text-zinc-300 dark:text-zinc-600" />
                <p className="mt-2 text-sm text-zinc-400">No transcripts match.</p>
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.uuid}
                  onClick={() => setSelectedUuid(c.uuid)}
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    selected?.uuid === c.uuid ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-zinc-50 dark:hover:bg-zinc-700/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{c.phone || "Anonymous"}</span>
                    <span className="shrink-0 text-[11px] text-zinc-400">{shortDate(c.at)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-zinc-700 dark:text-zinc-300">
                    {c.summary || "No summary generated."}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
          {selected ? (
            <DetailPane call={selected} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-zinc-400 dark:text-zinc-600">
              <FileText className="h-6 w-6" />
              <p className="text-sm">Select a call from the list to read its transcript.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
