// The global shortcuts, from any app: Quick capture, and talking to the assistant. Another program
// may already own the keys; then registering fails and Settings says so (and keeps the keys that
// worked). The two can't share keys.
import { globalShortcut, type BrowserWindow, type Event as ElectronEvent, type Input } from "electron";
import { CH, type ShortcutKey } from "@shared/ipc";
import { command, openQuick } from "./windows";

type Which = "quick" | "talk";
const current: Record<Which, string> = { quick: "", talk: "" };
const ACTION: Record<Which, () => void> = {
  quick: openQuick,
  // the main window comes up, and the assistant starts listening (or stops, if it was)
  talk: () => command({ type: "talk" }),
};
const NAME: Record<Which, string> = { quick: "Quick capture", talk: "Talking to the assistant" };
const label = (acc: string) => acc.replace("CommandOrControl", process.platform === "darwin" ? "Cmd" : "Ctrl");
// while Settings records new keys, Redline's own shortcuts let go of theirs (so they can be picked
// again, or reported as taken), and come back when it stops
let paused = false;

function register(which: Which, accelerator: string): string | undefined {
  if (current[which]) {
    try {
      globalShortcut.unregister(current[which]);
    } catch {
      /* already gone */
    }
    current[which] = "";
  }
  if (!accelerator) return undefined;
  const other: Which = which === "quick" ? "talk" : "quick";
  if (current[other] && current[other].toLowerCase() === accelerator.toLowerCase()) return `${NAME[other]} already uses ${label(accelerator)}. Pick other keys.`;
  try {
    const ok = globalShortcut.register(accelerator, ACTION[which]);
    if (!ok) return `${label(accelerator)} is already used by another app. Pick other keys.`;
    current[which] = accelerator;
    // still recording: the keys are free (that was the check), and are taken once it stops
    if (paused) globalShortcut.unregister(accelerator);
    return undefined;
  } catch {
    return "Those keys can't be used as a shortcut. Pick other keys.";
  }
}

export const registerQuickShortcut = (accelerator: string) => register("quick", accelerator);
export const registerTalkShortcut = (accelerator: string) => register("talk", accelerator);
export const quickShortcutActive = () => current.quick;
export const talkShortcutActive = () => current.talk;
// Recording a shortcut in Settings: the keys go straight from the window to Settings, before the
// menu's own shortcuts or the page can act on them (Alt opening the menu, Ctrl+K opening search…),
// and Redline's global shortcuts let go meanwhile. It stops when Settings says, when the window
// loses focus, or after a minute; Settings is told so it stops waiting.
let recording: { win: BrowserWindow; onInput: (e: ElectronEvent, input: Input) => void; onBlur: () => void; timer: ReturnType<typeof setTimeout> } | null = null;

export function recordKeys(win: BrowserWindow | null, on: boolean) {
  if (recording) {
    const r = recording;
    recording = null;
    clearTimeout(r.timer);
    if (!r.win.isDestroyed()) {
      r.win.webContents.removeListener("before-input-event", r.onInput);
      r.win.removeListener("blur", r.onBlur);
    }
    resume();
  }
  if (!on || !win || win.isDestroyed()) return;
  const wc = win.webContents;
  const send = (k: ShortcutKey) => {
    if (!wc.isDestroyed()) wc.send(CH.evShortcutKey, k);
  };
  const onInput = (e: ElectronEvent, input: Input) => {
    if (input.type !== "keyDown" && input.type !== "keyUp") return;
    e.preventDefault();
    if (input.isAutoRepeat) return;
    send({ type: input.type === "keyDown" ? "down" : "up", key: input.key, code: input.code, ctrlKey: input.control, metaKey: input.meta, altKey: input.alt, shiftKey: input.shift });
  };
  const stop = () => {
    recordKeys(null, false);
    send({ type: "stop", key: "", code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
  };
  pause();
  wc.on("before-input-event", onInput);
  win.on("blur", stop);
  recording = { win, onInput, onBlur: stop, timer: setTimeout(stop, 60000) };
}

function pause() {
  paused = true;
  for (const which of ["quick", "talk"] as Which[])
    if (current[which])
      try {
        globalShortcut.unregister(current[which]);
      } catch {
        /* already gone */
      }
}
function resume() {
  paused = false;
  for (const which of ["quick", "talk"] as Which[]) {
    if (!current[which]) continue;
    try {
      if (!globalShortcut.isRegistered(current[which]) && !globalShortcut.register(current[which], ACTION[which])) current[which] = "";
    } catch {
      current[which] = "";
    }
  }
}

export const unregisterAll = () => {
  globalShortcut.unregisterAll();
  current.quick = "";
  current.talk = "";
};
