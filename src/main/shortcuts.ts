// The global shortcut that brings up Quick capture from any app. Another program may already own
// the keys; then registering fails and Settings says so (and keeps the shortcut that worked).
import { globalShortcut } from "electron";
import { openQuick } from "./windows";

let current = "";

export function registerQuickShortcut(accelerator: string): string | undefined {
  if (current) {
    try {
      globalShortcut.unregister(current);
    } catch {
      /* already gone */
    }
    current = "";
  }
  if (!accelerator) return undefined;
  try {
    const ok = globalShortcut.register(accelerator, openQuick);
    if (!ok) return `${accelerator.replace("CommandOrControl", process.platform === "darwin" ? "Cmd" : "Ctrl")} is already used by another app. Pick other keys.`;
    current = accelerator;
    return undefined;
  } catch {
    return "Those keys can't be used as a shortcut. Pick other keys.";
  }
}

export const quickShortcutActive = () => current;
export const unregisterAll = () => globalShortcut.unregisterAll();
