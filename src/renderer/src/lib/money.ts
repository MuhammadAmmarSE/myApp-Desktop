// Sums the Money page draws: day by day, month by month, the running total against last month,
// and which monthly bills have been noted this month. Only entries in your currency are added up;
// the others are listed but not mixed into the totals. Pure, so it is tested.
import { MONTHS_LONG, type Rec } from "@myapp/core";

type M = Rec<"money">;

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const daysIn = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
export const monthTitle = (month: string, thisYear = new Date().getFullYear()) => {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]}${y === thisYear ? "" : ` ${y}`}`;
};

const mine = (r: M, currency: string) => (r.data.currency || currency) === currency;

// spent (or earned) on each day of the month: index 0 is the 1st
export function perDay(money: M[], month: string, currency: string, type: "expense" | "income" = "expense"): number[] {
  const out = new Array(daysIn(month)).fill(0);
  for (const r of money) if (r.data.type === type && r.data.date.slice(0, 7) === month && mine(r, currency)) out[Number(r.data.date.slice(8, 10)) - 1] += r.data.amount;
  return out;
}

export const running = (values: number[]) => {
  let n = 0;
  return values.map((v) => (n += v));
};

export function perMonth(money: M[], year: number, currency: string): { month: string; spent: number; earned: number }[] {
  const out = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, "0")}`, spent: 0, earned: 0 }));
  for (const r of money) {
    if (!mine(r, currency) || Number(r.data.date.slice(0, 4)) !== year) continue;
    const i = Number(r.data.date.slice(5, 7)) - 1;
    if (r.data.type === "income") out[i].earned += r.data.amount;
    else out[i].spent += r.data.amount;
  }
  return out;
}

export function byCategory(money: M[], filter: (r: M) => boolean, currency: string): { key: string; label: string; value: number; count: number }[] {
  const m = new Map<string, { value: number; count: number }>();
  for (const r of money) {
    if (!filter(r) || !mine(r, currency) || r.data.type !== "expense") continue;
    const c = m.get(r.data.category) || { value: 0, count: 0 };
    c.value += r.data.amount;
    c.count++;
    m.set(r.data.category, c);
  }
  return [...m.entries()].map(([k, v]) => ({ key: k, label: k, ...v })).sort((a, b) => b.value - a.value);
}

// where the month is heading at today's pace (only for the month you're in)
export function projection(spentSoFar: number, day: number, days: number) {
  if (day <= 0) return null;
  return Math.round((spentSoFar / day) * days);
}

// Monthly bills: an entry marked "every month" stands for the bill. For each one (by type,
// category and note), whether this month's has been noted yet.
export type Bill = { key: string; latest: M; noted: M | null; amount: number };
const billKey = (r: M) => `${r.data.type}|${r.data.category}|${(r.data.note || "").trim().toLowerCase()}`;
export function monthlyBills(money: M[], month: string): Bill[] {
  const latest = new Map<string, M>();
  for (const r of money) {
    if (r.data.recurring !== "monthly" || r.data.date.slice(0, 7) > month) continue;
    const k = billKey(r);
    const p = latest.get(k);
    if (!p || r.data.date > p.data.date) latest.set(k, r);
  }
  return [...latest.entries()]
    .map(([key, l]) => {
      const noted = money.find((r) => billKey(r) === key && r.data.date.slice(0, 7) === month) || null;
      return { key, latest: l, noted, amount: l.data.amount };
    })
    .sort((a, b) => Number(!!a.noted) - Number(!!b.noted) || b.amount - a.amount);
}

// the day this month a bill falls on: the same day as last time (the 31st becomes the 30th)
export const billDay = (bill: Bill, month: string) => {
  const d = Math.min(Number(bill.latest.data.date.slice(8, 10)), daysIn(month));
  return `${month}-${String(d).padStart(2, "0")}`;
};
