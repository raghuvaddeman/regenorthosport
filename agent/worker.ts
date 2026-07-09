import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { defineAgent, cli, voice, type JobContext, type JobProcess, ServerOptions } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import * as silero from '@livekit/agents-plugin-silero';

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: new sarvam.STT({ model: 'saaras:v3', languageCode: 'en-IN' }),
      llm: new google.LLM({ model: 'gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY }),
      tts: new sarvam.TTS({ model: 'bulbul:v2', targetLanguageCode: 'en-IN' }),
    });

    const agent = new voice.Agent({
      instructions:
        'You are a friendly, helpful voice assistant answering phone calls for a healthcare practice. ' +
        'Keep responses brief and conversational, ask clarifying questions when needed, and be polite at all times.',
    });

    await session.start({ agent, room: ctx.room });

    await session.generateReply({
      instructions: 'Greet the caller warmly and ask how you can help them today.',
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
