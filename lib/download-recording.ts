// lib/download-recording.ts
// A plain `<a href={url} download>` silently fails to actually download
// cross-origin files (like these Supabase Storage recording URLs) in most
// browsers — it just navigates/opens the file instead, which is why "Open
// recording" never gave anyone a real download. Fetching the file as a
// Blob and downloading from an object URL on the same origin works reliably
// regardless of where the file is hosted.

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]+/g, "").slice(0, 40) || "unknown";
}

export function buildRecordingFilename(call: { uuid: string; phone: string; at: string }): string {
  const phone = safeFilenamePart(call.phone);
  const date = new Date(call.at);
  const stamp = Number.isNaN(date.getTime())
    ? safeFilenamePart(call.uuid)
    : date.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `call-${phone}-${stamp}.mp3`;
}

/** Fetches the recording and triggers a real browser download (not just a new tab). */
export async function downloadRecording(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch recording (${res.status}).`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
