// Keyboard shortcuts for the whole app. Mod is Ctrl (⌘ on a Mac). Shortcuts don't fire while you
// type in a field, except the ones with Mod, which work everywhere.
import { useEffect } from "react";
import { navigate } from "./router";
import { bridge, isMac } from "./bridge";
import { layerOpen } from "./layers";
import { useUI, edit } from "@/store/ui";
import { useSettings } from "@/store/settings";
import { syncNow } from "@/store/sync";
import { toast } from "@/components/ui/Toast";

// global: one of the shortcuts set in Settings (the list shows the keys chosen there)
export type Shortcut = { keys: string; what: string; group: string; global?: "quick" | "talk" };
const M = () => (isMac() ? "⌘" : "Ctrl");

export const SHORTCUTS = (): Shortcut[] => [
  { keys: `${M()} K`, what: "Search everything", group: "Everywhere" },
  { keys: `${M()} ⇧ C`, what: "Capture with AI", group: "Everywhere" },
  { keys: `${M()} ⇧ Space`, what: "Quick capture, from any app", group: "Everywhere", global: "quick" },
  { keys: isMac() ? "⌥ Space" : "Alt Space", what: "Talk to the assistant, from any app", group: "Everywhere", global: "talk" },
  { keys: `${M()} N`, what: "New to-do", group: "Everywhere" },
  { keys: `${M()} ⇧ N`, what: "New note", group: "Everywhere" },
  { keys: `${M()} ⇧ E`, what: "Add an expense", group: "Everywhere" },
  { keys: `${M()} ⇧ V`, what: "Add an event", group: "Everywhere" },
  { keys: `${M()} R`, what: "Sync now", group: "Everywhere" },
  { keys: `${M()} \\`, what: "Fold or show the sidebar", group: "Everywhere" },
  { keys: `${M()} /`, what: "Keyboard shortcuts", group: "Everywhere" },
  { keys: `${M()} ,`, what: "Settings", group: "Everywhere" },
  { keys: `${M()} + / −`, what: "Bigger or smaller text", group: "Everywhere" },
  { keys: `${M()} 1 … 8`, what: "Today, Calendar, To-dos, Lists, Notes, Money, People, Assistant", group: "Go to" },
  { keys: "Alt ← / →", what: "Back and forward", group: "Go to" },
  { keys: "/", what: "Search (when not typing)", group: "Go to" },
  { keys: "Esc", what: "Close what's on top", group: "Go to" },
  { keys: "N", what: "Add one here (the page's main thing)", group: "On a page" },
  { keys: "↑ ↓ / J K", what: "Move through a list", group: "On a page" },
  { keys: "Enter", what: "Open the chosen one", group: "On a page" },
  { keys: "Space / X", what: "Tick the chosen to-do or item", group: "On a page" },
  { keys: "E", what: "Edit the chosen one", group: "On a page" },
  { keys: "Delete", what: "Delete the chosen one (with Undo)", group: "On a page" },
  { keys: "T / M / W", what: "Calendar: today, month, week", group: "On a page" },
  { keys: "← / →", what: "Calendar and Money: previous / next", group: "On a page" },
  { keys: "T / S", what: "Work: log time, start or stop the chosen project's timer", group: "On a page" },
  { keys: "R", what: "Words: go over the ones that are due", group: "On a page" },
  { keys: "Space · → · ←", what: "Going over words: show, knew it, didn't", group: "On a page" },
  { keys: `${M()} Enter`, what: "Save the open form · send to the assistant", group: "In a form" },
  { keys: `${M()} B / I / K`, what: "Notes: bold, italic, link", group: "In a form" },
];

const PAGES = ["/", "/calendar", "/todos", "/lists", "/notes", "/money", "/people", "/assistant"];

export const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT";
};

export function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && !e.altKey) {
        if (k === "k") {
          e.preventDefault();
          const ui = useUI.getState();
          if (ui.palette) ui.closePalette();
          else ui.openPalette();
        } else if (k === "c" && e.shiftKey) {
          e.preventDefault();
          navigate("/capture");
        } else if (k === "n" && !e.shiftKey) {
          e.preventDefault();
          edit("todo");
        } else if (k === "n" && e.shiftKey) {
          e.preventDefault();
          navigate("/notes/new");
        } else if (k === "e" && e.shiftKey) {
          e.preventDefault();
          edit("money");
        } else if (k === "v" && e.shiftKey) {
          e.preventDefault();
          edit("event");
        } else if (k === "r" && !e.shiftKey) {
          e.preventDefault();
          void syncNow().then((ok) => (ok ? toast.success("Up to date") : toast.error("Couldn't sync right now")));
        } else if (k === "\\") {
          e.preventDefault();
          const s = useSettings.getState();
          s.set({ sidebar: s.sidebar === "full" ? "icons" : "full" });
        } else if (k === "/") {
          e.preventDefault();
          useUI.getState().setShortcuts(!useUI.getState().shortcuts);
        } else if (k === ",") {
          e.preventDefault();
          navigate("/settings");
        } else if (k === "=" || k === "+" || k === "-" || k === "0") {
          e.preventDefault();
          void bridge.prefs.get().then((p) => {
            const z = k === "0" ? 1 : Math.round((p.zoom + (k === "-" ? -0.1 : 0.1)) * 10) / 10;
            bridge.win.setZoom(Math.min(1.4, Math.max(0.8, z)));
            toast(`Text size ${Math.round(Math.min(1.4, Math.max(0.8, z)) * 100)}%`, { ms: 1200 });
          });
        } else if (/^[1-8]$/.test(k) && !e.shiftKey) {
          e.preventDefault();
          navigate(PAGES[Number(k) - 1]);
        }
        return;
      }
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !typing(e.target)) {
        e.preventDefault();
        if (e.key === "ArrowLeft") history.back();
        else history.forward();
        return;
      }
      if (!typing(e.target) && !layerOpen() && e.key === "/" && !e.shiftKey) {
        e.preventDefault();
        useUI.getState().openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    // the mouse's back and forward buttons
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) history.back();
      if (e.button === 4) history.forward();
    };
    window.addEventListener("mouseup", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouse);
    };
  }, []);
}

// a page's own keys (not while typing, not with something open on top)
export function usePageKeys(handler: (e: KeyboardEvent) => boolean | void, deps: unknown[] = []) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || layerOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (useUI.getState().palette || useUI.getState().editing) return;
      if (handler(e) === true) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
