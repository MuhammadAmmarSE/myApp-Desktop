// Whether the window is in front of you: visible and focused. Ambient motion (the Aurora's drift,
// the orb) runs only then. Behind another window, minimised or in the tray, nothing moves, so the
// app costs nothing while you're elsewhere. <html data-active="true|false"> says it to the CSS.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let active = true;

function read() {
  return typeof document === "undefined" ? true : document.visibilityState === "visible" && document.hasFocus();
}

function update() {
  const next = read();
  if (next === active) return;
  active = next;
  document.documentElement.dataset.active = String(active);
  listeners.forEach((fn) => fn());
}

let started = false;
export function startActivity() {
  if (started || typeof window === "undefined") return;
  started = true;
  active = read();
  document.documentElement.dataset.active = String(active);
  window.addEventListener("focus", update);
  window.addEventListener("blur", update);
  document.addEventListener("visibilitychange", update);
}

export const isActive = () => active;

export function useWindowActive() {
  return useSyncExternalStore(
    (fn) => {
      startActivity();
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => active,
    () => true,
  );
}
