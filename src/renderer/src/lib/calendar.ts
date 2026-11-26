// What the calendar shows between two days: events, reminders, to-dos with a date, birthdays and
// anniversaries (every year), car papers that expire, services that are due, and warranties that
// end. One shape for all of them so every view draws them the same way. Pure, so it is tested.
import { addDays, CAR_PAPERS, currentPapers, daysBetween, isoDate, parseDate, yearsAt, type Kind, type Rec } from "@myapp/core";

export type CalKind = "event" | "reminder" | "todo" | "date" | "car" | "thing";
export type CalItem = {
  id: string; // unique per occurrence
  recId: string;
  kind: CalKind;
  editKind: Kind; // what opens when you click it
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:mm
  end?: string | null; // HH:mm, for events with a length
  detail?: string;
  done?: boolean;
  movable: boolean; // can be dragged to another day
  rec: Rec;
};

export const CAL_COLOR: Record<CalKind, string> = {
  event: "var(--c-info)",
  reminder: "var(--c-warn)",
  todo: "var(--c-accent)",
  date: "var(--c-accent2)",
  car: "var(--c-success)",
  thing: "var(--c-text2)",
};
export const CAL_WORD: Record<CalKind, string> = { event: "Event", reminder: "Reminder", todo: "To-do", date: "Date", car: "Car", thing: "Warranty" };

type Lists = {
  event: Rec<"event">[];
  reminder: Rec<"reminder">[];
  todo: Rec<"todo">[];
  date: Rec<"date">[];
  person: Rec<"person">[];
  car: Rec<"car">[];
  car_log: Rec<"car_log">[];
  thing: Rec<"thing">[];
};

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

// the yearly day a date falls on in a given year (29 Feb on 28 Feb when there isn't one)
export const yearlyOn = (year: number, month: number, day: number) => {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
};

export function calendarItems(l: Lists, from: string, to: string, opts: { showDone?: boolean } = {}): CalItem[] {
  const out: CalItem[] = [];
  const people = new Map(l.person.map((p) => [p.id, p.data.name]));
  const cars = new Map(l.car.map((c) => [c.id, c.data.name]));
  for (const e of l.event) {
    if (!inRange(e.data.date, from, to)) continue;
    const who = e.data.person_id ? people.get(e.data.person_id) : "";
    out.push({ id: e.id, recId: e.id, kind: "event", editKind: "event", title: e.data.title, date: e.data.date, time: e.data.time || null, detail: [e.data.place, who].filter(Boolean).join(" · "), movable: true, rec: e });
  }
  for (const r of l.reminder) {
    const d = new Date(r.data.at);
    const date = isoDate(d);
    if (!inRange(date, from, to) || (r.data.done && !opts.showDone)) continue;
    out.push({ id: r.id, recId: r.id, kind: "reminder", editKind: "reminder", title: r.data.text, date, time: hhmm(d), done: r.data.done, movable: true, rec: r });
  }
  for (const t of l.todo) {
    if (!t.data.due || !inRange(t.data.due, from, to) || (t.data.done && !opts.showDone)) continue;
    out.push({ id: t.id, recId: t.id, kind: "todo", editKind: "todo", title: t.data.title, date: t.data.due, time: t.data.time || null, done: t.data.done, detail: t.data.priority === "high" ? "High priority" : undefined, movable: true, rec: t });
  }
  // yearly dates: each year the range touches
  const y0 = parseDate(from).getFullYear();
  const y1 = parseDate(to).getFullYear();
  for (const d of l.date) {
    for (let y = y0; y <= y1; y++) {
      const on = yearlyOn(y, d.data.month, d.data.day);
      if (!inRange(on, from, to)) continue;
      const years = yearsAt(d.data.year, on);
      const who = d.data.person_id ? people.get(d.data.person_id) : "";
      const label = d.data.kind === "birthday" && years != null && years > 0 ? `turns ${years}` : d.data.kind === "anniversary" && years ? `${years} years` : "";
      out.push({ id: `${d.id}@${y}`, recId: d.id, kind: "date", editKind: "date", title: d.data.title, date: on, time: null, detail: [who, label].filter(Boolean).join(" · "), movable: false, rec: d });
    }
  }
  // car: papers that expire and services that are due
  const byCar = new Map<string, Rec<"car_log">[]>();
  for (const x of l.car_log) {
    if (x.data.type !== "paper") continue;
    const k = x.data.car_id || "";
    byCar.set(k, [...(byCar.get(k) || []), x]);
  }
  const papers = [...byCar.values()].flatMap((list) => currentPapers(list));
  for (const p of papers) {
    const d = p.data.next_date;
    if (!d || !inRange(d, from, to)) continue;
    const car = p.data.car_id ? cars.get(p.data.car_id) : "";
    out.push({ id: `${p.id}#paper`, recId: p.id, kind: "car", editKind: "car_log", title: `${p.data.title || CAR_PAPERS[0]} expires`, date: d, time: null, detail: car || "", movable: false, rec: p });
  }
  // the latest service of each kind per car, when it names a next date
  const lastService = new Map<string, Rec<"car_log">>();
  for (const s of l.car_log) {
    if (s.data.type !== "service" || !s.data.next_date) continue;
    const key = `${s.data.car_id || ""}|${s.data.title || ""}`;
    const prev = lastService.get(key);
    if (!prev || s.data.date > prev.data.date) lastService.set(key, s);
  }
  for (const s of lastService.values()) {
    const d = s.data.next_date!;
    if (!inRange(d, from, to)) continue;
    const car = s.data.car_id ? cars.get(s.data.car_id) : "";
    out.push({ id: `${s.id}#service`, recId: s.id, kind: "car", editKind: "car_log", title: `${s.data.title || "Service"} due`, date: d, time: null, detail: car || "", movable: false, rec: s });
  }
  for (const t of l.thing) {
    const d = t.data.warranty_until;
    if (!d || t.data.gone || !inRange(d, from, to)) continue;
    out.push({ id: `${t.id}#warranty`, recId: t.id, kind: "thing", editKind: "thing", title: `${t.data.name} warranty ends`, date: d, time: null, movable: false, rec: t });
  }
  return out.sort(byWhen);
}

