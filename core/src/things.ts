// My things' arithmetic, shared by the apps: warranties ending, what you own is worth.
import { daysBetween, parseDate, isoDate } from "./dates";
import type { ThingData } from "./kinds";

type Thing = { id?: string; data: ThingData };

// Days before a warranty ends that a reminder rings, by default a month and a week.
export const WARRANTY_REMIND = [30, 7];

// The same day n months on (31 Jan + 1 month = 28 Feb), for "1 year warranty" and the like.
export function addMonths(date: string, n: number): string {
  const d = parseDate(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return isoDate(d);
}

// A warranty on a day: covered, ending within a month, ended, or none given. Covered through its
// last day; `days` counts to it (0 = today is the last day).
export function warrantyStatus(thing: ThingData, today: string): { state: "covered" | "ending" | "ended" | "none"; days: number | null } {
  if (!thing.warranty_until) return { state: "none", days: null };
  const days = daysBetween(today, thing.warranty_until);
  return { state: days < 0 ? "ended" : days <= 30 ? "ending" : "covered", days };
}

// What's left of a warranty in words: "2 years", "5 months", "12 days", "ends today".
export function warrantyLeft(days: number): string {
  if (days < 0) return "ended";
  if (days === 0) return "ends today";
  if (days < 45) return days === 1 ? "1 day" : `${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 24) return months === 1 ? "1 month" : `${months} months`;
  const years = Math.round(months / 12);
  return `${years} years`;
}

// The things you still have: how many, what they cost, how many still under warranty, and those
// whose warranty ends within a month (soonest first).
export function thingsSummary<T extends Thing>(things: T[], today: string): { count: number; value: number; covered: number; ending: T[] } {
  let value = 0;
  let covered = 0;
  const ending: { t: T; days: number }[] = [];
  const have = things.filter((t) => !t.data.gone);
  for (const t of have) {
    if (t.data.price && t.data.price > 0) value += t.data.price;
    const w = warrantyStatus(t.data, today);
    if (w.state === "covered" || w.state === "ending") covered++;
    if (w.state === "ending") ending.push({ t, days: w.days! });
  }
  return { count: have.length, value, covered, ending: ending.sort((a, b) => a.days - b.days).map((x) => x.t) };
}
