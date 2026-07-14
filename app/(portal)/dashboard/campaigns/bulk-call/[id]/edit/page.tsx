// app/(portal)/dashboard/campaigns/bulk-call/[id]/edit/page.tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, FileUp, Loader2, Users } from "lucide-react";
import { CONDITIONS, type Condition } from "@/lib/campaigns/prompt-template";
import { readContactsFile, type ParsedContact } from "@/lib/campaigns/parse-contacts";

type OutboundTrunkOption = { sipTrunkId: string; name: string; numbers: string[] };
type CampaignStatus = "draft" | "scheduled" | "in_progress" | "paused" | "completed" | "cancelled";

const inputClasses =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-900";

export default function EditBulkCallCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const [totalContacts, setTotalContacts] = useState(0);

  const [name, setName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [condition, setCondition] = useState<Condition>("Knee");
  const [webinarDate, setWebinarDate] = useState("");
  const [webinarTime, setWebinarTime] = useState("18:00");
  const [meetingLink, setMeetingLink] = useState("");
  const [scheduledCallDate, setScheduledCallDate] = useState("");
  const [scheduledCallTime, setScheduledCallTime] = useState("16:00");
  const [resolvedPrompt, setResolvedPrompt] = useState("");

  const [outboundTrunks, setOutboundTrunks] = useState<OutboundTrunkOption[]>([]);
  const [loadingTrunks, setLoadingTrunks] = useState(true);
  const [selectedTrunkId, setSelectedTrunkId] = useState("");
  const [concurrentCallLimit, setConcurrentCallLimit] = useState(1);

  // Contacts default to "keep what's already there" — only replaced if the
  // user uploads a new file.
  const [fileName, setFileName] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ParsedContact[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/campaigns/bulk-call/${id}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!json.campaign) throw new Error(json.error || "Campaign not found.");
        const c = json.campaign;
        setStatus(c.status);
        setTotalContacts(c.totalContacts ?? 0);
        setName(c.name ?? "");
        setDoctorName(c.doctorName ?? "");
        setCondition((c.condition as Condition) ?? "Knee");
        setWebinarDate(c.webinarDate ?? "");
        setWebinarTime(c.webinarTime ?? "18:00");
        setMeetingLink(c.meetingLink ?? "");
        setScheduledCallDate(c.scheduledCallDate ?? "");
        setScheduledCallTime(c.scheduledCallTime ?? "16:00");
        setResolvedPrompt(c.resolvedPrompt ?? "");
        setSelectedTrunkId(c.fromSipTrunkId ?? "");
      })
      .catch((err) => setLoadError(err.message || "Failed to load campaign."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch("/api/telephony")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setOutboundTrunks(json.data.outboundTrunks || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTrunks(false));
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    try {
      const parsed = await readContactsFile(file);
      if (parsed.length === 0) {
        setParseError("Couldn't find any valid phone numbers in that file.");
        setContacts(null);
        return;
      }
      setContacts(parsed);
    } catch {
      setParseError("Couldn't read that file — make sure it's a valid .csv, .txt, .xlsx, or .xls file.");
      setContacts(null);
    }
  }

  const selectedTrunk = outboundTrunks.find((t) => t.sipTrunkId === selectedTrunkId);

  const missingFields: string[] = [];
  if (!name.trim()) missingFields.push("Campaign name");
  if (!doctorName.trim()) missingFields.push("Doctor name");
  if (!webinarDate) missingFields.push("Webinar date");
  if (!webinarTime) missingFields.push("Webinar time");
  if (!scheduledCallDate) missingFields.push("Call date");
  if (!scheduledCallTime) missingFields.push("Call time");
  if (!resolvedPrompt.trim()) missingFields.push("Call Script");
  if (!selectedTrunkId) missingFields.push("Phone Number");

  const canSubmit = missingFields.length === 0 && !submitting;

  async function handleSave() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/campaigns/bulk-call/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          doctorName: doctorName.trim(),
          condition,
          webinarDate,
          webinarTime,
          meetingLink: meetingLink.trim() || undefined,
          scheduledCallDate,
          scheduledCallTime,
          resolvedPrompt: resolvedPrompt.trim(),
          sipTrunkId: selectedTrunkId,
          fromNumber: selectedTrunk?.numbers[0] ?? null,
          concurrentCallLimit,
          contacts: contacts ?? undefined, // omit entirely to keep the existing contact list
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save changes.");
      router.push(`/dashboard/campaigns/bulk-call/${id}`);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to save changes.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="py-14 text-center text-sm text-zinc-400 animate-pulse">Loading campaign…</p>;
  }

  if (loadError || !status) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/campaigns/bulk-call" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to campaigns
        </Link>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-500">
          {loadError || "Campaign not found."}
        </div>
      </div>
    );
  }

  if (status !== "scheduled") {
    return (
      <div className="space-y-4">
        <Link href={`/dashboard/campaigns/bulk-call/${id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to campaign
        </Link>
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">
            This campaign can no longer be edited — it&apos;s already <strong>{status.replace("_", " ")}</strong>.
            Only campaigns that haven&apos;t started calling yet can be changed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/dashboard/campaigns/bulk-call/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to campaign
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Edit Campaign</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Update details before Priya starts calling.</p>
      </div>

      {/* Campaign details */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Campaign Details</h3>
        <div className="mt-3 space-y-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className={inputClasses} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              placeholder="Doctor name"
              className={inputClasses}
            />
            <select value={condition} onChange={(e) => setCondition(e.target.value as Condition)} className={inputClasses}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Webinar details */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Webinar Details</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Webinar date</label>
            <input type="date" value={webinarDate} onChange={(e) => setWebinarDate(e.target.value)} className={inputClasses} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Webinar time</label>
            <input type="time" value={webinarTime} onChange={(e) => setWebinarTime(e.target.value)} className={inputClasses} />
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Meeting link (optional)</label>
          <input
            type="url"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="https://..."
            className={inputClasses}
          />
        </div>
      </div>

      {/* Call script */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Call Script</h3>
        <p className="mt-0.5 text-xs text-zinc-400">
          Editing this only changes what Priya says for this campaign — it doesn&apos;t touch your saved template.
        </p>
        <textarea
          rows={12}
          value={resolvedPrompt}
          onChange={(e) => setResolvedPrompt(e.target.value)}
          className="mt-3 w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-zinc-900 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Phone number */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Phone Number</h3>
        <p className="mt-0.5 text-xs text-zinc-400">Select the outbound number to call from.</p>
        {loadingTrunks ? (
          <p className="mt-3 text-xs text-zinc-400">Loading phone numbers…</p>
        ) : outboundTrunks.length > 0 ? (
          <select value={selectedTrunkId} onChange={(e) => setSelectedTrunkId(e.target.value)} className={`mt-3 ${inputClasses}`}>
            {outboundTrunks.map((t) => (
              <option key={t.sipTrunkId} value={t.sipTrunkId}>
                {t.numbers[0] || t.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs">No outbound trunk is provisioned yet.</p>
          </div>
        )}
      </div>

      {/* Contact list */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Contact List</h3>
        <p className="mt-0.5 text-xs text-zinc-400">
          {contacts === null
            ? `Currently ${totalContacts} contact${totalContacts === 1 ? "" : "s"}. Upload a new file to replace the whole list — leave this alone to keep it as-is.`
            : "Uploading below will replace the entire contact list for this campaign."}
        </p>
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-sm text-zinc-500 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <FileUp className="h-4 w-4" />
          {fileName ? fileName : "Click to replace the contact list (optional)"}
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={handleFile}
          />
        </label>
        {parseError && <p className="mt-2 text-xs text-rose-500">{parseError}</p>}
        {contacts && contacts.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
            <Users className="h-3.5 w-3.5" /> Will replace with {contacts.length} contact{contacts.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {/* Scheduled call */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Scheduled Call</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Call date</label>
            <input type="date" value={scheduledCallDate} onChange={(e) => setScheduledCallDate(e.target.value)} className={inputClasses} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Call time</label>
            <input type="time" value={scheduledCallTime} onChange={(e) => setScheduledCallTime(e.target.value)} className={inputClasses} />
          </div>
        </div>
      </div>

      {/* Concurrency */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Concurrent Call Settings</h3>
        <input
          type="number"
          min={1}
          max={20}
          value={concurrentCallLimit}
          onChange={(e) => setConcurrentCallLimit(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          className={`mt-3 w-32 ${inputClasses}`}
        />
      </div>

      {submitError && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-500">{submitError}</div>
      )}

      <div className="flex flex-col items-end gap-2">
        {missingFields.length > 0 && (
          <p className="text-xs text-zinc-400">
            Still needed: <span className="font-medium text-zinc-500 dark:text-zinc-300">{missingFields.join(", ")}</span>
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/dashboard/campaigns/bulk-call/${id}`}
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
