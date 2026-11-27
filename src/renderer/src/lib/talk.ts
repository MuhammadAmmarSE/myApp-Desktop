// The talk shortcut (Alt+Space from any app, the menu or the tray): the assistant's message box on
// screen starts listening, or stops if it already is; with none on screen, the assistant opens a
// new chat already listening.
import { useEffect, useRef, useState } from "react";
import { navigate } from "./router";
import { bridge, isMac } from "./bridge";
import { describeAccelerator } from "./accelerator";

type Target = { toggle: () => void };
const targets: Target[] = [];

// a message box that answers the talk shortcut while it's on screen (the newest one wins)
export function useTalkTarget(toggle: () => void, enabled = true) {
  const latest = useRef(toggle);
  useEffect(() => {
    latest.current = toggle;
  }, [toggle]);
  useEffect(() => {
    if (!enabled) return;
    const t: Target = { toggle: () => latest.current() };
    targets.push(t);
    return () => {
      const i = targets.indexOf(t);
      if (i >= 0) targets.splice(i, 1);
    };
  }, [enabled]);
}

export function talk() {
  const t = targets[targets.length - 1];
  if (t) t.toggle();
  else navigate(`/assistant?voice=1&t=${Date.now()}`);
}

// the talk shortcut as the keyboard shows it ("⌥ Space", "Alt + Space"), or undefined when off
export function useTalkKeys() {
  const [acc, setAcc] = useState("");
  useEffect(() => {
    void bridge.prefs.get().then((p) => setAcc(p.talkShortcut || ""));
    return bridge.on("prefs", (p) => setAcc(p.talkShortcut || ""));
  }, []);
  return acc ? describeAccelerator(acc, isMac()) : undefined;
}
