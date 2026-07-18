// agent/greeting.ts
// Shared constants for the pre-recorded Priya opening greeting — imported by
// both the live worker (agent/worker.ts) and the one-time generation script
// (agent/generate-opening.ts), so the spoken text and the audio file path
// can never drift between them.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// This text must always match what's actually spoken in the WAV file exactly
// — it is not read live from the dashboard's configurable Welcome Message
// field. Changing the wording means re-running `npm run agent:generate-opening`
// and redeploying the new file, not just editing a setting.
export const GREETING_TEXT =
  'Hello, and welcome to RegenOrthoSport! This is Priya, your digital assistant. How can I help you today?';

export const OPENING_AUDIO_PATH = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'opening.wav');
