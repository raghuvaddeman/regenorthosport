// app/(portal)/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCallsContext } from "@/lib/calls-context";
import type { Call } from "@/lib/use-calls";
import { useAudio } from "@/components/audio-player";
import { CallSlideOver, RatingBadge, mmss, shortDate } from "@/components/call-slide-over";
import { CallsLineChart, RatingDonutChart, ratingCounts } from "@/components/charts";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { filterByRange, type TimeRange } from "@/lib/time-range";
import {
  Activity,
  ArrowRight,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageSquareText,
  MoreVertical,
  Play,
  Pause,
  PieChart,
  Sparkles,
  Star,
  TrendingUp,
  TrendingDown,
  PhoneIncoming,
  Clock,
} from "lucide-react";
import { buildRecordingFilename, downloadRecording } from "@/lib/download-recording";

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
    <div className="relative overflow-hidden rounded-2xl border border-brand-100 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-brand-500/20 dark:bg-zinc-800 dark:ring-white/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <svg
            viewBox="0 0 60 24"
            className="pointer-events-none absolute -left-11 h-6 w-14 text-brand-200 dark:text-brand-500/20"
            fill="none"
          >
            <path
              d="M0 12H16L20 3L26 21L30 12H60"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="relative z-10 grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            <Icon className="h-5 w-5" />
          </div>
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
  action,
  children,
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
      <div className="mb-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function CallRowMenu({ call }: { call: Call }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleDownload = async () => {
    setOpen(false);
    setDownloading(true);
    try {
      await downloadRecording(call.recordingUrl, buildRecordingFilename(call));
    } catch (err) {
      console.error("Failed to download recording:", err);
      alert("Couldn't download the recording. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(call.phone);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <Copy className="h-3.5 w-3.5" /> Copy phone number
          </button>
          <button
            type="button"
            disabled={!call.recordingUrl}
            onClick={() => {
              window.open(call.recordingUrl, "_blank", "noopener,noreferrer");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open recording
          </button>
          <button
            type="button"
            disabled={!call.recordingUrl || downloading}
            onClick={handleDownload}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download recording
          </button>
        </div>
      )}
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

  const allPendingRating = useMemo(() => {
    if (rangeCalls.length === 0) return false;
    return ratingCounts(rangeCalls).unrated === rangeCalls.length;
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
        <KpiCard icon={PhoneIncoming} label="Total inbound calls" value={String(kpis.n)} delta="↑ 12%" up />
        <KpiCard icon={Clock} label="Avg. call duration" value={mmss(kpis.avgDur)} delta="↓ 4%" up={false} />
        <KpiCard icon={Star} label="Avg. AI quality rating" value={kpis.avgRating} delta="↑ 0.3" up />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Calls over time" icon={Activity}>
            <CallsLineChart calls={rangeCalls} />
          </ChartCard>
        </div>
        <ChartCard title="Rating distribution" icon={PieChart}>
          <RatingDonutChart calls={rangeCalls} />
          {allPendingRating && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand-50 p-3 dark:bg-brand-500/10">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
              <div>
                <p className="text-xs font-semibold text-brand-700 dark:text-brand-400">
                  All calls are pending rating
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Rate calls to unlock insights</p>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Recent calls */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Recent calls</h3>
          <Link
            href="/dashboard/calls"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            View all in Call Logs <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

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
        {recentCalls.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-700">
                  <th className="px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Date &amp; Time</th>
                  <th className="px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Caller</th>
                  <th className="px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Duration</th>
                  <th className="px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Rating</th>
                  <th className="px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Summary</th>
                  <th className="px-6 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/70">
                {recentCalls.map((c) => {
                  const isCurrent = currentCall?.uuid === c.uuid && isPlaying;
                  return (
                    <tr
                      key={c.uuid}
                      className="group cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700/40"
                      onClick={() => setOpen(c)}
                    >
                      <td className="whitespace-nowrap px-6 py-3.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        {shortDate(c.at)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3.5 font-mono text-xs font-medium text-zinc-700 dark:text-zinc-200">
                        {c.phone}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3.5 font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                        {mmss(c.durationSec)}
                      </td>
                      <td className="px-6 py-3.5">
                        <RatingBadge value={c.rating} />
                        <div className="mt-1 text-[10px] text-zinc-400">{c.rating === 0 ? "Not rated" : "Rated"}</div>
                      </td>
                      <td className="max-w-xs px-6 py-3.5">
                        <span className="line-clamp-1 text-zinc-600 dark:text-zinc-300">{c.summary}</span>
                      </td>
                      <td className="px-6 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => play(c)}
                            disabled={!c.recordingUrl}
                            className="grid h-8 w-8 place-items-center rounded-full border border-brand-200 text-brand-500 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10"
                            aria-label={isCurrent ? "Pause recording" : "Play recording"}
                          >
                            {isCurrent ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 pl-px" />}
                          </button>
                          <button
                            onClick={() => setOpen(c)}
                            className="grid h-8 w-8 place-items-center rounded-full border border-brand-200 text-brand-500 transition-colors hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10"
                            aria-label="View transcript"
                          >
                            <MessageSquareText className="h-3.5 w-3.5" />
                          </button>
                          <CallRowMenu call={c} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <CallSlideOver call={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
