// Numbers and lists several screens show, computed from records the same way everywhere.
import { addDays, daysBetween, isoDate, nextOccurrence, toEpoch, yearsAt } from "./dates";
import type { Rec } from "./kinds";

export const isOpenTodo = (t: Rec<"todo">) => !t.data.done;
export const dueBy = (t: Rec<"todo">, day: string) => !!t.data.due && t.data.due <= day;

export const sortTodos = (a: Rec<"todo">, b: Rec<"todo">) => {
  const da = a.data.due || "9999-12-31";
  const db = b.data.due || "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  if ((a.data.time || "") !== (b.data.time || "")) return (a.data.time || "99") < (b.data.time || "99") ? -1 : 1;
  if (a.data.priority !== b.data.priority) return a.data.priority === "high" ? -1 : 1;
  return a.created_at - b.created_at;
};

// the next due date of a repeating to-do after it is done
export const nextDue = (due: string, repeat: "daily" | "weekly" | "monthly") => {
  if (repeat === "daily") return addDays(due, 1);
  if (repeat === "weekly") return addDays(due, 7);
  const [y, m, d] = due.split("-").map(Number);
  const last = new Date(y, m + 1, 0).getDate();
  return isoDate(new Date(y, m, Math.min(d, last)));
};

export type Upcoming = { key: string; at: number; date: string; time?: string | null; kind: "date" | "event" | "reminder"; title: string; detail: string; days: number; rec: Rec };

export function upcoming(lists: { date: Rec<"date">[]; event: Rec<"event">[]; reminder: Rec<"reminder">[]; person: Rec<"person">[] }, horizonDays = 30, today = isoDate()): Upcoming[] {
  const out: Upcoming[] = [];
  const people = new Map(lists.person.map((p) => [p.id, p.data.name]));
  for (const d of lists.date) {
    const next = nextOccurrence(d.data.month, d.data.day, today);
    const days = daysBetween(today, next);
    if (days > horizonDays) continue;
    const years = yearsAt(d.data.year, next);
    const who = d.data.person_id ? people.get(d.data.person_id) : "";
    const label = d.data.kind === "birthday" && years != null && years > 0 ? `turns ${years}` : d.data.kind === "anniversary" && years ? `${years} years` : "";
    out.push({ key: d.id, at: toEpoch(next), date: next, kind: "date", title: d.data.title, detail: [who, label].filter(Boolean).join(" · "), days, rec: d });
  }
  for (const e of lists.event) {
    const days = daysBetween(today, e.data.date);
    if (days < 0 || days > Math.min(horizonDays, 14)) continue;
    out.push({ key: e.id, at: toEpoch(e.data.date, e.data.time), date: e.data.date, time: e.data.time, kind: "event", title: e.data.title, detail: e.data.place || "", days, rec: e });
  }
  const now = Date.now();
  for (const r of lists.reminder) {
    if (r.data.done || r.data.at < now - 3600000) continue;
    const date = isoDate(new Date(r.data.at));
    const days = daysBetween(today, date);
    if (days > 7) continue;
    const d = new Date(r.data.at);
    out.push({ key: r.id, at: r.data.at, date, time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, kind: "reminder", title: r.data.text, detail: "", days, rec: r });
  }
  return out.sort((a, b) => a.at - b.at);
}

export const monthTotals = (money: Rec<"money">[], month: string, currency: string) => {
  let spent = 0;
  let earned = 0;
  const byCat = new Map<string, number>();
  for (const m of money) {
    if (m.data.paid_from || m.data.date.slice(0, 7) !== month || (m.data.currency || currency) !== currency) continue;
    if (m.data.type === "income") earned += m.data.amount;
    else {
      spent += m.data.amount;
      byCat.set(m.data.category, (byCat.get(m.data.category) || 0) + m.data.amount);
    }
  }
  return { spent, earned, net: earned - spent, categories: [...byCat.entries()].sort((a, b) => b[1] - a[1]) };
};
