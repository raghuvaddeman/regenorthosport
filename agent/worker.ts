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
  type MetricsCollectedEvent,
  ServerOptions,
} from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { EgressClient } from 'livekit-server-sdk';
import { EncodedFileOutput, EncodedFileType, S3Upload } from '@livekit/protocol';
import { EndSensitivity, GoogleGenAI, Modality, StartSensitivity } from '@google/genai';
import { z } from 'zod';
import type { CallUsage } from '../lib/pricing/call-cost';

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

// geminiModel: plain text-in/text-out Gemini, used only for the post-call
// transcript translation + AI summary (buildTranscriptAndSummary) — pinned
// after A/B testing showed ~20% lower avg LLM TTFT and ~11% lower avg total
// turn latency vs. gemini-2.5-flash, with no observed workflow/quality drift
// across 3 test calls (37 turns). That test predates the Live API switch
// below and was specific to the old text-only pipeline; re-validate if this
// ever gets swapped.
//
// realtimeModel/realtimeVoice: the live conversational model (STT+LLM+TTS
// unified via Gemini's Live API), replacing the former Sarvam STT + Sarvam
// TTS pipeline. Using 'gemini-2.5-flash-native-audio-preview-12-2025' instead
// of the 3.1 live-preview model — independent reports (Google's own dev forum)
// describe audio "stutter" specifically on newer native-audio preview models;
// this is a more mature variant, worth testing before assuming anything else
// is wrong. Voice list and model names verified against
// node_modules/@livekit/agents-plugin-google/dist/realtime/api_proto.d.ts.
const MODEL_DEFAULTS = {
  geminiModel: 'gemini-3.1-flash-lite',
  realtimeModel: 'gemini-2.5-flash-native-audio-preview-12-2025',
  realtimeVoice: 'Kore',
};

/** Fetches the tenant's chosen Gemini text model from the Providers page, falling back to the default. */
async function fetchProviderModels(): Promise<{ geminiModel: string }> {
  const appUrl = process.env.APP_URL;
  const secret = process.env.INTERNAL_SECRET_KEY;
  const clientId = process.env.AGENT_CLIENT_ID;
  if (!appUrl || !secret || !clientId) return { geminiModel: MODEL_DEFAULTS.geminiModel };

  try {
    const res = await fetch(`${appUrl}/api/providers?client_id=${encodeURIComponent(clientId)}`, {
      headers: { 'x-internal-secret': secret },
    });
    if (!res.ok) return { geminiModel: MODEL_DEFAULTS.geminiModel };
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return { geminiModel: MODEL_DEFAULTS.geminiModel };

    const configFor = (providerKey: string) =>
      json.data.find((p: any) => p.provider_key === providerKey)?.config_json as Record<string, string> | undefined;

    return { geminiModel: configFor('gemini')?.model ?? MODEL_DEFAULTS.geminiModel };
  } catch (err: any) {
    console.warn('Provider models fetch failed:', err.message);
    return { geminiModel: MODEL_DEFAULTS.geminiModel };
  }
}

// 0/'MINIMAL' disables Gemini's internal reasoning pass, which otherwise inflates
// response latency. Applies to the Live API the same way it did to the old plain
// google.LLM: Gemini 3.1 live models use thinkingLevel, Gemini 2.5 live models use
// thinkingBudget — passing both lets the plugin pick whichever the active model
// honors, per RealtimeModel's constructor doc comment (thinkingConfig).
const GEMINI_THINKING_BUDGET = 0;
const GEMINI_THINKING_LEVEL = 'MINIMAL';

// realtimeInputConfig.automaticActivityDetection is the Live API's own turn-
// detection tuning (verified in node_modules/@google/genai/dist/node/*.d.ts) —
// NOT a field on AgentSession/voice.AgentSession itself, and there is no
// "server_vad" mode in this SDK. START/END_SENSITIVITY_LOW are already this
// field's documented defaults; set explicitly here so the choice is visible
// rather than implicit. silenceDurationMs is set to 600ms, directly mirroring
// ENDPOINTING_MIN_DELAY_MS from the old pipeline — the value that was
// specifically raised from 400ms after real test calls showed premature turn
// commits and mid-sentence caller cut-offs. A pasted spec suggested 450ms with
// no supporting evidence; going anywhere near the already-proven-too-aggressive
// 400ms risks reproducing that exact bug. prefixPaddingMs=150 preserves the
// caller's opening phonemes. Both are still UNVERIFIED against real Live API
// call behavior (a different detector than the old STT pipeline's) — revisit
// after test calls, same discipline as before.
const VAD_START_SENSITIVITY = StartSensitivity.START_SENSITIVITY_LOW;
const VAD_END_SENSITIVITY = EndSensitivity.END_SENSITIVITY_LOW;
const VAD_PREFIX_PADDING_MS = 150;
const VAD_SILENCE_DURATION_MS = 600;

