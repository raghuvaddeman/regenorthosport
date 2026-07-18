// agent/wav.ts
// Minimal 16-bit PCM WAV read/write helpers — just enough for the fixed
// pre-recorded opening greeting (agent/greeting.ts), not general-purpose
// codec support.

/**
 * Throws on anything but 16-bit PCM (compressed WAV, non-16-bit, missing
 * chunks) rather than silently producing garbled audio.
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

/** Encodes raw 16-bit PCM samples as a standard 44-byte-header WAV file (the inverse of parseWavPcm16). */
export function writeWavPcm16(data: Int16Array, sampleRate: number, channels: number): Buffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = data.length * bytesPerSample;

  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size (PCM)
  buffer.writeUInt16LE(1, 20); // audio format: 1 = PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(buffer, 44);
  return buffer;
}
