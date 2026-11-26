// Photos for the assistant: pasted, dropped or picked from a folder, then shrunk here (longest
// side 1600 px, JPEG) so they go up quickly and cost the AI little, the same as on the phone.
export type Photo = { id: string; uri: string; data: string; width: number; height: number; name?: string };
export const MAX_PHOTOS = 4;
const MAX_SIDE = 1600;
const MAX_INPUT = 25 * 1024 * 1024;

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That picture couldn't be opened."));
    img.src = src;
  });

export async function shrinkDataUrl(src: string, name?: string): Promise<Photo> {
  const img = await load(src);
  const long = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const k = long > MAX_SIDE ? MAX_SIDE / long : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("That picture couldn't be read.");
  ctx.fillStyle = "#fff"; // a transparent PNG gets a white background, not black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const data = canvas.toDataURL("image/jpeg", 0.72);
  return { id: crypto.randomUUID(), uri: data, data, width: w, height: h, name };
}

export async function photosFromFiles(files: FileList | File[], room: number): Promise<Photo[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith("image/") && f.size <= MAX_INPUT).slice(0, Math.max(0, room));
  const out: Photo[] = [];
  for (const f of list) {
    const url = URL.createObjectURL(f);
    try {
      out.push(await shrinkDataUrl(url, f.name));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return out;
}