// A/B testing knob: overrides the dashboard-configured realtime model when set, so
// future model swaps for a test batch don't require touching the Providers page.
// Not needed for the current pinned default (see MODEL_DEFAULTS.realtimeModel) —
// leave unset in production.
const REALTIME_MODEL_OVERRIDE = process.env.LLM_MODEL;

// Callers may speak English (Indian accent), Hindi, Telugu, Marathi, Bengali, or
// Gujarati. The Live API's `language` option takes a single fixed code, which
// would bias the whole session toward one language and work against automatic
// detection — deliberately left unset on the RealtimeModel itself; this system-
// prompt instruction is what drives the actual multi-language behavior instead.
// Language codes verified against ai.google.dev/gemini-api/docs/live-guide's
// supported-languages table: plain base tags only (hi, te, mr, bn, gu) — there is
// no -IN regional variant for any of them, including English (en, not en-IN).
const MULTILINGUAL_INSTRUCTIONS =
  'You are a localized Indian voice assistant. Callers may speak English (with an Indian accent), Hindi, ' +
  'Telugu, Marathi, Bengali, or Gujarati. Automatically detect which language the caller is speaking from ' +
  'their audio and respond in that exact same language — if they switch languages mid-conversation, switch ' +
  'with them. Maintain localized cultural context: use appropriate regional honorifics where natural (e.g. ' +
  '"ji" in Hindi, "garu" in Telugu), and keep a professional yet warm tone throughout.\n\n';

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
  usage: CallUsage;
  recordingUrl: string | null;
  transcript: string | null;
  aiSummary: string | null;
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

// The live call itself may genuinely happen in Hindi/Telugu/Marathi/Bengali/
// Gujarati/English (see MULTILINGUAL_INSTRUCTIONS) — the dashboard's transcript/
// summary columns are English-only, so this translates whatever language(s) the
// call was conducted in into clean English before storing. Live call behavior
// (the Live API's own language handling) is untouched; this only affects what
// gets saved after the call ends.
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

/**
 * Subscribes to the session's `metrics_collected` events and logs per-response
 * latency ([LATENCY] lines), in addition to the SDK's built-in structured
 * metrics logger. Logs a [LATENCY] SUMMARY line when the call ends. Logging
 * only — does not touch the Live API's conversational behavior.
 *
 * The Live API unifies STT/LLM/TTS into one continuous session, so it reports
 * a single `realtime_model_metrics` event per response (ttft + token counts,
 * split into audio/text) rather than the old pipeline's separate eou/llm/stt/tts
 * events — there's no separate eou/tts stage to add up into a per-turn total
 * anymore, so ttftMs alone stands in as the per-response latency figure.
 */
