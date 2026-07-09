"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  BrainCircuit,
  AudioLines,
  Cpu,
  PhoneCall,
  Wrench,
  BarChart3,
  PhoneIncoming,
  Save,
  Sparkles,
  Info,
  TrendingUp,
  TrendingDown,
  PhoneIncoming as InboundIcon,
  Voicemail,
  UserCheck,
  MessageSquareText,
  CalendarCheck,
  ShieldCheck,
  ExternalLink,
  ArrowUpRight,
  Trash2,
  MessageCircle,
  Globe,
  Clock,
  PhoneOutgoing,
  Circle,
  Copy,
  Check,
} from "lucide-react";

/* --------------------------------- Tabs --------------------------------- */

const TABS = [
  { id: "agent", label: "Agent", icon: Bot },
  { id: "llm", label: "LLM", icon: BrainCircuit },
  { id: "audio", label: "Audio", icon: AudioLines },
  { id: "engine", label: "Engine", icon: Cpu },
  { id: "call", label: "Call", icon: PhoneCall },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "inbound", label: "Inbound", icon: PhoneIncoming },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface ConnectedProvider {
  id: string;
  provider_key: string;
  provider_name: string;
  category: string;
  status: string;
}

/* ------------------------------ UI building blocks ------------------------------ */

const inputClasses =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100";

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-700">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-600">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
        )}
      </div>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  tooltip,
  valueLabel,
  children,
}: {
  label: string;
  hint?: string;
  tooltip?: string;
  valueLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
      <div className="sm:col-span-1">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</label>
          {tooltip && (
            <span title={tooltip} className="inline-flex cursor-help">
              <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
            </span>
          )}
          {valueLabel && (
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{valueLabel}</span>
          )}
        </div>
        {hint && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClasses} />;
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100"
    />
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-500 dark:bg-zinc-800">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-600 dark:text-white"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-indigo-600 dark:bg-zinc-500"
      />
      <span className="w-16 shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-center font-mono text-xs tabular-nums text-zinc-700 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
        {value}
        {suffix}
      </span>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  tooltip,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  tooltip?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-600">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-600 dark:text-zinc-400">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
            {tooltip && (
              <span title={tooltip} className="inline-flex cursor-help">
                <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-500"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  up,
}: {
  label: string;
  value: string;
  delta: string;
  up: boolean;
}) {
  return (
    <div className="group rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:hover:bg-zinc-600/60">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <div
        className={`mt-1.5 inline-flex items-center gap-1 text-xs font-medium ${
          up ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
        {delta}
      </div>
    </div>
  );
}

function timeAgo(date: Date | null): string {
  if (!date) return "Not saved yet";
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 10) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

interface OutboundTrunkOption {
  sipTrunkId: string;
  name: string;
  numbers: string[];
}

interface InboundTrunkOption {
  sipTrunkId: string;
  name: string;
  numbers: string[];
}

function AgentActionsCard({
  onSave,
  saved,
  lastSavedAt,
  onOpenInboundTab,
}: {
  onSave: () => void;
  saved: boolean;
  lastSavedAt: Date | null;
  onOpenInboundTab: () => void;
}) {
  const [callPanelOpen, setCallPanelOpen] = useState(false);
  const [callTarget, setCallTarget] = useState("");
  const [callStatus, setCallStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [callError, setCallError] = useState("");

  const [outboundTrunks, setOutboundTrunks] = useState<OutboundTrunkOption[]>([]);
  const [selectedTrunkId, setSelectedTrunkId] = useState("");
  const [loadingTrunks, setLoadingTrunks] = useState(false);

  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);

  const [inboundPanelOpen, setInboundPanelOpen] = useState(false);
  const [inboundTrunks, setInboundTrunks] = useState<InboundTrunkOption[]>([]);
  const [loadingInboundTrunks, setLoadingInboundTrunks] = useState(false);
  const [inboundFetchError, setInboundFetchError] = useState("");
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      fetch("/api/agent-heartbeat")
        .then((res) => res.json())
        .then((json) => {
          if (!cancelled && json.success) setAgentOnline(json.data.online);
        })
        .catch(() => {
          if (!cancelled) setAgentOnline(null);
        });
    }
    poll();
    const id = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!callPanelOpen || outboundTrunks.length > 0 || loadingTrunks) return;
    setLoadingTrunks(true);
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
  }, [callPanelOpen, outboundTrunks.length, loadingTrunks]);

  useEffect(() => {
    if (!inboundPanelOpen || inboundTrunks.length > 0 || loadingInboundTrunks) return;
    setLoadingInboundTrunks(true);
    setInboundFetchError("");
    fetch("/api/telephony")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setInboundTrunks(json.data.inboundTrunks || []);
        } else {
          setInboundFetchError(json.error || "Failed to load inbound number.");
        }
      })
      .catch(() => setInboundFetchError("Failed to load inbound number."))
      .finally(() => setLoadingInboundTrunks(false));
  }, [inboundPanelOpen, inboundTrunks.length, loadingInboundTrunks]);

  function handleCopyNumber(number: string) {
    navigator.clipboard.writeText(number).then(() => {
      setCopiedNumber(number);
      setTimeout(() => setCopiedNumber(null), 1500);
    });
  }

  async function handleGetCall() {
    if (!callTarget) return;
    setCallStatus("loading");
    setCallError("");
    try {
      const res = await fetch("/api/telephony", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trigger_outbound",
          toNumber: callTarget,
          roomName: `test-${Date.now()}`,
          sipTrunkId: selectedTrunkId || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to place call.");
      setCallStatus("success");
    } catch (err: any) {
      setCallStatus("error");
      setCallError(err.message || "Failed to place call.");
    }
  }

  return (
    <div className="sticky top-20 w-full shrink-0 space-y-4 lg:w-80">
      {/* Quick actions */}
      <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-600 dark:bg-zinc-700">
        <div className="mb-1 flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-500">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Agent Status</span>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
              agentOnline === null
                ? "text-zinc-400"
                : agentOnline
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
            }`}
          >
            <Circle
              className={`h-2 w-2 ${
                agentOnline === null
                  ? "fill-zinc-400 text-zinc-400"
                  : agentOnline
                    ? "fill-emerald-500 text-emerald-500"
                    : "fill-rose-500 text-rose-500"
              }`}
            />
            {agentOnline === null ? "Checking…" : agentOnline ? "Online" : "Offline"}
          </span>
        </div>

        <button
          onClick={() => setCallPanelOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <PhoneOutgoing className="h-4 w-4" /> Get call from agent
        </button>

        {callPanelOpen && (
          <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-500">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Call from
              </label>
              {loadingTrunks ? (
                <p className="text-xs text-zinc-400">Loading trunks…</p>
              ) : outboundTrunks.length === 0 ? (
                <p className="text-xs text-rose-500">
                  No outbound trunk provisioned yet — set up a number first.
                </p>
              ) : (
                <SelectInput
                  value={selectedTrunkId}
                  onChange={(e) => setSelectedTrunkId(e.target.value)}
                >
                  {outboundTrunks.map((t) => (
                    <option key={t.sipTrunkId} value={t.sipTrunkId}>
                      {t.numbers[0] || t.name}
                    </option>
                  ))}
                </SelectInput>
              )}
            </div>
            <TextInput
              placeholder="+1 555 019 2044"
              value={callTarget}
              onChange={(e) => {
                setCallTarget(e.target.value);
                setCallStatus("idle");
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleGetCall}
                disabled={callStatus === "loading" || !callTarget || !selectedTrunkId}
                className="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {callStatus === "loading" ? "Dialing…" : "Call me now"}
              </button>
              <button
                onClick={() => {
                  setCallPanelOpen(false);
                  setCallStatus("idle");
                }}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-500 dark:text-zinc-400"
              >
                Cancel
              </button>
            </div>
            {callStatus === "success" && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Call dispatched — answer your phone.
              </p>
            )}
            {callStatus === "error" && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{callError}</p>
            )}
          </div>
        )}

        <button
          onClick={() => setInboundPanelOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-500 dark:text-zinc-200 dark:hover:bg-zinc-600/60"
        >
          <PhoneIncoming className="h-4 w-4" /> Test inbound call
        </button>

        {inboundPanelOpen && (
          <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-500">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Call this number from your own phone to test the inbound agent.
            </p>
            {loadingInboundTrunks ? (
              <p className="text-xs text-zinc-400">Loading number…</p>
            ) : inboundFetchError ? (
              <p className="text-xs text-rose-500">{inboundFetchError}</p>
            ) : inboundTrunks.flatMap((t) => t.numbers).length === 0 ? (
              <p className="text-xs text-rose-500">
                No inbound trunk provisioned yet — set up a number first.
              </p>
            ) : (
              inboundTrunks
                .flatMap((t) => t.numbers)
                .map((number) => (
                  <div
                    key={number}
                    className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-500 dark:bg-zinc-800"
                  >
                    <span className="font-mono text-sm text-zinc-900 dark:text-zinc-100">{number}</span>
                    <button
                      onClick={() => handleCopyNumber(number)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {copiedNumber === number ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                ))
            )}
            <button
              onClick={() => {
                setInboundPanelOpen(false);
                onOpenInboundTab();
              }}
              className="w-full pt-1 text-center text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Configure inbound settings
            </button>
          </div>
        )}

        <Link
          href="/dashboard/numbers"
          className="flex items-center justify-center gap-1.5 pt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Purchase phone numbers <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Manage */}
      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-600 dark:bg-zinc-700">
        <Link
          href="/dashboard/calls"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-500 dark:text-zinc-200 dark:hover:bg-zinc-600/60"
        >
          See all call logs <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>

        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <Save className="h-4 w-4" /> {saved ? "Saved" : "Save agent"}
            </button>
            <button
              disabled
              title="Not available yet"
              className="grid h-[42px] w-[42px] shrink-0 cursor-not-allowed place-items-center rounded-md border border-zinc-200 text-zinc-300 dark:border-zinc-600 dark:text-zinc-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
            <Clock className="h-3 w-3" /> {timeAgo(lastSavedAt)}
          </p>
        </div>

        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-600">
          <button
            disabled
            title="Coming soon"
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-300 dark:border-zinc-600 dark:text-zinc-600"
          >
            <MessageCircle className="h-4 w-4" /> Chat with agent
          </button>
          <p className="mt-1.5 text-center text-xs text-zinc-400">Coming soon</p>
        </div>

        <div className="border-t border-dashed border-zinc-200 pt-4 dark:border-zinc-600">
          <button
            disabled
            title="Coming soon"
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-300 dark:border-zinc-600 dark:text-zinc-600"
          >
            <Globe className="h-4 w-4" /> Test via browser
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:bg-zinc-600">
              Beta
            </span>
          </button>
          <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-xs text-zinc-400">
            <PhoneCall className="h-3 w-3" /> For best experience, use &quot;Get call from agent&quot;
          </p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Page --------------------------------- */

const DEFAULT_SYSTEM_PROMPT = `You are Priya, the AI front-desk receptionist for RegenOrthoSport, an orthopedic and sports medicine clinic.

- Greet callers warmly and confirm the reason for their call.
- Help schedule, reschedule, or cancel appointments.
- Answer basic questions about clinic hours, location, and accepted insurance.
- Never provide medical advice or diagnoses — offer to connect the caller with clinical staff instead.
- If the caller sounds distressed or describes an emergency, direct them to call 911 immediately.
- Keep responses concise and speak in a calm, professional tone.`;

export default function AgentSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("agent");

  // Agent tab — persisted via /api/agent-settings, used live by the call worker.
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Hello. This is Priya from RegenOrthoSport"
  );
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [agentName, setAgentName] = useState("Priya");
  const [loadingAgentSettings, setLoadingAgentSettings] = useState(true);

  useEffect(() => {
    async function fetchAgentSettings() {
      try {
        const res = await fetch("/api/agent-settings");
        const json = await res.json();
        if (json.success) {
          setAgentName(json.data.agentName);
          setWelcomeMessage(json.data.welcomeMessage);
          setSystemPrompt(json.data.systemPrompt);
        }
      } catch {
        // leave the built-in defaults in place
      } finally {
        setLoadingAgentSettings(false);
      }
    }
    fetchAgentSettings();
  }, []);

  // LLM tab
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(0.4);
  const [maxTokens, setMaxTokens] = useState(250);
  const [llmProviders, setLlmProviders] = useState<ConnectedProvider[]>([]);
  const [loadingLlmProviders, setLoadingLlmProviders] = useState(true);

  useEffect(() => {
    async function fetchLlmProviders() {
      try {
        const res = await fetch("/api/providers");
        const json = await res.json();
        if (json.success) {
          const connected = (json.data as ConnectedProvider[]).filter(
            (p) => p.category === "llm" && p.status === "connected"
          );
          setLlmProviders(connected);
          setProvider((prev) => prev || connected[0]?.provider_key || "");
        }
      } catch {
        // leave llmProviders empty; the UI will prompt to connect one
      } finally {
        setLoadingLlmProviders(false);
      }
    }
    fetchLlmProviders();
  }, []);

  // Audio tab
  const [voice, setVoice] = useState("aria");
  const [outputFormat, setOutputFormat] = useState<"pcm16" | "mp3" | "mulaw">("pcm16");
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [denoise, setDenoise] = useState(true);
  const [ambientProfile, setAmbientProfile] = useState<"clinic-quiet" | "office-ambience">(
    "clinic-quiet"
  );

  // Engine tab
  const [interruptionWords, setInterruptionWords] = useState(3);
  const [endpointingMs, setEndpointingMs] = useState(700);
  const [backchannel, setBackchannel] = useState(true);

  // Call tab
  const [maxCallMinutes, setMaxCallMinutes] = useState(15);
  const [silenceTimeoutSec, setSilenceTimeoutSec] = useState(10);
  const [recordCalls, setRecordCalls] = useState(true);
  const [voicemailDetection, setVoicemailDetection] = useState(true);

  // Tools tab
  const [tools, setTools] = useState({
    bookAppointment: true,
    transferToHuman: true,
    checkInsurance: false,
    smsConfirmation: true,
  });

  // Inbound tab
  const [assignedNumber, setAssignedNumber] = useState("+1 (555) 019-2044");
  const [afterHoursMessage, setAfterHoursMessage] = useState(
    "Thanks for calling RegenOrthoSport. Our office is currently closed. Please leave a message and we'll return your call during business hours."
  );
  const [escalateAfterFailures, setEscalateAfterFailures] = useState(true);

  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/agent-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName, welcomeMessage, systemPrompt }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to save.");
      setSaved(true);
      setLastSavedAt(new Date());
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // Tracks scroll position so the sticky action bar can pick up a hairline
  // border + blur once the page has scrolled past it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 4);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
    <div className="min-w-0 flex-1 space-y-6">
      <div
        className={`sticky top-14 z-20 flex flex-col gap-4 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
          scrolled
            ? "border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-800/80"
            : "border-b border-transparent"
        }`}
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent Settings</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Configure the orchestration behavior of your AI voice agent.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 self-start rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60 sm:self-auto"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
          </button>
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-600">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-indigo-600 text-zinc-900 dark:text-zinc-50"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Agent */}
      {activeTab === "agent" && (
        <div className="space-y-6">
          <SectionCard title="Identity" description="How the agent introduces itself to callers.">
            <Field label="Agent name" hint="Displayed internally in call logs and transcripts.">
              <TextInput value={agentName} onChange={(e) => setAgentName(e.target.value)} />
            </Field>
            <Field label="Welcome message" hint="Spoken at the start of every inbound call.">
              <TextInput
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
              />
            </Field>
          </SectionCard>

          <SectionCard
            title="System prompt"
            description="The instructions that steer the agent's behavior and tone."
          >
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
              <Sparkles className="h-3.5 w-3.5" /> Prompt canvas
            </div>
            <TextArea
              rows={12}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </SectionCard>
        </div>
      )}

      {/* LLM */}
      {activeTab === "llm" && (
        <div className="space-y-6">
          <SectionCard title="Model provider" description="Choose which LLM backend powers the agent.">
            {loadingLlmProviders ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading connected providers…</p>
            ) : llmProviders.length === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No LLM providers are connected yet. Connect one to power this agent.
                </p>
                <Link
                  href="/dashboard/providers?category=llm"
                  className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  🔌 Connect an LLM Provider
                </Link>
              </div>
            ) : (
              <>
                <Field label="Provider">
                  <SegmentedControl
                    value={provider}
                    onChange={setProvider}
                    options={llmProviders.map((p) => ({ value: p.provider_key, label: p.provider_name }))}
                  />
                </Field>
                <Field
                  label="Model"
                  hint={`Routed through ${llmProviders.find((p) => p.provider_key === provider)?.provider_name ?? ""}.`}
                >
                  <SelectInput value={model} onChange={(e) => setModel(e.target.value)}>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4.1">gpt-4.1</option>
                  </SelectInput>
                </Field>
              </>
            )}
          </SectionCard>

          <SectionCard title="Generation parameters">
            <Field
              label="Temperature"
              hint="Lower is more deterministic and on-script."
              valueLabel={`${temperature}`}
            >
              <Slider value={temperature} onChange={setTemperature} min={0} max={1} step={0.1} />
            </Field>
            <Field label="Max response tokens" valueLabel={`${maxTokens}`}>
              <Slider value={maxTokens} onChange={setMaxTokens} min={50} max={800} step={10} />
            </Field>
          </SectionCard>
        </div>
      )}

      {/* Audio */}
      {activeTab === "audio" && (
        <div className="space-y-6">
          <SectionCard title="Voice" description="Text-to-speech voice and output format.">
            <Field label="Voice">
              <SelectInput value={voice} onChange={(e) => setVoice(e.target.value)}>
                <option value="aria">Aria — warm, professional</option>
                <option value="nova">Nova — bright, energetic</option>
                <option value="sage">Sage — calm, measured</option>
              </SelectInput>
            </Field>
            <Field label="Output format">
              <SegmentedControl
                value={outputFormat}
                onChange={setOutputFormat}
                options={[
                  { value: "pcm16", label: "PCM16" },
                  { value: "mp3", label: "MP3" },
                  { value: "mulaw", label: "μ-law" },
                ]}
              />
            </Field>
            <Field label="Speaking rate" valueLabel={`${speakingRate}x`}>
              <Slider value={speakingRate} onChange={setSpeakingRate} min={0.5} max={1.5} step={0.05} suffix="x" />
            </Field>
          </SectionCard>

          <SectionCard title="Input processing">
            <Toggle
              checked={denoise}
              onChange={setDenoise}
              label="Background noise suppression"
              description="Filters ambient noise from the caller's line before transcription."
            />
            <Field
              label="Ambient noise profile"
              hint="Calibrates noise suppression to the room the agent is deployed in."
            >
              <SelectInput
                value={ambientProfile}
                onChange={(e) => setAmbientProfile(e.target.value as typeof ambientProfile)}
              >
                <option value="clinic-quiet">Clinic Room (Absolute Quiet)</option>
                <option value="office-ambience">Active Front-Desk Ambience</option>
              </SelectInput>
            </Field>
          </SectionCard>
        </div>
      )}

      {/* Engine */}
      {activeTab === "engine" && (
        <div className="space-y-6">
          <SectionCard
            title="Turn-taking"
            description="Controls how quickly the agent yields the floor back to the caller."
          >
            <Field
              label="Interruption word count"
              hint="Minimum words the caller must speak before interrupting the agent."
              valueLabel={`${interruptionWords} words`}
            >
              <Slider value={interruptionWords} onChange={setInterruptionWords} min={1} max={10} suffix=" words" />
            </Field>
            <Field
              label="Patient Pause Timeout"
              tooltip="How long the AI waits for the patient to finish speaking before replying."
              valueLabel={`${endpointingMs}ms`}
            >
              <Slider value={endpointingMs} onChange={setEndpointingMs} min={200} max={2000} step={50} suffix="ms" />
            </Field>
          </SectionCard>

          <SectionCard title="Conversational behavior">
            <Toggle
              checked={backchannel}
              onChange={setBackchannel}
              label="Muted Listening Affirmations"
              tooltip="Allows the AI to make subtle verbal nods like 'mm-hmm' or 'got it' while the patient tells their story."
            />
          </SectionCard>
        </div>
      )}

      {/* Call */}
      {activeTab === "call" && (
        <div className="space-y-6">
          <SectionCard title="Call limits">
            <Field label="Max call duration" valueLabel={`${maxCallMinutes} min`}>
              <Slider value={maxCallMinutes} onChange={setMaxCallMinutes} min={1} max={30} suffix=" min" />
            </Field>
            <Field
              label="Silence timeout"
              hint="Ends the call if the caller is silent for this long."
              valueLabel={`${silenceTimeoutSec}s`}
            >
              <Slider value={silenceTimeoutSec} onChange={setSilenceTimeoutSec} min={3} max={30} suffix="s" />
            </Field>
          </SectionCard>

          <SectionCard title="Call handling">
            <Toggle
              checked={recordCalls}
              onChange={setRecordCalls}
              label="Record calls"
              description="Store call audio for playback in Call Logs."
              icon={ShieldCheck}
            />
            <Toggle
              checked={voicemailDetection}
              onChange={setVoicemailDetection}
              label="Voicemail detection"
              description="Automatically hang up or leave a message if a voicemail system answers."
              icon={Voicemail}
            />
          </SectionCard>
        </div>
      )}

      {/* Tools */}
      {activeTab === "tools" && (
        <SectionCard title="Function tools" description="Capabilities the agent can invoke during a call.">
          <Toggle
            icon={CalendarCheck}
            checked={tools.bookAppointment}
            onChange={(v) => setTools((t) => ({ ...t, bookAppointment: v }))}
            label="Book / reschedule appointment"
            description="Agent can read and write to the practice's scheduling system."
          />
          <Toggle
            icon={UserCheck}
            checked={tools.transferToHuman}
            onChange={(v) => setTools((t) => ({ ...t, transferToHuman: v }))}
            label="Transfer to human staff"
            description="Escalates the call to front-desk staff on request or distress cues."
          />
          <Toggle
            icon={ShieldCheck}
            checked={tools.checkInsurance}
            onChange={(v) => setTools((t) => ({ ...t, checkInsurance: v }))}
            label="Check insurance eligibility"
            description="Looks up coverage status against the connected payer database."
          />
          <Toggle
            icon={MessageSquareText}
            checked={tools.smsConfirmation}
            onChange={(v) => setTools((t) => ({ ...t, smsConfirmation: v }))}
            label="Send SMS confirmation"
            description="Texts the caller a summary after appointments are booked."
          />
        </SectionCard>
      )}

      {/* Analytics */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="Calls this month" value="482" delta="+12% vs last week" up />
            <KpiCard label="Avg. handle time" value="3:42" delta="-4% vs last week" up={false} />
            <KpiCard label="Task success rate" value="91%" delta="+3% vs last week" up />
          </div>
          <SectionCard title="About this tab">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Detailed call-level analytics live in{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">Sentiment Analysis</span> and{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">Call Logs</span>. This tab
              summarizes agent-level performance for the current configuration.
            </p>
          </SectionCard>
        </div>
      )}

      {/* Inbound */}
      {activeTab === "inbound" && (
        <div className="space-y-6">
          <SectionCard title="Number assignment" description="The phone number this agent answers.">
            <Field label="Assigned number">
              <div className="flex items-center gap-2">
                <InboundIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                <TextInput value={assignedNumber} onChange={(e) => setAssignedNumber(e.target.value)} />
              </div>
            </Field>
          </SectionCard>

          <SectionCard title="After-hours handling">
            <Field label="After-hours message">
              <TextArea
                rows={4}
                value={afterHoursMessage}
                onChange={(e) => setAfterHoursMessage(e.target.value)}
              />
            </Field>
            <Toggle
              checked={escalateAfterFailures}
              onChange={setEscalateAfterFailures}
              label="Escalate after 2 failed attempts"
              description="Routes the caller to a human queue if the agent can't resolve the request."
            />
          </SectionCard>
        </div>
      )}
    </div>

    <AgentActionsCard
      onSave={handleSave}
      saved={saved}
      lastSavedAt={lastSavedAt}
      onOpenInboundTab={() => setActiveTab("inbound")}
    />
    </div>
  );
}
