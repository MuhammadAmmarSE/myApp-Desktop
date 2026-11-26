// Redline's mark: the faceted gem with its orbit, from the app icon, tinted with the current theme's
// colour (the facets are the accent mixed lighter or darker, so every theme gets its own gem).
import { motion } from "motion/react";
import { useReduced } from "@/theme";

const mix = (pct: number, to: "white" | "black") => `color-mix(in srgb, var(--c-accent) ${100 - pct}%, ${to})`;

const FACETS: [string, string][] = [
  ["512.0,408.5 601.6,563.8 422.4,563.8", mix(16, "white")],
  ["512.0,408.5 711.2,397.0 601.6,563.8", "var(--c-accent)"],
  ["601.6,563.8 512.0,742.0 422.4,563.8", mix(45, "black")],
  ["422.4,563.8 312.8,397.0 512.0,408.5", mix(24, "white")],
  ["512.0,408.5 312.8,397.0 512.0,282.0", mix(34, "white")],
  ["512.0,408.5 512.0,282.0 711.2,397.0", mix(20, "white")],
  ["601.6,563.8 711.2,397.0 711.2,627.0", mix(42, "black")],
  ["601.6,563.8 711.2,627.0 512.0,742.0", mix(66, "black")],
  ["422.4,563.8 512.0,742.0 312.8,627.0", mix(22, "black")],
  ["422.4,563.8 312.8,627.0 312.8,397.0", mix(12, "white")],
];

export function BrandMark({ size = 28, glow = true, spin = false }: { size?: number; glow?: boolean; spin?: boolean }) {
  const reduced = useReduced();
  return (
    <svg width={size} height={size} viewBox="230 200 564 624" aria-hidden className="shrink-0 overflow-visible">
      <defs>
        <radialGradient id="bm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--c-accent)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--c-accent)" stopOpacity="0" />
        </radialGradient>
        <clipPath id="bm-front">
          <rect x="0" y="512" width="1024" height="512" />
        </clipPath>
      </defs>
      {glow && <circle cx="512" cy="512" r="330" fill="url(#bm-glow)" />}
      <g transform="rotate(-18 512 512)">
        <ellipse cx="512" cy="512" rx="300" ry="92" fill="none" stroke="var(--c-accent2)" strokeWidth="16" opacity="0.35" />
      </g>
      <motion.g
        animate={spin && !reduced ? { rotate: [0, 6, -4, 0] } : undefined}
        transition={spin ? { duration: 9, repeat: Infinity, ease: "easeInOut" } : undefined}
        style={{ originX: "512px", originY: "512px" }}
      >
        {FACETS.map(([pts, fill]) => (
          <polygon key={pts} points={pts} fill={fill} stroke="rgba(255,255,255,0.18)" strokeWidth="4" strokeLinejoin="round" />
        ))}
        <polygon points="512.0,408.5 512.0,282.0 312.8,397.0" fill="#fff" opacity="0.12" />
      </motion.g>
      <g transform="rotate(-18 512 512)">
        <ellipse cx="512" cy="512" rx="300" ry="92" fill="none" stroke="var(--c-accent2)" strokeWidth="20" clipPath="url(#bm-front)" />
      </g>
    </svg>
  );
}