function attachLatencyLogging(
  session: voice.AgentSession,
  activeConfig: {
    realtimeModel: string;
    geminiModel: string;
    thinkingBudget: number;
    thinkingLevel: string;
    callUuid: string;
    callStartedAt: number;
    callInfo: { customerPhone: string; egressId: string };
    egressClient: EgressClient | null;
  }
) {
  console.log(
    `[LATENCY] config realtime_model=${activeConfig.realtimeModel} ` +
      `thinking_budget=${activeConfig.thinkingBudget} thinking_level=${activeConfig.thinkingLevel} ` +
      `vad_start_sensitivity=${VAD_START_SENSITIVITY} vad_end_sensitivity=${VAD_END_SENSITIVITY} ` +
      `vad_prefix_padding=${VAD_PREFIX_PADDING_MS}ms vad_silence_duration=${VAD_SILENCE_DURATION_MS}ms`
  );

  const completedTtftMs: number[] = [];

  let inputAudioTokens = 0;
  let inputTextTokens = 0;
  let outputAudioTokens = 0;
  let outputTextTokens = 0;

  session.on(AgentSessionEventTypes.MetricsCollected, (ev: MetricsCollectedEvent) => {
    // Baseline structured log via the SDK's built-in helper.
    metrics.logMetrics(ev.metrics);

    const m = ev.metrics;
    if (m.type !== 'realtime_model_metrics') return;

    console.log(
      `[LATENCY] request_id=${m.requestId} stage=realtime ttft=${Math.round(m.ttftMs)}ms ` +
        `inputAudioTokens=${m.inputTokenDetails.audioTokens} inputTextTokens=${m.inputTokenDetails.textTokens} ` +
        `outputAudioTokens=${m.outputTokenDetails.audioTokens} outputTextTokens=${m.outputTokenDetails.textTokens}`
    );
    if (m.ttftMs >= 0) completedTtftMs.push(m.ttftMs);

    inputAudioTokens += m.inputTokenDetails.audioTokens;
    inputTextTokens += m.inputTokenDetails.textTokens;
    outputAudioTokens += m.outputTokenDetails.audioTokens;
    outputTextTokens += m.outputTokenDetails.textTokens;
  });

  session.on(AgentSessionEventTypes.Close, () => {
    if (completedTtftMs.length > 0) {
      const turnCount = completedTtftMs.length;
      const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
      console.log(
        `[LATENCY] SUMMARY turns=${turnCount} avg_ttft=${Math.round(avg(completedTtftMs))}ms ` +
          `min_ttft=${Math.round(Math.min(...completedTtftMs))}ms max_ttft=${Math.round(Math.max(...completedTtftMs))}ms`
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
        withTimeout(buildTranscriptAndSummary(session, activeConfig.geminiModel), 18_000, {
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
        recordingUrl,
        transcript: artifacts.transcript,
        aiSummary: artifacts.aiSummary,
        usage: {
          realtimeModel: activeConfig.realtimeModel,
          inputAudioTokens,
          inputTextTokens,
          outputAudioTokens,
          outputTextTokens,
          geminiModel: activeConfig.geminiModel,
          summaryPromptTokens: artifacts.summaryPromptTokens,
          summaryCompletionTokens: artifacts.summaryCompletionTokens,
          callDurationSec: durationSec,
        },
      });
    })();
  });
}

export default defineAgent({
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
    const realtimeModel = REALTIME_MODEL_OVERRIDE ?? MODEL_DEFAULTS.realtimeModel;

    const session = new voice.AgentSession({
      llm: new google.realtime.RealtimeModel({
        model: realtimeModel,
        apiKey: process.env.GEMINI_API_KEY,
        voice: MODEL_DEFAULTS.realtimeVoice,
        modalities: [Modality.AUDIO],
        // language deliberately left unset — see MULTILINGUAL_INSTRUCTIONS comment.
        // languageCodes (a hint list) is NOT supported on the standard Gemini
        // Developer API (apiKey auth) — only on Vertex AI, which this project
        // doesn't use. Setting it throws "languageCodes parameter is not
        // supported in Gemini API." and kills the whole session (confirmed via
        // a live test call — every call failed with zero audio). Empty objects
        // still enable transcription, just with auto-detected language instead
        // of a hint list, which is what we want anyway for auto multi-language.
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET, thinkingLevel: GEMINI_THINKING_LEVEL as any },
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: VAD_START_SENSITIVITY,
            endOfSpeechSensitivity: VAD_END_SENSITIVITY,
            prefixPaddingMs: VAD_PREFIX_PADDING_MS,
            silenceDurationMs: VAD_SILENCE_DURATION_MS,
          },
        },
      }),
    });

    attachLatencyLogging(session, {
      realtimeModel,
      geminiModel: models.geminiModel,
      thinkingBudget: GEMINI_THINKING_BUDGET,
      thinkingLevel: GEMINI_THINKING_LEVEL,
      callUuid,
      callStartedAt,
      callInfo,
      egressClient,
    });

    // Resolution order for bulk calls: the campaign's own locked-in script
    // (placeholders already filled in at creation time) beats the tenant-wide
    // outbound prompt, which beats the inbound prompt, which beats the
    // hardcoded fallback. Inbound calls are unaffected. MULTILINGUAL_INSTRUCTIONS
    // is prepended in every case so the multi-language behavior applies
    // regardless of which script is otherwise in effect.
    const baseInstructions = bulkCallInfo
      ? campaignResolvedPrompt || settings?.outboundSystemPrompt || settings?.systemPrompt || FALLBACK_INSTRUCTIONS
      : (settings?.systemPrompt ?? FALLBACK_INSTRUCTIONS);
    const instructions = MULTILINGUAL_INSTRUCTIONS + baseInstructions;

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
