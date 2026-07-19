"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Cpu,
  PhoneCall,
  Wrench,
  PhoneIncoming,
  Save,
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
  Circle,
  Copy,
  Check,
  Waypoints,
} from "lucide-react";
import {
  VOICE_PIPELINES,
  VOICE_PIPELINE_INFO,
  DEFAULT_VOICE_PIPELINE,
  isVoicePipeline,
  type VoicePipeline,
} from "@/lib/voice-pipeline";
import { SectionCard, Field, TextArea, Slider, Toggle } from "@/components/agent-settings-ui";

/* --------------------------------- Tabs --------------------------------- */

const TABS = [
  { id: "voicePipeline", label: "Voice Pipeline", icon: Waypoints },
  { id: "engine", label: "Engine", icon: Cpu },
  { id: "call", label: "Call", icon: PhoneCall },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "inbound", label: "Inbound", icon: PhoneIncoming },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Live testing (Get/Test call, Agent Status, etc.) moved to its own
// "Agent Actions" page/sidebar entry — see app/(portal)/dashboard/agent-actions.

/* --------------------------------- Page --------------------------------- */

const DEFAULT_SYSTEM_PROMPT = `You are Priya, the AI front-desk receptionist for RegenOrthoSport, an orthopedic and sports medicine clinic.

- Greet callers warmly and confirm the reason for their call.
- Help schedule, reschedule, or cancel appointments.
- Answer basic questions about clinic hours, location, and accepted insurance.
- Never provide medical advice or diagnoses — offer to connect the caller with clinical staff instead.
- If the caller sounds distressed or describes an emergency, direct them to call 911 immediately.
- Keep responses concise and speak in a calm, professional tone.`;

export default function AgentSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("voicePipeline");

  // Agent tab — persisted via /api/agent-settings, used live by the call worker.
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Hello. This is Priya from RegenOrthoSport"
  );
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [outboundSystemPrompt, setOutboundSystemPrompt] = useState("");
  const [agentName, setAgentName] = useState("Priya");
  const [voicePipeline, setVoicePipeline] = useState<VoicePipeline>(DEFAULT_VOICE_PIPELINE);
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
          setOutboundSystemPrompt(json.data.outboundSystemPrompt ?? "");
          setVoicePipeline(isVoicePipeline(json.data.voicePipeline) ? json.data.voicePipeline : DEFAULT_VOICE_PIPELINE);
        }
      } catch {
        // leave the built-in defaults in place
      } finally {
        setLoadingAgentSettings(false);
      }
    }
    fetchAgentSettings();
  }, []);

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
        body: JSON.stringify({ agentName, welcomeMessage, systemPrompt, outboundSystemPrompt, voicePipeline }),
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
    <div className="space-y-6">
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

      {/* Voice Pipeline */}
      {activeTab === "voicePipeline" && (
        <div className="space-y-6">
          <SectionCard
            title="Voice Pipeline"
            description="Which speech-to-text/LLM/text-to-speech stack handles calls. Switch to compare quality, latency, and cost for your business — test with a real call before relying on a new option."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {VOICE_PIPELINES.map((pipeline) => {
                const info = VOICE_PIPELINE_INFO[pipeline];
                const selected = voicePipeline === pipeline;
                return (
                  <button
                    key={pipeline}
                    type="button"
                    onClick={() => setVoicePipeline(pipeline)}
                    className={`flex flex-col items-start gap-1.5 rounded-lg border p-3.5 text-left transition-colors ${
                      selected
                        ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10"
                        : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-600 dark:hover:border-zinc-500"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <Waypoints className={`h-3.5 w-3.5 ${selected ? "text-brand-600 dark:text-brand-400" : "text-zinc-400"}`} />
                        {info.label}
                      </span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />}
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{info.description}</p>
                  </button>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}

      {/* LLM */}
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
      {/* Inbound */}
      {activeTab === "inbound" && (
        <div className="space-y-6">
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
  );
}
