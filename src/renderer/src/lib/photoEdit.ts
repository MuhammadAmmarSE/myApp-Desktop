// The photo editor's arithmetic, kept apart from the screen so it can be tested: a crop box (in
// fractions of the picture, 0..1) dragged, moved and resized; and turning what was drawn on the
// screen into the picture's own pixels. The canvas work (rotate, crop, draw, shrink) is at the end.

export type Box = { x: number; y: number; w: number; h: number }; // fractions of the picture
export type Handle = "nw" | "ne" | "sw" | "se" | "move";
export type Stroke = { color: string; width: number; points: { x: number; y: number }[] }; // fractions; width: of the picture's width

export const MIN_BOX = 0.04; // a crop is never smaller than this, so it can't vanish
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// keep a box inside the picture and no smaller than the minimum
export function clampBox(b: Box): Box {
  const w = Math.min(1, Math.max(MIN_BOX, b.w));
  const h = Math.min(1, Math.max(MIN_BOX, b.h));
  return { x: Math.min(1 - w, Math.max(0, b.x)), y: Math.min(1 - h, Math.max(0, b.y)), w, h };
}

// a new box from where the drag began to where it is now (either direction)
export function boxFromDrag(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  const x1 = clamp01(Math.min(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y));
  const x2 = clamp01(Math.max(a.x, b.x));
  const y2 = clamp01(Math.max(a.y, b.y));
  return clampBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
}

// the box after dragging one of its corners (or the whole box) by dx, dy
export function dragBox(start: Box, handle: Handle, dx: number, dy: number): Box {
  if (handle === "move") return clampBox({ ...start, x: start.x + dx, y: start.y + dy });
  let { x, y } = start;
  let r = start.x + start.w;
  let btm = start.y + start.h;
  if (handle === "nw" || handle === "sw") x = Math.min(r - MIN_BOX, clamp01(x + dx));
  if (handle === "ne" || handle === "se") r = Math.max(x + MIN_BOX, clamp01(r + dx));
  if (handle === "nw" || handle === "ne") y = Math.min(btm - MIN_BOX, clamp01(y + dy));
  if (handle === "sw" || handle === "se") btm = Math.max(y + MIN_BOX, clamp01(btm + dy));
  return clampBox({ x, y, w: r - x, h: btm - y });
}

// which part of the box a point (fractions) is on: a corner (within `reach`), inside, or neither
export function handleAt(b: Box, p: { x: number; y: number }, reach: { x: number; y: number }): Handle | null {
  const near = (px: number, py: number) => Math.abs(p.x - px) <= reach.x && Math.abs(p.y - py) <= reach.y;
  if (near(b.x, b.y)) return "nw";
  if (near(b.x + b.w, b.y)) return "ne";
  if (near(b.x, b.y + b.h)) return "sw";
  if (near(b.x + b.w, b.y + b.h)) return "se";
  if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) return "move";
  return null;
}

// a box is the whole picture (nothing to crop)
export const isWhole = (b: Box) => b.x <= 0.001 && b.y <= 0.001 && b.w >= 0.999 && b.h >= 0.999;

// a box in the picture's own pixels (whole numbers, at least one pixel)
export function boxInPixels(b: Box, width: number, height: number) {
  const x = Math.round(b.x * width);
  const y = Math.round(b.y * height);
  return { x, y, w: Math.max(1, Math.min(width - x, Math.round(b.w * width))), h: Math.max(1, Math.min(height - y, Math.round(b.h * height))) };
}

// ---------- on a canvas ----------

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That picture couldn't be opened."));
    img.src = src;
  });

const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("That picture couldn't be edited.");
  return { c, ctx };
};
// kept sharp between steps; the photo is shrunk once, when it's saved
const out = (c: HTMLCanvasElement) => c.toDataURL("image/jpeg", 0.92);

// turned a quarter to the right (1) or the left (-1)
export async function rotateImage(src: string, dir: 1 | -1): Promise<string> {
  const img = await loadImage(src);
  const { c, ctx } = canvasOf(img.naturalHeight, img.naturalWidth);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return out(c);
}

export async function cropImage(src: string, box: Box): Promise<string> {
  const img = await loadImage(src);
  const p = boxInPixels(box, img.naturalWidth, img.naturalHeight);
  const { c, ctx } = canvasOf(p.w, p.h);
  ctx.drawImage(img, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
  return out(c);
}

export function strokePath(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  ctx.strokeStyle = s.color;
  ctx.lineWidth = Math.max(1, s.width * w);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  s.points.forEach((pt, i) => (i ? ctx.lineTo(pt.x * w, pt.y * h) : ctx.moveTo(pt.x * w, pt.y * h)));
  if (s.points.length === 1) ctx.lineTo(s.points[0].x * w + 0.01, s.points[0].y * h);
  ctx.stroke();
}

export async function drawOnImage(src: string, strokes: Stroke[]): Promise<string> {
  const img = await loadImage(src);
  const { c, ctx } = canvasOf(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  for (const s of strokes) strokePath(ctx, s, c.width, c.height);
  return out(c);
}

export async function imageSize(src: string) {
  const img = await loadImage(src);
  return { width: img.naturalWidth, height: img.naturalHeight };
}
