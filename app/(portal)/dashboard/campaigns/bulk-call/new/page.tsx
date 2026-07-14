// app/(portal)/dashboard/campaigns/bulk-call/new/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronDown, FileUp, Loader2, Users } from "lucide-react";
import * as XLSX from "xlsx";
import { CONDITIONS, resolvePromptTemplate, type Condition } from "@/lib/campaigns/prompt-template";

type OutboundTrunkOption = { sipTrunkId: string; name: string; numbers: string[] };
type ParsedContact = { name: string | null; phone: string };

const inputClasses =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-900";

/** Loose phone check: keeps a leading "+" and 7-15 digits — good enough to filter
    out obviously-broken rows without rejecting valid international formats. */
function looksLikePhone(value: string): boolean {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** Shared row logic for both CSV lines and spreadsheet rows: whichever cell
    looks like a phone number wins, the rest becomes the name. */
function contactsFromRows(rows: string[][]): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  for (const row of rows) {
    const cells = row.map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    if (cells.length === 1 && !looksLikePhone(cells[0])) continue; // likely a header row
    if (cells.length === 1) {
      contacts.push({ name: null, phone: cells[0] });
      continue;
    }
    const phoneIdx = cells.findIndex(looksLikePhone);
    if (phoneIdx === -1) continue; // header row like "name,phone"
    const phone = cells[phoneIdx];
    const name = cells.filter((_, i) => i !== phoneIdx).join(" ").trim() || null;
    contacts.push({ name, phone });
  }
  return contacts;
}

function parseContactsCsv(text: string): ParsedContact[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => line.split(","));
  return contactsFromRows(rows);
}

function parseContactsXlsx(buffer: ArrayBuffer): ParsedContact[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return [];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: "" });
  return contactsFromRows(rows.map((row) => row.map((cell) => String(cell ?? ""))));
}