// untimed first (they belong to the whole day), then by time, then by kind
const ORDER: CalKind[] = ["date", "event", "reminder", "todo", "car", "thing"];
export const byWhen = (a: CalItem, b: CalItem) =>
  a.date.localeCompare(b.date) || (a.time ? 1 : 0) - (b.time ? 1 : 0) || (a.time || "").localeCompare(b.time || "") || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.title.localeCompare(b.title);

export function groupByDay(items: CalItem[]): Map<string, CalItem[]> {
  const m = new Map<string, CalItem[]>();
  for (const i of items) {
    const list = m.get(i.date);
    if (list) list.push(i);
    else m.set(i.date, [i]);
  }
  return m;
}

// the six weeks a month grid shows, starting on the week's first day
export function monthMatrix(month: string, weekStart: 0 | 1): string[] {
  const first = parseDate(`${month}-01`);
  const shift = (first.getDay() - weekStart + 7) % 7;
  const start = addDays(`${month}-01`, -shift);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const weekOf = (day: string, weekStart: 0 | 1): string[] => {
  const shift = (parseDate(day).getDay() - weekStart + 7) % 7;
  const start = addDays(day, -shift);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

export const addMonthsTo = (month: string, n: number) => {
  const d = parseDate(`${month}-01`);
  return isoDate(new Date(d.getFullYear(), d.getMonth() + n, 1)).slice(0, 7);
};

// moving something to another day: what changes on the record (null when it can't move)
export function moveTo(item: CalItem, date: string): { kind: Kind; id: string; change: Record<string, unknown> } | null {
  if (!item.movable) return null;
  if (item.kind === "event") return { kind: "event", id: item.recId, change: { date } };
  if (item.kind === "todo") return { kind: "todo", id: item.recId, change: { due: date } };
  if (item.kind === "reminder") {
    const was = new Date((item.rec as Rec<"reminder">).data.at);
    const d = parseDate(date);
    d.setHours(was.getHours(), was.getMinutes(), 0, 0);
    return { kind: "reminder", id: item.recId, change: { at: d.getTime() } };
  }
  return null;
}

// moving to another time on a day (week and day views)
export function retime(item: CalItem, date: string, time: string): { kind: Kind; id: string; change: Record<string, unknown> } | null {
  if (!item.movable) return null;
  if (item.kind === "event") return { kind: "event", id: item.recId, change: { date, time } };
  if (item.kind === "todo") return { kind: "todo", id: item.recId, change: { due: date, time } };
  if (item.kind === "reminder") {
    const d = parseDate(date);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return { kind: "reminder", id: item.recId, change: { at: d.getTime() } };
  }
  return null;
}

export const minutesOf = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const timeOf = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const daysAway = (date: string, today = isoDate()) => daysBetween(today, date);
