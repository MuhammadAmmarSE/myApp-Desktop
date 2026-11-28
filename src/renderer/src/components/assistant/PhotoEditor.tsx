// A photo, as large as the window allows (one bigger than the window: click it to see it at full
// size and scroll around it). A photo you're about to send can be edited here before it goes: crop
// it (drag a box, move it, pull its corners), turn it a quarter either way, or draw on it (the
// theme's colours, three thicknesses). Every step can be undone (Ctrl+Z); Save puts the edited
// photo back in the message, shrunk like any photo. Esc leaves a tool, then closes (asking first if
// there are changes).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Check, Crop, PenLine, RotateCcw, RotateCw, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button, confirmDialog, IconButton, Spin, toast } from "@/components/ui";
import { useEscape } from "@/lib/layers";
import { shrinkDataUrl, type Photo } from "@/lib/images";
import { boxFromDrag, cropImage, dragBox, drawOnImage, handleAt, isWhole, rotateImage, strokePath, type Box, type Handle, type Stroke } from "@/lib/photoEdit";
import { ease } from "@/theme/motion";

const layer = () => document.getElementById("overlay-root") || document.body;
const PENS = ["--c-danger", "--c-warn", "--c-success", "--c-info", "--c-accent", "--c-accent2", "--c-text", "--c-bg"];
const SIZES = [
  { label: "Thin", w: 0.005 },
  { label: "Medium", w: 0.011 },
  { label: "Thick", w: 0.022 },
];
const WHOLE: Box = { x: 0, y: 0, w: 1, h: 1 };
type Mode = "view" | "crop" | "draw";

