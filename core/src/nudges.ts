// Nudges: the app (and the assistant) bringing something up at the right moment. "Pay rent was due
// yesterday", "Tomorrow at 10: dentist", "Sara's birthday is on Saturday: anything to get?". They
// show in the assistant and as one card on Today, and ring as a notification when they're due.
//
// The app's own check (planNudges) runs on each device when the app opens and every so often. It
// only reads records and decides; the apps save what it returns through their own store. The same
// nudge always gets the same id (from its key), so two devices making it at once make one record,
// and one already done, snoozed or dismissed is never made again. Its timestamps are the moment
// the reason for it began (never later than now), so anything the person did on another device
// wins over a copy made late.
//
// The rules here: never two waiting nudges about the same record, never the same text twice in a
// month, at most `cap` (4 at most) a day, never during quiet hours, and a nudge whose reason has
// gone (the to-do is done, the loan is paid) quietly ends. Pure, so it's tested here once.
import { addDays, daysBetween, isoDate, isValidTime, nextOccurrence, parseDate, toEpoch, yearsAt } from "./dates";
import { dayWord, money, time12 } from "./format";
import { fundSummary } from "./funds";
import { NUDGE_CATEGORIES, type Kind, type NudgeCategory, type NudgeData, type NudgeKind } from "./kinds";
import { owedSummary } from "./owed";
import { moneyPace } from "./today";

type AnyRec = { id: string; kind: Kind | string; data: any; deleted?: 0 | 1 | number; created_at?: number; updated_at?: number };
type NRec = { id: string; data: NudgeData; deleted?: 0 | 1 | number; created_at?: number; updated_at?: number };

export const NUDGE_CAP_MAX = 4;

export interface NudgeSettings {
  on: boolean; // the app's own check makes nudges
  categories: Record<NudgeCategory, boolean>; // which kinds of nudge to make and show
  quiet: { from: string; to: string } | null; // HH:mm; nothing comes up (or rings) in between
  cap: number; // nudges a day, 1..4
  notify: boolean; // ring when one is due
  self: boolean; // the assistant's own reminders are saved without asking
}

export const NUDGE_CATEGORY_WORD: Record<NudgeCategory, { name: string; hint: string }> = {
  todos: { name: "To-dos", hint: "What's on for today, and to-dos past their day" },
  events: { name: "Plans", hint: "The evening before something you've planned" },
  dates: { name: "Birthdays and dates", hint: "A few days before, to get something ready" },
  money: { name: "Spending", hint: "When this month runs well ahead of last month" },
  hisaab: { name: "Hisaabs", hint: "Money someone gave you that's been open a while" },
  loans: { name: "Money you lent", hint: "When it's past the day they'd pay it back" },
  assistant: { name: "From the assistant", hint: "Reminders the assistant sets for you" },
};

export const DEFAULT_NUDGE_SETTINGS: NudgeSettings = {
  on: true,
  categories: { todos: true, events: true, dates: true, money: true, hisaab: true, loans: true, assistant: true },
  quiet: { from: "22:00", to: "08:00" },
  cap: NUDGE_CAP_MAX,
  notify: true,
  self: false,
};

// settings from storage (or anywhere), made sense of
export function cleanNudgeSettings(raw: any): NudgeSettings {
  const r = raw && typeof raw === "object" ? raw : {};
  const categories = Object.assign({}, DEFAULT_NUDGE_SETTINGS.categories);
  if (r.categories && typeof r.categories === "object") for (const c of NUDGE_CATEGORIES) if (typeof r.categories[c] === "boolean") categories[c] = r.categories[c];
  let quiet = DEFAULT_NUDGE_SETTINGS.quiet;
  if (r.quiet === null) quiet = null;
  else if (r.quiet && isValidTime(r.quiet.from) && isValidTime(r.quiet.to)) quiet = r.quiet.from === r.quiet.to ? null : { from: r.quiet.from, to: r.quiet.to };
  const cap = Math.round(Number(r.cap));
  return {
    on: typeof r.on === "boolean" ? r.on : DEFAULT_NUDGE_SETTINGS.on,
    categories,
    quiet,
    cap: cap >= 1 && cap <= NUDGE_CAP_MAX ? cap : DEFAULT_NUDGE_SETTINGS.cap,
    notify: typeof r.notify === "boolean" ? r.notify : DEFAULT_NUDGE_SETTINGS.notify,
    self: typeof r.self === "boolean" ? r.self : DEFAULT_NUDGE_SETTINGS.self,
  };
}

