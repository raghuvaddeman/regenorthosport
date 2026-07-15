// components/charts.tsx
// Lightweight, dependency-free charts (plain SVG / CSS) for the Dashboard
// summary — matches the rest of the app's handcrafted-visuals approach
// rather than pulling in a charting library for two visuals.
"use client";

import { useId } from "react";
import type { Call } from "@/lib/use-calls";

/* ----------------------------- Calls per day ----------------------------- */

const CHART_W = 700;
const CHART_H = 260;
const PAD_L = 34;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 30;

export function CallsLineChart({ calls }: { calls: Call[] }) {
  const gradientId = useId();

  const buckets = new Map<string, number>();
  for (const c of calls) {
    const key = new Date(c.at).toISOString().slice(0, 10); // YYYY-MM-DD
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const days = [...buckets.keys()].sort();

  if (days.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
        No calls in this range yet.
      </div>
    );
  }

  const label = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  const counts = days.map((d) => buckets.get(d)!);
  const maxCount = Math.max(...counts);
  const niceMax = Math.max(2, Math.ceil(maxCount / 2) * 2);
  const tickCount = 6;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((niceMax / tickCount) * i));

  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const baselineY = PAD_T + plotH;

  const points = days.map((d, i) => {
    const x = PAD_L + (days.length === 1 ? plotW / 2 : (i / (days.length - 1)) * plotW);
    const y = PAD_T + (1 - buckets.get(d)! / niceMax) * plotH;
    return { x, y, day: d, count: buckets.get(d)! };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${baselineY} L${points[0].x},${baselineY} Z`;

  const last = points[points.length - 1];
  const tooltipW = 64;
  const tooltipX = Math.min(Math.max(last.x - tooltipW / 2, PAD_L), CHART_W - PAD_R - tooltipW);
  const tooltipY = Math.max(last.y - 52, 4);

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="h-64 w-full">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* gridlines + y-axis labels */}
      {ticks.map((t) => {
        const y = PAD_T + (1 - t / niceMax) * plotH;
        return (
          <g key={t}>
            <line
              x1={PAD_L}
              y1={y}
              x2={CHART_W - PAD_R}
              y2={y}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 4"
              className="text-zinc-100 dark:text-zinc-700/60"
            />
            <text x={PAD_L - 8} y={y + 3} textAnchor="end" className="fill-zinc-400 text-[9px]">
              {t}
            </text>
          </g>
        );
      })}

      {/* x-axis labels */}
      {points.map((p) => (
        <text
          key={p.day}
          x={p.x}
          y={CHART_H - 8}
          textAnchor="middle"
          className="fill-zinc-400 text-[9px]"
        >
          {label(p.day)}
        </text>
      ))}

      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke="var(--color-brand-600)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {points.map((p, i) => (
        <circle
          key={p.day}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 5 : 3}
          fill={i === points.length - 1 ? "var(--color-brand-600)" : "white"}
          stroke="var(--color-brand-600)"
          strokeWidth="2"
        >
          <title>
            {p.count} call{p.count === 1 ? "" : "s"} on {label(p.day)}
          </title>
        </circle>
      ))}

      {/* highlight tooltip on the most recent day */}
      <g>
        <rect
          x={tooltipX}
          y={tooltipY}
          width={tooltipW}
          height={40}
          rx={8}
          className="fill-white stroke-zinc-200 dark:fill-zinc-800 dark:stroke-zinc-600"
          strokeWidth="1"
        />
        <text x={tooltipX + tooltipW / 2} y={tooltipY + 16} textAnchor="middle" className="fill-zinc-700 text-[10px] font-semibold dark:fill-zinc-200">
          {label(last.day)}
        </text>
        <text x={tooltipX + tooltipW / 2} y={tooltipY + 30} textAnchor="middle" className="fill-zinc-400 text-[9px]">
          {last.count} call{last.count === 1 ? "" : "s"}
        </text>
      </g>
    </svg>
  );
}

/* ------------------------------ Rating donut ------------------------------ */

const RATING_SEGMENTS = [
  { key: "high", label: "4-5 stars", color: "#10b981" },
  { key: "mid", label: "3 stars", color: "#f59e0b" },
  { key: "low", label: "1-2 stars", color: "#f43f5e" },
  { key: "unrated", label: "Not yet rated", color: "#d4d4d8" },
] as const;

export function ratingCounts(calls: Call[]) {
  const counts = { high: 0, mid: 0, low: 0, unrated: 0 };
  for (const c of calls) {
    if (c.rating === 0) counts.unrated++;
    else if (c.rating >= 4) counts.high++;
    else if (c.rating === 3) counts.mid++;
    else counts.low++;
  }
  return counts;
}

export function RatingDonutChart({ calls }: { calls: Call[] }) {
  const counts = ratingCounts(calls);
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

/* ------------------------------ Spend per day ------------------------------ */

export function SpendLineChart({ calls }: { calls: Call[] }) {
  const gradientId = useId();

  const buckets = new Map<string, number>();
  for (const c of calls) {
    const key = new Date(c.at).toISOString().slice(0, 10); // YYYY-MM-DD
    buckets.set(key, (buckets.get(key) ?? 0) + c.costInr);
  }
  const days = [...buckets.keys()].sort();

  if (days.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
        No calls in this range yet.
      </div>
    );
  }

  const label = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  const spends = days.map((d) => buckets.get(d)!);
  const maxSpend = Math.max(...spends);
  const niceMax = Math.max(1, Math.ceil(maxSpend / 5) * 5);
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((niceMax / tickCount) * i));

  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const baselineY = PAD_T + plotH;

  const points = days.map((d, i) => {
    const x = PAD_L + (days.length === 1 ? plotW / 2 : (i / (days.length - 1)) * plotW);
    const y = PAD_T + (1 - buckets.get(d)! / niceMax) * plotH;
    return { x, y, day: d, spend: buckets.get(d)! };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${baselineY} L${points[0].x},${baselineY} Z`;

  const last = points[points.length - 1];
  const tooltipW = 74;
  const tooltipX = Math.min(Math.max(last.x - tooltipW / 2, PAD_L), CHART_W - PAD_R - tooltipW);
  const tooltipY = Math.max(last.y - 52, 4);

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="h-64 w-full">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t) => {
        const y = PAD_T + (1 - t / niceMax) * plotH;
        return (
          <g key={t}>
            <line
              x1={PAD_L}
              y1={y}
              x2={CHART_W - PAD_R}
              y2={y}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 4"
              className="text-zinc-100 dark:text-zinc-700/60"
            />
            <text x={PAD_L - 8} y={y + 3} textAnchor="end" className="fill-zinc-400 text-[9px]">
              ₹{t}
            </text>
          </g>
        );
      })}

      {points.map((p) => (
        <text key={p.day} x={p.x} y={CHART_H - 8} textAnchor="middle" className="fill-zinc-400 text-[9px]">
          {label(p.day)}
        </text>
      ))}

      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke="var(--color-brand-600)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {points.map((p, i) => (
        <circle
          key={p.day}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 5 : 3}
          fill={i === points.length - 1 ? "var(--color-brand-600)" : "white"}
          stroke="var(--color-brand-600)"
          strokeWidth="2"
        >
          <title>
            ₹{p.spend.toFixed(2)} on {label(p.day)}
          </title>
        </circle>
      ))}

      <g>
        <rect
          x={tooltipX}
          y={tooltipY}
          width={tooltipW}
          height={40}
          rx={8}
          className="fill-white stroke-zinc-200 dark:fill-zinc-800 dark:stroke-zinc-600"
          strokeWidth="1"
        />
        <text x={tooltipX + tooltipW / 2} y={tooltipY + 16} textAnchor="middle" className="fill-zinc-700 text-[10px] font-semibold dark:fill-zinc-200">
          {label(last.day)}
        </text>
        <text x={tooltipX + tooltipW / 2} y={tooltipY + 30} textAnchor="middle" className="fill-zinc-400 text-[9px]">
          ₹{last.spend.toFixed(2)}
        </text>
      </g>
    </svg>
  );
}
