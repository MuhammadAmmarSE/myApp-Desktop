// This computer's settings for the screens (the main process keeps its own: tray, shortcut,
// startup). A desktop can use a different theme from the phone. Saved with the records' meta.
import { create } from "zustand";
import { DEFAULT_THEME } from "@myapp/core";
import { useRecords } from "./records";

export type Background = "aurora" | "monolith" | "peaks" | "silk" | "spheres" | "none";

export interface Settings {
  themeId: string;
  currency: string;
  name: string;
  background: Background;
  motion: "full" | "reduced";
  effects: "auto" | "full" | "light"; // light: no blur behind the glass, no wallpaper depth
  density: "comfortable" | "compact";
  sidebar: "full" | "icons";
  weekStart: 0 | 1; // Sunday or Monday
  readAloud: boolean; // the assistant's replies are read out
  searches: string[]; // recent searches, newest first
  todoView: "list" | "board";
  moneyView: "month" | "year";
  onboarded: boolean;
}

export const DEFAULTS: Settings = {
  themeId: DEFAULT_THEME,
  currency: "PKR",
  name: "",
  background: "aurora",
  motion: "full",
  effects: "auto",
  density: "comfortable",
  sidebar: "full",
  weekStart: 1,
  readAloud: false,
  searches: [],
  todoView: "list",
  moneyView: "month",
  onboarded: false,
};

type State = Settings & { loaded: boolean; load: () => void; set: (patch: Partial<Settings>) => void };

export const useSettings = create<State>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  load: () => {
    let saved: Partial<Settings> = {};
    try {
      saved = JSON.parse(useRecords.getState().meta.settings || "{}");
    } catch {
      saved = {};
    }
    // a system that asks for less motion starts calm
    if (!("motion" in saved) && typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) saved.motion = "reduced";
    set({ ...DEFAULTS, ...saved, loaded: true });
  },
  set: (patch) => {
    set(patch);
    const s = { ...get(), ...patch };
    const out: Partial<Settings> = {};
    for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) (out as any)[k] = s[k];
    useRecords.getState().setMeta("settings", JSON.stringify(out));
  },
}));