// ---------- secrets never go in a nudge ----------

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\bxox[abpr]-[0-9A-Za-z-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // a signed token (JWT)
];
// keep the word, hide what follows: "password: hunter22", "PIN is 4471", "api key = ..."
const SECRET_LABELLED = /\b(password|passwd|passcode|pass code|pin|otp|cvv|secret|api[ _-]?key|access[ _-]?token|auth[ _-]?token|token|private key)(\s*(?:is|was|:|=|-)\s*)["']?[^\s"',]{3,}/gi;

// and with only a space, when what follows looks like one (it has a digit or a symbol): "password
// hunter22", "PIN 4471" — but not "change the wifi password tomorrow" or "pin the photo"
const SECRET_SPACED = /\b(password|passwd|passcode|pass code|pin|otp|cvv|api[ _-]?key|access[ _-]?token|auth[ _-]?token|token|private key)(\s+)["']?(?=[^\s"',]*[\d!@#$%^&*_+=~?<>|\\/])[^\s"',]{3,}/gi;

export function hideSecrets(text: string): string {
  let s = String(text == null ? "" : text);
  for (const re of SECRET_PATTERNS) s = s.replace(re, "[hidden]");
  s = s.replace(SECRET_LABELLED, "$1$2[hidden]");
  return s.replace(SECRET_SPACED, (all, label: string, gap: string) => (/\[hidden\]/.test(all) ? all : `${label}${gap}[hidden]`));
}

// ---------- quiet hours ----------

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const minuteOfDay = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

// is this moment inside quiet hours (which may run past midnight: 22:00 to 08:00)?
export function inQuietHours(ms: number, quiet: NudgeSettings["quiet"]): boolean {
  if (!quiet) return false;
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  if (from === to) return false;
  const m = minuteOfDay(ms);
  return from < to ? m >= from && m < to : m >= from || m < to;
}

// the moment itself, or when quiet hours end if it falls inside them
export function afterQuietHours(ms: number, quiet: NudgeSettings["quiet"]): number {
  if (!quiet || !inQuietHours(ms, quiet)) return ms;
  const day = isoDate(new Date(ms));
  const end = toEpoch(day, quiet.to);
  return end > ms ? end : toEpoch(addDays(day, 1), quiet.to);
}

// ---------- ids ----------

// FNV-1a, twice with different starts: 16 hex characters, the same on every device
function hash(s: string): string {
  const one = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return one(2166136261) + one(0x9e3779b9);
}
export const nudgeId = (key: string) => `ndg_${hash(key)}`;

// ---------- reading nudges ----------

const ACTIVE = new Set(["pending", "seen", "snoozed"]);
export const isActiveNudge = (n: { data: NudgeData; deleted?: unknown }) => !n.deleted && ACTIVE.has(n.data.status);

// when it next comes up: its time, or the end of a snooze
export const nudgeWhen = (n: { data: NudgeData }) => (n.data.status === "snoozed" && n.data.snooze_until ? n.data.snooze_until : n.data.due_at);

export const nudgeCategory = (n: { data: NudgeData }): NudgeCategory => (n.data.category && (NUDGE_CATEGORIES as readonly string[]).includes(n.data.category) ? n.data.category : n.data.created_by === "assistant" ? "assistant" : "todos");

// waiting to be dealt with now (its time has come, it's switched on, and it isn't quiet hours)
export function isDueNudge(n: NRec, now: number, settings: NudgeSettings): boolean {
  if (!isActiveNudge(n) || !settings.categories[nudgeCategory(n)]) return false;
  return afterQuietHours(nudgeWhen(n), settings.quiet) <= now;
}

const RANK = { high: 0, normal: 1, low: 2 } as const;
const byRank = (a: NRec, b: NRec) => (RANK[a.data.priority] ?? 1) - (RANK[b.data.priority] ?? 1) || nudgeWhen(a) - nudgeWhen(b) || a.id.localeCompare(b.id);

// the ones to deal with now, most pressing first (Today shows the first; the assistant all of them)
export const dueNudges = <N extends NRec>(nudges: N[], now: number, settings: NudgeSettings): N[] => nudges.filter((n) => isDueNudge(n, now, settings)).sort(byRank);
// coming later (snoozed, or not due yet), soonest first
export const laterNudges = <N extends NRec>(nudges: N[], now: number, settings: NudgeSettings): N[] =>
  nudges.filter((n) => isActiveNudge(n) && settings.categories[nudgeCategory(n)] && !isDueNudge(n, now, settings)).sort((a, b) => nudgeWhen(a) - nudgeWhen(b));
// done, dismissed or no longer needed, newest first
export const pastNudges = <N extends NRec>(nudges: N[]): N[] => nudges.filter((n) => !n.deleted && !isActiveNudge(n)).sort((a, b) => (b.data.done_at || b.updated_at || 0) - (a.data.done_at || a.updated_at || 0));

// the two snooze times: an hour from now, and tomorrow morning (both moved out of quiet hours)
export function snoozeTimes(now: number, settings: NudgeSettings): { hour: number; tomorrow: number } {
  const morning = settings.quiet ? settings.quiet.to : "09:00";
  const t = toEpoch(addDays(isoDate(new Date(now)), 1), minutesOf(morning) < minutesOf("09:00") ? "09:00" : morning);
  return { hour: afterQuietHours(now + 3600000, settings.quiet), tomorrow: afterQuietHours(t, settings.quiet) };
}

// what a nudge becomes when it's done, snoozed or dismissed
export function nudgeAfter(data: NudgeData, action: "done" | "dismiss" | "seen" | { snooze: number }, now: number): NudgeData {
  if (action === "seen") return data.status === "pending" ? Object.assign({}, data, { status: "seen" as const }) : data;
  if (action === "done") return Object.assign({}, data, { status: "done" as const, done_at: now, snooze_until: null });
  if (action === "dismiss") return Object.assign({}, data, { status: "dismissed" as const, done_at: now, snooze_until: null });
  return Object.assign({}, data, { status: "snoozed" as const, snooze_until: action.snooze, done_at: null });
}

export const NUDGE_STATUS_WORD: Record<string, string> = { pending: "Waiting", seen: "Seen", snoozed: "Snoozed", done: "Done", dismissed: "Dismissed" };
export const nudgeEndWord = (n: { data: NudgeData }) => (n.data.resolved ? "No longer needed" : NUDGE_STATUS_WORD[n.data.status] || n.data.status);

// ---------- duplicates ----------

export const nudgeText = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const MONTH_MS = 30 * 86400000;

// why a new nudge shouldn't be made (one about the same record is waiting, or the same words came
// up in the last month), or "" when it's fine. `self` is its own id, when it has one.
export function nudgeDuplicate(data: { text: string; related_ids?: string[] }, nudges: NRec[], now: number, self = ""): string {
  const text = nudgeText(data.text);
  const related = new Set(data.related_ids || []);
  for (const n of nudges) {
    if (n.deleted || n.id === self) continue;
    if (isActiveNudge(n) && (n.data.related_ids || []).some((id) => related.has(id))) return `there's already a nudge about that: "${n.data.text}"`;
    if (text && nudgeText(n.data.text) === text && now - (n.data.due_at || 0) < MONTH_MS) return `the same nudge came up already: "${n.data.text}"`;
  }
  return "";
}

// ---------- the app's own check ----------

export interface NudgeWorld {
  records: AnyRec[]; // every live record (the planner picks the kinds it reads)
  nudges: NRec[]; // every nudge record, deleted ones too (so a cleared one isn't made again)
  get?: (id: string) => AnyRec | undefined; // any record by id, deleted ones too
  currency: string;
  candidates?: NudgeCandidate[]; // worked out already (nudgeCandidates)
}

export interface NudgeCandidate {
  key: string;
  category: NudgeCategory;
  kind: NudgeKind;
  text: string;
  reason: string;
  priority: NudgeData["priority"];
  related_ids: string[];
  due_at: number; // when it should come up
  since: string; // YYYY-MM-DD: the day its reason began (its timestamps)
  group?: boolean; // about several records: those already nudged about are left out of it
  rule: string; // which rule made it (some rules make only so many a day)
}

const RULE_LIMIT: Record<string, number> = { "todo-overdue": 2 };
const quote = (s: string) => `“${String(s || "").trim()}”`;
const list3 = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`);

// a day gone by, mid-sentence: "yesterday", "on Thu 26 Nov"
const pastDay = (date: string, today: string) => {
  const n = daysBetween(today, date);
  return n === 0 ? "today" : n === -1 ? "yesterday" : `on ${dayWord(date, today)}`;
};

// at hh:mm today, or now if that's passed (it's still worth saying today)
const todayAt = (today: string, hhmm: string, now: number) => Math.max(toEpoch(today, hhmm), now);

// Everything that deserves a nudge right now, with no limits applied: the rules, in one place.
export function nudgeCandidates(world: NudgeWorld, now: number): NudgeCandidate[] {
  const today = isoDate(new Date(now));
  const of = (k: string) => world.records.filter((r) => r.kind === k && !r.deleted);
  const out: NudgeCandidate[] = [];
  const people = new Map(of("person").map((p) => [p.id, p.data.name as string]));

  // to-dos: what's on for today, in the morning; each one past its day, once for that day
  const open = of("todo").filter((t) => !t.data.done);
  const forToday = open.filter((t) => t.data.due === today);
  if (forToday.length) {
    const names = forToday.map((t) => quote(t.data.title));
    out.push({
      key: `todos-today:${today}`,
      rule: "todos-today",
      category: "todos",
      kind: "message",
      text: forToday.length === 1 ? `${names[0]} is on for today.` : `${forToday.length} to-dos for today: ${list3(names)}.`,
      reason: "What's on your list for today",
      priority: "low",
      related_ids: forToday.map((t) => t.id),
      due_at: todayAt(today, "09:00", now),
      since: today,
      group: true,
    });
  }
  for (const t of open) {
    if (!t.data.due || t.data.due >= today) continue;
    out.push({
      key: `todo-overdue:${t.id}:${t.data.due}`,
      rule: "todo-overdue",
      category: "todos",
      kind: "question",
      text: `${quote(t.data.title)} was due ${pastDay(t.data.due, today)}. Do it today, or give it a new day?`,
      reason: "A to-do past its day",
      priority: t.data.priority === "high" ? "high" : "normal",
      related_ids: [t.id],
      due_at: todayAt(today, "10:00", now),
      since: addDays(t.data.due, 1),
    });
  }

  // plans: the evening before (it stays until the plan has started)
  const tomorrow = addDays(today, 1);
  for (const e of of("event")) {
    const d = e.data.date;
    const started = d === today && (!e.data.time || toEpoch(d, e.data.time) <= now);
    if (!(d === tomorrow || (d === today && !started))) continue;
    const who = e.data.person_id ? people.get(e.data.person_id) : "";
    out.push({
      key: `event:${e.id}:${d}`,
      rule: d === tomorrow ? "event-tomorrow" : "event-today",
      category: "events",
      kind: "reminder",
      text: `${d === tomorrow ? "Tomorrow" : "Today"}${e.data.time ? ` at ${time12(e.data.time)}` : ""}: ${e.data.title}${e.data.place ? ` at ${e.data.place}` : ""}${who ? ` with ${who}` : ""}. Anything to get ready?`,
      reason: "Something you've planned",
      priority: "normal",
      related_ids: [e.id],
      due_at: todayAt(today, "19:30", now),
      since: addDays(d, -1),
    });
  }

  // birthdays and dates: from three days before, to get something ready
  for (const r of of("date")) {
    const next = nextOccurrence(r.data.month, r.data.day, today);
    const days = daysBetween(today, next);
    if (days > 3) continue;
    const who = r.data.person_id ? people.get(r.data.person_id) : "";
    const years = yearsAt(r.data.year, next);
    const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `on ${dayWord(next, today)}`;
    const what =
      r.data.kind === "birthday"
        ? `${who || r.data.title}${who ? "'s birthday" : ""} is ${when}${years && years > 0 ? ` (${years})` : ""}`
        : `${r.data.title}${years && years > 0 && r.data.kind === "anniversary" ? ` (${years} years)` : ""} is ${when}`;
    out.push({
      key: `date:${r.id}:${next}`,
      rule: "date-soon",
      category: "dates",
      kind: "question",
      text: `${what}. Anything to get or plan?`,
      reason: "A date coming up",
      priority: days <= 1 ? "normal" : "low",
      related_ids: [r.id],
      due_at: todayAt(today, "11:00", now),
      since: addDays(next, -3),
    });
  }

  // a hisaab open for a while: ten days with nothing on it
  const moneyRecs = of("money");
  const items = of("item");
  for (const f of of("fund")) {
    if (f.data.closed) continue;
    const s = fundSummary(f as any, moneyRecs as any, items as any);
    const dates = [f.data.date, ...(f.data.moves || []).map((m: any) => m.date), ...s.spends.map((m: any) => m.data.date)].filter((d: unknown): d is string => typeof d === "string");
    const last = dates.sort().pop() || today;
    if (daysBetween(last, today) < 10) continue;
    const cur = f.data.currency || world.currency;
    const from = f.data.from || "someone";
    const what = String(f.data.purpose || "money").toLowerCase();
    let text: string;
    if (s.state === "holding") text = `${from}'s money for ${what}: ${money(s.left, cur)} is still with you. Give it back, keep it, or spend it?`;
    else if (s.state === "over") text = `You spent ${money(-s.left, cur)} more than ${from} gave for ${what}. Ask them for it, or cover it yourself?`;
    else text = `${from}'s money for ${what} is all spent. Settle the hisaab?`;
    out.push({
      key: `fund:${f.id}:${last}`,
      rule: "fund-open",
      category: "hisaab",
      kind: "question",
      text,
      reason: "A hisaab open for a while",
      priority: "normal",
      related_ids: [f.id],
      due_at: todayAt(today, "11:30", now),
      since: addDays(last, 10),
    });
  }

  // money you lent, past the day they'd pay it back (the day itself already rings)
  for (const o of of("owed")) {
    if (o.data.type !== "loan" || o.data.closed || !o.data.due || o.data.due >= today) continue;
    const left = owedSummary(o, today).left;
    if (!(left > 0)) continue;
    const cur = o.data.currency || world.currency;
    out.push({
      key: `owed:${o.id}:${o.data.due}`,
      rule: "loan-late",
      category: "loans",
      kind: "question",
      text: `${o.data.who || "Someone"} was to pay back ${money(left, cur)} ${pastDay(o.data.due, today)}. Send them a gentle reminder?`,
      reason: "Money you lent, past its day",
      priority: daysBetween(o.data.due, today) > 7 ? "high" : "normal",
      related_ids: [o.id],
      due_at: todayAt(today, "10:30", now),
      since: addDays(o.data.due, 1),
    });
  }

  // this month's spending well ahead of last month at the same point (once a month)
  const day = Number(today.slice(8, 10));
  if (day >= 8) {
    const pace = moneyPace(moneyRecs as any, today, world.currency);
    if (pace.before > 0 && pace.change !== null && pace.change >= 0.25) {
      out.push({
        key: `money-pace:${today.slice(0, 7)}`,
        rule: "money-pace",
        category: "money",
        kind: "message",
        text: `Spending this month is ${Math.round(pace.change * 100)}% above last month at this point: ${money(pace.now, world.currency)} against ${money(pace.before, world.currency)}.`,
        reason: "How this month's money is going",
        priority: "low",
        related_ids: [],
        due_at: todayAt(today, "18:00", now),
        since: `${today.slice(0, 7)}-08`,
      });
    }
  }
  return out;
}

