// Reminders on the computer. The screens work out what should ring (the same list the phone uses:
// reminders, events, timed to-dos, birthdays, the car's papers and service, warranties) and send it
// here whenever records change. This checks the clock every 15 seconds and shows each one once,
// even while the window is closed (Redline stays in the tray). During quiet hours they are held
// and shown together when quiet hours end.
import path from "path";
import { app, Notification, powerMonitor } from "electron";
import type { Alert } from "@shared/ipc";
import { JsonFile } from "./jsonfile";
import { getPrefs, inQuietHours } from "./prefs";
import { command } from "./windows";
import { resource } from "./resources";

type Data = { alerts: Alert[]; fired: Record<string, number>; held: Alert[] };
let file: JsonFile<Data> | null = null;
let timer: NodeJS.Timeout | null = null;
let onNext: (a: Alert | null) => void = () => {};
export const whenNextChanges = (fn: (a: Alert | null) => void) => (onNext = fn);

const LATE_MS = 10 * 60 * 1000; // a reminder missed by more than this (the computer was asleep) is shown as missed
const KEEP_FIRED_MS = 3 * 86400000;
const icon = () => resource("icon.png");

const f = () => {
  if (!file) file = new JsonFile<Data>(path.join(app.getPath("userData"), "reminders.json"), { alerts: [], fired: {}, held: [] }, 300);
  return file;
};
const keyOf = (a: Alert) => a.key || `${a.at}|${a.title}|${a.body}`;

const ok = (a: any): a is Alert => a && typeof a.at === "number" && Number.isFinite(a.at) && typeof a.title === "string" && typeof a.body === "string" && typeof a.url === "string";

export function schedule(list: Alert[]): number {
  const alerts = (Array.isArray(list) ? list : [])
    .filter(ok)
    .map((a) => ({ at: a.at, title: a.title.slice(0, 200), body: a.body.slice(0, 400), url: a.url.startsWith("/") ? a.url.slice(0, 120) : "/", key: typeof a.key === "string" ? a.key.slice(0, 160) : undefined }))
    .sort((a, b) => a.at - b.at)
    .slice(0, 200);
  f().update((d) => ({ ...d, alerts }));
  tellNext();
  return alerts.length;
}

export function nextAlert(now = Date.now()): Alert | null {
  const d = f().get();
  return d.alerts.find((a) => a.at > now && !d.fired[keyOf(a)]) || null;
}

const tellNext = () => onNext(nextAlert());

export function show(a: { title: string; body: string; url: string }, opts: { silent?: boolean } = {}) {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title: a.title, body: a.body, icon: icon(), silent: !!opts.silent });
  n.on("click", () => command({ type: "navigate", to: a.url }));
  n.show();
  return true;
}

export function tick(now = Date.now()) {
  const d = f().get();
  const prefs = getPrefs();
  const fired = { ...d.fired };
  const held = [...(d.held || [])];
  let changed = false;
  for (const a of d.alerts) {
    const k = keyOf(a);
    if (fired[k] || a.at > now) continue;
    fired[k] = now;
    changed = true;
    if (!prefs.notifications) continue;
    if (inQuietHours(prefs, new Date(now))) {
      held.push(a);
      continue;
    }
    const late = now - a.at > LATE_MS;
    show(late ? { ...a, title: `Missed: ${a.title}` } : a);
  }
  // quiet hours are over: everything held comes out together
  if (held.length && !inQuietHours(prefs, new Date(now))) {
    const fresh = held.filter((a) => now - a.at < 12 * 3600000);
    if (prefs.notifications && fresh.length === 1) show({ ...fresh[0], title: `While it was quiet: ${fresh[0].title}` });
    else if (prefs.notifications && fresh.length > 1) show({ title: `${fresh.length} reminders while it was quiet`, body: fresh.slice(0, 3).map((a) => a.title).join(" · "), url: "/" });
    held.length = 0;
    changed = true;
  }
  for (const k of Object.keys(fired)) if (now - fired[k] > KEEP_FIRED_MS) delete fired[k];
  if (changed) {
    f().set({ ...d, fired, held });
    tellNext();
  }
}

export function startReminders() {
  if (timer) return;
  // anything already in the past when Redline starts was shown before (or long missed): mark it
  // as seen so a restart doesn't replay the day's reminders
  const d = f().get();
  const now = Date.now();
  const fired = { ...d.fired };
  for (const a of d.alerts) if (a.at < now - LATE_MS) fired[keyOf(a)] = fired[keyOf(a)] || now;
  f().set({ ...d, fired });
  timer = setInterval(() => tick(), 15000);
  powerMonitor.on("resume", () => tick());
  powerMonitor.on("unlock-screen", () => tick());
  tick();
}

export function stopReminders() {
  if (timer) clearInterval(timer);
  timer = null;
  file?.flushSync();
}

export function testNotification() {
  return show({ title: "Redline", body: "Notifications are working. Reminders will look like this.", url: "/settings" });
}
