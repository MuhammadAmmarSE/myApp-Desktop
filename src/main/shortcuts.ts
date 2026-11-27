// The global shortcuts, from any app: Quick capture, and talking to the assistant. Another program
// may already own the keys; then registering fails and Settings says so (and keeps the keys that
// worked). The two can't share keys.
import { globalShortcut } from "electron";
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
    return undefined;
  } catch {
    return "Those keys can't be used as a shortcut. Pick other keys.";
  }
}

export const registerQuickShortcut = (accelerator: string) => register("quick", accelerator);
export const registerTalkShortcut = (accelerator: string) => register("talk", accelerator);
export const quickShortcutActive = () => current.quick;
export const talkShortcutActive = () => current.talk;
export const unregisterAll = () => {
  globalShortcut.unregisterAll();
  current.quick = "";
  current.talk = "";
};
