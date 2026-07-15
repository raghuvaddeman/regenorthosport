"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useCallsContext } from "@/lib/calls-context";
import { CallSlideOver, RatingBadge, LatencyBadge } from "@/components/call-slide-over";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { filterByRange, type TimeRange } from "@/lib/time-range";
import type { Call } from "@/lib/use-calls";

export default function CallPerformancePage() {
  const { calls, loading } = useCallsContext();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [openCall, setOpenCall] = useState<Call | null>(null);

  const rangeCalls = useMemo(
    () => filterByRange(calls, range, customFrom, customTo),
    [calls, range, customFrom, customTo]
  );

  const filteredCalls = useMemo(() => {
    if (!search) return rangeCalls;
    const q = search.toLowerCase();
    return rangeCalls.filter((c) => c.phone.toLowerCase().includes(q));
  }, [rangeCalls, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Call Performance</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Per-call cost and response latency for Priya, so you can spot slow or expensive calls.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-zinc-200 bg-white pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
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
                <th className="p-4 font-medium">Latency</th>
                <th className="p-4 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-600">
              {loading && filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-400 animate-pulse">
                    Loading call performance data…
                  </td>
                </tr>
              ) : filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-400">No calls in this range.</td>
                </tr>
              ) : (
                filteredCalls.map((c) => (
                  <tr
                    key={c.uuid}
                    onClick={() => setOpenCall(c)}
                    className="cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-700/30"
                  >
                    <td className="p-4 font-medium whitespace-nowrap">{new Date(c.at).toLocaleString()}</td>
                    <td className="p-4 font-mono">{c.phone || "Anonymous"}</td>
                    <td className="p-4">
                      {Math.floor(c.durationSec / 60)}:{(c.durationSec % 60).toString().padStart(2, "0")}
                    </td>
                    <td className="p-4 font-mono">₹{c.costInr.toFixed(2)}</td>
                    <td className="p-4">
                      <LatencyBadge latencyMetrics={c.latencyMetrics} />
                    </td>
                    <td className="p-4">
                      <RatingBadge value={c.rating} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openCall && <CallSlideOver call={openCall} onClose={() => setOpenCall(null)} />}
    </div>
  );
}
