// What should ring, worked out from the records: the same list the phone schedules (reminders,
// events before they start, timed to-dos, birthdays and anniversaries, the car's papers and service,
// warranties ending). The main process shows them at the right time, even with the window closed.
import { addDays, currentPapers, isoDate, nextOccurrence, PAPER_REMIND, parseDate, toEpoch, WARRANTY_REMIND, yearsAt } from "@myapp/core";
import type { Alert } from "@shared/ipc";
import { useRecords } from "@/store/records";
import { bridge } from "@/lib/bridge";

const HORIZON_MS = 60 * 86400000;
const MAX = 120;
const DATE_HOUR = 9; // dates remind at 09:00


const label = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

// Everything that should ring between now and the horizon, soonest first.
export function upcomingAlerts(now = Date.now()): Alert[] {
  const { lists, byId } = useRecords.getState();
  const out: Alert[] = [];
  const within = (at: number) => at > now + 5000 && at < now + HORIZON_MS;
  for (const r of lists.reminder) if (!r.data.done && within(r.data.at)) out.push({ at: r.data.at, title: "Reminder", body: r.data.text, url: "/todos" });
  for (const e of lists.event) {
    if (!e.data.time || e.data.remind_min == null) continue;
    const start = toEpoch(e.data.date, e.data.time);
    const at = start - e.data.remind_min * 60000;
    if (within(at)) out.push({ at, title: e.data.title, body: e.data.remind_min ? `Starts at ${e.data.time}${e.data.place ? ` · ${e.data.place}` : ""}` : "Starting now", url: "/calendar" });
  }
  for (const t of lists.todo) {
    if (t.data.done || !t.data.due || !t.data.time) continue;
    const at = toEpoch(t.data.due, t.data.time);
    if (within(at)) out.push({ at, title: "To-do", body: t.data.title, url: "/todos" });
  }
  const today = isoDate(new Date(now));
  for (const d of lists.date) {
    const next = nextOccurrence(d.data.month, d.data.day, today);
    const person = d.data.person_id ? byId[d.data.person_id] : null;
    const who = person && !person.deleted ? (person.data as any).name : "";
    const years = yearsAt(d.data.year, next);
    const what = `${d.data.title}${years && years > 0 ? ` (${years}${d.data.kind === "birthday" ? "" : " years"})` : ""}`;
    for (const before of d.data.remind || [7, 1, 0]) {
      const day = parseDate(next);
      day.setDate(day.getDate() - before);
      day.setHours(DATE_HOUR, 0, 0, 0);
      if (within(day.getTime())) out.push({ at: day.getTime(), title: `${what} ${label(before)}`, body: who ? `For ${who}` : "Coming up", url: "/people" });
    }
  }
  // My car: each paper's latest renewal rings before it expires; a service rings before its date
  const at9 = (date: string) => {
    const day = parseDate(date);
    day.setHours(DATE_HOUR, 0, 0, 0);
    return day.getTime();
  };
  for (const car of lists.car) {
    const logs = lists.car_log.filter((l) => l.data.car_id === car.id);
    for (const p of currentPapers(logs)) {
      if (!p.data.next_date) continue;
      for (const before of p.data.remind || PAPER_REMIND) {
        const at = at9(addDays(p.data.next_date, -before));
        if (within(at)) out.push({ at, title: `${p.data.title || "Papers"} ${before === 0 ? "expires today" : `expires ${label(before)}`}`, body: `${car.data.name}${car.data.plate ? ` · ${car.data.plate}` : ""}: renew it and add the new date`, url: "/car" });
      }
    }
    const next = logs.filter((l) => l.data.type === "service" && l.data.next_date).sort((a, b) => b.data.date.localeCompare(a.data.date))[0];
    if (next?.data.next_date) {
      for (const before of [7, 1, 0]) {
        const at = at9(addDays(next.data.next_date, -before));
        if (within(at)) out.push({ at, title: `Service due ${label(before)}`, body: `${car.data.name}${next.data.next_km ? ` · or at ${next.data.next_km.toLocaleString()} km` : ""}`, url: "/car" });
      }
    }
  }
  // My things: a warranty ending, on the days before chosen for it (a month and a week by default)
  for (const t of lists.thing) {
    if (t.data.gone || !t.data.warranty_until) continue;
    for (const before of t.data.remind || WARRANTY_REMIND) {
      const at = at9(addDays(t.data.warranty_until, -before));
      if (within(at)) out.push({ at, title: `Warranty on ${t.data.name} ends ${label(before)}`, body: "Claim anything that's wrong with it before then", url: "/things" });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX).map((a) => ({ ...a, key: `${a.at}|${a.title}` }));
}


// sends the list to the main process whenever records change (a moment later, once)
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
export function scheduleAlerts(ms = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void bridge.reminders.schedule(upcomingAlerts());
  }, ms);
}
export function startAlerts() {
  if (started) return;
  started = true;
  let last = useRecords.getState().byId;
  useRecords.subscribe((s) => {
    if (s.byId !== last) {
      last = s.byId;
      scheduleAlerts();
    }
  });
  // the horizon moves on: look again every hour
  setInterval(() => scheduleAlerts(0), 3600000);
  scheduleAlerts(500);
}