// is a record settled (done, gone, paid), so a nudge about it has nothing left to say?
export function recordSettled(r: AnyRec | undefined, today: string): boolean {
  if (!r) return false; // not here yet (still syncing): can't say
  if (r.deleted) return true;
  const d = r.data || {};
  switch (r.kind) {
    case "todo":
    case "reminder":
    case "item":
      return !!d.done;
    case "event":
      return typeof d.date === "string" && d.date < today;
    case "owed":
    case "fund":
      return !!d.closed;
    case "wish":
      return !!d.got;
    case "thing":
    case "server":
    case "domain":
      return !!d.gone;
    case "client":
      return !!d.past;
    case "interest":
      return !!d.archived;
    case "project":
      return d.status === "done";
    case "media":
      return d.status === "done" || d.status === "dropped";
  }
  return false;
}

export interface NudgePlan {
  create: { id: string; data: NudgeData; at: number }[]; // `at`: its created_at / updated_at
  resolve: { id: string; data: NudgeData }[]; // waiting ones whose reason has gone (status done)
}

// The check: what to make now and what to end. Makes nothing while it's switched off (it still
// ends nudges that have nothing left to say).
export function planNudges(world: NudgeWorld, now: number, settings: NudgeSettings): NudgePlan {
  const today = isoDate(new Date(now));
  const all = world.candidates || nudgeCandidates(world, now);
  const holding = new Set(all.map((c) => c.key));
  const byId = new Map(world.records.map((r) => [r.id, r]));
  const get = (id: string) => (world.get ? world.get(id) : byId.get(id));
  const plan: NudgePlan = { create: [], resolve: [] };

  // end the waiting ones with nothing left to say
  for (const n of world.nudges) {
    if (!isActiveNudge(n)) continue;
    const gone = n.data.created_by === "app" && n.data.key ? !holding.has(n.data.key) : false;
    const related = n.data.related_ids || [];
    const settled = related.length > 0 && related.every((id) => recordSettled(get(id), today));
    if (gone || settled) plan.resolve.push({ id: n.id, data: Object.assign({}, n.data, { status: "done" as const, resolved: true, done_at: now, snooze_until: null }) });
  }
  if (!settings.on) return plan;

  const ended = new Set(plan.resolve.map((r) => r.id));
  const exists = new Set(world.nudges.map((n) => n.id));
  const live = world.nudges.filter((n) => !n.deleted);
  const waiting = live.filter((n) => isActiveNudge(n) && !ended.has(n.id));
  const covered = new Set<string>();
  for (const n of waiting) for (const id of n.data.related_ids || []) covered.add(id);
  const recentText = new Set(live.filter((n) => now - (n.data.due_at || 0) < MONTH_MS).map((n) => nudgeText(n.data.text)));
  // how many each day has already (by the day it comes up) and each rule today
  const dayOf = (ms: number) => isoDate(new Date(ms));
  const perDay = new Map<string, number>();
  const perRule = new Map<string, number>();
  for (const n of live) {
    const d = dayOf(n.data.due_at);
    perDay.set(d, (perDay.get(d) || 0) + 1);
    const rule = n.data.key ? n.data.key.split(":")[0] : "";
    if (rule && d === today) perRule.set(rule, (perRule.get(rule) || 0) + 1);
  }

  const order = all.slice().sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.due_at - b.due_at || a.key.localeCompare(b.key));
  for (const c of order) {
    if (!settings.categories[c.category]) continue;
    const id = nudgeId(c.key);
    if (exists.has(id)) continue; // made before (by this device or another), whatever became of it
    let related = c.related_ids;
    if (c.group) {
      related = related.filter((r) => !covered.has(r));
      if (!related.length) continue;
    } else if (related.some((r) => covered.has(r))) continue;
    const text = hideSecrets(c.text);
    if (recentText.has(nudgeText(text))) continue;
    const due = afterQuietHours(c.due_at, settings.quiet);
    const day = dayOf(due);
    if ((perDay.get(day) || 0) >= Math.min(settings.cap, NUDGE_CAP_MAX)) continue;
    const limit = RULE_LIMIT[c.rule];
    const ruleKey = c.key.split(":")[0];
    if (limit && day === today && (perRule.get(ruleKey) || 0) >= limit) continue;
    const at = Math.min(now, toEpoch(c.since));
    plan.create.push({
      id,
      at,
      data: { text, kind: c.kind, due_at: due, priority: c.priority, status: "pending", snooze_until: null, reason: c.reason, related_ids: related, created_by: "app", category: c.category, key: c.key },
    });
    exists.add(id);
    perDay.set(day, (perDay.get(day) || 0) + 1);
    if (day === today) perRule.set(ruleKey, (perRule.get(ruleKey) || 0) + 1);
    for (const r of related) covered.add(r);
    recentText.add(nudgeText(text));
  }
  return plan;
}

