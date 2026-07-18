// agent/generate-opening.ts
// One-time script: synthesizes the fixed Priya opening greeting via Sarvam
// Bulbul v3 and saves it as a static WAV to agent/assets/opening.wav.
//
// NOT part of the live call path — agent/worker.ts only ever reads the
// resulting file, it never calls Sarvam for the opening. Re-run this
// manually (and redeploy the new file) whenever GREETING_TEXT changes.
//
// Usage: npm run agent:generate-opening

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { initializeLogger } from '@livekit/agents';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import { combineAudioFrames } from '@livekit/rtc-node';
import { GREETING_TEXT, OPENING_AUDIO_PATH } from './greeting';
import { writeWavPcm16 } from './wav';

async function main() {
  // sarvam.TTS's ChunkedStream logs via the SDK's shared logger, which is
  // normally initialized by cli.runApp() (agent/worker.ts's bootstrap) —
  // this script never calls that, so it has to do it itself or every
  // synthesize() call throws "logger not initialized" before doing anything.
  initializeLogger({ pretty: true });

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error('SARVAM_API_KEY is required to generate the opening greeting.');
  }

  // Same model/speaker/language/temperature as the live sarvam-backed
  // pipelines (see agent/worker.ts's MODEL_DEFAULTS and session construction)
  // so the pre-recorded opening's voice matches whatever the caller hears for
  // the rest of the call.
  const tts = new sarvam.TTS({
    apiKey,
    model: 'bulbul:v3',
    speaker: 'priya',
    targetLanguageCode: 'en-IN',
    temperature: 1.0,
  });

  const stream = tts.synthesize(GREETING_TEXT);
  const frames = [];
  for await (const audio of stream) {
    frames.push(audio.frame);
  }
  if (frames.length === 0) {
    throw new Error('Sarvam returned no audio frames for the greeting text.');
  }

  const combined = combineAudioFrames(frames);
  const wavBuffer = writeWavPcm16(combined.data, combined.sampleRate, combined.channels);
  writeFileSync(OPENING_AUDIO_PATH, wavBuffer);
  console.log(
    `Wrote ${wavBuffer.length} bytes (${combined.sampleRate}Hz, ${combined.channels}ch) to ${OPENING_AUDIO_PATH}`
  );
}

main().catch((err) => {
  console.error('Failed to generate opening greeting:', err);
  process.exit(1);
});
