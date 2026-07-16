"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PhoneOutgoing,
  PhoneIncoming,
  ExternalLink,
  ArrowUpRight,
  MessageCircle,
  Globe,
  PhoneCall,
  Circle,
  Copy,
  Check,
} from "lucide-react";

const inputClasses =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100";

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClasses} />;
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}

function CardSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
      {title && <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h3>}
      {children}
    </div>
  );
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

export default function AgentActionsPage() {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent Actions</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Test Priya live, check her status, and jump to related setup — separate from the Agent Settings config form.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CardSection>
          <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-600">
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
              <Link
                href="/dashboard/agent-settings"
                onClick={() => setInboundPanelOpen(false)}
                className="block w-full pt-1 text-center text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Configure inbound settings
              </Link>
            </div>
          )}

          <Link
            href="/dashboard/numbers"
            className="flex items-center justify-center gap-1.5 pt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Purchase phone numbers <ExternalLink className="h-3 w-3" />
          </Link>
        </CardSection>

        <CardSection>
          <Link
            href="/dashboard/calls"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-500 dark:text-zinc-200 dark:hover:bg-zinc-600/60"
          >
            See all call logs <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>

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
        </CardSection>
      </div>
    </div>
  );
}
