import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import {
  defineAgent,
  cli,
  voice,
  metrics,
  AgentSessionEventTypes,
  type JobContext,
  type JobProcess,
  type MetricsCollectedEvent,
  ServerOptions,
} from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import * as silero from '@livekit/agents-plugin-silero';
import type { CallUsage } from '../lib/pricing/call-cost';

const FALLBACK_INSTRUCTIONS =
  'You are a friendly, helpful voice assistant answering phone calls for a healthcare practice. ' +
  'Keep responses brief and conversational, ask clarifying questions when needed, and be polite at all times.';

/** Fetches the persisted agent persona (system prompt + welcome message) from the dashboard. */
async function fetchAgentSettings(): Promise<{ welcomeMessage: string; systemPrompt: string } | null> {
  const appUrl = process.env.APP_URL;
  const secret = process.env.INTERNAL_SECRET_KEY;
  const clientId = process.env.AGENT_CLIENT_ID;
  if (!appUrl || !secret || !clientId) {
    console.warn('Agent settings fetch disabled: APP_URL, INTERNAL_SECRET_KEY, or AGENT_CLIENT_ID is not set.');
    return null;
  }

  try {
    const res = await fetch(`${appUrl}/api/agent-settings?client_id=${encodeURIComponent(clientId)}`, {
      headers: { 'x-internal-secret': secret },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch (err: any) {
    console.warn('Agent settings fetch failed:', err.message);
    return null;
  }
}

// Pinned (not the floating gemini-flash-lite-latest alias) after A/B testing showed
// ~20% lower avg LLM TTFT and ~11% lower avg total turn latency vs. gemini-2.5-flash,
// with no observed workflow/quality drift across 3 test calls (37 turns).
const MODEL_DEFAULTS = {
  geminiModel: 'gemini-3.1-flash-lite',
  sttModel: 'saaras:v3',
  ttsModel: 'bulbul:v2',
  ttsVoice: 'anushka',
};

/** Fetches the tenant's chosen LLM/STT/TTS models and TTS voice from the Providers page, falling back to defaults. */
async function fetchProviderModels(): Promise<typeof MODEL_DEFAULTS> {
  const appUrl = process.env.APP_URL;
  const secret = process.env.INTERNAL_SECRET_KEY;
  const clientId = process.env.AGENT_CLIENT_ID;
  if (!appUrl || !secret || !clientId) return MODEL_DEFAULTS;

  try {
    const res = await fetch(`${appUrl}/api/providers?client_id=${encodeURIComponent(clientId)}`, {
      headers: { 'x-internal-secret': secret },
    });
    if (!res.ok) return MODEL_DEFAULTS;
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return MODEL_DEFAULTS;

    const configFor = (providerKey: string) =>
      json.data.find((p: any) => p.provider_key === providerKey)?.config_json as Record<string, string> | undefined;

    return {
      geminiModel: configFor('gemini')?.model ?? MODEL_DEFAULTS.geminiModel,
      sttModel: configFor('sarvam_stt')?.model ?? MODEL_DEFAULTS.sttModel,
      ttsModel: configFor('sarvam_tts')?.model ?? MODEL_DEFAULTS.ttsModel,
      ttsVoice: configFor('sarvam_tts')?.voice ?? MODEL_DEFAULTS.ttsVoice,
    };
  } catch (err: any) {
    console.warn('Provider models fetch failed:', err.message);
    return MODEL_DEFAULTS;
  }
}

// 0 disables Gemini's internal reasoning pass, which otherwise inflates LLM TTFT.
const GEMINI_THINKING_BUDGET = 0;

// turnDetection is left unset, so the SDK auto-provisions its streaming audio-model
// turn detector, whose default endpointing window (300-2500ms) was capping EOU delay
// at 2500ms on hesitant turns. Tightened here without changing the detector itself.
//
// FUTURE EXPERIMENT (parked, not applied): AgentSessionOptions.turnHandling.turnDetection
// supports 'stt' in @livekit/agents 1.5.0 (TurnDetectionMode includes 'stt' — see
// dist/voice/agent_session.d.ts), which would commit turns off Sarvam's own end-of-speech
// signal instead of this streaming audio-model detector, with endpointing minDelay/maxDelay
// applied on top of that instead. Likely removes one inference hop from the latency chain,
// but trades away the audio model's more nuanced "is the caller done talking" judgment for
// plain VAD-style silence detection, which is more prone to cutting off mid-thought pauses.
// Don't stack this with further endpointing changes until we've watched real calls on the
// current config — both affect the same turn-taking decision, so stacking them would make
// it hard to tell which change caused any new interruption issues.
//
// minDelay raised 400ms -> 600ms after test calls showed premature turn commits ("transcript
// arrives after turn has been committed" warnings) and mid-sentence caller cut-offs — 400ms was
// tighter than Sarvam's typical 700-1200ms transcription delay. Costs ~200ms on fast turns.
const ENDPOINTING_MIN_DELAY_MS = 600;
const ENDPOINTING_MAX_DELAY_MS = 1200;

// A/B testing knob: overrides the dashboard-configured Gemini model when set, so future
// model swaps for a test batch don't require touching the Providers page. Not needed for
// the current pinned default (see MODEL_DEFAULTS.geminiModel) — leave unset in production.
const LLM_MODEL_OVERRIDE = process.env.LLM_MODEL;

/**
 * Reports a completed call's usage to the dashboard for cost computation/storage.
 * Fire-and-forget: never blocks or throws into the caller, matches the pattern used
 * by fetchAgentSettings/startHeartbeat. A failed report means that call's cost row
 * is permanently missing (no retry) — logged via console.warn only.
 */
async function reportCallCost(payload: {
  callUuid: string;
  customerPhone: string;
  durationSec: number;
  ttsAudioDurationMs: number;
  usage: CallUsage;
}) {
  const appUrl = process.env.APP_URL;
  const secret = process.env.INTERNAL_SECRET_KEY;
  const clientId = process.env.AGENT_CLIENT_ID;
  if (!appUrl || !secret || !clientId) {
    console.warn('Call cost report disabled: APP_URL, INTERNAL_SECRET_KEY, or AGENT_CLIENT_ID is not set.');
    return;
  }

  try {
    const res = await fetch(`${appUrl}/api/calls?client_id=${encodeURIComponent(clientId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ clientId, ...payload }),
    });
    if (!res.ok) console.warn('Call cost report failed:', res.status, await res.text().catch(() => ''));
  } catch (err: any) {
    console.warn('Call cost report failed:', err.message);
  }
}

type TurnLatency = { eouDelayMs?: number; llmTtftMs?: number; ttsTtfbMs?: number };

/**
 * Subscribes to the session's `metrics_collected` events and logs per-turn
 * latency breakdown ([LATENCY] lines) correlated by `speech_id`, in addition
 * to the SDK's built-in structured metrics logger. Logs a [LATENCY] SUMMARY
 * line when the call ends. Logging only — does not touch STT/TTS/LLM behavior.
 */
function attachLatencyLogging(
  session: voice.AgentSession,
  activeConfig: {
    llmModel: string;
    sttModel: string;
    ttsModel: string;
    thinkingBudget: number;
    endpointingMinDelayMs: number;
    endpointingMaxDelayMs: number;
    callUuid: string;
    callStartedAt: number;
    callInfo: { customerPhone: string };
  }
) {
  console.log(
    `[LATENCY] config llm_model=${activeConfig.llmModel} ` +
      `thinking_budget=${activeConfig.thinkingBudget} (${activeConfig.thinkingBudget === 0 ? 'disabled' : 'enabled'}) ` +
      `endpointing_min=${activeConfig.endpointingMinDelayMs}ms endpointing_max=${activeConfig.endpointingMaxDelayMs}ms`
  );

  const turns = new Map<string, TurnLatency>();
  const completedTotalsMs: number[] = [];
  const completedTtftMs: number[] = [];

  let llmPromptTokens = 0;
  let llmCompletionTokens = 0;
  let sttAudioDurationMs = 0;
  let ttsCharactersCount = 0;
  let ttsAudioDurationMs = 0;

  const maybeLogTotal = (speechId: string) => {
    const t = turns.get(speechId);
    if (!t || t.eouDelayMs === undefined || t.llmTtftMs === undefined || t.ttsTtfbMs === undefined) return;
    const total = t.eouDelayMs + t.llmTtftMs + t.ttsTtfbMs;
    console.log(`[LATENCY] speech_id=${speechId} TOTAL=${Math.round(total)}ms`);
    completedTotalsMs.push(total);
    completedTtftMs.push(t.llmTtftMs);
    turns.delete(speechId);
  };

  session.on(AgentSessionEventTypes.MetricsCollected, (ev: MetricsCollectedEvent) => {
    // Baseline structured log via the SDK's built-in helper.
    metrics.logMetrics(ev.metrics);

    const m = ev.metrics;
    switch (m.type) {
      case 'eou_metrics': {
        const speechId = m.speechId ?? 'unknown';
        console.log(
          `[LATENCY] speech_id=${speechId} stage=eou eou_delay=${Math.round(m.endOfUtteranceDelayMs)}ms transcription_delay=${Math.round(m.transcriptionDelayMs)}ms`
        );
        if (m.speechId) {
          const t = turns.get(m.speechId) ?? {};
          if (t.eouDelayMs === undefined) t.eouDelayMs = m.endOfUtteranceDelayMs;
          turns.set(m.speechId, t);
          maybeLogTotal(m.speechId);
        }
        break;
      }
      case 'llm_metrics': {
        const speechId = m.speechId ?? 'unknown';
        console.log(
          `[LATENCY] speech_id=${speechId} stage=llm ttft=${Math.round(m.ttftMs)}ms promptTokens=${m.promptTokens} completionTokens=${m.completionTokens}`
        );
        if (m.speechId) {
          const t = turns.get(m.speechId) ?? {};
          if (t.llmTtftMs === undefined) t.llmTtftMs = m.ttftMs;
          turns.set(m.speechId, t);
          maybeLogTotal(m.speechId);
        }
        llmPromptTokens += m.promptTokens;
        llmCompletionTokens += m.completionTokens;
        break;
      }
      case 'stt_metrics': {
        sttAudioDurationMs += m.audioDurationMs;
        console.log(`[LATENCY] stage=stt audio_duration=${Math.round(m.audioDurationMs)}ms`);
        break;
      }
      case 'tts_metrics': {
        const speechId = m.speechId ?? 'unknown';
        console.log(`[LATENCY] speech_id=${speechId} stage=tts ttfb=${Math.round(m.ttfbMs)}ms`);
        if (m.speechId) {
          const t = turns.get(m.speechId) ?? {};
          if (t.ttsTtfbMs === undefined) t.ttsTtfbMs = m.ttfbMs;
          turns.set(m.speechId, t);
          maybeLogTotal(m.speechId);
        }
        ttsCharactersCount += m.charactersCount;
        ttsAudioDurationMs += m.audioDurationMs;
        break;
      }
      default:
        break;
    }
  });

  session.on(AgentSessionEventTypes.Close, () => {
    if (completedTotalsMs.length > 0) {
      const turnCount = completedTotalsMs.length;
      const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
      console.log(
        `[LATENCY] SUMMARY turns=${turnCount} avg_total=${Math.round(avg(completedTotalsMs))}ms ` +
          `min_total=${Math.round(Math.min(...completedTotalsMs))}ms max_total=${Math.round(Math.max(...completedTotalsMs))}ms ` +
          `avg_llm_ttft=${Math.round(avg(completedTtftMs))}ms`
      );
    }

    const durationSec = Math.round((Date.now() - activeConfig.callStartedAt) / 1000);
    void reportCallCost({
      callUuid: activeConfig.callUuid,
      customerPhone: activeConfig.callInfo.customerPhone,
      durationSec,
      ttsAudioDurationMs,
      usage: {
        geminiModel: activeConfig.llmModel,
        llmPromptTokens,
        llmCompletionTokens,
        sttModel: activeConfig.sttModel,
        sttAudioDurationMs,
        ttsModel: activeConfig.ttsModel,
        ttsCharactersCount,
        callDurationSec: durationSec,
      },
    });
  });
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const callStartedAt = Date.now();
    const callUuid = ctx.job.id || crypto.randomUUID();
    const callInfo = { customerPhone: '' };

    const [settings, models] = await Promise.all([fetchAgentSettings(), fetchProviderModels()]);
    const geminiModel = LLM_MODEL_OVERRIDE ?? models.geminiModel;

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: new sarvam.STT({ model: models.sttModel as any, languageCode: 'en-IN' }),
      llm: new google.LLM({
        model: geminiModel,
        apiKey: process.env.GEMINI_API_KEY,
        thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET },
      }),
      tts: new sarvam.TTS({ model: models.ttsModel as any, speaker: models.ttsVoice, targetLanguageCode: 'en-IN' }),
      turnHandling: {
        endpointing: { minDelay: ENDPOINTING_MIN_DELAY_MS, maxDelay: ENDPOINTING_MAX_DELAY_MS },
      },
    });

    attachLatencyLogging(session, {
      llmModel: geminiModel,
      sttModel: models.sttModel,
      ttsModel: models.ttsModel,
      thinkingBudget: GEMINI_THINKING_BUDGET,
      endpointingMinDelayMs: ENDPOINTING_MIN_DELAY_MS,
      endpointingMaxDelayMs: ENDPOINTING_MAX_DELAY_MS,
      callUuid,
      callStartedAt,
      callInfo,
    });

    const agent = new voice.Agent({
      instructions: settings?.systemPrompt ?? FALLBACK_INSTRUCTIONS,
    });

    await session.start({ agent, room: ctx.room });

    // Captured once here (participant is definitely connected by now) rather than
    // re-read at session Close, where the disconnecting participant may already be
    // gone from ctx.room.remoteParticipants.
    const participant = [...ctx.room.remoteParticipants.values()][0];
    callInfo.customerPhone = participant?.identity?.replace(/^sip_/, '') ?? '';

    await session.generateReply({
      instructions: settings?.welcomeMessage
        ? `Greet the caller with exactly: "${settings.welcomeMessage}"`
        : 'Greet the caller warmly and ask how you can help them today.',
    });
  },
});

// Reports raw process aliveness to the dashboard, independent of the job/call
// lifecycle above, so the "Agent Status" indicator works even when idle.
function startHeartbeat() {
  const appUrl = process.env.APP_URL;
  const secret = process.env.INTERNAL_SECRET_KEY;
  if (!appUrl || !secret) {
    console.warn('Heartbeat disabled: APP_URL or INTERNAL_SECRET_KEY is not set.');
    return;
  }

  const send = () => {
    fetch(`${appUrl}/api/agent-heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    }).catch((err) => console.warn('Heartbeat failed:', err.message));
  };

  send();
  setInterval(send, 15_000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startHeartbeat();
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
}
