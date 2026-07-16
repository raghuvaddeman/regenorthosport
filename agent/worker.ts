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
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { EgressClient } from 'livekit-server-sdk';
import { EncodedFileOutput, EncodedFileType, S3Upload } from '@livekit/protocol';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type { CallUsage } from '../lib/pricing/call-cost';
import type { CallLatencyMetrics, CallLatencyTurn } from '../lib/observability/call-latency';
import { DEFAULT_VOICE_PIPELINE, isVoicePipeline, type VoicePipeline } from '../lib/voice-pipeline';

const FALLBACK_INSTRUCTIONS =
  'You are a friendly, helpful voice assistant answering phone calls for a healthcare practice. ' +
  'Keep responses brief and conversational, ask clarifying questions when needed, and be polite at all times.';

/** Fetches the persisted agent persona (system prompt + welcome message) from the dashboard. */
async function fetchAgentSettings(): Promise<{
  welcomeMessage: string;
  systemPrompt: string;
  outboundSystemPrompt: string;
  voicePipeline: VoicePipeline;
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
    if (!json.success) return null;
    return {
      ...json.data,
      voicePipeline: isVoicePipeline(json.data?.voicePipeline) ? json.data.voicePipeline : DEFAULT_VOICE_PIPELINE,
    };
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

/**
 * Inbound rooms are always named by LiveKit's SIP dispatch rule, which uses
 * `roomPrefix: 'call'` (see app/api/telephony/route.ts's createInboundDispatchRule
 * call) — so every room this worker didn't name itself starts with "call-".
 * The two call sites that dial out (bulk-call dispatch's `bulk_...` rooms and
 * Agent Settings' manual test trigger's `test-...` rooms) are the only ones
 * where we pick the room name, so their prefixes are the outbound signal.
 * There's no first-class "direction" field on the SIP participant/room to
 * read instead — this is a naming convention, not protocol metadata, so it
 * breaks silently if a future call path picks a room name outside this set.
 */
function isOutboundRoom(roomName: string): boolean {
  return /^(bulk_|test-)/.test(roomName);
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

// Fixed defaults for the two alternate voice pipelines (lib/voice-pipeline.ts) — not
// tenant-configurable yet (see the "simple 3-way switch" scope for this feature).
// Pricing for both is in lib/pricing/call-cost.ts, keyed by these exact model names.
const OPENAI_PIPELINE_DEFAULTS = {
  llmModel: 'gpt-5-mini',
  sttModel: 'whisper-1',
  ttsModel: 'tts-1',
  ttsVoice: 'alloy',
};
// NOT gemini-3.1-flash-live-preview: confirmed via a real test call + SDK source
// (node_modules/@livekit/agents-plugin-google/dist/realtime/realtime_api.js — any
// model name containing "3.1" sets midSessionChatCtxUpdate: false) that any "3.1"
// live model silently breaks session.generateReply(), which is how the welcome
// greeting is triggered — the agent said nothing until the caller spoke first.
// gemini-2.5-flash-native-audio-preview-12-2025 is the SDK's own default for
// non-Vertex (apiKey) auth and does not have this limitation.
const GEMINI_LIVE_PIPELINE_DEFAULTS = {
  model: 'gemini-2.5-flash-native-audio-preview-12-2025',
  voice: 'Puck',
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
  callDirection: 'inbound' | 'outbound';
  durationSec: number;
  ttsAudioDurationMs: number;
  usage: CallUsage;
  // Translation/classification (buildTranscriptAndSummary) always runs on a fixed
  // Gemini model regardless of which pipeline drove the live call — tracked
  // separately from `usage` so they're priced at the Gemini rate, not whatever
  // rate `usage.llmModel` implies (which varies by pipeline).
  classificationPromptTokens: number;
  classificationCompletionTokens: number;
  recordingUrl: string | null;
  transcript: string | null;
  aiSummary: string | null;
  sentiment: SentimentLabel | null;
  callLanguage: CallLanguage | null;
  callIntent: CallIntent | null;
  callOutcome: CallOutcome | null;
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

// Keep these four lists in sync with lib/call-classification.ts, the frontend/API's
// copy of the same categories.
const SENTIMENT_LABELS = ['neutral', 'anxious', 'frustrated', 'curious', 'satisfied'] as const;
type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

const CALL_LANGUAGES = ['mixed', 'english', 'hindi', 'telugu', 'marathi', 'kannada'] as const;
type CallLanguage = (typeof CALL_LANGUAGES)[number];

const CALL_INTENTS = [
  'appointment', 'knee_pain', 'follow_up', 'neck_pain', 'other',
  'back_pain', 'general_inquiry', 'hip_pain', 'shoulder_pain', 'pricing', 'location',
] as const;
type CallIntent = (typeof CALL_INTENTS)[number];

const CALL_OUTCOMES = [
  'booked', 'info_shared', 'callback_promised', 'appointment', 'call_dropped', 'other', 'no_answer',
] as const;
type CallOutcome = (typeof CALL_OUTCOMES)[number];

// Runs against the RAW (pre-translation) transcript, not the translated one — language
// detection needs to see the caller's actual words, which the translation step (above)
// deliberately erases. Summary/intent/outcome are asked to come back in English regardless.
const SUMMARY_PROMPT_PREFIX =
  'Analyze this healthcare-practice phone call for a front-desk dashboard. The transcript below may be ' +
  'in Hindi, Telugu, or other Indian languages, or phonetically transliterated into English/Latin script. ' +
  'Return all text fields in English regardless of the transcript\'s language.\n\n' +
  '1. summary: 2-4 sentences covering the caller\'s stated reason for calling, any action taken or ' +
  'promised (e.g. appointment request logged, callback promised), and any follow-up needed. Concise ' +
  'and factual, no preamble.\n' +
  `2. sentiment: the caller's dominant emotional state during the call, exactly one of: ${SENTIMENT_LABELS.join(', ')}.\n` +
  `3. language: the dominant language(s) the caller actually spoke, exactly one of: ${CALL_LANGUAGES.join(', ')} ` +
  '("mixed" if the caller switched between languages/English mid-call).\n' +
  `4. intent: the caller's primary reason for calling, exactly one of: ${CALL_INTENTS.join(', ')}.\n` +
  `5. outcome: how the call concluded, exactly one of: ${CALL_OUTCOMES.join(', ')}.\n\n` +
  'Transcript:\n';

const CLASSIFICATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    sentiment: { type: Type.STRING, enum: [...SENTIMENT_LABELS] },
    language: { type: Type.STRING, enum: [...CALL_LANGUAGES] },
    intent: { type: Type.STRING, enum: [...CALL_INTENTS] },
    outcome: { type: Type.STRING, enum: [...CALL_OUTCOMES] },
  },
  required: ['summary', 'sentiment', 'language', 'intent', 'outcome'],
};

type ClassificationResult = {
  transcript: string | null;
  aiSummary: string | null;
  sentiment: SentimentLabel | null;
  callLanguage: CallLanguage | null;
  callIntent: CallIntent | null;
  callOutcome: CallOutcome | null;
  summaryPromptTokens: number;
  summaryCompletionTokens: number;
};

/**
 * Extracts a speaker-attributed transcript from the session's chat history, then runs
 * two independent Gemini calls in parallel against it: one translates it to clean
 * English for storage, the other classifies it (summary/sentiment/language/intent/
 * outcome) in a single structured-output call. Both run against the RAW transcript,
 * not each other's output — classification needs the caller's original words to detect
 * language, which translation deliberately erases. The "Agent: "/"Caller: " line
 * prefixes are required by the dashboard's transcript parser
 * (app/(portal)/dashboard/page.tsx). Each step is best-effort — a failure in either
 * never blocks the cost report, and a failed translation falls back to the raw
 * (possibly non-English) transcript rather than losing it.
 */
async function buildTranscriptAndSummary(
  session: voice.AgentSession,
  geminiModel: string
): Promise<ClassificationResult> {
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
  const empty: ClassificationResult = {
    transcript: rawTranscript || null,
    aiSummary: null,
    sentiment: null,
    callLanguage: null,
    callIntent: null,
    callOutcome: null,
    summaryPromptTokens: 0,
    summaryCompletionTokens: 0,
  };
  if (!rawTranscript || !apiKey) {
    console.warn('[RECORDING] Skipping translation/classification: transcript or GEMINI_API_KEY missing.', {
      transcriptLength: rawTranscript.length,
      hasApiKey: !!apiKey,
    });
    return empty;
  }

  const genai = new GoogleGenAI({ apiKey });

  const [translateResult, classifyResult] = await Promise.allSettled([
    genai.models.generateContent({
      model: geminiModel,
      contents: [{ role: 'user', parts: [{ text: TRANSLATE_PROMPT_PREFIX + rawTranscript }] }],
    }),
    genai.models.generateContent({
      model: geminiModel,
      contents: [{ role: 'user', parts: [{ text: SUMMARY_PROMPT_PREFIX + rawTranscript }] }],
      config: { responseMimeType: 'application/json', responseSchema: CLASSIFICATION_RESPONSE_SCHEMA },
    }),
  ]);

  let transcript = rawTranscript;
  let promptTokens = 0;
  let completionTokens = 0;
  if (translateResult.status === 'fulfilled') {
    if (translateResult.value.text) transcript = translateResult.value.text;
    promptTokens += translateResult.value.usageMetadata?.promptTokenCount ?? 0;
    completionTokens += translateResult.value.usageMetadata?.candidatesTokenCount ?? 0;
    console.log('[RECORDING] Transcript translated, length:', transcript.length, 'chars');
  } else {
    console.warn('[RECORDING] Transcript translation failed, using raw transcript:', translateResult.reason?.message);
  }

  let aiSummary: string | null = null;
  let sentiment: SentimentLabel | null = null;
  let callLanguage: CallLanguage | null = null;
  let callIntent: CallIntent | null = null;
  let callOutcome: CallOutcome | null = null;
  if (classifyResult.status === 'fulfilled') {
    try {
      const parsed = classifyResult.value.text ? JSON.parse(classifyResult.value.text) : null;
      aiSummary = parsed?.summary ?? null;
      sentiment = parsed && SENTIMENT_LABELS.includes(parsed.sentiment) ? parsed.sentiment : null;
      callLanguage = parsed && CALL_LANGUAGES.includes(parsed.language) ? parsed.language : null;
      callIntent = parsed && CALL_INTENTS.includes(parsed.intent) ? parsed.intent : null;
      callOutcome = parsed && CALL_OUTCOMES.includes(parsed.outcome) ? parsed.outcome : null;
      promptTokens += classifyResult.value.usageMetadata?.promptTokenCount ?? 0;
      completionTokens += classifyResult.value.usageMetadata?.candidatesTokenCount ?? 0;
      console.log(
        '[RECORDING] AI classification:', aiSummary ?? '(empty)',
        'sentiment:', sentiment ?? '(none)', 'language:', callLanguage ?? '(none)',
        'intent:', callIntent ?? '(none)', 'outcome:', callOutcome ?? '(none)'
      );
    } catch (err: any) {
      console.warn('[RECORDING] Classification response parse failed:', err.message);
    }
  } else {
    console.warn('[RECORDING] AI classification failed:', classifyResult.reason?.message);
  }

  return { transcript, aiSummary, sentiment, callLanguage, callIntent, callOutcome, summaryPromptTokens: promptTokens, summaryCompletionTokens: completionTokens };
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
    voicePipeline: VoicePipeline;
    llmModel: string;
    // Fixed Gemini model buildTranscriptAndSummary always uses for post-call
    // translation/classification, independent of which pipeline drove the live call.
    classificationModel: string;
    // null for gemini_native — its realtime model fuses STT/LLM/TTS into one, so
    // there's no separate stage or endpointing window to report.
    sttModel: string | null;
    ttsModel: string | null;
    thinkingBudget: number;
    thinkingLevel: string;
    endpointingMinDelayMs: number | null;
    endpointingMaxDelayMs: number | null;
    callUuid: string;
    callDirection: 'inbound' | 'outbound';
    callStartedAt: number;
    callInfo: { customerPhone: string; egressId: string };
    egressClient: EgressClient | null;
  }
) {
  // The active LLM only honors one of thinkingBudget/thinkingLevel depending on
  // whether it's a Gemini 3.x model or earlier — see GEMINI_THINKING_LEVEL comment.
  console.log(
    `[LATENCY] config pipeline=${activeConfig.voicePipeline} llm_model=${activeConfig.llmModel} ` +
      `thinking_budget=${activeConfig.thinkingBudget} thinking_level=${activeConfig.thinkingLevel} ` +
      `endpointing_min=${activeConfig.endpointingMinDelayMs ?? 'n/a'}ms endpointing_max=${activeConfig.endpointingMaxDelayMs ?? 'n/a'}ms`
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
  // gemini_native only — Gemini's realtime model reports token usage as a single
  // fused input/output split (with audio vs. text sub-counts), not the separate
  // llm/stt/tts triplet above.
  let realtimeInputTextTokens = 0;
  let realtimeInputAudioTokens = 0;
  let realtimeOutputTextTokens = 0;
  let realtimeOutputAudioTokens = 0;

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
      case 'realtime_model_metrics': {
        // NOT one event per conversational turn: the plugin's isNewGeneration() treats
        // every audio/text delta as a new "generation" (see node_modules/@livekit/
        // agents-plugin-google/dist/realtime/realtime_api.js), so this fires many times
        // per turn, each measuring chunk-to-chunk timing (~0ms) rather than real
        // end-of-utterance-to-first-audio latency. Logged for visibility only — NOT
        // pushed into perTurn, unlike the eou/llm/tts path above. Fabricating fake
        // per-turn totals from this would show near-0ms "latency," which is wrong and
        // was confirmed on a real call (Call Performance showed 0.0-0.1s).
        console.log(
          `[LATENCY] request_id=${m.requestId} stage=realtime ttft=${Math.round(m.ttftMs)}ms ` +
            `input_tokens=${m.inputTokens} output_tokens=${m.outputTokens}`
        );
        // Token counts appear to be a running cumulative total (each event's numbers keep
        // growing through the call, consistent with Gemini's usageMetadata semantics), not
        // a per-event delta — confirmed indirectly: summing every event inflated a real
        // 4-minute call's cost to ~3x a hand-computed estimate. Assignment (not +=) here
        // keeps only the latest snapshot, which is the correct running total by the time
        // the call ends.
        realtimeInputTextTokens = m.inputTokenDetails.textTokens;
        realtimeInputAudioTokens = m.inputTokenDetails.audioTokens;
        realtimeOutputTextTokens = m.outputTokenDetails.textTokens;
        realtimeOutputAudioTokens = m.outputTokenDetails.audioTokens;
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
        voicePipeline: activeConfig.voicePipeline,
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
        // Translate + classify now run in parallel (not sequential), so 12s covers
        // one round-trip with margin rather than two. Always the fixed classification
        // model, independent of activeConfig.llmModel (which varies by pipeline).
        withTimeout(buildTranscriptAndSummary(session, activeConfig.classificationModel), 12_000, {
          transcript: null,
          aiSummary: null,
          sentiment: null,
          callLanguage: null,
          callIntent: null,
          callOutcome: null,
          summaryPromptTokens: 0,
          summaryCompletionTokens: 0,
        }),
      ]);

      const usage: CallUsage =
        activeConfig.voicePipeline === 'gemini_native'
          ? {
              kind: 'realtime',
              llmModel: activeConfig.llmModel,
              inputTextTokens: realtimeInputTextTokens,
              inputAudioTokens: realtimeInputAudioTokens,
              outputTextTokens: realtimeOutputTextTokens,
              outputAudioTokens: realtimeOutputAudioTokens,
              callDurationSec: durationSec,
            }
          : {
              kind: 'standard',
              llmModel: activeConfig.llmModel,
              llmPromptTokens,
              llmCompletionTokens,
              sttModel: activeConfig.sttModel ?? 'unknown',
              sttAudioDurationMs,
              ttsModel: activeConfig.ttsModel ?? 'unknown',
              ttsCharactersCount,
              callDurationSec: durationSec,
            };

      await reportCallCost({
        callUuid: activeConfig.callUuid,
        customerPhone: activeConfig.callInfo.customerPhone,
        callDirection: activeConfig.callDirection,
        durationSec,
        ttsAudioDurationMs,
        recordingUrl,
        transcript: artifacts.transcript,
        aiSummary: artifacts.aiSummary,
        sentiment: artifacts.sentiment,
        callLanguage: artifacts.callLanguage,
        callIntent: artifacts.callIntent,
        callOutcome: artifacts.callOutcome,
        latencyMetrics,
        usage,
        classificationPromptTokens: artifacts.summaryPromptTokens,
        classificationCompletionTokens: artifacts.summaryCompletionTokens,
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
    const callDirection: 'inbound' | 'outbound' = isOutboundRoom(ctx.room.name ?? '') ? 'outbound' : 'inbound';

    const [settings, models, campaignResolvedPrompt] = await Promise.all([
      fetchAgentSettings(),
      fetchProviderModels(),
      bulkCallInfo ? fetchCampaignResolvedPrompt(bulkCallInfo.campaignId) : Promise.resolve(null),
    ]);
    const geminiModel = LLM_MODEL_OVERRIDE ?? models.geminiModel;
    const voicePipeline = settings?.voicePipeline ?? DEFAULT_VOICE_PIPELINE;

    let session: voice.AgentSession;
    if (voicePipeline === 'openai_full') {
      session = new voice.AgentSession({
        vad: ctx.proc.userData.vad as silero.VAD,
        stt: new openai.STT({ apiKey: process.env.OPENAI_API_KEY, model: OPENAI_PIPELINE_DEFAULTS.sttModel, language: 'en' }),
        llm: new openai.LLM({ apiKey: process.env.OPENAI_API_KEY, model: OPENAI_PIPELINE_DEFAULTS.llmModel }),
        tts: new openai.TTS({
          apiKey: process.env.OPENAI_API_KEY,
          model: OPENAI_PIPELINE_DEFAULTS.ttsModel,
          voice: OPENAI_PIPELINE_DEFAULTS.ttsVoice as any,
        }),
        turnHandling: {
          endpointing: { minDelay: ENDPOINTING_MIN_DELAY_MS, maxDelay: ENDPOINTING_MAX_DELAY_MS },
        },
      });
    } else if (voicePipeline === 'gemini_native') {
      // No vad/stt/tts/turnHandling — the realtime model fuses listening and
      // speaking into one connection with its own server-side turn detection.
      session = new voice.AgentSession({
        llm: new google.realtime.RealtimeModel({
          apiKey: process.env.GEMINI_API_KEY,
          model: GEMINI_LIVE_PIPELINE_DEFAULTS.model,
          voice: GEMINI_LIVE_PIPELINE_DEFAULTS.voice as any,
          language: 'en-IN',
        }),
      });
    } else {
      session = new voice.AgentSession({
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
    }

    const pipelineLlmModel =
      voicePipeline === 'openai_full'
        ? OPENAI_PIPELINE_DEFAULTS.llmModel
        : voicePipeline === 'gemini_native'
          ? GEMINI_LIVE_PIPELINE_DEFAULTS.model
          : geminiModel;

    attachLatencyLogging(session, {
      voicePipeline,
      llmModel: pipelineLlmModel,
      classificationModel: geminiModel,
      sttModel: voicePipeline === 'gemini_native' ? null : voicePipeline === 'openai_full' ? OPENAI_PIPELINE_DEFAULTS.sttModel : models.sttModel,
      ttsModel: voicePipeline === 'gemini_native' ? null : voicePipeline === 'openai_full' ? OPENAI_PIPELINE_DEFAULTS.ttsModel : models.ttsModel,
      thinkingBudget: GEMINI_THINKING_BUDGET,
      thinkingLevel: GEMINI_THINKING_LEVEL,
      endpointingMinDelayMs: voicePipeline === 'gemini_native' ? null : ENDPOINTING_MIN_DELAY_MS,
      endpointingMaxDelayMs: voicePipeline === 'gemini_native' ? null : ENDPOINTING_MAX_DELAY_MS,
      callUuid,
      callDirection,
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

    // Not awaited: Room Composite Egress (a full browser-based compositor on LiveKit's
    // side) can take several seconds to spin up — awaiting it here was delaying the
    // welcome greeting by that long on every call, confirmed on a real test call
    // ("agent speaking after 10 seconds"). callInfo.egressId is only read later, at
    // session Close (well after this resolves), so recording can start in the
    // background without the caller waiting on it.
    if (egressClient) {
      const recordingOutput = buildRecordingOutput(callUuid);
      if (recordingOutput) {
        void egressClient
          .startRoomCompositeEgress(ctx.room.name ?? callUuid, recordingOutput, { audioOnly: true })
          .then((egressInfo) => {
            callInfo.egressId = egressInfo.egressId;
            console.log('[RECORDING] Egress started:', egressInfo.egressId, 'status=', egressInfo.status);
          })
          .catch((err: any) => {
            console.warn('[RECORDING] Egress start failed:', err.message);
          });
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
