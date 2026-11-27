// Money's arithmetic, shared by the apps: what a month adds up to, where it went, and what is
// still to come. Pure functions over the money records, so they are tested here once.
import { addDays, daysBetween, monthKey, parseDate } from "./dates";
import { MONTHS_LONG } from "./format";
import { addMonths } from "./things";
import type { MoneyData } from "./kinds";

type Money = { id?: string; data: MoneyData };

// what was spent out of money someone gave you to spend isn't your own spending: their hisaab
// has it (funds.ts), your totals don't
const own = (m: Money) => !m.data.paid_from;

const pad = (n: number) => String(n).padStart(2, "0");

// The month before "2026-01" is "2025-12".
export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

// The month after "2026-12" is "2027-01".
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

// The last day of a month: "2026-02" -> "2026-02-28".
export function endOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${pad(new Date(y, m, 0).getDate())}`;
}

// The day a monthly expense falls on next, on or after `from`. A 31st falls on the last day of
// shorter months. Null when the expense doesn't repeat.
export function nextRecurring(date: string, recurring: MoneyData["recurring"], from: string): string | null {
  if (recurring !== "monthly") return null;
  let next = date;
  if (next >= from) return next;
  const months = (Number(from.slice(0, 4)) - Number(date.slice(0, 4))) * 12 + (Number(from.slice(5, 7)) - Number(date.slice(5, 7)));
  next = addMonths(date, Math.max(0, months));
  while (next < from) next = addMonths(next, 1);
  return next;
}

// What a month adds up to: spent, earned, the difference, and the expenses by category (biggest
// first). Only one currency is counted, so dollars are never added to rupees.
export function monthSummary(money: Money[], month: string, currency: string) {
  let spent = 0;
  let earned = 0;
  let count = 0;
  const byCat = new Map<string, number>();
  for (const m of money) {
    if (!own(m) || m.data.date.slice(0, 7) !== month || (m.data.currency || currency) !== currency) continue;
    count++;
    if (m.data.type === "income") earned += m.data.amount;
    else {
      spent += m.data.amount;
      byCat.set(m.data.category, (byCat.get(m.data.category) || 0) + m.data.amount);
    }
  }
  const categories = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount, share: spent ? amount / spent : 0 }));
  return { spent, earned, net: earned - spent, count, categories };
}

// The last n months up to `month`, oldest first, each with what was spent and earned.
export function monthlyTrend(money: Money[], month: string, currency: string, n = 6) {
  const months: string[] = [];
  let m = month;
  for (let i = 0; i < n; i++) {
    months.unshift(m);
    m = prevMonth(m);
  }
  return months.map((key) => {
    const s = monthSummary(money, key, currency);
    return { month: key, spent: s.spent, earned: s.earned, net: s.net };
  });
}

// The average spent per day so far this month, and what the month is heading for at that rate.
export function dailyPace(money: Money[], today: string, currency: string) {
  const month = monthKey(today);
  const s = monthSummary(money, month, currency);
  const day = Number(today.slice(8, 10));
  const perDay = day > 0 ? s.spent / day : 0;
  const days = Number(endOfMonth(month).slice(8, 10));
  return { spent: s.spent, perDay, projected: Math.round(perDay * days), daysLeft: days - day };
}

// The biggest single expenses of a month, biggest first.
export function topExpenses(money: Money[], month: string, currency: string, n = 5) {
  return money
    .filter((m) => own(m) && m.data.type === "expense" && m.data.date.slice(0, 7) === month && (m.data.currency || currency) === currency)
    .sort((a, b) => b.data.amount - a.data.amount || b.data.date.localeCompare(a.data.date))
    .slice(0, n);
}

// Monthly expenses that fall due in the next `days` days: { date, amount, category, note }.
export function dueSoon(money: Money[], today: string, currency: string, days = 7) {
  const out: { date: string; amount: number; category: string; note: string; id?: string }[] = [];
  for (const m of money) {
    if (!own(m) || m.data.type !== "expense" || (m.data.currency || currency) !== currency) continue;
    const next = nextRecurring(m.data.date, m.data.recurring, today);
    if (!next) continue;
    const left = daysBetween(today, next);
    if (left < 0 || left > days) continue;
    out.push({ date: next, amount: m.data.amount, category: m.data.category, note: m.data.note || "", id: m.id });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

// The same day of last month, for "compared with last month".
export const sameDayLastMonth = (today: string) => {
  const prev = prevMonth(monthKey(today));
  const last = Number(endOfMonth(prev).slice(8, 10));
  return `${prev}-${pad(Math.min(Number(today.slice(8, 10)), last))}`;
};

// Spending this month up to today against last month up to the same day.
export function monthCompare(money: Money[], today: string, currency: string) {
  const month = monthKey(today);
  const prev = prevMonth(month);
  const cut = sameDayLastMonth(today);
  let now = 0;
  let before = 0;
  for (const r of money) {
    if (!own(r) || r.data.type === "income" || (r.data.currency || currency) !== currency) continue;
    if (r.data.date.slice(0, 7) === month && r.data.date <= today) now += r.data.amount;
    else if (r.data.date.slice(0, 7) === prev && r.data.date <= cut) before += r.data.amount;
  }
  return { now, before, change: before > 0 ? (now - before) / before : null };
}

// A month in words: "November 2026".
export function monthName(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[m - 1] || month} ${y}`;
}

// The days of a month, for a calendar: { date, day, inMonth }.
export function monthDays(month: string) {
  const first = `${month}-01`;
  const days = Number(endOfMonth(month).slice(8, 10));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(first, i);
    return { date, day: i + 1, weekday: parseDate(date).getDay() };
  });
}
