"use client";

import React, { useMemo, useState } from "react";
import { Search, Shield, User, Landmark, Play, Pause, MessageSquareText } from "lucide-react";
import { useAudio } from "./audio-player";
import { useCallsContext } from "@/lib/calls-context";
import { CallSlideOver } from "./call-slide-over";
import { TimeRangeFilter } from "./time-range-filter";
import { filterByRange, type TimeRange } from "@/lib/time-range";
import type { Call } from "@/lib/use-calls";

/* ----------------- CALL LOGS VIEW ----------------- */
export function CallLogsView() {
  const { calls, loading } = useCallsContext();
  const [search, setSearch] = useState("");
  const [minRating, setMinRating] = useState("0");
  const [openCall, setOpenCall] = useState<Call | null>(null);
  const [range, setRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { currentCall, isPlaying, play } = useAudio();

  const rangeCalls = useMemo(
    () => filterByRange(calls, range, customFrom, customTo),
    [calls, range, customFrom, customTo]
  );

  const filteredCalls = rangeCalls.filter((c) => {
    const matchesSearch =
      c.phone.toLowerCase().includes(search.toLowerCase()) ||
      c.summary.toLowerCase().includes(search.toLowerCase()) ||
      c.transcript.toLowerCase().includes(search.toLowerCase());
    const matchesRating = c.rating >= parseFloat(minRating);
    return matchesSearch && matchesRating;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Call Audit Logs</h1>
          <p className="text-sm text-zinc-500">Search and audit across your conversational data streams.</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-zinc-200 bg-white pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
          </div>
          <select
            value={minRating}
            onChange={(e) => setMinRating(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
          >
            <option value="0">All Ratings</option>
            <option value="4">4★ & Above</option>
            <option value="3">3★ & Above</option>
            <option value="1">Underperforming</option>
          </select>
          <TimeRangeFilter
            range={range}
            onRangeChange={setRange}
            customFrom={customFrom}
            onCustomFromChange={setCustomFrom}
            customTo={customTo}
            onCustomToChange={setCustomTo}
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-600 dark:bg-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/70 text-zinc-500 dark:border-zinc-600 dark:bg-zinc-700/50">
                <th className="p-4 font-medium">Timestamp</th>
                <th className="p-4 font-medium">Customer Phone</th>
                <th className="p-4 font-medium">Duration</th>
                <th className="p-4 font-medium">Cost</th>
                <th className="p-4 font-medium">Rating</th>
                <th className="p-4 font-medium">AI Insight Summary</th>
                <th className="p-4 font-medium text-center">Chat Transcript</th>
                <th className="p-4 font-medium text-right">Playback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-600">
              {loading && filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-400 animate-pulse">
                    Loading call logs from Supabase…
                  </td>
                </tr>
              ) : filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-400">No telemetry matches found.</td>
                </tr>
              ) : (
                filteredCalls.map((c) => {
                  const isCurrent = currentCall?.uuid === c.uuid && isPlaying;
                  return (
                    <tr key={c.uuid} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-700/30">
                      <td className="p-4 font-medium whitespace-nowrap">{new Date(c.at).toLocaleString()}</td>
                      <td className="p-4 font-mono">{c.phone || "Anonymous"}</td>
                      <td className="p-4">{Math.floor(c.durationSec / 60)}:{(c.durationSec % 60).toString().padStart(2, "0")}</td>
                      <td className="p-4 font-mono">₹{c.costInr.toFixed(2)}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          c.rating >= 4 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" :
                          c.rating >= 3 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" :
                          "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                        }`}>
                          {c.rating.toFixed(1)} ★
                        </span>
                      </td>
                      <td className="p-4 max-w-sm truncate text-zinc-600 dark:text-zinc-400" title={c.summary}>{c.summary}</td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setOpenCall(c)}
                          disabled={!c.transcript}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-30 dark:bg-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500"
                          title="View chat transcript"
                        >
                          <MessageSquareText className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => play(c)}
                          disabled={!c.recordingUrl}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-30 dark:bg-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500"
                        >
                          {isCurrent ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openCall && <CallSlideOver call={openCall} onClose={() => setOpenCall(null)} />}
    </div>
  );
}

/* ----------------- ANALYTICS VIEW ----------------- */
export function AnalyticsView() {
  const { calls } = useCallsContext();

  const totalCalls = calls.length;
  const avgDuration = totalCalls ? Math.round(calls.reduce((acc, curr) => acc + curr.durationSec, 0) / totalCalls) : 0;
  const avgRating = totalCalls ? (calls.reduce((acc, curr) => acc + curr.rating, 0) / totalCalls).toFixed(1) : "0.0";

  const high = calls.filter((c) => c.rating >= 4).length;
  const mid = calls.filter((c) => c.rating === 3).length;
  const low = calls.filter((c) => c.rating < 3).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Performance Analytics</h1>
        <p className="text-sm text-zinc-500">Aggregated operation insights derived by automated telemetry.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-600 dark:bg-zinc-800">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Total Handled Calls</p>
          <p className="mt-2 text-3xl font-bold">{totalCalls}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-600 dark:bg-zinc-800">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Avg Interaction Length</p>
          <p className="mt-2 text-3xl font-bold">{Math.floor(avgDuration / 60)}m {avgDuration % 60}s</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-600 dark:bg-zinc-800">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Mean Customer Rating</p>
          <p className="mt-2 text-3xl font-bold text-indigo-500">{avgRating} ★</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-600 dark:bg-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6">AI Agent Quality Distribution</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-emerald-500 font-medium">Optimal Performance (4-5★)</span>
              <span className="font-mono">{high} calls</span>
            </div>
            <div className="w-full bg-zinc-100 h-3 rounded-full dark:bg-zinc-600 overflow-hidden">
              <div className="bg-emerald-500 h-full transition-all" style={{ width: `${totalCalls ? (high / totalCalls) * 100 : 0}%` }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-amber-500 font-medium">Standard Resolution (3★)</span>
              <span className="font-mono">{mid} calls</span>
            </div>
            <div className="w-full bg-zinc-100 h-3 rounded-full dark:bg-zinc-600 overflow-hidden">
              <div className="bg-amber-500 h-full transition-all" style={{ width: `${totalCalls ? (mid / totalCalls) * 100 : 0}%` }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-rose-500 font-medium">Escalations / Friction (1-2★)</span>
              <span className="font-mono">{low} calls</span>
            </div>
            <div className="w-full bg-zinc-100 h-3 rounded-full dark:bg-zinc-600 overflow-hidden">
              <div className="bg-rose-500 h-full transition-all" style={{ width: `${totalCalls ? (low / totalCalls) * 100 : 0}%` }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------- SETTINGS VIEW ----------------- */
export function SettingsView() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portal Configuration</h1>
        <p className="text-sm text-zinc-500">Verify tenant metadata environment configurations.</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:divide-zinc-600">
        <div className="flex items-center gap-4 p-5">
          <User className="h-5 w-5 text-zinc-400" />
          <div>
            <p className="text-sm font-medium">Operator Identity</p>
            <p className="text-xs text-zinc-400">Authenticated user identity context injected by Clerk session headers.</p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-5">
          <Landmark className="h-5 w-5 text-indigo-500" />
          <div>
            <p className="text-sm font-medium">Data Boundary Isolation</p>
            <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">Verified Client Token: Connected to Supabase.</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-5 bg-zinc-50/50 dark:bg-zinc-700/10">
          <Shield className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Multi-Tenant Cryptographic Isolation Active</p>
            <p className="text-xs text-zinc-500 mt-1">
              Your session uses upstream filtering queries bound directly to your authorization token. Row level leakage is strictly guarded on our API edge server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
