// app/(portal)/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCallsContext } from "@/lib/calls-context";
import type { Call } from "@/lib/use-calls";
import {
  CallSlideOver,
  RatingBadge,
  mmss,
  shortDate,
  clientLabel,
} from "@/components/call-slide-over";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Play,
  Pause,
  Star,
  TrendingUp,
  TrendingDown,
  PhoneIncoming,
  Clock,
} from "lucide-react";

/* ----------------------------- Small pieces ----------------------------- */

function ClientBadge({ id }: { id: string }) {
  return (
    <span className="inline-flex max-w-[11rem] items-center truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs capitalize text-zinc-600 dark:border-zinc-500 dark:bg-zinc-700 dark:text-zinc-300">
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
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-600 dark:bg-zinc-700">
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

/* -------------------------------- The page ------------------------------ */

type SortKey = "at" | "durationSec" | "rating" | "clientId";
type TimeRange = "today" | "7d" | "30d" | "90d" | "thisMonth" | "prevMonth" | "all" | "custom";

const RANGE_LABELS: Record<TimeRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  thisMonth: "This month",
  prevMonth: "Previous month",
  all: "All time",
  custom: "Custom range",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/* Custom dropdown, not a native <select> — a native select's popup opens around
   whichever option is currently selected, so with 8 options it can open upward
   and obscure the page. This always opens directly below the trigger button. */
function RangeDropdown({
  range,
  onChange,
}: {
  range: TimeRange;
  onChange: (r: TimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Time range"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-700"
      >
        {RANGE_LABELS[range]}
        <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-700">
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                onChange(r);
                setOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-600 ${
                range === r
                  ? "font-medium text-indigo-600 dark:text-indigo-400"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { calls: liveCalls, loading, error } = useCallsContext();
  const [sortKey, setSortKey] = useState<SortKey>("at");
  const [asc, setAsc] = useState(false);
  const [open, setOpen] = useState<Call | null>(null);
  const [rowAudio, setRowAudio] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const rowAudioRef = useRef<HTMLAudioElement>(null);

  const rangeCalls = useMemo(() => {
    if (!liveCalls) return [];
    const now = new Date();

    switch (range) {
      case "all":
        return liveCalls;
      case "today": {
        const cutoff = startOfDay(now).getTime();
        return liveCalls.filter((c) => new Date(c.at).getTime() >= cutoff);
      }
      case "7d":
      case "30d":
      case "90d": {
        const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
        const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
        return liveCalls.filter((c) => new Date(c.at).getTime() >= cutoff);
      }
      case "thisMonth": {
        const cutoff = startOfMonth(now).getTime();
        return liveCalls.filter((c) => new Date(c.at).getTime() >= cutoff);
      }
      case "prevMonth": {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        const end = startOfMonth(now).getTime();
        return liveCalls.filter((c) => {
          const t = new Date(c.at).getTime();
          return t >= start && t < end;
        });
      }
      case "custom": {
        if (!customFrom && !customTo) return liveCalls;
        const start = customFrom ? startOfDay(new Date(customFrom)).getTime() : -Infinity;
        // "to" is inclusive of the whole day, so the upper bound is the start of the next day.
        const end = customTo
          ? startOfDay(new Date(customTo)).getTime() + 24 * 60 * 60 * 1000
          : Infinity;
        return liveCalls.filter((c) => {
          const t = new Date(c.at).getTime();
          return t >= start && t < end;
        });
      }
      default:
        return liveCalls;
    }
  }, [liveCalls, range, customFrom, customTo]);

  const processedCalls = useMemo(() => {
    const sorted = [...rangeCalls].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const cmp =
        typeof va === "number"
          ? va - (vb as number)
          : String(va).localeCompare(String(vb));
      return asc ? cmp : -cmp;
    });
    return sorted as Call[];
  }, [rangeCalls, sortKey, asc]);

  const kpis = useMemo(() => {
    const list = rangeCalls;
    const n = list.length;
    if (n === 0) return { n: 0, avgDur: 0, avgRating: "0.0" };
    const avgDur = Math.round(list.reduce((s, c) => s + (c.durationSec || 0), 0) / n);
    const avgRating = (list.reduce((s, c) => s + (c.rating || 0), 0) / n).toFixed(1);
    return { n, avgDur, avgRating };
  }, [rangeCalls]);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Live call telemetry from your AI receptionist.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeDropdown range={range} onChange={setRange} />
          {range === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="Custom range start date"
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-700"
              />
              <span className="text-sm text-zinc-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="Custom range end date"
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-700"
              />
            </>
          )}
        </div>
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
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-700">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-400 dark:border-zinc-600">
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
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-600/70">
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
                  className="group cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-600/40"
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
                          : "border-zinc-200 text-zinc-400 hover:border-indigo-500 hover:text-indigo-600 dark:border-zinc-500 dark:hover:text-indigo-400"
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