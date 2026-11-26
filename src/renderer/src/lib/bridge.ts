// window.redline, typed. Everything that needs the main process goes through here.
import type { Bridge } from "@shared/ipc";

declare global {
  interface Window {
    redline: Bridge;
  }
}

export const bridge: Bridge = (typeof window !== "undefined" && window.redline) as Bridge;
export const isMac = () => bridge?.app.platform === "darwin";
export const modKey = () => (isMac() ? "⌘" : "Ctrl");
