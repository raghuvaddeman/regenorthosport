// lib/audio/wav.ts
// Shared with agent/worker.ts (playback) and the greeting-audio upload route
// (validation) — both need the exact same parsing rules, so an uploaded file
// that validates here is guaranteed to actually play at call time.

/**
 * Minimal 16-bit PCM WAV parser — just enough to read a fixed greeting asset,
 * not a general-purpose decoder. Throws on anything else (compressed WAV,
 * non-16-bit, missing chunks) rather than silently producing garbled audio.
 */
export function parseWavPcm16(buffer: Buffer): { data: Int16Array; sampleRate: number; channels: number } {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a valid WAV file (missing RIFF/WAVE header).');
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataStart = offset + 8;
      dataLength = chunkSize;
    }
    // Chunks are word-aligned: a chunk with odd size has one byte of padding after it.
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (dataStart === -1) throw new Error('WAV file has no data chunk.');
  if (bitsPerSample !== 16) throw new Error(`Expected 16-bit PCM WAV, got ${bitsPerSample}-bit.`);

  const pcmBytes = buffer.subarray(dataStart, dataStart + dataLength);
  // Copy into a fresh, aligned ArrayBuffer — Int16Array requires an even byte offset, which
  // buffer.subarray()'s underlying offset isn't guaranteed to have.
  const aligned = new Uint8Array(pcmBytes.length);
  aligned.set(pcmBytes);
  const data = new Int16Array(aligned.buffer);
  return { data, sampleRate, channels };
}