// ---------- notifications ----------

export interface NudgeAlert {
  key: string; // its id and the moment it was meant for: the same nudge snoozed rings again
  id: string;
  at: number; // when to ring (out of quiet hours; now for one that's late)
  late: boolean;
  title: string;
  body: string;
  related_id: string | null; // the record to open, if there's one
}

const ALERT_TITLE: Record<NudgeCategory, string> = { todos: "To-dos", events: "Coming up", dates: "Coming up", money: "Money", hisaab: "Hisaab", loans: "Money you lent", assistant: "From your assistant" };
const LATE_MS = 12 * 3600000; // one that came in (from another device) more than this late stays in the app, silent

// What should ring: each waiting nudge at its time, moved out of quiet hours, at most `cap` a day
// (counting what this device already rang that day). `sent` is what this device has rung or
// scheduled: alert key -> when.
export function nudgeAlerts(nudges: NRec[], now: number, settings: NudgeSettings, sent: Record<string, number> = {}, horizonMs = 14 * 86400000): NudgeAlert[] {
  if (!settings.notify) return [];
  const dayOf = (ms: number) => isoDate(new Date(ms));
  const rung = new Map<string, number>();
  for (const k of Object.keys(sent)) if (sent[k] <= now) rung.set(dayOf(sent[k]), (rung.get(dayOf(sent[k])) || 0) + 1);
  const wanted: NudgeAlert[] = [];
  for (const n of nudges) {
    if (n.deleted || !(n.data.status === "pending" || n.data.status === "snoozed")) continue;
    if (!settings.categories[nudgeCategory(n)]) continue;
    const meant = nudgeWhen(n);
    const key = `${n.id}:${meant}`;
    if (sent[key] !== undefined && sent[key] <= now) continue; // rung already
    if (now - meant > LATE_MS) continue;
    // its time has passed (it came from another device, or the app wasn't running): ring it now,
    // or when quiet hours end
    const late = meant <= now;
    const at = afterQuietHours(late ? now : meant, settings.quiet);
    if (at > now + horizonMs) continue;
    wanted.push({ key, id: n.id, at, late, title: ALERT_TITLE[nudgeCategory(n)], body: hideSecrets(n.data.text), related_id: (n.data.related_ids || [])[0] || null });
  }
  const rank = new Map(nudges.map((n) => [n.id, RANK[n.data.priority] ?? 1]));
  wanted.sort((a, b) => a.at - b.at || (rank.get(a.id) || 0) - (rank.get(b.id) || 0));
  const out: NudgeAlert[] = [];
  const cap = Math.min(settings.cap, NUDGE_CAP_MAX);
  for (const a of wanted) {
    const d = dayOf(a.at);
    if ((rung.get(d) || 0) >= cap) continue;
    rung.set(d, (rung.get(d) || 0) + 1);
    out.push(a);
  }
  return out;
}

