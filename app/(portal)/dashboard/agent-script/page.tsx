"use client";

import { useEffect, useState } from "react";
import { Sparkles, MessageSquareText, PhoneOutgoing } from "lucide-react";
import { DEFAULT_VOICE_PIPELINE, isVoicePipeline, type VoicePipeline } from "@/lib/voice-pipeline";
import { SectionCard, Field, TextInput, TextArea, SaveButton } from "@/components/agent-settings-ui";
import { useUnsavedChangesGuard } from "@/lib/hooks/use-unsaved-changes-guard";

const SCRIPT_TABS = [
  { id: "inbound", label: "Inbound Script", icon: MessageSquareText },
  { id: "outbound", label: "Outbound Script", icon: PhoneOutgoing },
] as const;

type ScriptTabId = (typeof SCRIPT_TABS)[number]["id"];

const DEFAULT_SYSTEM_PROMPT = `You are Priya, the AI front-desk receptionist for RegenOrthoSport, an orthopedic and sports medicine clinic.

- Greet callers warmly and confirm the reason for their call.
- Help schedule, reschedule, or cancel appointments.
- Answer basic questions about clinic hours, location, and accepted insurance.
- Never provide medical advice or diagnoses — offer to connect the caller with clinical staff instead.
- If the caller sounds distressed or describes an emergency, direct them to call 911 immediately.
- Keep responses concise and speak in a calm, professional tone.`;

export default function AgentScriptPage() {
  const [scriptSubTab, setScriptSubTab] = useState<ScriptTabId>("inbound");

  const [agentName, setAgentName] = useState("Priya");
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Hello. This is Priya from RegenOrthoSport"
  );
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [outboundSystemPrompt, setOutboundSystemPrompt] = useState("");
  // Not edited on this page, but carried through so saving here doesn't
  // reset the pipeline chosen on the Agent Settings page.
  const [voicePipeline, setVoicePipeline] = useState<VoicePipeline>(DEFAULT_VOICE_PIPELINE);
  // Snapshot of the last-loaded/last-saved fields, used to detect unsaved edits.
  // Starts from the same built-in defaults the fields above do, so dirty-checking
  // still works even if the fetch below never succeeds (e.g. Supabase unreachable).
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({
      agentName: "Priya",
      welcomeMessage: "Hello. This is Priya from RegenOrthoSport",
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      outboundSystemPrompt: "",
      voicePipeline: DEFAULT_VOICE_PIPELINE,
    })
  );

  useEffect(() => {
    async function fetchAgentSettings() {
      try {
        const res = await fetch("/api/agent-settings");
        const json = await res.json();
        if (json.success) {
          const pipeline = isVoicePipeline(json.data.voicePipeline) ? json.data.voicePipeline : DEFAULT_VOICE_PIPELINE;
          setAgentName(json.data.agentName);
          setWelcomeMessage(json.data.welcomeMessage);
          setSystemPrompt(json.data.systemPrompt);
          setOutboundSystemPrompt(json.data.outboundSystemPrompt ?? "");
          setVoicePipeline(pipeline);
          setSavedSnapshot(
            JSON.stringify({
              agentName: json.data.agentName,
              welcomeMessage: json.data.welcomeMessage,
              systemPrompt: json.data.systemPrompt,
              outboundSystemPrompt: json.data.outboundSystemPrompt ?? "",
              voicePipeline: pipeline,
            })
          );
        }
      } catch {
        // leave the built-in defaults in place
      }
    }
    fetchAgentSettings();
  }, []);

  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currentSnapshot = JSON.stringify({ agentName, welcomeMessage, systemPrompt, outboundSystemPrompt, voicePipeline });
  const isDirty = savedSnapshot !== currentSnapshot;
  useUnsavedChangesGuard(isDirty);

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
      setSavedSnapshot(currentSnapshot);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

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
          <h1 className="text-xl font-semibold tracking-tight">Agent Script</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            What your AI voice agent says and how it behaves on inbound and outbound calls.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <SaveButton isDirty={isDirty} saving={saving} saved={saved} onClick={handleSave} />
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </div>
      </div>

      {/* Sub-tab strip */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-600">
        {SCRIPT_TABS.map(({ id, label, icon: Icon }) => {
          const active = scriptSubTab === id;
          return (
            <button
              key={id}
              onClick={() => setScriptSubTab(id)}
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

      {scriptSubTab === "inbound" && (
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
            title="Inbound System Prompt"
            description="The instructions that steer the agent's behavior and tone on inbound calls."
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

      {scriptSubTab === "outbound" && (
        <div className="space-y-6">
          <SectionCard
            title="Outbound / Bulk Call System Prompt"
            description={
              'Used as the reusable template for weekly webinar RSVP calls. Supports placeholders: ' +
              '{{doctor_name}}, {{condition}}, {{webinar_date}}, {{webinar_time}}. Falls back to the inbound prompt if left empty.'
            }
          >
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
              <Sparkles className="h-3.5 w-3.5" /> Prompt canvas
            </div>
            <TextArea
              rows={12}
              value={outboundSystemPrompt}
              onChange={(e) => setOutboundSystemPrompt(e.target.value)}
              placeholder="Leave empty to reuse the inbound prompt above for bulk call campaigns."
            />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
