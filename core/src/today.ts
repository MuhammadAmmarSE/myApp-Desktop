// Today at a glance, shared by the apps: the day's timed things on one line (events with a time,
// reminders, to-dos with a time), what's next, and how long until it.
import { addDays, isoDate, toEpoch } from "./dates";
import type { EventData, Rec, ReminderData, TodoData } from "./kinds";
import { dueBy, isOpenTodo } from "./derive";

type R<D> = { id: string; data: D };
export type TimelineItem = { id: string; kind: "event" | "reminder" | "todo"; title: string; at: number; detail?: string; done: boolean };

// Everything with a time on `today` (local), earliest first. Done to-dos and reminders stay on the
// line (shown as done) so the day reads as it happened.
export function dayTimeline(input: { event?: R<EventData>[]; reminder?: R<ReminderData>[]; todo?: R<TodoData>[] }, today: string): TimelineItem[] {
  const from = toEpoch(today);
  const to = toEpoch(addDays(today, 1));
  const out: TimelineItem[] = [];
  for (const e of input.event || []) {
    if (e.data.date !== today || !e.data.time) continue;
    out.push({ id: e.id, kind: "event", title: e.data.title, at: toEpoch(e.data.date, e.data.time), detail: e.data.place || undefined, done: false });
  }
  for (const r of input.reminder || []) {
    if (!(r.data.at >= from && r.data.at < to)) continue;
    out.push({ id: r.id, kind: "reminder", title: r.data.text, at: r.data.at, done: !!r.data.done });
  }
  for (const t of input.todo || []) {
    if (t.data.due !== today || !t.data.time) continue;
    out.push({ id: t.id, kind: "todo", title: t.data.title, at: toEpoch(t.data.due, t.data.time), done: !!t.data.done });
  }
  return out.sort((a, b) => a.at - b.at || a.title.localeCompare(b.title));
}

// The next thing not done that hasn't started more than `graceMin` minutes ago; with how long
// until it (negative while it's just started).
export function nextUp(items: TimelineItem[], now: number, graceMin = 10): { item: TimelineItem; inMs: number } | null {
  const item = items.find((i) => !i.done && i.at >= now - graceMin * 60000);
  return item ? { item, inMs: item.at - now } : null;
}

// "now", "in 5 min", "in 1 h 20 min", "in 3 h"
export function countdown(ms: number): string {
  if (ms <= 60000) return "now";
  const min = Math.round(ms / 60000);
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m && h < 6 ? `in ${h} h ${m} min` : `in ${h} h`;
}

// how far through the day `now` is (0..1), for the line's "now" marker
export const dayProgress = (today: string, now: number) => Math.min(1, Math.max(0, (now - toEpoch(today)) / (toEpoch(addDays(today, 1)) - toEpoch(today))));

// What Today says about the day, from records: how the to-dos are going, how spending compares
// with last month at the same point, and a one-line brief.
// today's to-dos: the open ones due by today, and the ones ticked off today
export function todoProgress(todos: Rec<"todo">[], today: string) {
  const from = toEpoch(today);
  const to = toEpoch(addDays(today, 1));
  let open = 0;
  let done = 0;
  for (const t of todos) {
    if (isOpenTodo(t)) {
      if (dueBy(t, today)) open++;
    } else if (t.data.done_at && t.data.done_at >= from && t.data.done_at < to) done++;
  }
  const total = open + done;
  return { open, done, total, progress: total ? done / total : 0 };
}

// spending this month up to today against last month up to the same day
export function moneyPace(money: Rec<"money">[], today: string, currency: string) {
  const day = Number(today.slice(8, 10));
  const [y, m] = today.split("-").map(Number);
  const prev = isoDate(new Date(y, m - 2, 1)).slice(0, 7);
  const lastDayPrev = new Date(y, m - 1, 0).getDate();
  const cutPrev = `${prev}-${String(Math.min(day, lastDayPrev)).padStart(2, "0")}`;
  let now = 0;
  let before = 0;
  for (const r of money) {
    if (r.data.type === "income" || (r.data.currency || currency) !== currency) continue;
    if (r.data.date.slice(0, 7) === today.slice(0, 7) && r.data.date <= today) now += r.data.amount;
    else if (r.data.date.slice(0, 7) === prev && r.data.date <= cutPrev) before += r.data.amount;
  }
  const change = before > 0 ? (now - before) / before : null;
  return { now, before, change };
}

const PART = (h: number) => (h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night");
export const partOfDay = (ms: number) => PART(new Date(ms).getHours());

// "Next: Dentist in 2 h · 3 to-dos left · 2 heads-ups", or a calm line when the day is clear
export function briefLine(parts: { next?: { title: string; when: string } | null; open: number; done: number; heads: number }): string {
  const out: string[] = [];
  if (parts.next) out.push(`Next: ${parts.next.title} ${parts.next.when}`);
  if (parts.open) out.push(`${parts.open} to-do${parts.open === 1 ? "" : "s"} left`);
  else if (parts.done) out.push("To-dos all done");
  if (parts.heads) out.push(`${parts.heads} heads-up${parts.heads === 1 ? "" : "s"}`);
  return out.length ? out.join(" · ") : "Nothing pressing today.";
}
