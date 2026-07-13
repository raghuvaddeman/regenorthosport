// components/charts.tsx
// Lightweight, dependency-free charts (plain SVG / CSS) for the Dashboard
// summary — matches the rest of the app's handcrafted-bars approach rather
// than pulling in a charting library for two visuals.
"use client";

import type { Call } from "@/lib/use-calls";

/* ----------------------------- Calls per day ----------------------------- */

export function CallsBarChart({ calls }: { calls: Call[] }) {
  const buckets = new Map<string, number>();
  for (const c of calls) {
    const key = new Date(c.at).toISOString().slice(0, 10); // YYYY-MM-DD
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const days = [...buckets.keys()].sort();
  const maxCount = Math.max(1, ...buckets.values());

  if (days.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
        No calls in this range yet.
      </div>
    );
  }

  const label = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  return (
    <div className="flex h-48 items-end gap-2 overflow-x-auto pb-1">
      {days.map((key) => {
        const count = buckets.get(key)!;
        const heightPct = Math.max(5, (count / maxCount) * 100);
        return (
          <div key={key} className="flex min-w-[30px] flex-1 flex-col items-center gap-2">
            <div className="flex h-36 w-full items-end border-b border-zinc-100 dark:border-zinc-700/70">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 to-indigo-400 shadow-[0_1px_6px_rgba(79,70,229,0.35)] transition-all duration-300 hover:from-indigo-700 hover:to-indigo-400 dark:from-indigo-500 dark:to-indigo-400"
                style={{ height: `${heightPct}%` }}
                title={`${count} call${count === 1 ? "" : "s"} on ${label(key)}`}
              />
            </div>
            <span className="text-[10px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
              {count}
            </span>
            <span className="whitespace-nowrap text-[9px] text-zinc-400 dark:text-zinc-500">
              {label(key)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Rating donut ------------------------------ */

const RATING_SEGMENTS = [
  { key: "high", label: "4-5 stars", color: "#10b981" },
  { key: "mid", label: "3 stars", color: "#f59e0b" },
  { key: "low", label: "1-2 stars", color: "#f43f5e" },
  { key: "unrated", label: "Not yet rated", color: "#d4d4d8" },
] as const;

export function RatingDonutChart({ calls }: { calls: Call[] }) {
  const counts = { high: 0, mid: 0, low: 0, unrated: 0 };
  for (const c of calls) {
    if (c.rating === 0) counts.unrated++;
    else if (c.rating >= 4) counts.high++;
    else if (c.rating === 3) counts.mid++;
    else counts.low++;
  }
  const total = calls.length;

  if (total === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
        No calls in this range yet.
      </div>
    );
  }

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  // Small visual gap between segments — insets each dash length slightly, leaving a hairline of background showing.
  const gap = total > 1 ? 3 : 0;
  const dashes = RATING_SEGMENTS.map((seg) =>
    Math.max(0, (counts[seg.key] / total) * circumference - gap)
  );
  const offsets = dashes.map((_, i) =>
    RATING_SEGMENTS.slice(0, i).reduce((sum, seg) => sum + (counts[seg.key] / total) * circumference, 0)
  );

  const arcs = RATING_SEGMENTS.map((seg, i) => (
    <circle
      key={seg.key}
      cx="80"
      cy="80"
      r={radius}
      fill="none"
      stroke={seg.color}
      strokeWidth="18"
      strokeLinecap="round"
      strokeDasharray={`${dashes[i]} ${circumference - dashes[i]}`}
      strokeDashoffset={-offsets[i]}
      transform="rotate(-90 80 80)"
    />
  ));

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0 drop-shadow-[0_6px_10px_rgba(0,0,0,0.08)]">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="currentColor" strokeWidth="18" className="text-zinc-100 dark:text-zinc-700/60" />
        {arcs}
        <text
          x="80"
          y="76"
          textAnchor="middle"
          className="fill-zinc-900 text-2xl font-bold dark:fill-zinc-50"
        >
          {total}
        </text>
        <text x="80" y="94" textAnchor="middle" className="fill-zinc-400 text-[10px] font-medium uppercase tracking-wider">
          calls
        </text>
      </svg>
      <div className="min-w-[9rem] space-y-2.5 text-sm">
        {RATING_SEGMENTS.map((seg) => {
          const value = counts[seg.key];
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={seg.key} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-800"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-zinc-600 dark:text-zinc-300">{seg.label}</span>
              <span className="ml-auto font-mono text-xs tabular-nums text-zinc-400">
                {value} <span className="text-zinc-300 dark:text-zinc-600">·</span> {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