export default function NewBulkCallCampaignPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [condition, setCondition] = useState<Condition>("Knee");
  const [webinarDate, setWebinarDate] = useState("");
  const [webinarTime, setWebinarTime] = useState("18:00");
  const [meetingLink, setMeetingLink] = useState("");

  // Scheduled call defaults to the webinar date at 4:00 PM until the user
  // edits it directly — a day-before reminder or an evening webinar just
  // means overriding these two fields, no code changes needed.
  const [scheduledCallDate, setScheduledCallDate] = useState("");
  const [scheduledCallTime, setScheduledCallTime] = useState("16:00");
  const [scheduleTouched, setScheduleTouched] = useState(false);

  useEffect(() => {
    if (webinarDate && !scheduleTouched) setScheduledCallDate(webinarDate);
  }, [webinarDate, scheduleTouched]);

  // Call Script — pre-filled from the saved outbound template (or the inbound
  // prompt as a starting point if no outbound template is set), live-resolved
  // as Doctor/Condition/Webinar fields change until the user edits it directly.
  const [rawTemplate, setRawTemplate] = useState<string | null>(null);
  const [templateSource, setTemplateSource] = useState<"outbound" | "inbound" | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [resolvedPrompt, setResolvedPrompt] = useState("");
  const [scriptDirty, setScriptDirty] = useState(false);

  useEffect(() => {
    fetch("/api/agent-settings")
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) return;
        const outbound = (json.data.outboundSystemPrompt ?? "").trim();
        const inbound = (json.data.systemPrompt ?? "").trim();
        if (outbound) {
          setRawTemplate(outbound);
          setTemplateSource("outbound");
        } else {
          setRawTemplate(inbound);
          setTemplateSource("inbound");
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTemplate(false));
  }, []);

  useEffect(() => {
    if (rawTemplate === null || scriptDirty) return;
    const ready = doctorName.trim() && webinarDate && webinarTime;
    setResolvedPrompt(
      ready
        ? resolvePromptTemplate(rawTemplate, { doctorName: doctorName.trim(), condition, webinarDate, webinarTime })
        : rawTemplate
    );
  }, [rawTemplate, doctorName, condition, webinarDate, webinarTime, scriptDirty]);

  const [outboundTrunks, setOutboundTrunks] = useState<OutboundTrunkOption[]>([]);
  const [loadingTrunks, setLoadingTrunks] = useState(true);
  const [selectedTrunkId, setSelectedTrunkId] = useState("");
  const [concurrentCallLimit, setConcurrentCallLimit] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/telephony")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          const trunks: OutboundTrunkOption[] = json.data.outboundTrunks || [];
          setOutboundTrunks(trunks);
          setSelectedTrunkId((prev) => prev || trunks[0]?.sipTrunkId || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTrunks(false));
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    const isSpreadsheet = /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      let parsed: ParsedContact[];
      try {
        parsed = isSpreadsheet
          ? parseContactsXlsx(reader.result as ArrayBuffer)
          : parseContactsCsv(String(reader.result ?? ""));
      } catch {
        setParseError("Couldn't read that spreadsheet — make sure it's a valid .xlsx or .xls file.");
        setContacts([]);
        return;
      }
      if (parsed.length === 0) {
        setParseError("Couldn't find any valid phone numbers in that file.");
        setContacts([]);
        return;
      }
      setContacts(parsed);
    };
    reader.onerror = () => setParseError("Couldn't read that file.");
    if (isSpreadsheet) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
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
  if (contacts.length === 0) missingFields.push("Contact list");

  const canSubmit = missingFields.length === 0 && !submitting;

  async function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/campaigns/bulk-call", {
        method: "POST",
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
          contacts,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create campaign.");
      router.push("/dashboard/campaigns/bulk-call");
    } catch (err: any) {
      setSubmitError(err.message || "Failed to create campaign.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/dashboard/campaigns/bulk-call"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to campaigns
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Create Bulk Call Campaign</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Set up Priya to call your webinar leads and confirm who&apos;s attending.
        </p>
      </div>

      {/* Campaign details */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Campaign Details</h3>
        <p className="mt-0.5 text-xs text-zinc-400">Name the campaign and pick the doctor and condition for this week.</p>
        <div className="mt-3 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Knee webinar — Dr. Venkatesh, 20 Jul"
            className={inputClasses}
          />
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
        <p className="mt-0.5 text-xs text-zinc-400">Priya confirms these details on the call.</p>
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
      <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <button
          type="button"
          onClick={() => setScriptExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-4 p-6 text-left"
        >
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Call Script (optional edit)</h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              {templateSource === "inbound"
                ? "No outbound template set — using your inbound prompt as a starting point. Click to customize for this campaign."
                : "Uses your saved outbound template — click to customize for this campaign."}
            </p>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${scriptExpanded ? "rotate-180" : ""}`} />
        </button>
        {scriptExpanded && (
          <div className="border-t border-zinc-100 p-6 pt-4 dark:border-zinc-700">
            {loadingTemplate ? (
              <p className="text-xs text-zinc-400">Loading your saved template…</p>
            ) : (
              <>
                {templateSource === "inbound" && (
                  <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-xs">
                      No outbound template set — using inbound prompt as a starting point. Edit as needed for outbound calls.
                    </p>
                  </div>
                )}
                <textarea
                  rows={12}
                  value={resolvedPrompt}
                  onChange={(e) => {
                    setScriptDirty(true);
                    setResolvedPrompt(e.target.value);
                  }}
                  className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-zinc-900 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <p className="mt-1.5 text-[11px] text-zinc-400">
                  {scriptDirty
                    ? "Edited for this campaign — no longer updates automatically as Doctor/Condition/Webinar fields change."
                    : "Updates automatically as you fill in Doctor, Condition, and Webinar details above."}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Phone number */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Phone Number</h3>
        <p className="mt-0.5 text-xs text-zinc-400">Select the outbound number to call from.</p>

        {!loadingTrunks && outboundTrunks.length === 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs">
              No outbound trunk is provisioned yet. Set one up from{" "}
              <Link href="/dashboard/numbers" className="font-medium underline">
                Phone Numbers
              </Link>{" "}
              before creating a campaign.
            </p>
          </div>
        )}

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
        ) : null}
      </div>

      {/* Contact list */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Upload Contact List</h3>
        <p className="mt-0.5 text-xs text-zinc-400">
          A .csv, .txt, or .xlsx/.xls file with one contact per row — either just a phone number, or &quot;Name,
          Phone&quot;.
        </p>
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-sm text-zinc-500 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <FileUp className="h-4 w-4" />
          {fileName ? fileName : "Click to choose a file"}
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={handleFile}
          />
        </label>
        {parseError && <p className="mt-2 text-xs text-rose-500">{parseError}</p>}
        {contacts.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
            <Users className="h-3.5 w-3.5" /> {contacts.length} contact{contacts.length === 1 ? "" : "s"} ready to call
          </div>
        )}
      </div>

      {/* Scheduled call */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Scheduled Call</h3>
        <p className="mt-0.5 text-xs text-zinc-400">
          When Priya starts calling this list. Defaults to the webinar date at 4:00 PM — change it for a day-before
          reminder, an evening webinar, or any other timing.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Call date</label>
            <input
              type="date"
              value={scheduledCallDate}
              onChange={(e) => {
                setScheduleTouched(true);
                setScheduledCallDate(e.target.value);
              }}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Call time</label>
            <input
              type="time"
              value={scheduledCallTime}
              onChange={(e) => {
                setScheduleTouched(true);
                setScheduledCallTime(e.target.value);
              }}
              className={inputClasses}
            />
          </div>
        </div>
      </div>

      {/* Concurrency */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Concurrent Call Settings</h3>
        <p className="mt-0.5 text-xs text-zinc-400">How many calls can run at the same time.</p>
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
            href="/dashboard/campaigns/bulk-call"
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Cancel
          </Link>
          <button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Campaign
          </button>
        </div>
      </div>
    </div>
  );
}
