// The current theme, applied as CSS variables on <html>: every colour on screen reads them. Themes
// are core's (the same six as the phone); glass and the Aurora's colours are worked out from them.
import { useEffect } from "react";
import { themeById, type Theme } from "@myapp/core";
import { useSettings, type Background } from "@/store/settings";
import { useLightEffects } from "@/lib/effects";

export const withAlpha = (hex: string, a: number) => {
  if (!hex.startsWith("#")) return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// chart hues per theme: a pair validated for colour-blind separation and contrast on that theme's
// surface (spent echoes the theme's own colour; earned is a blue or an aqua that stays apart from it)
const VIZ: Record<string, { spent: string; earned: string }> = {
  redline: { spent: "#eb6263", earned: "#338ced" },
  carbon: { spent: "#e76624", earned: "#338ced" },
  velvet: { spent: "#d28e05", earned: "#338ced" },
  ember: { spent: "#e76624", earned: "#338ced" },
  midnight: { spent: "#338ced", earned: "#00a888" },
  daylight: { spent: "#ec4647", earned: "#257de0" },
};
export const vizOf = (id: string) => VIZ[id] || VIZ.redline;

export function themeVars(theme: Theme, background: Background, light = false): Record<string, string> {
  const c = theme.colors;
  const dark = theme.mode === "dark";
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) vars[`--c-${k}`] = v;
  for (const [k, v] of Object.entries(theme.orb)) vars[`--orb-${k}`] = v;
  const wallpaper = background !== "none" && background !== "aurora";
  // light effects keep a wallpaper readable without the blur by letting less of it through
  const see = background === "none" ? 1 : background === "aurora" ? (dark ? 0.62 : 0.74) : light ? (dark ? 0.86 : 0.9) : dark ? 0.72 : 0.8;
  vars["--glass"] = withAlpha(c.surface, see);
  vars["--glass-strong"] = withAlpha(c.surface, Math.min(1, see + 0.2));
  // Only a wallpaper is blurred behind the glass: it has edges that would show through. With no
  // background the glass is solid, and the Aurora is soft light already, so blurring it changes
  // nothing you can see. A backdrop filter (even blur(0)) redraws what's behind every card each
  // time anything near it changes: over the Aurora that was most of the app's idle work.
  const blur = wallpaper && !light;
  vars["--glass-filter"] = blur ? "blur(22px) saturate(140%)" : "none";
  vars["--glass-filter-strong"] = blur ? "blur(31px) saturate(150%)" : "none";
  vars["--hover"] = dark ? "rgba(255,255,255,0.055)" : "rgba(10,10,30,0.05)";
  vars["--press"] = dark ? "rgba(255,255,255,0.09)" : "rgba(10,10,30,0.085)";
  vars["--au1"] = withAlpha(c.accent, dark ? 0.55 : 0.32);
  vars["--au2"] = withAlpha(c.accent2, dark ? 0.32 : 0.22);
  vars["--au3"] = withAlpha(c.info, dark ? 0.2 : 0.16);
  vars["--au4"] = withAlpha(c.bg2 === c.bg ? c.accent : c.bg2, dark ? 0.9 : 0.5);
  vars["--grain"] = dark ? "0.045" : "0.03";
  const viz = vizOf(theme.id);
  vars["--viz-1"] = viz.spent;
  vars["--viz-2"] = viz.earned;
  vars["--viz-grid"] = dark ? "rgba(255,255,255,0.07)" : "rgba(10,10,30,0.08)";
  vars["--viz-axis"] = dark ? "rgba(255,255,255,0.2)" : "rgba(10,10,30,0.22)";
  return vars;
}

export function applyTheme(themeId: string, background: Background, motion: "full" | "reduced", density: "comfortable" | "compact", light = false) {
  const theme = themeById(themeId);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(theme, background, light))) root.style.setProperty(k, v);
  root.dataset.mode = theme.mode;
  root.dataset.theme = theme.id;
  root.dataset.motion = motion;
  root.dataset.density = density;
  root.dataset.bg = background;
  root.dataset.effects = light ? "light" : "full";
  return theme;
}

export function useApplyTheme() {
  const themeId = useSettings((s) => s.themeId);
  const background = useSettings((s) => s.background);
  const motion = useSettings((s) => s.motion);
  const density = useSettings((s) => s.density);
  const light = useLightEffects();
  useEffect(() => {
    applyTheme(themeId, background, motion, density, light);
  }, [themeId, background, motion, density, light]);
}

export const useTheme = () => themeById(useSettings((s) => s.themeId));
export const useReduced = () => useSettings((s) => s.motion) === "reduced";
