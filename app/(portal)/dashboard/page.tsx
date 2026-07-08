// app/(portal)/dashboard/page.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useCallsContext } from "@/lib/calls-context";
import type { Call } from "@/lib/use-calls";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Play,
  Pause,
  Star,
  TrendingUp,
  TrendingDown,
  X,
  PhoneIncoming,
  Clock,
  Sparkles,
} from "lucide-react";

/* ------------------------------- Utilities ------------------------------ */

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const clientLabel = (id: string) =>
  id ? id.replace(/^CLIENT_/, "").replaceAll("_", " ").toLowerCase() : "unknown";

/* ----------------------------- Small pieces ----------------------------- */

function RatingBadge({ value }: { value: number }) {
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

function ClientBadge({ id }: { id: string }) {
  return (
    <span className="inline-flex max-w-[11rem] items-center truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs capitalize text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {clientLabel(id)}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  up,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  delta: string;
  up: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </div>
      <div
        className={`mt-1.5 inline-flex items-center gap-1 text-xs font-medium ${
          up
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400"
        }`}
      >
        {up ? (
          <TrendingUp className="h-3.5 w-3.5" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5" />
        )}
        {delta} vs last week
      </div>
    </div>
  );
}

/* ------------------------------ Slide-over ------------------------------ */

function CallSlideOver({ call, onClose }: { call: Call; onClose: () => void }) {
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
              ? "border-l-2 border-indigo-500 bg-zinc-100 dark:bg-zinc-700/80"
              : "border-r-2 border-emerald-500 bg-white dark:bg-zinc-800"
          } border border-zinc-200 dark:border-zinc-700`}
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
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-zinc-50 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
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
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
            <Sparkles className="h-3.5 w-3.5" /> AI summary
          </div>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {call.summary}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">{turns}</div>

        <div className="flex items-center gap-3 border-t border-zinc-200 bg-white px-6 py-3 dark:border-zinc-700 dark:bg-zinc-800">
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

/* -------------------------------- The page ------------------------------ */

type SortKey = "at" | "durationSec" | "rating" | "clientId";

export default function DashboardPage() {
  const { calls: liveCalls, loading, error } = useCallsContext();
  const [sortKey, setSortKey] = useState<SortKey>("at");
  const [asc, setAsc] = useState(false);
  const [open, setOpen] = useState<Call | null>(null);
  const [rowAudio, setRowAudio] = useState<string | null>(null);
  const rowAudioRef = useRef<HTMLAudioElement>(null);

  const processedCalls = useMemo(() => {
    if (!liveCalls) return [];
    const sorted = [...liveCalls].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const cmp =
        typeof va === "number"
          ? va - (vb as number)
          : String(va).localeCompare(String(vb));
      return asc ? cmp : -cmp;
    });
    return sorted as Call[];
  }, [liveCalls, sortKey, asc]);

  const kpis = useMemo(() => {
    const list = liveCalls || [];
    const n = list.length;
    if (n === 0) return { n: 0, avgDur: 0, avgRating: "0.0" };
    const avgDur = Math.round(list.reduce((s, c) => s + (c.durationSec || 0), 0) / n);
    const avgRating = (list.reduce((s, c) => s + (c.rating || 0), 0) / n).toFixed(1);
    return { n, avgDur, avgRating };
  }, [liveCalls]);

  function header(label: string, key: SortKey) {
    const active = sortKey === key;
    return (
      <button
        onClick={() => {
          active ? setAsc(!asc) : (setSortKey(key), setAsc(false));
        }}
        className={`inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 ${
          active ? "text-zinc-900 dark:text-zinc-100" : ""
        }`}
      >
        {label}
        {active ? (
          asc ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  }

  function toggleRowAudio(c: Call) {
    const a = rowAudioRef.current;
    if (!a) return;
    if (rowAudio === c.uuid) {
      a.pause();
      setRowAudio(null);
    } else {
      a.src = c.recordingUrl;
      a.play();
      setRowAudio(c.uuid);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Live call telemetry from your AI receptionist.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-500 border border-rose-500/20">
          Failed to synchronize isolated database stream: {error || "Unauthorized"}
        </div>
      )}

      {/* KPI ribbon */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={PhoneIncoming}
          label="Total inbound calls"
          value={String(kpis.n)}
          delta="↑ 12%"
          up
        />
        <KpiCard
          icon={Clock}
          label="Avg. call duration"
          value={mmss(kpis.avgDur)}
          delta="↓ 4%"
          up={false}
        />
        <KpiCard
          icon={Star}
          label="Avg. AI quality rating"
          value={kpis.avgRating}
          delta="↑ 0.3"
          up
        />
      </div>

      {/* Call logs table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-400 dark:border-zinc-700">
              <tr>
                <th className="px-4 py-3 font-medium">{header("When", "at")}</th>
                <th className="px-4 py-3 font-medium">{header("Client", "clientId")}</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">{header("Duration", "durationSec")}</th>
                <th className="px-4 py-3 font-medium">{header("Rating", "rating")}</th>
                <th className="px-4 py-3 font-medium">AI summary</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Recording</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/70">
              {loading && processedCalls.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-zinc-400 animate-pulse">
                    Streaming secure backend records...
                  </td>
                </tr>
              )}
              {!loading && processedCalls.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-zinc-400">
                    No verified call records isolated for this client context.
                  </td>
                </tr>
              )}
              {processedCalls.map((c) => (
                <tr
                  key={c.uuid}
                  className="group cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700/40"
                  onClick={() => setOpen(c)}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {shortDate(c.at)}
                  </td>
                  <td className="px-4 py-3">
                    <ClientBadge id={c.clientId} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{c.phone}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums">{mmss(c.durationSec)}</td>
                  <td className="px-4 py-3">
                    <RatingBadge value={c.rating} />
                  </td>
                  <td className="max-w-[22rem] px-4 py-3">
                    <span className="line-clamp-1 text-zinc-600 underline-offset-2 group-hover:underline dark:text-zinc-300">
                      {c.summary}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRowAudio(c);
                      }}
                      className={`grid h-7 w-7 place-items-center rounded-full border transition-colors ${
                        rowAudio === c.uuid
                          ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                          : "border-zinc-200 text-zinc-400 hover:border-indigo-500 hover:text-indigo-600 dark:border-zinc-600 dark:hover:text-indigo-400"
                      }`}
                    >
                      {rowAudio === c.uuid ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 pl-px" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <audio ref={rowAudioRef} onEnded={() => setRowAudio(null)} />
      </div>

      {open && <CallSlideOver call={open} onClose={() => setOpen(null)} />}
    </div>
  );
}