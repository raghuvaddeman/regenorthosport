// components/call-slide-over.tsx
"use client";

import { useRef, useState } from "react";
import { Play, Pause, X, Sparkles, Star } from "lucide-react";
import type { Call } from "@/lib/use-calls";

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

/* ------------------------------ Slide-over ------------------------------ */

export function CallSlideOver({ call, onClose }: { call: Call; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

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
