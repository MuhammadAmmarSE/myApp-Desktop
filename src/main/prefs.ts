// The settings the main process acts on: closing to the tray, starting at login, the Quick
// capture and talk shortcuts, notifications and quiet hours, the zoom. Kept with the window's size and place.
import path from "path";
import { app } from "electron";
import { DEFAULT_PREFS, type Prefs } from "@shared/ipc";
import { JsonFile } from "./jsonfile";

export type Bounds = { x: number; y: number; width: number; height: number };
type Data = { prefs: Prefs; window: { bounds: Bounds | null; maximized: boolean } };

let file: JsonFile<Data> | null = null;
const f = () => {
  if (!file) file = new JsonFile<Data>(path.join(app.getPath("userData"), "preferences.json"), { prefs: DEFAULT_PREFS, window: { bounds: null, maximized: false } }, 300);
  return file;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function getPrefs(): Prefs {
  return { ...DEFAULT_PREFS, ...(f().get().prefs || {}) };
}

// keep only known keys with the right types
export function cleanPrefs(patch: Partial<Prefs>): Partial<Prefs> {
  const out: Partial<Prefs> = {};
  if (!patch || typeof patch !== "object") return out;
  for (const k of ["closeToTray", "startAtLogin", "startHidden", "notifications", "quietHours"] as const) if (typeof patch[k] === "boolean") out[k] = patch[k];
  if (typeof patch.quickShortcut === "string" && patch.quickShortcut.length <= 60) out.quickShortcut = patch.quickShortcut;
  if (typeof patch.talkShortcut === "string" && patch.talkShortcut.length <= 60) out.talkShortcut = patch.talkShortcut;
  if (typeof patch.quietFrom === "string" && HHMM.test(patch.quietFrom)) out.quietFrom = patch.quietFrom;
  if (typeof patch.quietTo === "string" && HHMM.test(patch.quietTo)) out.quietTo = patch.quietTo;
  if (typeof patch.zoom === "number" && Number.isFinite(patch.zoom)) out.zoom = Math.min(1.4, Math.max(0.8, Math.round(patch.zoom * 100) / 100));
  return out;
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...cleanPrefs(patch) };
  f().update((d) => ({ ...d, prefs: next }));
  return next;
}

export const windowState = () => f().get().window || { bounds: null, maximized: false };
export const saveWindowState = (w: { bounds: Bounds | null; maximized: boolean }) => f().update((d) => ({ ...d, window: w }));
export const flushPrefs = () => f().flushSync();

// is this moment inside quiet hours? (quietFrom..quietTo, which may cross midnight)
export function inQuietHours(p: Prefs, at = new Date()): boolean {
  if (!p.quietHours) return false;
  const m = at.getHours() * 60 + at.getMinutes();
  const [fh, fm] = p.quietFrom.split(":").map(Number);
  const [th, tm] = p.quietTo.split(":").map(Number);
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  if (from === to) return false;
  return from < to ? m >= from && m < to : m >= from || m < to;
}
