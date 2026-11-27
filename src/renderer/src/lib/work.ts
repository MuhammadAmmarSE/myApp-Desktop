// Saving and removing Work, and the figures its page draws. A payment can also be income in
// Money (Freelance), linked by money_id like My car's log: changing it changes the income, taking
// it out of Money or removing it removes that too, and Undo brings both back. Removing a project
// takes its log with it. (The phone's lib/work.ts does the same.)
import { addDays, addMonths, daysWord, isoDate, renewalsDue, weekStart, type MoneyData, type Rec, type WorkLogData } from "@myapp/core";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { MONTHS_SHORT } from "./format";

const live = (id: string | null | undefined) => {
  const r = id ? (useRecords.getState().byId[id] as Rec | undefined) : undefined;
  return r && !r.deleted ? r : undefined;
};

export function saveWorkLog(rec: Rec<"work_log"> | null, data: WorkLogData, inMoney: boolean, projectName: string): string {
  const s = useRecords.getState();
  let money_id = rec?.data.money_id ?? null;
  const linked = live(money_id) as Rec<"money"> | undefined;
  const amount = data.type === "payment" && data.amount && data.amount > 0 ? data.amount : null;
  if (inMoney && amount) {
    const m: MoneyData = {
      type: "income",
      amount,
      currency: linked ? linked.data.currency : useSettings.getState().currency,
      category: "Freelance",
      note: [projectName, data.note].filter(Boolean).join(" · "),
      date: data.date,
      account: linked ? linked.data.account : "bank",
      recurring: null,
    };
    if (linked) s.update<"money">(linked.id, m);
    else money_id = s.create("money", m).id;
  } else if (linked) {
    s.remove(linked.id);
    money_id = null;
  } else money_id = null;
  const full: WorkLogData = { ...data, money_id };
  if (rec) {
    s.update<"work_log">(rec.id, full);
    return rec.id;
  }
  return s.create("work_log", full).id;
}

// remove records (and the Money entries they saved); returns what puts them all back
function removeAll(recs: Rec[]): () => void {
  const s = useRecords.getState();
  const gone: Rec[] = [];
  for (const r of recs) {
    if (r.deleted) continue;
    const m = live((r.data as { money_id?: string | null }).money_id);
    s.remove(r.id);
    gone.push(r);
    if (m) {
      s.remove(m.id);
      gone.push(m);
    }
  }
  return () => {
    for (const r of gone) useRecords.getState().restore(r);
  };
}

export const removeWorkLog = (rec: Rec<"work_log">) => removeAll([rec]);
export const removeProject = (rec: Rec<"project">) => removeAll([rec, ...(useRecords.getState().lists.work_log as Rec<"work_log">[]).filter((l) => l.data.project_id === rec.id)]);

// a domain renewed: a year on from when it expires (or from today, if that's already past)
export const renewedUntil = (expires: string | null | undefined, today = isoDate(), years = 1) => addMonths(expires && expires > today ? expires : today, 12 * years);

// the renewal coming up soonest, in words (Today, the sidebar)
export function workHeadsUp(domains: Rec<"domain">[], servers: Rec<"server">[], today = isoDate()): string | null {
  const r = renewalsDue({ domain: domains, server: servers }, today)[0];
  if (!r) return null;
  return r.days < 0 ? `${r.name} ${r.kind === "domain" ? "expired" : "renewal was due"} ${daysWord(r.days)}` : `${r.name} ${r.kind === "domain" ? "expires" : "renews"} ${daysWord(r.days)}`;
}

// hours worked each week (Monday on) for the last `weeks` weeks, oldest first, split into billable
// and not, for the column chart
export function weeklyHours(logs: { data: WorkLogData }[], today: string, weeks = 8): { key: string; label: string; values: { billable: number; other: number } }[] {
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const out = Array.from({ length: weeks }, (_, i) => {
    const key = addDays(first, 7 * i);
    return { key, label: `${Number(key.slice(8, 10))} ${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]}`, values: { billable: 0, other: 0 } };
  });
  for (const l of logs) {
    if (l.data.type !== "time" || !l.data.minutes || l.data.date < first || l.data.date > today) continue;
    const i = Math.floor((Date.parse(`${weekStart(l.data.date)}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / (7 * 86400000));
    if (i < 0 || i >= weeks) continue;
    const h = l.data.minutes / 60;
    if (l.data.billable === false) out[i].values.other += h;
    else out[i].values.billable += h;
  }
  for (const w of out) {
    w.values.billable = Math.round(w.values.billable * 10) / 10;
    w.values.other = Math.round(w.values.other * 10) / 10;
  }
  return out;
}

// A duration typed the way people type it: "90", "45m", "1h", "1h 30", "1:30", "1.5h", "2 hours" →
// minutes (null when it isn't one).
export function parseMinutes(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, ".");
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes)?)?$/);
  if (m) return Math.round(Number(m[1]) * 60) + (m[2] ? Number(m[2]) : 0);
  m = s.match(/^(\d+)\s*(?:m|min|mins|minute|minutes)?$/);
  if (m) return Number(m[1]);
  return null;
}

// how a duration reads in a field: "45m", "2h", "1h 30m"
export const minutesShort = (min: number) => {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  return h ? (m % 60 ? `${h}h ${m % 60}m` : `${h}h`) : `${m}m`;
};

// The project timer: starting it marks the project active; stopping it gives the minutes to log
// (to the nearest 5, at least 1) and opens the time form with them, so you can say what you did.
export function startTimer(p: Rec<"project">, at = Date.now()) {
  useRecords.getState().update<"project">(p.id, { timer_from: at, status: p.data.status === "idea" || p.data.status === "paused" ? "active" : p.data.status });
}
export const timerMinutes = (from: number, at: number) => {
  const m = Math.max(1, Math.round((at - from) / 60000));
  return Math.round(m / 5) * 5 || m;
};
export function stopTimer(p: Rec<"project">, at = Date.now()): number {
  const from = typeof p.data.timer_from === "number" ? p.data.timer_from : at;
  useRecords.getState().update<"project">(p.id, { timer_from: null });
  return timerMinutes(from, at);
}
// "00:42:07" for a running timer
export const elapsed = (from: number, at: number) => {
  const s = Math.max(0, Math.floor((at - from) / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};
