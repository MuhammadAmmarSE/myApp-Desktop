// Work's arithmetic, shared by the apps: time spent on a project, what a client still owes, and
// the domains and servers coming up for renewal. Pure functions over records, tested here once.
import { addDays, daysBetween, parseDate } from "./dates";
import type { DomainData, ProjectData, ServerData, WorkLogData } from "./kinds";

type Log = { id?: string; data: WorkLogData };

// Days before a domain expires (or a server renews) that a reminder rings, by default.
export const RENEW_REMIND = [30, 7, 1];

// Monday of the week `date` falls in (YYYY-MM-DD).
export function weekStart(date: string): string {
  const day = parseDate(date).getDay(); // 0 Sunday
  return addDays(date, -((day + 6) % 7));
}

// "45 min", "1 h", "2 h 30 min", "0 min"
export function minutesInWords(min: number): string {
  const m = Math.max(0, Math.round(min || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// One project's log: minutes spent (all, billable, this week), what's been paid, the last day
// anything happened.
export function projectStats(logs: Log[], projectId: string | null, today: string) {
  const week = weekStart(today);
  let minutes = 0;
  let billable = 0;
  let thisWeek = 0;
  let paid = 0;
  let last: string | null = null;
  for (const l of logs) {
    if (projectId !== null && l.data.project_id !== projectId) continue;
    if (!last || l.data.date > last) last = l.data.date;
    if (l.data.type === "time") {
      const m = l.data.minutes && l.data.minutes > 0 ? l.data.minutes : 0;
      minutes += m;
      if (l.data.billable !== false) billable += m;
      if (l.data.date >= week && l.data.date <= today) thisWeek += m;
    } else if (l.data.type === "payment" && l.data.amount && l.data.amount > 0) paid += l.data.amount;
  }
  return { minutes, billable, thisWeek, paid, last };
}

// What the work is worth and what's still owed: billable hours at the hourly rate, or the fixed
// price; less what's been paid. Null when the project has no rate.
export function projectOwed(project: ProjectData, logs: Log[], projectId: string): { worth: number; paid: number; owed: number } | null {
  if (!project.rate || project.rate <= 0) return null;
  const s = projectStats(logs, projectId, "9999-12-31");
  const worth = project.rate_unit === "fixed" ? project.rate : Math.round((s.billable / 60) * project.rate * 100) / 100;
  return { worth, paid: s.paid, owed: Math.max(0, Math.round((worth - s.paid) * 100) / 100) };
}

// A date coming up: how many days to it, and whether that's soon (within `soonDays`) or past.
export function renewal(date: string | null | undefined, today: string, soonDays = 30): { state: "none" | "ok" | "soon" | "past"; days: number | null } {
  if (!date) return { state: "none", days: null };
  const days = daysBetween(today, date);
  return { state: days < 0 ? "past" : days <= soonDays ? "soon" : "ok", days };
}

// "today", "tomorrow", "in 12 days", "3 days ago"
export function daysWord(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

type Named<D> = { id: string; data: D };

// Domains expiring and servers renewing within a month (or already past), soonest first. Ones
// that renew by themselves are left out; ones you've let go are too.
export function renewalsDue(input: { domain?: Named<DomainData>[]; server?: Named<ServerData>[] }, today: string, soonDays = 30) {
  const out: { id: string; kind: "domain" | "server"; name: string; date: string; days: number }[] = [];
  for (const d of input.domain || []) {
    if (d.data.gone || d.data.auto_renew) continue;
    const r = renewal(d.data.expires_on, today, soonDays);
    if (r.state === "soon" || r.state === "past") out.push({ id: d.id, kind: "domain", name: d.data.name, date: d.data.expires_on!, days: r.days! });
  }
  for (const s of input.server || []) {
    if (s.data.gone) continue;
    const r = renewal(s.data.renews_on, today, Math.min(soonDays, 7));
    if (r.state === "soon" || r.state === "past") out.push({ id: s.id, kind: "server", name: s.data.name, date: s.data.renews_on!, days: r.days! });
  }
  return out.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

// The work page's line of figures: active projects, hours this week, paid this month, owed,
// servers' monthly cost.
export function workSummary(input: { project?: Named<ProjectData>[]; work_log?: Log[]; server?: Named<ServerData>[] }, today: string) {
  const projects = input.project || [];
  const logs = input.work_log || [];
  const month = today.slice(0, 7);
  let paidMonth = 0;
  for (const l of logs) if (l.data.type === "payment" && l.data.date.slice(0, 7) === month && (l.data.amount || 0) > 0) paidMonth += l.data.amount!;
  let owed = 0;
  for (const p of projects) {
    if (p.data.status === "idea") continue;
    const o = projectOwed(p.data, logs, p.id);
    if (o) owed += o.owed;
  }
  let serverCost = 0;
  for (const s of input.server || []) if (!s.data.gone && (s.data.cost || 0) > 0) serverCost += s.data.cost!;
  return { active: projects.filter((p) => p.data.status === "active").length, weekMinutes: projectStats(logs, null, today).thisWeek, paidMonth, owed: Math.round(owed * 100) / 100, serverCost };
}
