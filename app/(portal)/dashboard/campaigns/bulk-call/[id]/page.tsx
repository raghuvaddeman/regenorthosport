// app/(portal)/dashboard/campaigns/bulk-call/[id]/page.tsx
"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  Calendar,
  ExternalLink,
  MessageSquareText,
  Pause,
  Phone,
  Play,
  Stethoscope,
  Users,
} from "lucide-react";

type CampaignStatus = "draft" | "scheduled" | "in_progress" | "paused" | "completed" | "cancelled";
type CallStatus = "pending" | "calling" | "completed" | "no_answer" | "failed";
type RsvpStatus = "yes" | "no" | "no_answer" | "unclear" | null;

type Campaign = {
  id: string;
  name: string;
  doctorName: string;
  condition: string;
  webinarDate: string;
  webinarTime: string;
  meetingLink: string | null;
  scheduledCallDate: string;
  scheduledCallTime: string;
  status: CampaignStatus;
  fromNumber: string | null;
  concurrentCallLimit: number;
  totalContacts: number;
  createdAt: string;
};

type Contact = {
  id: string;
  name: string | null;
  phone: string;
  callStatus: CallStatus;
  rsvpStatus: RsvpStatus;
  feedbackNote: string | null;
  retryCount: number;
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

const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  pending: "Pending",
  calling: "Calling",
  completed: "Completed",
  no_answer: "No answer",
  failed: "Failed",
};

function KpiCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <div className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">{value}</div>
    </div>
  );
}

export default function BulkCallCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/bulk-call/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load campaign.");
      setCampaign(json.campaign);
      setContacts(json.contacts ?? []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load campaign.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!campaign || (campaign.status !== "in_progress" && campaign.status !== "scheduled")) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [campaign, load]);

  async function updateStatus(status: CampaignStatus) {
    setActionPending(true);
    try {
      const res = await fetch(`/api/campaigns/bulk-call/${id}`, {
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
      setActionPending(false);
    }
  }

  if (loading) {
    return <p className="py-14 text-center text-sm text-zinc-400 animate-pulse">Loading campaign…</p>;
  }

  if (error || !campaign) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/campaigns/bulk-call" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to campaigns
        </Link>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-500">{error || "Campaign not found."}</div>
      </div>
    );
  }

  const yes = contacts.filter((c) => c.rsvpStatus === "yes").length;
  const no = contacts.filter((c) => c.rsvpStatus === "no").length;
  const noAnswer = contacts.filter((c) => c.rsvpStatus === "no_answer").length;
  const feedbackNotes = contacts.filter((c) => c.rsvpStatus === "no" && c.feedbackNote);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/campaigns/bulk-call" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to campaigns
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[campaign.status]}`}>
                {campaign.status === "in_progress" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
                {STATUS_LABELS[campaign.status]}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <Stethoscope className="h-3.5 w-3.5" /> {campaign.doctorName} · {campaign.condition}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Webinar {new Date(`${campaign.webinarDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
              {campaign.meetingLink && (
                <a href={campaign.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-brand-600 hover:underline dark:text-brand-400">
                  <ExternalLink className="h-3.5 w-3.5" /> Meeting link
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {campaign.status === "in_progress" && (
              <button
                onClick={() => updateStatus("paused")}
                disabled={actionPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-3.5 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50 disabled:opacity-40 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10"
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            )}
            {campaign.status === "paused" && (
              <button
                onClick={() => updateStatus("in_progress")}
                disabled={actionPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-3.5 py-2 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-40 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10"
              >
                <Play className="h-3.5 w-3.5" /> Resume
              </button>
            )}
            {(campaign.status === "scheduled" || campaign.status === "in_progress" || campaign.status === "paused") && (
              <button
                onClick={() => updateStatus("cancelled")}
                disabled={actionPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                <Ban className="h-3.5 w-3.5" /> Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-500">{error}</div>}

      {/* KPIs — the number Raghu actually needs: attendance likelihood before the webinar. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Users} label="Total contacts" value={campaign.totalContacts} tone="bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400" />
        <KpiCard icon={Phone} label="Yes" value={yes} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" />
        <KpiCard icon={Phone} label="No" value={no} tone="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" />
        <KpiCard icon={Phone} label="No answer" value={noAnswer} tone="bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400" />
      </div>

      {/* Feedback from declines */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Feedback from &quot;No&quot; responses</h3>
        </div>
        {feedbackNotes.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No decline feedback yet.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {feedbackNotes.map((c) => (
              <li key={c.id} className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900/50">
                <span className="font-mono text-xs text-zinc-400">{c.name || c.phone}</span>
                <p className="mt-0.5 text-zinc-700 dark:text-zinc-300">{c.feedbackNote}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Contacts */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Contacts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-700">
                <th className="px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Contact</th>
                <th className="px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Call Status</th>
                <th className="px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">RSVP</th>
                <th className="px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/70">
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-sm text-zinc-400">No contacts on this campaign.</td>
                </tr>
              )}
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="px-6 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-200">
                    {c.name ? `${c.name} · ` : ""}
                    {c.phone}
                  </td>
                  <td className="px-6 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {CALL_STATUS_LABELS[c.callStatus]}
                    {c.retryCount > 0 && <span className="ml-1 text-zinc-400">(retry {c.retryCount})</span>}
                  </td>
                  <td className="px-6 py-3">
                    {c.rsvpStatus ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.rsvpStatus === "yes"
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : c.rsvpStatus === "no"
                              ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
                        }`}
                      >
                        {c.rsvpStatus.replace("_", " ")}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="max-w-xs px-6 py-3 text-xs text-zinc-500 dark:text-zinc-400">{c.feedbackNote || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