// forget what was rung more than a few days ago
export function pruneSent(sent: Record<string, number>, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(sent)) if (now - sent[k] < 4 * 86400000) out[k] = sent[k];
  return out;
}

// ---------- context for a new conversation ----------

const STOP = new Set(
  "the a an and or but to of in on at for with from by is are was were be been it its this that these those i me my mine you your we our they them their he she his her what when where who how why do does did can could should would will shall have has had not no yes so if then than just about into over please want need get got make let tell".split(
    " ",
  ),
);
const words = (s: string) =>
  nudgeText(s)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));

// The memories most worth bringing into a conversation that starts with `query`: sharing words with
// it (or its topic named), about a record it mentions, and newer ones first when nothing matches.
export function rankMemories<M extends { id: string; data: { text: string; topic?: string; related_ids?: string[]; date?: string | null }; updated_at?: number }>(
  memories: M[],
  opts: { query?: string; related?: string[]; today?: string },
  n = 12,
): M[] {
  const q = new Set(words(opts.query || ""));
  const related = new Set(opts.related || []);
  const today = opts.today || isoDate();
  const scored = memories.map((m) => {
    const w = new Set(words(`${m.data.text} ${m.data.topic || ""}`));
    let s = 0;
    for (const x of q) if (w.has(x)) s += 3;
    if (m.data.topic && q.has(nudgeText(m.data.topic))) s += 2;
    if ((m.data.related_ids || []).some((id) => related.has(id))) s += 4;
    if (m.data.date && daysBetween(m.data.date, today) <= 30 && daysBetween(m.data.date, today) >= 0) s += 0.5;
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s || (b.m.updated_at || 0) - (a.m.updated_at || 0) || a.m.id.localeCompare(b.m.id));
  return scored.slice(0, n).map((x) => x.m);
}

// a date the memory's line can carry: "(since 12 Mar)"
export const memoryDateWord = (date: string | null | undefined, today = isoDate()) => (date && parseDate(date).getTime() ? dayWord(date, today) : "");
