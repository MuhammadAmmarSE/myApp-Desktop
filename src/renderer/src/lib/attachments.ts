// Files for the assistant (photos have lib/images.ts): picked through the main process or dropped
// on the composer, sent as base64. Up to 4 with a message, 10 MB each, 20 MB together.
export type Attachment = { id: string; name: string; size: number; data: string };
export const MAX_FILES = 4;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

let n = 0;
export const attachmentId = () => `f${Date.now().toString(36)}${n++}`;

const readAsBase64 = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(new Error("That file couldn't be read."));
    r.readAsDataURL(file);
  });

// dropped files, within `room` files and `left` bytes; too-big ones named in skipped
export async function attachmentsFromFiles(files: File[], room: number, left: number): Promise<{ files: Attachment[]; skipped: string[] }> {
  const out: Attachment[] = [];
  const skipped: string[] = [];
  for (const f of files.slice(0, Math.max(0, room))) {
    if (f.size > MAX_FILE_BYTES || f.size > left) {
      skipped.push(f.name);
      continue;
    }
    left -= f.size;
    out.push({ id: attachmentId(), name: f.name || "file", size: f.size, data: await readAsBase64(f) });
  }
  return { files: out, skipped };
}
