// app/(portal)/dashboard/campaigns/bulk-call/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  Inbox,
  Loader2,
  Pause,
  Phone,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

type CampaignStatus = "draft" | "scheduled" | "in_progress" | "paused" | "completed" | "cancelled";

type Campaign = {
  id: string;
  name: string;
  doctorName: string;
  condition: string;
  webinarDate: string;
  scheduledCallDate: string;
  scheduledCallTime: string;
  status: CampaignStatus;
  fromNumber: string | null;
  concurrentCallLimit: number;
  totalContacts: number;
  createdAt: string;
  counts: { pending: number; calling: number; yes: number; no: number; noAnswer: number; unclear: number };
};

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
  scheduled: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
  in_progress: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  paused: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  completed: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
  cancelled: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
};

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status === "in_progress" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

function ProgressBar({ campaign }: { campaign: Campaign }) {
  const { yes, no, noAnswer, unclear } = campaign.counts;
  const resolved = yes + no + noAnswer + unclear;
  const total = campaign.totalContacts || 1;
  const pct = Math.min(100, Math.round((resolved / total) * 100));
  return (
    <div className="w-40">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-zinc-400">
        {resolved} / {campaign.totalContacts} · {pct}%
      </p>
    </div>
  );
}

export default function BulkCallCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns/bulk-call", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load campaigns.");
      setCampaigns(json.campaigns ?? []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while anything is scheduled/active so progress bars and the
  // scheduled->in_progress transition show up without a manual refresh.
  useEffect(() => {
    if (!campaigns.some((c) => c.status === "in_progress" || c.status === "scheduled")) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [campaigns, load]);

  async function updateStatus(campaign: Campaign, status: CampaignStatus) {
    setActionPendingId(campaign.id);
    try {
      const res = await fetch(`/api/campaigns/bulk-call/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update campaign.");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to update campaign.");
    } finally {
      setActionPendingId(null);
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    if (!confirm(`Delete campaign "${campaign.name}"? This can't be undone.`)) return;
    setActionPendingId(campaign.id);
    try {
      const res = await fetch(`/api/campaigns/bulk-call/${campaign.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete campaign.");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to delete campaign.");
    } finally {
      setActionPendingId(null);
    }
  }

  const filtered = useMemo(
    () =>
      campaigns.filter((c) => {
        const matchesSearch =
          c.name.toLowerCase().includes(search.toLowerCase()) || c.doctorName.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "all" || c.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [campaigns, search, statusFilter]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bulk Call Campaigns</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Weekly webinar RSVP calls, managed and tracked here.</p>
        </div>
        <Link
          href="/dashboard/campaigns/bulk-call/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Create New Campaign
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-500">{error}</div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name or doctor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-800"
        >
          <option value="all">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In progress</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-700">
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Campaign</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Status</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Scheduled Call</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">RSVP Progress</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Yes / No</th>
                <th className="px-6 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/70">
              {loading && (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-sm text-zinc-400 animate-pulse">
                    Loading campaigns…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <Inbox className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                    <p className="mt-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">No bulk call campaigns found.</p>
                    <p className="mt-1 text-xs text-zinc-400">Try creating a new campaign to get started.</p>
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/40">
                    <td className="px-6 py-3.5">
                      <Link href={`/dashboard/campaigns/bulk-call/${c.id}`} className="font-medium text-zinc-800 hover:underline dark:text-zinc-100">
                        {c.name}
                      </Link>
                      <p className="text-xs text-zinc-400">
                        {c.doctorName} · {c.condition}
                      </p>
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(`${c.scheduledCallDate}T${c.scheduledCallTime}`).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-3.5">
                      <ProgressBar campaign={c} />
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">{c.counts.yes} yes</span>
                      <span className="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
                      <span className="font-mono text-xs tabular-nums text-rose-600 dark:text-rose-400">{c.counts.no} no</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status === "paused" && (
                          <button
                            onClick={() => updateStatus(c, "in_progress")}
                            disabled={actionPendingId === c.id}
                            className="grid h-8 w-8 place-items-center rounded-full border border-brand-200 text-brand-500 transition-colors hover:bg-brand-50 disabled:opacity-40 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10"
                            aria-label="Resume campaign"
                          >
                            {actionPendingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 pl-px" />}
                          </button>
                        )}
                        {c.status === "in_progress" && (
                          <button
                            onClick={() => updateStatus(c, "paused")}
                            disabled={actionPendingId === c.id}
                            className="grid h-8 w-8 place-items-center rounded-full border border-amber-200 text-amber-500 transition-colors hover:bg-amber-50 disabled:opacity-40 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10"
                            aria-label="Pause campaign"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(c.status === "scheduled" || c.status === "in_progress" || c.status === "paused") && (
                          <button
                            onClick={() => updateStatus(c, "cancelled")}
                            disabled={actionPendingId === c.id}
                            className="grid h-8 w-8 place-items-center rounded-full border border-zinc-200 text-zinc-400 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-zinc-700"
                            aria-label="Cancel campaign"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(c.status === "completed" || c.status === "cancelled") && (
                          <button
                            onClick={() => deleteCampaign(c)}
                            disabled={actionPendingId === c.id}
                            className="grid h-8 w-8 place-items-center rounded-full border border-zinc-200 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-rose-500/10"
                            aria-label="Delete campaign"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-zinc-400">
        <Phone className="h-3 w-3" /> Calls dial out automatically at the scheduled time, through your configured
        Vobiz outbound trunk, respecting each campaign&apos;s concurrent call limit.
      </p>
    </div>
  );
}
