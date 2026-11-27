// The tray icon: Redline stays here when the window is closed, so reminders still ring. A click
// opens the window; the menu has Quick capture, the common "new" actions and the switches.
import path from "path";
import { app, Menu, nativeImage, Tray } from "electron";
import type { Alert } from "@shared/ipc";
import { getPrefs, setPrefs } from "./prefs";
import { applyStartAtLogin } from "./startup";
import { command, openQuick, setQuitting, showMain, toggleMain } from "./windows";
import { resource } from "./resources";

let tray: Tray | null = null;
let next: Alert | null = null;

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const day = (ms: number) => {
  const d = new Date(ms);
  const t = new Date();
  const tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
  if (d.toDateString() === t.toDateString()) return "today";
  if (d.toDateString() === tomorrow.toDateString()) return "tomorrow";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
};

function image() {
  const dir = resource("tray");
  if (process.platform === "darwin") {
    const img = nativeImage.createFromPath(path.join(dir, "trayTemplate.png"));
    img.setTemplateImage(true);
    return img;
  }
  return nativeImage.createFromPath(path.join(dir, process.platform === "win32" ? "tray.ico" : "tray.png"));
}

const accel = (s: string) => s.replace("CommandOrControl", process.platform === "darwin" ? "Cmd" : "Ctrl");

export function buildTrayMenu() {
  if (!tray) return;
  const p = getPrefs();
  const menu = Menu.buildFromTemplate([
    { label: "Open Redline", click: showMain },
    { label: p.quickShortcut ? `Quick capture\t${accel(p.quickShortcut)}` : "Quick capture", click: openQuick },
    { label: p.talkShortcut ? `Talk to the assistant\t${accel(p.talkShortcut)}` : "Talk to the assistant", click: () => command({ type: "talk" }) },
    { type: "separator" },
    { label: next ? `Next: ${next.title} · ${day(next.at)} ${time(next.at)}` : "Nothing coming up", enabled: !!next, click: () => next && command({ type: "navigate", to: next.url }) },
    { type: "separator" },
    { label: "New to-do", click: () => command({ type: "new", what: "todo" }) },
    { label: "New note", click: () => command({ type: "new", what: "note" }) },
    { label: "Add an expense", click: () => command({ type: "new", what: "money" }) },
    { label: "Ask the assistant", click: () => command({ type: "navigate", to: "/assistant" }) },
    { type: "separator" },
    { label: "Sync now", click: () => command({ type: "sync" }, { show: false }) },
    {
      label: "Notifications",
      type: "checkbox",
      checked: p.notifications,
      click: (i) => {
        setPrefs({ notifications: i.checked });
        buildTrayMenu();
      },
    },
    {
      label: "Start with the computer",
      type: "checkbox",
      checked: p.startAtLogin,
      click: (i) => {
        const now = setPrefs({ startAtLogin: i.checked });
        applyStartAtLogin(now.startAtLogin, now.startHidden);
        buildTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Quit Redline",
      click: () => {
        setQuitting();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(next ? `Redline · next: ${next.title}, ${day(next.at)} ${time(next.at)}` : "Redline");
}

export function createTray() {
  if (tray) return tray;
  tray = new Tray(image());
  tray.on("click", () => (process.platform === "darwin" ? undefined : toggleMain()));
  tray.on("double-click", showMain);
  buildTrayMenu();
  return tray;
}

export function setTrayNext(a: Alert | null) {
  next = a;
  buildTrayMenu();
}

export const destroyTray = () => {
  tray?.destroy();
  tray = null;
};
