// Behind the glass: the live Aurora (slow drifting light in the theme's colours), one of the 3D
// wallpapers (a back and a front layer that shift a little with the pointer), or nothing.
import { useEffect, useRef } from "react";
import { useSettings } from "@/store/settings";
import { useTheme } from "@/theme";

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
  const front = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const backUrl = background !== "aurora" && background !== "none" ? wallpaperUrl(background, theme.id, "back") : undefined;
  const frontUrl = backUrl ? wallpaperUrl(background, theme.id, "front") : undefined;

  // the layers drift a few pixels against each other as the pointer moves: depth, not motion
  useEffect(() => {
    if (!backUrl || motion === "reduced") return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const step = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      if (back.current) back.current.style.transform = `translate3d(${(-x * 6).toFixed(2)}px, ${(-y * 4).toFixed(2)}px, 0) scale(1.04)`;
      if (front.current) front.current.style.transform = `translate3d(${(-x * 16).toFixed(2)}px, ${(-y * 10).toFixed(2)}px, 0) scale(1.06)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(step) : 0;
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [backUrl, motion]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-bg" data-wallpaper={backUrl ? background : background === "aurora" ? "aurora" : "none"}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 85% -10%, var(--c-bg2), transparent 60%), radial-gradient(90% 70% at -10% 110%, color-mix(in srgb, var(--c-bg2) 60%, transparent), transparent 60%)" }} />
      {background === "aurora" && (
        <div className="aurora" style={{ animationPlayState: motion === "reduced" ? "paused" : "running" }}>
          <span className="a1" />
          <span className="a2" />
          <span className="a3" />
          <span className="a4" />
        </div>
      )}
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
