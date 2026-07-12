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

const MODEL_DEFAULTS = {
  geminiModel: 'gemini-2.5-flash',
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

type TurnLatency = { eouDelayMs?: number; llmTtftMs?: number; ttsTtfbMs?: number };

/**
 * Subscribes to the session's `metrics_collected` events and logs per-turn
 * latency breakdown ([LATENCY] lines) correlated by `speech_id`, in addition
 * to the SDK's built-in structured metrics logger. Logging only — does not
 * touch STT/TTS/LLM behavior.
 */
function attachLatencyLogging(session: voice.AgentSession) {
  const turns = new Map<string, TurnLatency>();

  const maybeLogTotal = (speechId: string) => {
    const t = turns.get(speechId);
    if (!t || t.eouDelayMs === undefined || t.llmTtftMs === undefined || t.ttsTtfbMs === undefined) return;
    const total = t.eouDelayMs + t.llmTtftMs + t.ttsTtfbMs;
    console.log(`[LATENCY] speech_id=${speechId} TOTAL=${Math.round(total)}ms`);
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
        console.log(`[LATENCY] speech_id=${speechId} stage=llm ttft=${Math.round(m.ttftMs)}ms`);
        if (m.speechId) {
          const t = turns.get(m.speechId) ?? {};
          if (t.llmTtftMs === undefined) t.llmTtftMs = m.ttftMs;
          turns.set(m.speechId, t);
          maybeLogTotal(m.speechId);
        }
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
        break;
      }
      default:
        break;
    }
  });
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const [settings, models] = await Promise.all([fetchAgentSettings(), fetchProviderModels()]);

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: new sarvam.STT({ model: models.sttModel as any, languageCode: 'en-IN' }),
      llm: new google.LLM({ model: models.geminiModel, apiKey: process.env.GEMINI_API_KEY }),
      tts: new sarvam.TTS({ model: models.ttsModel as any, speaker: models.ttsVoice, targetLanguageCode: 'en-IN' }),
    });

    attachLatencyLogging(session);

    const agent = new voice.Agent({
      instructions: settings?.systemPrompt ?? FALLBACK_INSTRUCTIONS,
    });

    await session.start({ agent, room: ctx.room });

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
