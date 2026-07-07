"use client";

import { useState } from "react";
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
  PhoneIncoming as InboundIcon,
  Voicemail,
  UserCheck,
  MessageSquareText,
  CalendarCheck,
  ShieldCheck,
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

/* ------------------------------ UI building blocks ------------------------------ */

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
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
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
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
      <div className="sm:col-span-1">
        <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</label>
        {hint && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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
    <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-950">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
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
        className="h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-indigo-600 dark:bg-zinc-700"
      />
      <span className="w-16 shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-center font-mono text-xs tabular-nums text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
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
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
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
          checked ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"
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

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
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

  // Agent tab
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Hello. This is Priya from RegenOrthoSport"
  );
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [agentName, setAgentName] = useState("Priya");

  // LLM tab
  const [provider, setProvider] = useState<"azure" | "openai">("azure");
  const [model, setModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(0.4);
  const [maxTokens, setMaxTokens] = useState(250);

  // Audio tab
  const [voice, setVoice] = useState("aria");
  const [outputFormat, setOutputFormat] = useState<"pcm16" | "mp3" | "mulaw">("pcm16");
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [denoise, setDenoise] = useState(true);

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
  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent Settings</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Configure the orchestration behavior of your AI voice agent.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 self-start rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 sm:self-auto"
        >
          <Save className="h-4 w-4" />
          {saved ? "Saved" : "Save changes"}
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
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
            <Field label="Provider">
              <SegmentedControl
                value={provider}
                onChange={setProvider}
                options={[
                  { value: "azure", label: "Azure OpenAI" },
                  { value: "openai", label: "OpenAI" },
                ]}
              />
            </Field>
            <Field label="Model" hint={`Routed through ${provider === "azure" ? "Azure OpenAI" : "OpenAI"}.`}>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
              </select>
            </Field>
          </SectionCard>

          <SectionCard title="Generation parameters">
            <Field label="Temperature" hint="Lower is more deterministic and on-script.">
              <Slider value={temperature} onChange={setTemperature} min={0} max={1} step={0.1} />
            </Field>
            <Field label="Max response tokens">
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
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="aria">Aria — warm, professional</option>
                <option value="nova">Nova — bright, energetic</option>
                <option value="sage">Sage — calm, measured</option>
              </select>
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
            <Field label="Speaking rate">
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
            >
              <Slider value={interruptionWords} onChange={setInterruptionWords} min={1} max={10} suffix=" words" />
            </Field>
            <Field label="Endpointing delay" hint="Silence duration before the agent assumes the caller has finished speaking.">
              <Slider value={endpointingMs} onChange={setEndpointingMs} min={200} max={2000} step={50} suffix="ms" />
            </Field>
          </SectionCard>

          <SectionCard title="Conversational behavior">
            <Toggle
              checked={backchannel}
              onChange={setBackchannel}
              label="Backchannel responses"
              description="Agent inserts brief acknowledgements ('mm-hmm', 'got it') while listening."
            />
          </SectionCard>
        </div>
      )}

      {/* Call */}
      {activeTab === "call" && (
        <div className="space-y-6">
          <SectionCard title="Call limits">
            <Field label="Max call duration">
              <Slider value={maxCallMinutes} onChange={setMaxCallMinutes} min={1} max={30} suffix=" min" />
            </Field>
            <Field label="Silence timeout" hint="Ends the call if the caller is silent for this long.">
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
            <KpiCard label="Calls this month" value="482" />
            <KpiCard label="Avg. handle time" value="3:42" />
            <KpiCard label="Task success rate" value="91%" />
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
  );
}
