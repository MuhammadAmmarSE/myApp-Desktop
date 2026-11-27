// Behind the glass: the live Aurora (slow drifting light in the theme's colours), one of the 3D
// wallpapers (a back and a front layer that shift a little with the pointer), or nothing.
import { useEffect, useRef } from "react";
import type { Theme } from "@myapp/core";
import { useSettings } from "@/store/settings";
import { useTheme } from "@/theme";
import { useWindowActive } from "@/lib/activity";
import { useLightEffects } from "@/lib/effects";

const files = import.meta.glob("../../assets/wallpapers/*/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
export const wallpaperUrl = (scene: string, theme: string, layer: "back" | "front") => files[`../../assets/wallpapers/${scene}/${theme}-${layer}.webp`];
export const WALLPAPERS = [
  { id: "monolith", name: "Monolith" },
  { id: "peaks", name: "Peaks" },
  { id: "silk", name: "Silk" },
  { id: "spheres", name: "Spheres" },
].filter((w) => !!wallpaperUrl(w.id, "redline", "back"));

export function Background() {
  const background = useSettings((s) => s.background);
  const motion = useSettings((s) => s.motion);
  const theme = useTheme();
  const active = useWindowActive();
  const light = useLightEffects();
  const front = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const backUrl = background !== "aurora" && background !== "none" ? wallpaperUrl(background, theme.id, "back") : undefined;
  const frontUrl = backUrl ? wallpaperUrl(background, theme.id, "front") : undefined;

  // the layers drift a few pixels against each other as the pointer moves: depth, not motion. At
  // most 30 times a second: the glass over them is blurred again each time they move, and a few
  // pixels of drift look just as smooth at 30. Light effects keep the layers still.
  useEffect(() => {
    if (!backUrl || motion === "reduced" || !active || light) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let last = 0;
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const step = (t: number) => {
      if (t - last < 32) {
        raf = requestAnimationFrame(step);
        return;
      }
      last = t;
      x += (tx - x) * 0.15;
      y += (ty - y) * 0.15;
      if (back.current) back.current.style.transform = `translate3d(${(-x * 6).toFixed(2)}px, ${(-y * 4).toFixed(2)}px, 0) scale(1.04)`;
      if (front.current) front.current.style.transform = `translate3d(${(-x * 16).toFixed(2)}px, ${(-y * 10).toFixed(2)}px, 0) scale(1.06)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(step) : 0;
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [backUrl, motion, active, light]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-bg" data-wallpaper={backUrl ? background : background === "aurora" ? "aurora" : "none"}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 85% -10%, var(--c-bg2), transparent 60%), radial-gradient(90% 70% at -10% 110%, color-mix(in srgb, var(--c-bg2) 60%, transparent), transparent 60%)" }} />
      {background === "aurora" && <Aurora theme={theme} still={motion === "reduced"} light={light} />}
      {backUrl && (
        <>
          <div ref={back} className="absolute inset-0 bg-cover bg-center transition-opacity duration-700" style={{ backgroundImage: `url(${backUrl})`, transform: "scale(1.04)" }} />
          {frontUrl && <div ref={front} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${frontUrl})`, transform: "scale(1.06)" }} />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, color-mix(in srgb, var(--c-bg) 35%, transparent), color-mix(in srgb, var(--c-bg) 55%, transparent))" }} />
        </>
      )}
      {background !== "none" && <div className="grain" />}
    </div>
  );
}

// The Aurora: four soft lights drifting behind the glass. Painted small (a sixth of the window) on a
// canvas, 8 times a second (4 with light effects), and stretched to fill it. The drift is so slow
// that this looks the same as moving it every frame; a full-window CSS blur moving every frame was
// the most expensive thing the app drew. The glass over it isn't blurred (theme/index.ts), so each
// repaint is only the canvas. It stops while the window is behind another one, and with calm motion.
const LIGHTS: { color: (t: Theme) => string; alpha: [dark: number, light: number]; x: number; y: number; w: number; h: number; dx: number; dy: number; grow: number; periods: [number, number, number]; phase: number }[] = [
  { color: (t) => t.colors.accent, alpha: [0.55, 0.32], x: 0.19, y: 0.29, w: 0.73, h: 0.81, dx: 0.11, dy: 0.08, grow: 0.12, periods: [92, 118, 76], phase: 0 },
  { color: (t) => t.colors.accent2, alpha: [0.32, 0.22], x: 0.82, y: 0.19, w: 0.64, h: 0.73, dx: 0.12, dy: 0.09, grow: 0.1, periods: [116, 98, 84], phase: 1.7 },
  { color: (t) => t.colors.info, alpha: [0.2, 0.16], x: 0.56, y: 0.85, w: 0.84, h: 0.7, dx: 0.1, dy: 0.08, grow: 0.08, periods: [128, 104, 96], phase: 3.1 },
  { color: (t) => (t.colors.bg2 === t.colors.bg ? t.colors.accent : t.colors.bg2), alpha: [0.9, 0.5], x: 0.74, y: 0.74, w: 0.42, h: 0.48, dx: 0.08, dy: 0.07, grow: 0.1, periods: [104, 88, 70], phase: 4.4 },
];
const SCALE = 6;
const TICK_MS = 125;

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function Aurora({ theme, still, light }: { theme: Theme; still: boolean; light: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const active = useWindowActive();
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dark = theme.mode === "dark";
    const lights = LIGHTS.map((l) => ({ ...l, rgb: rgb(l.color(theme)), a: dark ? l.alpha[0] : l.alpha[1] }));
    const paint = () => {
      const W = Math.max(48, Math.round(window.innerWidth / SCALE));
      const H = Math.max(32, Math.round(window.innerHeight / SCALE));
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
      }
      const t = performance.now() / 1000;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = dark ? "screen" : "multiply";
      for (const l of lights) {
        const wave = (i: number) => Math.sin((2 * Math.PI * t) / l.periods[i] + l.phase * (i + 1));
        const k = 1 + l.grow * wave(2);
        const [r, g, b] = l.rgb;
        ctx.save();
        ctx.translate((l.x + l.dx * wave(0)) * W, (l.y + l.dy * wave(1)) * H);
        ctx.scale(((l.w * W) / 2) * k, ((l.h * H) / 2) * k);
        const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        fill.addColorStop(0, `rgba(${r},${g},${b},${l.a})`);
        fill.addColorStop(0.45, `rgba(${r},${g},${b},${l.a * 0.35})`);
        fill.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = fill;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
    };
    paint();
    window.addEventListener("resize", paint);
    const timer = !still && active ? setInterval(paint, light ? TICK_MS * 2 : TICK_MS) : null;
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("resize", paint);
    };
  }, [theme, still, active, light]);
  return <canvas ref={ref} className="aurora" aria-hidden />;
}
