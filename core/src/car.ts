// My car's arithmetic, shared by the apps: km per litre, cost per km, what's due, what's expiring.
// Pure functions over the car's log, so they are tested here once.
import { addDays } from "./dates";
import type { CarData, CarLogData } from "./kinds";

type Log = { id?: string; data: CarLogData };

const byOdometer = (a: Log, b: Log) => (a.data.odometer || 0) - (b.data.odometer || 0) || a.data.date.localeCompare(b.data.date);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// The latest reading: the car's own, or a higher one from its log.
export function latestOdometer(car: CarData | null | undefined, logs: Log[]): number | null {
  let km = car?.odometer && car.odometer > 0 ? car.odometer : 0;
  for (const l of logs) if (l.data.odometer && l.data.odometer > km) km = l.data.odometer;
  return km || null;
}

// Km per litre over the fills you made to a full tank: between two full fills, the km driven
// divided by the litres put in after the first (partial fills in between count). Null until
// there are two full fills with readings.
export function fuelEconomy(logs: Log[]): { kmPerLitre: number | null; costPerKm: number | null; km: number; litres: number } {
  const fuel = logs.filter((l) => l.data.type === "fuel" && (l.data.odometer || 0) > 0 && (l.data.litres || 0) > 0).sort(byOdometer);
  let km = 0;
  let litres = 0;
  let cost = 0;
  let start: Log | null = null;
  let pendingL = 0;
  let pendingCost = 0;
  for (const f of fuel) {
    if (!start) {
      if (f.data.full) start = f;
      continue;
    }
    pendingL += f.data.litres || 0;
    pendingCost += f.data.amount || 0;
    if (f.data.full) {
      km += (f.data.odometer || 0) - (start.data.odometer || 0);
      litres += pendingL;
      cost += pendingCost;
      start = f;
      pendingL = 0;
      pendingCost = 0;
    }
  }
  return { kmPerLitre: km > 0 && litres > 0 ? Math.round((km / litres) * 10) / 10 : null, costPerKm: km > 0 && cost > 0 ? Math.round((cost / km) * 10) / 10 : null, km, litres };
}

// A paper's state on a day: expired, due within a month, fine, or no expiry given.
export function paperStatus(paper: CarLogData, today: string): { state: "expired" | "soon" | "ok" | "none"; days: number | null } {
  if (!paper.next_date) return { state: "none", days: null };
  const days = daysBetween(today, paper.next_date);
  return { state: days < 0 ? "expired" : days <= 30 ? "soon" : "ok", days };
}

// The latest paper of each kind ("Insurance" renewed twice = the newer one counts).
export function currentPapers<L extends Log>(logs: L[]): L[] {
  const latest = new Map<string, L>();
  for (const l of logs) {
    if (l.data.type !== "paper") continue;
    const key = (l.data.title || "Other").toLowerCase();
    const prev = latest.get(key);
    if (!prev || (l.data.next_date || l.data.date) > (prev.data.next_date || prev.data.date)) latest.set(key, l);
  }
  return [...latest.values()].sort((a, b) => (a.data.next_date || "9999").localeCompare(b.data.next_date || "9999"));
}

// When the next service is due, from the latest service that said so: by date, by km, or both.
export function serviceDue<L extends Log>(logs: L[], odometer: number | null, today: string): { log: L; days: number | null; km: number | null; due: boolean } | null {
  const withNext = logs.filter((l) => l.data.type === "service" && (l.data.next_date || l.data.next_km)).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const log = withNext[0];
  if (!log) return null;
  const days = log.data.next_date ? daysBetween(today, log.data.next_date) : null;
  const km = log.data.next_km && odometer ? log.data.next_km - odometer : null;
  return { log, days, km, due: (days != null && days <= 14) || (km != null && km <= 500) };
}

// What the car cost from a day on (fuel, services, papers), and fuel alone.
export function carSpend(logs: Log[], from: string): { total: number; fuel: number } {
  let total = 0;
  let fuel = 0;
  for (const l of logs) {
    if (l.data.date < from || !(l.data.amount && l.data.amount > 0)) continue;
    total += l.data.amount;
    if (l.data.type === "fuel") fuel += l.data.amount;
  }
  return { total, fuel };
}

// Days before a paper expires that a reminder rings, by default a month, a week and a day.
export const PAPER_REMIND = [30, 7, 1];
export const reminderDays = (expires: string, remind: number[] = PAPER_REMIND) => remind.map((d) => addDays(expires, -d));