export function PhotoEditor({ src, name, editable, onClose, onSave }: { src: string; name?: string; editable?: boolean; onClose: () => void; onSave?: (photo: Photo) => void }) {
  const [history, setHistory] = useState<string[]>([src]);
  const [at, setAt] = useState(0);
  const current = history[at];
  const [mode, setMode] = useState<Mode>("view");
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState<Box>(WHOLE);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [pens] = useState(() => {
    const css = getComputedStyle(document.documentElement);
    // the theme's colours, each once (some themes use the same one for two jobs), six at most
    const seen = new Set<string>();
    return PENS.map((v) => css.getPropertyValue(v).trim())
      .filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()))
      .slice(0, 6);
  });
  const [pen, setPen] = useState(0);
  const [size, setSize] = useState(1);
  const img = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState({ w: 0, h: 0 });
  // the picture as large as the window allows (a small one up to twice its size)
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const k = natural.w ? Math.min((win.w - 48) / natural.w, (win.h - 150) / natural.h, 2) : 0;
  const fit = k > 0 ? { width: Math.round(natural.w * k), height: Math.round(natural.h * k) } : undefined;
  const canZoom = k > 0 && k < 0.98; // bigger than the window: a click shows it at full size
  const changed = at > 0 || strokes.length > 0;

  // the picture's size on screen, for the crop box and the drawing layer
  useLayoutEffect(() => {
    const el = img.current;
    if (!el) return;
    const measure = () => setShown({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [current, zoom]);

  // what's being drawn, on top of the picture
  useEffect(() => {
    const c = canvas.current;
    if (!c || !shown.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(shown.w * dpr);
    c.height = Math.round(shown.h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes) strokePath(ctx, s, c.width, c.height);
  }, [strokes, shown]);

  const push = (next: string) => {
    setHistory((h) => [...h.slice(0, at + 1), next].slice(-20));
    setAt((i) => Math.min(i + 1, 19));
  };
  const run = async (step: () => Promise<string>) => {
    setBusy(true);
    try {
      push(await step());
    } catch (e: any) {
      toast.error(e?.message || "That couldn't be done.");
    } finally {
      setBusy(false);
    }
  };
  const bake = async () => {
    if (!strokes.length) return current;
    const next = await drawOnImage(current, strokes);
    setStrokes([]);
    push(next);
    return next;
  };
  const undo = () => {
    if (busy) return;
    if (strokes.length) return setStrokes((s) => s.slice(0, -1));
    if (at > 0) setAt(at - 1);
  };
  const tool = async (next: Mode) => {
    if (mode === "draw" && strokes.length) {
      setBusy(true);
      await bake();
      setBusy(false);
    }
    setZoom(false);
    setBox(WHOLE);
    setMode(mode === next ? "view" : next);
  };
  const applyCrop = async () => {
    if (!isWhole(box)) await run(() => cropImage(current, box));
    setBox(WHOLE);
    setMode("view");
  };
  const save = async () => {
    if (!onSave) return onClose();
    setBusy(true);
    try {
      const done = await bake();
      if (at === 0 && done === src) return onClose();
      onSave(await shrinkDataUrl(done, name));
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "That couldn't be saved.");
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    if (editable && changed && !(await confirmDialog({ title: "Leave without saving?", body: "Your changes to this photo will be lost.", confirm: "Leave", danger: true }))) return;
    onClose();
  };
  useEscape(() => {
    if (mode !== "view") {
      setStrokes([]);
      setBox(WHOLE);
      setMode("view");
    } else void close();
  }, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (editable && e.key === "Enter" && mode === "crop") void applyCrop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // pointer on the picture, as fractions of it
  const fraction = (e: React.PointerEvent) => {
    const r = img.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const drag = useRef<{ handle: Handle | null; from: { x: number; y: number }; start: Box } | null>(null);
  const down = (e: React.PointerEvent) => {
    if (mode === "view" || busy || !img.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = fraction(e);
    if (mode === "draw") {
      setStrokes((s) => [...s, { color: pens[pen] || "red", width: SIZES[size].w, points: [p] }]);
      drag.current = { handle: null, from: p, start: box };
      return;
    }
    const r = img.current.getBoundingClientRect();
    drag.current = { handle: isWhole(box) ? null : handleAt(box, p, { x: 14 / r.width, y: 14 / r.height }), from: p, start: box };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = fraction(e);
    if (mode === "draw") {
      setStrokes((s) => {
        const last = s[s.length - 1];
        if (!last) return s;
        const prev = last.points[last.points.length - 1];
        if (Math.hypot((p.x - prev.x) * shown.w, (p.y - prev.y) * shown.h) < 2) return s;
        return [...s.slice(0, -1), { ...last, points: [...last.points, { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }] }];
      });
      return;
    }
    setBox(d.handle ? dragBox(d.start, d.handle, p.x - d.from.x, p.y - d.from.y) : boxFromDrag(d.from, p));
  };
  const up = () => (drag.current = null);

  const cursor = mode !== "view" ? "crosshair" : !canZoom ? "default" : zoom ? "zoom-out" : "zoom-in";
  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={editable ? "Edit the photo" : "The photo"}
      data-testid="photo-editor"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: ease.out }}
      className="fixed inset-0 z-[115] flex flex-col backdrop-blur-sm"
      style={{ background: "color-mix(in srgb, var(--c-bg) 92%, transparent)" }}
    >
      {/* the top: its name, the tools, close */}
      <div className="flex shrink-0 items-center gap-2 px-4 py-3 text-text">
        <div className="min-w-0 flex-1 truncate text-[13px] text-text2">{name || "Photo"}</div>
        {editable && (
          <div className="flex items-center gap-1 rounded-[12px] bg-surface2 p-1 hairline" data-testid="photo-tools">
            <ToolButton icon={Crop} label="Crop" on={mode === "crop"} onClick={() => void tool("crop")} disabled={busy} />
            <ToolButton icon={RotateCcw} label="Turn left" onClick={() => void run(() => rotateImage(current, -1))} disabled={busy || mode !== "view"} />
            <ToolButton icon={RotateCw} label="Turn right" onClick={() => void run(() => rotateImage(current, 1))} disabled={busy || mode !== "view"} />
            <ToolButton icon={PenLine} label="Draw" on={mode === "draw"} onClick={() => void tool("draw")} disabled={busy} />
            <span className="mx-1 h-5 w-px bg-line" />
            <ToolButton icon={Undo2} label="Undo" onClick={undo} disabled={busy || (!changed && !strokes.length)} />
          </div>
        )}
        {!editable && canZoom && <ToolButton icon={zoom ? ZoomOut : ZoomIn} label={zoom ? "Fit to the window" : "Full size"} onClick={() => setZoom((z) => !z)} />}
        <div className="flex flex-1 justify-end">
          <IconButton icon={X} label="Close" onClick={() => void close()} />
        </div>
      </div>

      {/* the picture */}
      <div className={clsx("relative min-h-0 flex-1 px-6", zoom ? "overflow-auto" : "grid place-items-center overflow-hidden")}>
        <div className={clsx("relative", zoom ? "mx-auto w-max" : "")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ cursor, touchAction: "none" }}>
          <motion.img
            key={current}
            ref={img}
            src={current}
            alt={name || "Photo"}
            draggable={false}
            initial={{ opacity: 0.6, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: ease.out }}
            onClick={() => mode === "view" && canZoom && setZoom((z) => !z)}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={zoom ? undefined : fit}
            className={clsx("block select-none rounded-[10px] shadow-[var(--shadow-pop)]", zoom ? "max-w-none" : "max-h-[calc(100vh-150px)] max-w-[calc(100vw-48px)] object-contain")}
            data-testid="photo-large"
          />
          {mode === "draw" && <canvas ref={canvas} className="pointer-events-none absolute left-0 top-0" style={{ width: shown.w, height: shown.h }} data-testid="photo-ink" />}
          {mode === "crop" && shown.w > 0 && <CropBox box={box} w={shown.w} h={shown.h} />}
          {busy && (
            <div className="absolute inset-0 grid place-items-center">
              <Spin size={22} className="text-accent-text" />
            </div>
          )}
        </div>
      </div>

      {/* the bottom: what the tool needs, then Cancel / Save */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 px-4 py-3">
        <AnimatePresence mode="wait" initial={false}>
          {mode === "draw" ? (
            <motion.div key="draw" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-[12px] bg-surface2 px-3 py-2 hairline" data-testid="photo-pens">
              {pens.map((c, i) => (
                <button key={i} type="button" aria-label={`Pen ${i + 1}`} aria-pressed={pen === i} onClick={() => setPen(i)} className={clsx("h-6 w-6 rounded-full transition-transform", pen === i ? "scale-110 ring-2 ring-[var(--c-text)] ring-offset-2 ring-offset-[var(--c-surface2)]" : "ring-1 ring-[var(--c-line)] hover:scale-105")} style={{ background: c }} />
              ))}
              <span className="mx-1 h-5 w-px bg-line" />
              {SIZES.map((s, i) => (
                <button key={s.label} type="button" aria-label={s.label} aria-pressed={size === i} onClick={() => setSize(i)} className={clsx("grid h-7 w-7 place-items-center rounded-[8px]", size === i ? "bg-accent-soft" : "hover:bg-hover")}>
                  <span className="rounded-full bg-[var(--c-text)]" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
                </button>
              ))}
              <Button size="sm" variant="primary" icon={Check} onClick={() => void tool("draw")} disabled={busy}>
                Done drawing
              </Button>
            </motion.div>
          ) : mode === "crop" ? (
            <motion.div key="crop" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-[12px] bg-surface2 px-3 py-2 text-[12.5px] text-text2 hairline">
              <span>{isWhole(box) ? "Drag over the part to keep" : "Move the box or pull its corners"}</span>
              <Button size="sm" onClick={() => (setBox(WHOLE), setMode("view"))}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" icon={Check} onClick={() => void applyCrop()} disabled={busy || isWhole(box)} data-testid="crop-apply">
                Crop
              </Button>
            </motion.div>
          ) : editable ? (
            <motion.div key="save" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
              <Button onClick={() => void close()}>Cancel</Button>
              <Button variant="primary" icon={Check} onClick={() => void save()} loading={busy} data-testid="photo-save">
                {changed ? "Save" : "Done"}
              </Button>
            </motion.div>
          ) : (
            <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px] text-text3">
              {canZoom ? `Click the photo to see it ${zoom ? "fit the window" : "at full size"} · ` : ""}Esc closes
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>,
    layer(),
  );
}

function ToolButton({ icon: Icon, label, on, onClick, disabled }: { icon: typeof Crop; label: string; on?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={on} onClick={onClick} disabled={disabled} className={clsx("grid h-8 w-8 place-items-center rounded-[9px] transition-colors disabled:opacity-35", on ? "bg-accent-soft text-accent-text" : "text-text2 hover:bg-hover hover:text-text")}>
      <Icon size={16} />
    </button>
  );
}

// the crop box: everything outside it dimmed, a frame with corner handles and thirds lines
function CropBox({ box, w, h }: { box: Box; w: number; h: number }) {
  const x = box.x * w;
  const y = box.y * h;
  const bw = box.w * w;
  const bh = box.h * h;
  const corner = "absolute h-3.5 w-3.5 rounded-[3px] border-2 border-[var(--c-accent)] bg-[var(--c-surface)]";
  return (
    <div className="pointer-events-none absolute left-0 top-0" style={{ width: w, height: h }} data-testid="crop-box">
      <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--c-bg) 55%, transparent)", clipPath: `polygon(evenodd, 0 0, ${w}px 0, ${w}px ${h}px, 0 ${h}px, 0 0, ${x}px ${y}px, ${x}px ${y + bh}px, ${x + bw}px ${y + bh}px, ${x + bw}px ${y}px, ${x}px ${y}px)` }} />
      <div className="absolute border-2 border-[var(--c-accent)]" style={{ left: x, top: y, width: bw, height: bh }}>
        <div className="absolute inset-y-0 left-1/3 w-px bg-[color-mix(in_srgb,var(--c-text)_35%,transparent)]" />
        <div className="absolute inset-y-0 left-2/3 w-px bg-[color-mix(in_srgb,var(--c-text)_35%,transparent)]" />
        <div className="absolute inset-x-0 top-1/3 h-px bg-[color-mix(in_srgb,var(--c-text)_35%,transparent)]" />
        <div className="absolute inset-x-0 top-2/3 h-px bg-[color-mix(in_srgb,var(--c-text)_35%,transparent)]" />
        <span className={clsx(corner, "-left-2 -top-2")} />
        <span className={clsx(corner, "-right-2 -top-2")} />
        <span className={clsx(corner, "-bottom-2 -left-2")} />
        <span className={clsx(corner, "-bottom-2 -right-2")} />
      </div>
    </div>
  );
}
