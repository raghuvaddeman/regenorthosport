"use client";

import { useMemo, useState } from "react";
import { IndianRupee, Phone, Receipt } from "lucide-react";
import { useCallsContext } from "@/lib/calls-context";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { filterByRange, type TimeRange } from "@/lib/time-range";
import { SpendLineChart } from "@/components/charts";

const COST_SEGMENTS = [
  { key: "llmCostInr", label: "LLM (Gemini)", color: "#6366f1" },
  { key: "sttCostInr", label: "Speech-to-text (Sarvam)", color: "#0ea5e9" },
  { key: "ttsCostInr", label: "Text-to-speech (Sarvam)", color: "#f59e0b" },
  { key: "livekitCostInr", label: "LiveKit (call infra)", color: "#10b981" },
] as const;

function KpiCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</span>
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">{value}</div>
      {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

export default function BillingPage() {
  const { calls } = useCallsContext();
  const [range, setRange] = useState<TimeRange>("thisMonth");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const scoped = useMemo(() => filterByRange(calls, range, customFrom, customTo), [calls, range, customFrom, customTo]);

  const totalSpend = scoped.reduce((sum, c) => sum + c.costInr, 0);
  const totalCalls = scoped.length;
  const avgCost = totalCalls ? totalSpend / totalCalls : 0;

  const costByCategory = COST_SEGMENTS.map((seg) => ({
    ...seg,
    total: scoped.reduce((sum, c) => sum + c[seg.key], 0),
  }));
  const categorySum = costByCategory.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing &amp; Usage</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Estimated cost of running Priya, based on actual Gemini + Sarvam + LiveKit usage per call.
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

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard icon={IndianRupee} label="Total spend" value={`₹${totalSpend.toFixed(2)}`} />
        <KpiCard icon={Phone} label="Calls" value={String(totalCalls)} />
        <KpiCard icon={Receipt} label="Avg cost / call" value={`₹${avgCost.toFixed(2)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Spend over time</h3>
          <p className="mt-0.5 text-xs text-zinc-400">Total estimated cost per day.</p>
          <div className="mt-4">
            <SpendLineChart calls={scoped} />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Cost by category</h3>
          <p className="mt-0.5 text-xs text-zinc-400">Where the spend goes.</p>
          <div className="mt-4 space-y-4">
            {categorySum === 0 ? (
              <p className="text-sm text-zinc-400">No cost data in this range yet.</p>
            ) : (
              costByCategory.map((seg) => {
                const pct = categorySum > 0 ? Math.round((seg.total / categorySum) * 100) : 0;
                return (
                  <div key={seg.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">{seg.label}</span>
                      <span className="font-mono tabular-nums text-zinc-400">
                        ₹{seg.total.toFixed(2)} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: seg.color }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-400">
        Costs are estimates computed from actual per-call token/audio usage against current provider pricing — not
        an invoice. Vobiz's own PSTN/telephony charges aren't included here (billed separately by Vobiz).
      </p>
    </div>
  );
}
