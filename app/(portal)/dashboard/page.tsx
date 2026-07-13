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
  MessageSquareText,
  Play,
  Pause,
  Star,
  TrendingUp,
  TrendingDown,
  PhoneIncoming,
  Clock,
} from "lucide-react";

/* ----------------------------- Small pieces ----------------------------- */

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

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-600 dark:bg-zinc-700">
      <h3 className="mb-4 text-sm font-semibold text-zinc-500 dark:text-zinc-400">{title}</h3>
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
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
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

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Calls over time">
            <CallsBarChart calls={rangeCalls} />
          </ChartCard>
        </div>
        <ChartCard title="Rating distribution">
          <RatingDonutChart calls={rangeCalls} />
        </ChartCard>
      </div>

      {/* Recent calls */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-700">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-600">
          <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Recent calls</h3>
          <Link
            href="/dashboard/calls"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            View all in Call Logs <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-600/70">
          {loading && recentCalls.length === 0 && (
            <div className="py-8 text-center text-sm text-zinc-400 animate-pulse">
              Streaming secure backend records...
            </div>
          )}
          {!loading && recentCalls.length === 0 && (
            <div className="py-8 text-center text-sm text-zinc-400">
              No verified call records isolated for this client context.
            </div>
          )}
          {recentCalls.map((c) => {
            const isCurrent = currentCall?.uuid === c.uuid && isPlaying;
            return (
              <div
                key={c.uuid}
                className="group flex cursor-pointer items-center gap-4 px-5 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-600/40"
                onClick={() => setOpen(c)}
              >
                <span className="w-24 shrink-0 whitespace-nowrap font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {shortDate(c.at)}
                </span>
                <span className="w-28 shrink-0 whitespace-nowrap font-mono text-xs">{c.phone}</span>
                <span className="w-14 shrink-0 whitespace-nowrap font-mono text-xs tabular-nums">
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
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-zinc-200 text-zinc-400 transition-colors hover:border-indigo-500 hover:text-indigo-600 disabled:opacity-30 dark:border-zinc-500 dark:hover:text-indigo-400"
                  aria-label={isCurrent ? "Pause recording" : "Play recording"}
                >
                  {isCurrent ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 pl-px" />}
                </button>
                <MessageSquareText className="h-4 w-4 shrink-0 text-zinc-300 group-hover:text-indigo-500 dark:text-zinc-500" />
              </div>
            );
          })}
        </div>
      </div>

      {open && <CallSlideOver call={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
