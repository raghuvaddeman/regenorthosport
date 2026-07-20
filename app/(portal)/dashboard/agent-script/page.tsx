"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  MessageSquareText,
  PhoneOutgoing,
  Database,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
  Plus,
  Code,
  ListTree,
} from "lucide-react";
import { DEFAULT_VOICE_PIPELINE, isVoicePipeline, type VoicePipeline } from "@/lib/voice-pipeline";
import { SectionCard, Field, TextInput, TextArea, SaveButton } from "@/components/agent-settings-ui";
import { useUnsavedChangesGuard } from "@/lib/hooks/use-unsaved-changes-guard";

const SCRIPT_TABS = [
  { id: "inbound", label: "Inbound Script", icon: MessageSquareText },
  { id: "outbound", label: "Outbound Script", icon: PhoneOutgoing },
  { id: "knowledge", label: "Knowledge Base", icon: Database },
] as const;

type ScriptTabId = (typeof SCRIPT_TABS)[number]["id"];

const DEFAULT_SYSTEM_PROMPT = `You are Priya, the AI front-desk receptionist for RegenOrthoSport, an orthopedic and sports medicine clinic.

- Greet callers warmly and confirm the reason for their call.
- Help schedule, reschedule, or cancel appointments.
- Answer basic questions about clinic hours, location, and accepted insurance.
- Never provide medical advice or diagnoses — offer to connect the caller with clinical staff instead.
- If the caller sounds distressed or describes an emergency, direct them to call 911 immediately.
- Keep responses concise and speak in a calm, professional tone.`;

/* --------------------------- Prompt section editor --------------------------- */
// Splits the flat system prompt into named, toggleable, reorderable sections
// (mirroring how third-party assistant builders present a script as blocks
// like "Identity & Purpose" / "Flow: Booking Request" instead of one big
// text field), while keeping systemPrompt itself as the single flat string
// agent/worker.ts actually sends to the LLM — reassembled from enabled
// sections, in order, whenever they change. systemPromptSections persists
// the full set (including disabled ones, so toggling off doesn't lose text)
// as UI-only metadata; nothing in agent/worker.ts reads it.

type PromptSection = {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  // True only for the untitled text before the first detected header (e.g.
  // "You are Priya, a receptionist for...") — serialized as bare content,
  // never as a "TITLE\ncontent" block, since it was never a header line.
  isPreamble?: boolean;
};

/** A line counts as a section header if it starts with a run of 2+ uppercase
 * letters/digits/spaces/&/'// characters — covers plain "PERSONA" headers as
 * well as "CONVERSATION FLOW — one question per turn" and "NEVER USE: ..."
 * style ones, stopping at the first lowercase letter or punctuation outside
 * that set. Heuristic, not exhaustive — a starting point to reorganize, not a
 * guarantee every prompt splits perfectly on the first try.
 */
