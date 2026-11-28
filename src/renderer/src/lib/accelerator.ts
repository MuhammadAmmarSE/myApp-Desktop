// Recording a keyboard shortcut for Quick capture: a key press becomes an Electron accelerator
// ("CommandOrControl+Shift+Space"), and an accelerator is shown the way the keyboard reads
// ("⌘ ⇧ Space" on a Mac, "Ctrl + Shift + Space" elsewhere). Pure, so it is tested.
type KeyLike = { key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };

const NAMED: Record<string, string> = { " ": "Space", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", Insert: "Insert" };

// null while only modifiers are down, or for a key that can't be a shortcut on its own
export function toAccelerator(e: KeyLike, mac: boolean): string | null {
  if (["Control", "Meta", "Alt", "Shift", "OS"].includes(e.key)) return null;
  let key = NAMED[e.key] || "";
  if (!key && /^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) key = e.key;
  if (!key && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  if (!key && /^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  if (!key && /^[!-~]$/.test(e.key)) key = e.key.toUpperCase();
  if (!key) return null;
  const mods: string[] = [];
  const primary = mac ? e.metaKey : e.ctrlKey;
  if (primary) mods.push("CommandOrControl");
  if (mac && e.ctrlKey) mods.push("Control");
  if (!mac && e.metaKey) mods.push("Super");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  // a global shortcut needs a real modifier, or it would steal the key from every app
  const fn = /^F\d+$/.test(key);
  if (!fn && !mods.some((m) => m !== "Shift")) return null;
  return [...mods, key].join("+");
}

export function describeAccelerator(acc: string, mac: boolean): string {
  const map: Record<string, string> = mac
    ? { CommandOrControl: "⌘", CmdOrCtrl: "⌘", Command: "⌘", Control: "⌃", Ctrl: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧", Super: "⌘" }
    : { CommandOrControl: "Ctrl", CmdOrCtrl: "Ctrl", Control: "Ctrl", Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Win", Command: "Win" };
  return acc
    .split("+")
    .map((p) => map[p] || p)
    .join(mac ? " " : " + ");
}

// what's held down so far, for the button while recording: "Ctrl + Shift + …" ("" with nothing)
export function heldWords(e: KeyLike, mac: boolean): string {
  const mods: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) mods.push("CommandOrControl");
  if (mac && e.ctrlKey) mods.push("Control");
  if (!mac && e.metaKey) mods.push("Super");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (!mods.length) return "";
  return `${describeAccelerator(mods.join("+"), mac)}${mac ? " " : " + "}…`;
}

// why a key pressed while recording can't be the shortcut, in words ("" when it's only a modifier,
// so there's nothing to say yet)
export function whyNotShortcut(e: KeyLike, mac: boolean): string {
  if (["Control", "Meta", "Alt", "Shift", "OS"].includes(e.key)) return "";
  if (toAccelerator(e, mac)) return "";
  const mods = mac ? e.metaKey || e.ctrlKey || e.altKey : e.ctrlKey || e.altKey || e.metaKey;
  if (!mods) return `Hold ${mac ? "⌘, ⌃ or ⌥" : "Ctrl or Alt"} with it, e.g. ${mac ? "⌘ ⇧ T" : "Ctrl + Shift + T"} (F1–F24 work on their own)`;
  return "That key can't be part of a shortcut. Try a letter, a number or F1–F24.";
}
