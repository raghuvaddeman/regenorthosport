import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import {
  defineAgent,
  cli,
  voice,
  metrics,
  tool,
  AgentSessionEventTypes,
  type ChatMessage,
  type JobContext,
  type JobProcess,
  type MetricsCollectedEvent,
  ServerOptions,
} from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import * as silero from '@livekit/agents-plugin-silero';
import { EgressClient } from 'livekit-server-sdk';
import { EncodedFileOutput, EncodedFileType, S3Upload } from '@livekit/protocol';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { CallUsage } from '../lib/pricing/call-cost';
import type { CallLatencyMetrics, CallLatencyTurn } from '../lib/observability/call-latency';

const FALLBACK_INSTRUCTIONS =
  'You are a friendly, helpful voice assistant answering phone calls for a healthcare practice. ' +
  'Keep responses brief and conversational, ask clarifying questions when needed, and be polite at all times.';

/** Fetches the persisted agent persona (system prompt + welcome message) from the dashboard. */
async function fetchAgentSettings(): Promise<{
  welcomeMessage: string;
  systemPrompt: string;
  outboundSystemPrompt: string;
} | null> {
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

/**
 * Bulk-call rooms are named `bulk_${campaignId}_${contactId}` by
 * app/api/campaigns/bulk-call/dispatch — that's the only signal this worker
 * has that a job is an agent-initiated outbound campaign call, and how it
 * recovers which campaign/contact the call belongs to.
 */
function parseBulkCallRoomName(roomName: string): { campaignId: string; contactId: string } | null {
  const match = /^bulk_([0-9a-f-]+)_([0-9a-f-]+)$/i.exec(roomName);
  if (!match) return null;
  return { campaignId: match[1], contactId: match[2] };
}

/** Fetches a bulk-call campaign's locked-in, placeholder-resolved outbound script. */
async function fetchCampaignResolvedPrompt(campaignId: string): Promise<string | null> {
  const appUrl = process.env.APP_URL;
  const secret = process.env.INTERNAL_SECRET_KEY;
  if (!appUrl || !secret) return null;

  try {
    const res = await fetch(`${appUrl}/api/campaigns/bulk-call/${campaignId}`, {
      headers: { 'x-internal-secret': secret },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.campaign?.resolvedPrompt ?? null;
  } catch (err: any) {
    console.warn('Bulk campaign prompt fetch failed:', err.message);
    return null;
  }
}

/**
 * The structured-capture tool for webinar-RSVP bulk calls: the agent calls
 * this once it has a clear answer, instead of us trying to parse the
 * transcript afterwards. Posts straight to the contact's row.
 */
function buildRsvpTool(contactId: string) {
  return tool({
    name: 'record_rsvp',
    description:
      "Records the lead's RSVP decision for the webinar, and their reason if declining. " +
      'Call this exactly once, right before ending the call, as soon as you have a clear answer.',
    parameters: z.object({
      rsvpStatus: z
        .enum(['yes', 'no', 'unclear'])
        .describe('Whether the lead confirmed they will attend the webinar. Use "unclear" if they never gave a clear answer.'),
      feedbackNote: z
        .string()
        .optional()
        .describe('A brief reason for declining, in the lead\'s own words. Only include this when rsvpStatus is "no".'),
    }),
    execute: async ({ rsvpStatus, feedbackNote }) => {
      const appUrl = process.env.APP_URL;
      const secret = process.env.INTERNAL_SECRET_KEY;
      if (!appUrl || !secret) {
        console.warn('record_rsvp: APP_URL or INTERNAL_SECRET_KEY not set, could not persist RSVP.');
        return { recorded: false };
      }
      try {
        const res = await fetch(`${appUrl}/api/campaigns/bulk-call/contacts/${contactId}/rsvp`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
          body: JSON.stringify({ rsvpStatus, feedbackNote }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        console.log(`[RSVP] Recorded rsvpStatus=${rsvpStatus} for contact ${contactId}`);
        return { recorded: true };
      } catch (err: any) {
        console.warn('record_rsvp: failed to persist RSVP:', err.message);
        return { recorded: false };
      }
    },
  });
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
// Gemini 3.x models (the plugin detects this by checking if the model name contains
// "gemini-3") ignore thinkingBudget entirely and warn on every turn — they use
// thinkingLevel instead, with 'MINIMAL' being the lowest setting available (there's
// no full "off" for Gemini 3). Passing both fields lets the plugin pick whichever one
// applies to the active model without a warning: Gemini 2.5-and-earlier models use
// thinkingBudget and silently ignore thinkingLevel, Gemini 3.x models use thinkingLevel
// and silently ignore thinkingBudget. See node_modules/@livekit/agents-plugin-google/dist/llm.js.
const GEMINI_THINKING_BUDGET = 0;
const GEMINI_THINKING_LEVEL = 'MINIMAL';

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
// minDelay raised 400ms -> 600ms -> 700ms across two rounds of real test calls, each
// time after the same "transcript arrives after turn has been committed. consider
// raising `minDelay`" warning kept firing. The second round (2026-07-15, 19-turn
// call) showed multiple turns' endOfUtteranceDelayMs landing at exactly 1200ms —
// the maxDelay ceiling — meaning Sarvam was already using the full window on
// several turns, consistent with its documented 700-1200ms typical delay.
//
// maxDelay deliberately NOT lowered (tightening it to 800ms alongside this raise
// was requested) — those same turns that hit the 1200ms ceiling
// would instead force-commit at 800ms, before Sarvam's transcript is ready even
// more often, making the exact warning this change targets MORE frequent. The
// two changes pull in opposite directions given this data; only the evidenced
// one (raising minDelay) is applied. Revisit maxDelay only with its own test-call
// evidence, not paired with a minDelay change in the same round (compounding
// changes made past regressions hard to attribute — see the FUTURE EXPERIMENT
// note above).
const ENDPOINTING_MIN_DELAY_MS = 700;
const ENDPOINTING_MAX_DELAY_MS = 1200;

// A/B testing knob: overrides the dashboard-configured Gemini model when set, so future
// model swaps for a test batch don't require touching the Providers page. Not needed for
// the current pinned default (see MODEL_DEFAULTS.geminiModel) — leave unset in production.
const LLM_MODEL_OVERRIDE = process.env.LLM_MODEL;

/**
 * Reports a completed call's usage (and, when available, its recording/transcript/
 * summary) to the dashboard. Fire-and-forget: never blocks or throws into the caller,
 * matches the pattern used by fetchAgentSettings/startHeartbeat. A failed report means
 * that call's row is permanently missing (no retry) — logged via console.warn only.
 */
async function reportCallCost(payload: {
  callUuid: string;
  customerPhone: string;
  durationSec: number;
  ttsAudioDurationMs: number;
  usage: CallUsage;
  recordingUrl: string | null;
  transcript: string | null;
  aiSummary: string | null;
  latencyMetrics: CallLatencyMetrics;
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

/** Resolves after `ms` with `fallback` if `promise` hasn't settled by then. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** Null if LIVEKIT_URL/API_KEY/API_SECRET aren't set — recording becomes a no-op, not an error. */
function getEgressClient(): EgressClient | null {
  const host = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!host || !apiKey || !apiSecret) {
    console.warn('[RECORDING] Egress client not created: LIVEKIT_URL/API_KEY/API_SECRET missing.');
    return null;
  }
  return new EgressClient(host, apiKey, apiSecret);
}

/** Null if the SUPABASE_S3_* env vars aren't fully configured — recording becomes a no-op. */
function buildRecordingOutput(callUuid: string): EncodedFileOutput | null {
  const accessKey = process.env.SUPABASE_S3_ACCESS_KEY_ID;
  const secret = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;
  const region = process.env.SUPABASE_S3_REGION;
  const endpoint = process.env.SUPABASE_S3_ENDPOINT;
  const bucket = process.env.SUPABASE_S3_BUCKET;
  if (!accessKey || !secret || !region || !endpoint || !bucket) {
    console.warn('[RECORDING] Recording output not built: one or more SUPABASE_S3_* env vars missing.', {
      hasAccessKey: !!accessKey,
      hasSecret: !!secret,
      hasRegion: !!region,
      hasEndpoint: !!endpoint,
      hasBucket: !!bucket,
    });
    return null;
  }

  return new EncodedFileOutput({
    fileType: EncodedFileType.MP3,
    filepath: `calls/${callUuid}.mp3`,
    output: { case: 's3', value: new S3Upload({ accessKey, secret, region, endpoint, bucket, forcePathStyle: true }) },
  });
}

/**
 * Stops the egress (bounded wait — doesn't block indefinitely if the stop call hangs)
 * and returns the recording's public URL. The URL is deterministic from the filepath
 * we chose at start time, so it's returned even if the stop confirmation times out —
 * the file lands there regardless once LiveKit finishes flushing it.
 */
async function stopEgressAndGetUrl(
  egressClient: EgressClient | null,
  egressId: string,
  callUuid: string
): Promise<string | null> {
  const bucket = process.env.SUPABASE_S3_BUCKET;
  const projectUrl = process.env.SUPABASE_PROJECT_URL;
  if (!egressClient || !egressId || !bucket || !projectUrl) {
    console.warn('[RECORDING] No recording URL: egressClient/egressId/bucket/projectUrl missing.', {
      hasEgressClient: !!egressClient,
      egressId: egressId || '(empty)',
      hasBucket: !!bucket,
      hasProjectUrl: !!projectUrl,
    });
    return null;
  }

  try {
    const info = await withTimeout(egressClient.stopEgress(egressId), 5_000, undefined);
    console.log('[RECORDING] Egress stopped:', info ? `status=${info.status}` : 'timed out waiting for stop confirmation');
  } catch (err: any) {
    console.warn('[RECORDING] Egress stop failed:', err.message);
  }
  const url = `${projectUrl}/storage/v1/object/public/${bucket}/calls/${callUuid}.mp3`;
  console.log('[RECORDING] Recording URL:', url);
  return url;
}

// STT runs hardcoded in en-IN, so callers speaking Hindi/Telugu/etc. end up as
// phonetic, Latin-script transcription (e.g. "Nenu appointment repu morning
// teesukuntaanandi") rather than English. This translates that into clean English
// before storing — live call behavior (STT/TTS language) is untouched; this only
// affects what gets saved to the transcript/summary columns after the call ends.
const TRANSLATE_PROMPT_PREFIX =
  'This is a call transcript from a healthcare practice. Agent is the AI receptionist, Caller is the ' +
  'patient. Lines may be in Hindi, Telugu, or other Indian languages, or phonetically transliterated into ' +
  'English/Latin script. Produce a clean, fully-English version. Rules:\n' +
  '- Translate every non-English line/phrase to natural English.\n' +
  '- CRITICAL: preserve every number, price, time, and quantity EXACTLY as stated in the original — do not ' +
  '"correct", round, or otherwise alter any numeric value.\n' +
  '- Keep the exact "Agent: "/"Caller: " line prefixes and one-line-per-turn structure unchanged.\n' +
  '- Do not add commentary, headers, or anything else — output only the transcript lines.\n\n' +
  'Transcript:\n';

const SUMMARY_PROMPT_PREFIX =
  'Summarize this healthcare-practice phone call in 2-4 sentences for a front-desk dashboard. ' +
  "Include: the caller's stated reason for calling, any action taken or promised (e.g. appointment " +
  'request logged, callback promised), and any follow-up needed. Be concise and factual, no preamble.\n\n' +
  'Transcript:\n';

/**
 * Extracts a speaker-attributed transcript from the session's chat history, translates
 * it to clean English, and asks Gemini for a short summary. The "Agent: "/"Caller: "
 * line prefixes are required by the dashboard's transcript parser
 * (app/(portal)/dashboard/page.tsx). Extraction, translation, and summary are each
 * best-effort — a failure at any stage never blocks the cost report, and translation
 * failure falls back to the raw (possibly non-English) transcript rather than losing it.
 */
async function buildTranscriptAndSummary(
  session: voice.AgentSession,
  geminiModel: string
): Promise<{ transcript: string | null; aiSummary: string | null; summaryPromptTokens: number; summaryCompletionTokens: number }> {
  console.log(
    '[RECORDING] session.history.items:',
    session.history.items.length,
    'types:',
    session.history.items.map((item) => item.type).join(',')
  );

  const rawTranscript = session.history.items
    .filter((item): item is ChatMessage => item.type === 'message' && (item.role === 'user' || item.role === 'assistant'))
    .map((m) => `${m.role === 'assistant' ? 'Agent' : 'Caller'}: ${m.textContent ?? ''}`)
    .join('\n');

  console.log('[RECORDING] Extracted transcript length:', rawTranscript.length, 'chars');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!rawTranscript || !apiKey) {
    console.warn('[RECORDING] Skipping translation/summary: transcript or GEMINI_API_KEY missing.', {
      transcriptLength: rawTranscript.length,
      hasApiKey: !!apiKey,
    });
    return { transcript: rawTranscript || null, aiSummary: null, summaryPromptTokens: 0, summaryCompletionTokens: 0 };
  }

  const genai = new GoogleGenAI({ apiKey });
  let transcript = rawTranscript;
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    const translateResp = await genai.models.generateContent({
      model: geminiModel,
      contents: [{ role: 'user', parts: [{ text: TRANSLATE_PROMPT_PREFIX + rawTranscript }] }],
    });
    if (translateResp.text) transcript = translateResp.text;
    promptTokens += translateResp.usageMetadata?.promptTokenCount ?? 0;
    completionTokens += translateResp.usageMetadata?.candidatesTokenCount ?? 0;
    console.log('[RECORDING] Transcript translated, length:', transcript.length, 'chars');
  } catch (err: any) {
    console.warn('[RECORDING] Transcript translation failed, using raw transcript:', err.message);
  }

  try {
    const summaryResp = await genai.models.generateContent({
      model: geminiModel,
      contents: [{ role: 'user', parts: [{ text: SUMMARY_PROMPT_PREFIX + transcript }] }],
    });
    console.log('[RECORDING] AI summary generated:', summaryResp.text ?? '(empty)');
    return {
      transcript,
      aiSummary: summaryResp.text ?? null,
      summaryPromptTokens: promptTokens + (summaryResp.usageMetadata?.promptTokenCount ?? 0),
      summaryCompletionTokens: completionTokens + (summaryResp.usageMetadata?.candidatesTokenCount ?? 0),
    };
  } catch (err: any) {
    console.warn('[RECORDING] AI summary generation failed:', err.message);
    return { transcript, aiSummary: null, summaryPromptTokens: promptTokens, summaryCompletionTokens: completionTokens };
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
    thinkingLevel: string;
    endpointingMinDelayMs: number;
    endpointingMaxDelayMs: number;
    callUuid: string;
    callStartedAt: number;
    callInfo: { customerPhone: string; egressId: string };
    egressClient: EgressClient | null;
  }
) {
  // The active LLM only honors one of thinkingBudget/thinkingLevel depending on
  // whether it's a Gemini 3.x model or earlier — see GEMINI_THINKING_LEVEL comment.
  console.log(
    `[LATENCY] config llm_model=${activeConfig.llmModel} ` +
      `thinking_budget=${activeConfig.thinkingBudget} thinking_level=${activeConfig.thinkingLevel} ` +
      `endpointing_min=${activeConfig.endpointingMinDelayMs}ms endpointing_max=${activeConfig.endpointingMaxDelayMs}ms`
  );

  const turns = new Map<string, TurnLatency>();
  // The full per-turn record, kept alongside the console [LATENCY] lines —
  // this is what actually gets persisted (see CallLatencyMetrics), so the
  // dashboard can show the same breakdown without anyone needing to SSH in
  // and grep PM2 logs.
  const perTurn: CallLatencyTurn[] = [];

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
    perTurn.push({
      speechId,
      eouDelayMs: Math.round(t.eouDelayMs),
      llmTtftMs: Math.round(t.llmTtftMs),
      ttsTtfbMs: Math.round(t.ttsTtfbMs),
      totalMs: Math.round(total),
    });
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
    const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const totals = perTurn.map((t) => t.totalMs);
    const ttfts = perTurn.map((t) => t.llmTtftMs);

    const latencyMetrics: CallLatencyMetrics = {
      config: {
        llmModel: activeConfig.llmModel,
        sttModel: activeConfig.sttModel,
        ttsModel: activeConfig.ttsModel,
        thinkingBudget: activeConfig.thinkingBudget,
        thinkingLevel: activeConfig.thinkingLevel,
        endpointingMinDelayMs: activeConfig.endpointingMinDelayMs,
        endpointingMaxDelayMs: activeConfig.endpointingMaxDelayMs,
      },
      summary: {
        turnCount: perTurn.length,
        avgTotalMs: totals.length ? Math.round(avg(totals)) : null,
        minTotalMs: totals.length ? Math.round(Math.min(...totals)) : null,
        maxTotalMs: totals.length ? Math.round(Math.max(...totals)) : null,
        avgLlmTtftMs: ttfts.length ? Math.round(avg(ttfts)) : null,
      },
      perTurn,
    };

    if (perTurn.length > 0) {
      console.log(
        `[LATENCY] SUMMARY turns=${latencyMetrics.summary.turnCount} avg_total=${latencyMetrics.summary.avgTotalMs}ms ` +
          `min_total=${latencyMetrics.summary.minTotalMs}ms max_total=${latencyMetrics.summary.maxTotalMs}ms ` +
          `avg_llm_ttft=${latencyMetrics.summary.avgLlmTtftMs}ms`
      );
    }

    const durationSec = Math.round((Date.now() - activeConfig.callStartedAt) / 1000);

    // Recording/transcript/summary take real wall-clock time (Egress flush, one Gemini
    // call), so they can't be attached synchronously here. This outer `void` keeps
    // session Close itself non-blocking exactly as before — only the background report
    // is delayed, never call teardown.
    void (async () => {
      const [recordingUrl, artifacts] = await Promise.all([
        stopEgressAndGetUrl(activeConfig.egressClient, activeConfig.callInfo.egressId, activeConfig.callUuid),
        // 18s, not 10s: this now makes two sequential Gemini calls (translate, then
        // summarize) instead of one.
        withTimeout(buildTranscriptAndSummary(session, activeConfig.llmModel), 18_000, {
          transcript: null,
          aiSummary: null,
          summaryPromptTokens: 0,
          summaryCompletionTokens: 0,
        }),
      ]);

      await reportCallCost({
        callUuid: activeConfig.callUuid,
        customerPhone: activeConfig.callInfo.customerPhone,
        durationSec,
        ttsAudioDurationMs,
        recordingUrl,
        transcript: artifacts.transcript,
        aiSummary: artifacts.aiSummary,
        latencyMetrics,
        usage: {
          geminiModel: activeConfig.llmModel,
          llmPromptTokens: llmPromptTokens + artifacts.summaryPromptTokens,
          llmCompletionTokens: llmCompletionTokens + artifacts.summaryCompletionTokens,
          sttModel: activeConfig.sttModel,
          sttAudioDurationMs,
          ttsModel: activeConfig.ttsModel,
          ttsCharactersCount,
          callDurationSec: durationSec,
        },
      });
    })();
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
    const callInfo = { customerPhone: '', egressId: '' };
    const egressClient = getEgressClient();

    const bulkCallInfo = parseBulkCallRoomName(ctx.room.name ?? '');

    const [settings, models, campaignResolvedPrompt] = await Promise.all([
      fetchAgentSettings(),
      fetchProviderModels(),
      bulkCallInfo ? fetchCampaignResolvedPrompt(bulkCallInfo.campaignId) : Promise.resolve(null),
    ]);
    const geminiModel = LLM_MODEL_OVERRIDE ?? models.geminiModel;

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: new sarvam.STT({ model: models.sttModel as any, languageCode: 'en-IN' }),
      llm: new google.LLM({
        model: geminiModel,
        apiKey: process.env.GEMINI_API_KEY,
        thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET, thinkingLevel: GEMINI_THINKING_LEVEL as any },
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
      thinkingLevel: GEMINI_THINKING_LEVEL,
      endpointingMinDelayMs: ENDPOINTING_MIN_DELAY_MS,
      endpointingMaxDelayMs: ENDPOINTING_MAX_DELAY_MS,
      callUuid,
      callStartedAt,
      callInfo,
      egressClient,
    });

    // Resolution order for bulk calls: the campaign's own locked-in script
    // (placeholders already filled in at creation time) beats the tenant-wide
    // outbound prompt, which beats the inbound prompt, which beats the
    // hardcoded fallback. Inbound calls are unaffected.
    const instructions = bulkCallInfo
      ? campaignResolvedPrompt || settings?.outboundSystemPrompt || settings?.systemPrompt || FALLBACK_INSTRUCTIONS
      : (settings?.systemPrompt ?? FALLBACK_INSTRUCTIONS);

    const agent = new voice.Agent({
      instructions,
      tools: bulkCallInfo ? [buildRsvpTool(bulkCallInfo.contactId)] : undefined,
    });

    await session.start({ agent, room: ctx.room });

    // Captured once here (participant is definitely connected by now) rather than
    // re-read at session Close, where the disconnecting participant may already be
    // gone from ctx.room.remoteParticipants.
    const participant = [...ctx.room.remoteParticipants.values()][0];
    callInfo.customerPhone = participant?.identity?.replace(/^sip_/, '') ?? '';

    if (egressClient) {
      const recordingOutput = buildRecordingOutput(callUuid);
      if (recordingOutput) {
        try {
          const egressInfo = await egressClient.startRoomCompositeEgress(ctx.room.name ?? callUuid, recordingOutput, {
            audioOnly: true,
          });
          callInfo.egressId = egressInfo.egressId;
          console.log('[RECORDING] Egress started:', egressInfo.egressId, 'status=', egressInfo.status);
        } catch (err: any) {
          console.warn('[RECORDING] Egress start failed:', err.message);
        }
      }
    } else {
      console.warn('[RECORDING] Skipping egress: egressClient is null.');
    }

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

// Ticks the bulk-call campaign engine (app/api/campaigns/bulk-call/dispatch) —
// this worker process is just the reliable "clock"; all the actual campaign
// state/dialing logic lives server-side where the Supabase admin client and
// LiveKit SDK are already set up. Same fire-and-forget pattern as the heartbeat.
function startBulkCallDispatcher() {
  const appUrl = process.env.APP_URL;
  const secret = process.env.INTERNAL_SECRET_KEY;
  if (!appUrl || !secret) {
    console.warn('Bulk call dispatcher disabled: APP_URL or INTERNAL_SECRET_KEY is not set.');
    return;
  }

  const tick = () => {
    fetch(`${appUrl}/api/campaigns/bulk-call/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    }).catch((err) => console.warn('Bulk call dispatch tick failed:', err.message));
  };

  tick();
  setInterval(tick, 15_000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startHeartbeat();
  startBulkCallDispatcher();
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
}
