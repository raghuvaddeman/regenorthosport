// app/(portal)/dashboard/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCallsContext } from "@/lib/calls-context";
import type { Call } from "@/lib/use-calls";
import { useAudio } from "@/components/audio-player";
import { CallSlideOver, RatingBadge, mmss, shortDate } from "@/components/call-slide-over";
import { CallsBarChart, RatingDonutChart } from "@/components/charts";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { filterByRange, type TimeRange } from "@/lib/time-range";
import {
  ArrowRight,
  BarChart3,
  MessageSquareText,
  Phone,
  Play,
  Pause,
  PieChart,
  Star,
  TrendingUp,
  TrendingDown,
  PhoneIncoming,
  Clock,
} from "lucide-react";

/* ----------------------------- Small pieces ----------------------------- */

const KPI_TONES = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
} as const;

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  up,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  delta: string;
  up: boolean;
  tone: keyof typeof KPI_TONES;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${KPI_TONES[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 font-mono text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-white">
        {value}
      </div>
      <div
        className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          up
            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
        }`}
      >
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {delta} <span className="font-normal opacity-70">vs last week</span>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
      <div className="mb-5 flex items-center gap-2">
        <Icon className="h-4 w-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/* -------------------------------- The page ------------------------------ */

const RECENT_CALLS_LIMIT = 6;

export default function DashboardPage() {
  const { calls: liveCalls, loading, error } = useCallsContext();
  const [open, setOpen] = useState<Call | null>(null);
  const [range, setRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { currentCall, isPlaying, play } = useAudio();

  const rangeCalls = useMemo(
    () => filterByRange(liveCalls || [], range, customFrom, customTo),
    [liveCalls, range, customFrom, customTo]
  );

  const kpis = useMemo(() => {
    const list = rangeCalls;
    const n = list.length;
    if (n === 0) return { n: 0, avgDur: 0, avgRating: "0.0" };
    const avgDur = Math.round(list.reduce((s, c) => s + (c.durationSec || 0), 0) / n);
    const avgRating = (list.reduce((s, c) => s + (c.rating || 0), 0) / n).toFixed(1);
    return { n, avgDur, avgRating };
  }, [rangeCalls]);

  const recentCalls = useMemo(
    () =>
      [...rangeCalls]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, RECENT_CALLS_LIMIT),
    [rangeCalls]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Live call telemetry from your AI receptionist.
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
          tone="brand"
        />
        <KpiCard
          icon={Clock}
          label="Avg. call duration"
          value={mmss(kpis.avgDur)}
          delta="↓ 4%"
          up={false}
          tone="amber"
        />
        <KpiCard
          icon={Star}
          label="Avg. AI quality rating"
          value={kpis.avgRating}
          delta="↑ 0.3"
          up
          tone="emerald"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Calls over time" icon={BarChart3}>
            <CallsBarChart calls={rangeCalls} />
          </ChartCard>
        </div>
        <ChartCard title="Rating distribution" icon={PieChart}>
          <RatingDonutChart calls={rangeCalls} />
        </ChartCard>
      </div>

      {/* Recent calls */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Recent calls</h3>
          <Link
            href="/dashboard/calls"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            View all in Call Logs <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-700/70">
          {loading && recentCalls.length === 0 && (
            <div className="py-10 text-center text-sm text-zinc-400 animate-pulse">
              Streaming secure backend records...
            </div>
          )}
          {!loading && recentCalls.length === 0 && (
            <div className="py-10 text-center text-sm text-zinc-400">
              No verified call records isolated for this client context.
            </div>
          )}
          {recentCalls.map((c) => {
            const isCurrent = currentCall?.uuid === c.uuid && isPlaying;
            return (
              <div
                key={c.uuid}
                className="group flex cursor-pointer items-center gap-4 px-6 py-3.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700/40"
                onClick={() => setOpen(c)}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-700 dark:text-zinc-500">
                  <Phone className="h-3.5 w-3.5" />
                </div>
                <div className="w-32 shrink-0">
                  <span className="whitespace-nowrap font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {shortDate(c.at)}
                  </span>
                </div>
                <span className="w-28 shrink-0 whitespace-nowrap font-mono text-xs font-medium text-zinc-700 dark:text-zinc-200">
                  {c.phone}
                </span>
                <span className="w-14 shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {mmss(c.durationSec)}
                </span>
                <RatingBadge value={c.rating} />
                <span className="line-clamp-1 flex-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {c.summary}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    play(c);
                  }}
                  disabled={!c.recordingUrl}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-zinc-200 text-zinc-400 transition-colors hover:border-indigo-500 hover:text-indigo-600 disabled:opacity-30 dark:border-zinc-600 dark:hover:text-indigo-400"
                  aria-label={isCurrent ? "Pause recording" : "Play recording"}
                >
                  {isCurrent ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 pl-px" />}
                </button>
                <MessageSquareText className="h-4 w-4 shrink-0 text-zinc-300 group-hover:text-indigo-500 dark:text-zinc-600" />
              </div>
            );
          })}
        </div>
      </div>

      {open && <CallSlideOver call={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