function detectSectionHeader(line: string): string | null {
  const trimmed = line.trimEnd();
  let i = 0;
  while (i < trimmed.length && /[A-Z0-9 &'/]/.test(trimmed[i])) i++;
  const run = trimmed.slice(0, i).trim();
  return run.length >= 2 && /[A-Z]/.test(run) ? run : null;
}

function parsePromptIntoSections(text: string): PromptSection[] {
  const sections: PromptSection[] = [];
  let currentTitle = "";
  let currentIsPreamble = true;
  let currentLines: string[] = [];
  let idCounter = 0;

  function flush() {
    const content = currentLines.join("\n").trim();
    if (content || !currentIsPreamble) {
      sections.push({ id: `parsed-${idCounter++}`, title: currentTitle, content, enabled: true, isPreamble: currentIsPreamble });
    }
  }

  for (const line of text.split("\n")) {
    const header = detectSectionHeader(line);
    if (header) {
      flush();
      currentTitle = header;
      currentIsPreamble = false;
      const rest = line.trim().slice(header.length).trim();
      currentLines = rest ? [rest] : [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections.length ? sections : [{ id: "parsed-0", title: "", content: text, enabled: true, isPreamble: true }];
}

function serializeSections(sections: PromptSection[]): string {
  return sections
    .filter((s) => s.enabled)
    .map((s) => (s.isPreamble ? s.content : `${s.title}\n${s.content}`))
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n");
}

function PromptSectionRow({
  section,
  index,
  expanded,
  onToggleExpanded,
  onChange,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  section: PromptSection;
  index: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (patch: Partial<PromptSection>) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-700"
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-300 dark:text-zinc-500" />
        <button
          type="button"
          onClick={onToggleExpanded}
          className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="w-5 shrink-0 text-right text-xs text-zinc-400 dark:text-zinc-500">{index + 1}.</span>
        <input
          value={section.isPreamble ? "Introduction" : section.title}
          disabled={section.isPreamble}
          onChange={(e) => onChange({ title: e.target.value.toUpperCase() })}
          placeholder="SECTION TITLE"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-zinc-900 outline-none transition-colors hover:border-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:text-zinc-400 dark:text-zinc-100 dark:hover:border-zinc-500 dark:disabled:text-zinc-500"
        />
        <button
          type="button"
          role="switch"
          aria-checked={section.enabled}
          onClick={() => onChange({ enabled: !section.enabled })}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            section.enabled ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-500"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              section.enabled ? "translate-x-[18px]" : "translate-x-1"
            }`}
          />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-zinc-200 p-3 dark:border-zinc-600">
          <TextArea
            rows={6}
            value={section.content}
            onChange={(e) => onChange({ content: e.target.value })}
            placeholder="What the agent should do in this section..."
          />
        </div>
      )}
    </div>
  );
}

export default function AgentScriptPage() {
  const [scriptSubTab, setScriptSubTab] = useState<ScriptTabId>("inbound");

  const [agentName, setAgentName] = useState("Priya");
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Hello. This is Priya from RegenOrthoSport"
  );
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [outboundSystemPrompt, setOutboundSystemPrompt] = useState("");
  const [knowledgeBase, setKnowledgeBase] = useState("");
  // The structured view of systemPrompt — see the "Prompt section editor" comment
  // above. null means "not loaded/parsed yet"; sectionsViewMode controls which
  // editor (Sections vs. Raw text) is currently shown for the inbound prompt.
  const [sections, setSections] = useState<PromptSection[] | null>(() => parsePromptIntoSections(DEFAULT_SYSTEM_PROMPT));
  const [sectionsViewMode, setSectionsViewMode] = useState<"sections" | "raw">("sections");
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(new Set());
  const dragIndexRef = useRef<number | null>(null);

  function applySections(next: PromptSection[]) {
    setSections(next);
    setSystemPrompt(serializeSections(next));
  }

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
      knowledgeBase: "",
      sections: parsePromptIntoSections(DEFAULT_SYSTEM_PROMPT),
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
          const loadedSections: PromptSection[] =
            Array.isArray(json.data.systemPromptSections) && json.data.systemPromptSections.length
              ? json.data.systemPromptSections
              : parsePromptIntoSections(json.data.systemPrompt);
          setAgentName(json.data.agentName);
          setWelcomeMessage(json.data.welcomeMessage);
          setSystemPrompt(json.data.systemPrompt);
          setOutboundSystemPrompt(json.data.outboundSystemPrompt ?? "");
          setKnowledgeBase(json.data.knowledgeBase ?? "");
          setSections(loadedSections);
          setVoicePipeline(pipeline);
          setSavedSnapshot(
            JSON.stringify({
              agentName: json.data.agentName,
              welcomeMessage: json.data.welcomeMessage,
              systemPrompt: json.data.systemPrompt,
              outboundSystemPrompt: json.data.outboundSystemPrompt ?? "",
              knowledgeBase: json.data.knowledgeBase ?? "",
              sections: loadedSections,
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

  const currentSnapshot = JSON.stringify({ agentName, welcomeMessage, systemPrompt, outboundSystemPrompt, knowledgeBase, sections, voicePipeline });
  const isDirty = savedSnapshot !== currentSnapshot;
  useUnsavedChangesGuard(isDirty);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/agent-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName,
          welcomeMessage,
          systemPrompt,
          outboundSystemPrompt,
          knowledgeBase,
          systemPromptSections: sections,
          voicePipeline,
        }),
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
            description="The instructions that steer the agent's behavior and tone on inbound calls. Organized into named sections you can toggle on/off, reorder, or edit individually — or switch to raw text for free-form editing."
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
                <Sparkles className="h-3.5 w-3.5" /> Prompt canvas
              </div>
              <div className="flex gap-1 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-600">
                <button
                  type="button"
                  onClick={() => {
                    if (sections === null) setSections(parsePromptIntoSections(systemPrompt));
                    setSectionsViewMode("sections");
                  }}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    sectionsViewMode === "sections"
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  <ListTree className="h-3.5 w-3.5" /> Sections
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSectionsViewMode("raw");
                  }}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    sectionsViewMode === "raw"
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  <Code className="h-3.5 w-3.5" /> Raw text
                </button>
              </div>
            </div>

            {sectionsViewMode === "raw" && (
              <TextArea
                rows={12}
                value={systemPrompt}
                onChange={(e) => {
                  setSystemPrompt(e.target.value);
                  // Raw edits invalidate the previous section boundaries — re-derive
                  // them from this text next time Sections view is opened.
                  setSections(null);
                }}
              />
            )}

            {sectionsViewMode === "sections" && (
              <div className="space-y-2">
                {(sections ?? []).map((section, index) => (
                  <PromptSectionRow
                    key={section.id}
                    section={section}
                    index={index}
                    expanded={expandedSectionIds.has(section.id)}
                    onToggleExpanded={() =>
                      setExpandedSectionIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(section.id)) next.delete(section.id);
                        else next.add(section.id);
                        return next;
                      })
                    }
                    onChange={(patch) => {
                      const next = (sections ?? []).map((s) => (s.id === section.id ? { ...s, ...patch } : s));
                      applySections(next);
                    }}
                    onDelete={() => applySections((sections ?? []).filter((s) => s.id !== section.id))}
                    onDragStart={() => {
                      dragIndexRef.current = index;
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const from = dragIndexRef.current;
                      dragIndexRef.current = null;
                      if (from === null || from === index) return;
                      const next = [...(sections ?? [])];
                      const [moved] = next.splice(from, 1);
                      next.splice(index, 0, moved);
                      applySections(next);
                    }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const id = `new-${Date.now()}`;
                    applySections([...(sections ?? []), { id, title: "NEW SECTION", content: "", enabled: true }]);
                    setExpandedSectionIds((prev) => new Set(prev).add(id));
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  <Plus className="h-4 w-4" /> Add Section
                </button>
              </div>
            )}
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

      {scriptSubTab === "knowledge" && (
        <div className="space-y-6">
          <SectionCard
            title="Knowledge Base"
            description="Detailed reference material — treatment/procedure explanations, condition mappings, pricing, anything the agent only needs when a caller asks about it specifically. The agent looks this up on demand instead of it being sent on every turn, which keeps the System Prompt lean and calls faster. Leave empty to skip this lookup entirely."
          >
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
              <Sparkles className="h-3.5 w-3.5" /> Prompt canvas
            </div>
            <TextArea
              rows={20}
              value={knowledgeBase}
              onChange={(e) => setKnowledgeBase(e.target.value)}
              placeholder="e.g. detailed treatment explanations, condition-to-treatment mappings, pricing tiers, doctor bios — anything long and reference-y rather than behavioral."
            />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
