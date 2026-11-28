// Pots: your own money given jobs (envelope budgeting; the types are in kinds.ts). Worked out the
// same way by the phone, the computer and the assistant: what's in each pot, what went in and came
// out, how close it is to its target, how an income splits by your rules, and where a month's
// money went. Pure, so it's tested here once.
import { MONTHS_LONG, money as moneyWord } from "./format";
import type { MoneyData, PotData, PotMove, PotRule, PotSplit, PotType } from "./kinds";

type R<D> = { id: string; data: D; created_at?: number };
type Mo = R<MoneyData>;
type Po = R<PotData>;

const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

export const POT_TYPES: PotType[] = ["spend", "bills", "save", "debt"];

// each kind of pot in words: what it's for and what its target means
export const POT_TYPE_META: Record<PotType, { name: string; what: string; target: string; date?: string; example: string }> = {
  spend: { name: "Spending", what: "Money to spend on something: personal, groceries, eating out.", target: "Monthly limit", example: "Personal" },
  bills: { name: "Bills", what: "What has to be paid every month: rent, fees, bills.", target: "Needed each month", example: "Bills" },
  save: { name: "Saving", what: "Putting money aside for something.", target: "Goal", date: "Reach it by", example: "Savings" },
  debt: { name: "Paying off", what: "A loan or a debt you're paying back.", target: "How much you owe", date: "Paid off by", example: "Loan" },
};

// Pots to start with, one tap each, and the 50/30/20 split (half on needs, 30% on wants, 20% saved).
export const POT_STARTERS: { name: string; type: PotType; rule?: PotRule }[] = [
  { name: "Personal", type: "spend" },
  { name: "Bills", type: "bills", rule: { kind: "fill" } },
  { name: "Savings", type: "save", rule: { kind: "percent", value: 10 } },
  { name: "Loan", type: "debt" },
  { name: "Emergency fund", type: "save" },
];
export const POT_503020: { name: string; type: PotType; rule: PotRule }[] = [
  { name: "Needs", type: "bills", rule: { kind: "percent", value: 50 } },
  { name: "Wants", type: "spend", rule: { kind: "percent", value: 30 } },
  { name: "Savings", type: "save", rule: { kind: "percent", value: 20 } },
];

// The pot palette: eight hues for each mode, checked for colour-blind separation side by side
// (worst neighbours ΔE 10 dark, 11.8 light) and for contrast on every theme's cards. A pot keeps
// its slot (data.color), so its colour never changes when others are added or put in order. On the
// light theme four of them are below 3:1, so a pot is always named next to its colour.
export const POT_COLORS = {
  dark: ["#338ced", "#e76624", "#00a888", "#d28e05", "#e24d8b", "#0aac23", "#9887ef", "#eb6263"],
  light: ["#257de0", "#f47230", "#00b894", "#f2a600", "#ee7fac", "#008a17", "#6a4ce2", "#ec4647"],
};
export const potColor = (slot: number | undefined, mode: "dark" | "light") => {
  const list = POT_COLORS[mode];
  const n = Math.round(num(slot));
  return list[((n % list.length) + list.length) % list.length];
};
// the first colour no pot has yet (archived pots keep theirs)
export function nextPotColor(pots: { data: PotData }[]): number {
  const used = new Set(pots.map((p) => Math.round(num(p.data.color))));
  for (let i = 0; i < POT_COLORS.dark.length; i++) if (!used.has(i)) return i;
  return pots.length % POT_COLORS.dark.length;
}

// pots in the order you keep them: by order (none = at the end), then oldest first
const orderOf = (p: Po) => (typeof p.data.order === "number" && Number.isFinite(p.data.order) ? p.data.order : 1e6);
export function sortPots<P extends Po>(pots: P[]): P[] {
  return pots.slice().sort((a, b) => orderOf(a) - orderOf(b) || (a.created_at || 0) - (b.created_at || 0) || String(a.data.name).localeCompare(String(b.data.name)));
}

const mine = (m: Mo, currency: string) => !m.data.paid_from && (m.data.currency || currency) === currency;
const monthOf = (d: string) => String(d || "").slice(0, 7);
const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
// months to put money in, this one included: from November to June is 8
export const monthsLeft = (today: string, until: string) => Math.max(1, monthIndex(until) - monthIndex(today) + 1);
export const monthYearWord = (date: string) => `${MONTHS_LONG[Number(date.slice(5, 7)) - 1] || ""} ${date.slice(0, 4)}`.trim();

// every move that touches a pot, as the pot sees it: its own, and the ones kept on the other pot
export function potMoves(pot: Po, pots: Po[]): (PotMove & { kept_on: string })[] {
  const out: (PotMove & { kept_on: string })[] = [];
  for (const m of pot.data.moves || []) out.push(Object.assign({}, m, { kept_on: pot.id }));
  for (const p of pots) {
    if (p.id === pot.id) continue;
    for (const m of p.data.moves || []) if (m.other === pot.id) out.push({ dir: m.dir === "in" ? "out" : "in", other: p.id, amount: m.amount, date: m.date, note: m.note, kept_on: p.id });
  }
  return out;
}

export interface PotEntry<M extends Mo = Mo> {
  type: "income" | "spend" | "refund" | "move_in" | "move_out" | "opening";
  amount: number; // above 0; type says which way
  date: string;
  money?: M; // income: the income split into it; spend / refund: the spending
  other?: string | null; // a move: the other pot, null = money not in a pot
  note?: string;
  at?: number; // when it was added, to order a day's entries
}

export interface PotSummary<M extends Mo = Mo> {
  balance: number; // what's in it now
  opening: number;
  putIn: number; // from income, all time
  movedIn: number;
  movedOut: number;
  spent: number; // all time, refunds taken off
  month: { key: string; in: number; out: number; spent: number }; // this month: in from income and moves, out by moves
  over: boolean; // spent more than was in it
  // how far along it is: spend = this month's spending of its limit; bills = put in this month of
  // what's needed; save = saved of the goal; debt = paid of what was owed. null without a target
  progress: number | null;
  meter: "use" | "fill"; // "use": filling up is bad (a limit); "fill": filling up is good
  paid: number; // debt: paid out of it so far
  owed: number | null; // debt: still owed
  monthNeed: number; // what it should get this month (its target, or the goal spread over the months left)
  stillNeeded: number; // of monthNeed, what hasn't gone in yet
  perMonth: number | null; // save / debt with a date: what it needs each month from now on
  entries: PotEntry<M>[]; // newest first
}

export function potSummary<M extends Mo>(pot: Po, pots: Po[], money: M[], opts: { today: string; currency: string }): PotSummary<M> {
  const currency = pot.data.currency || opts.currency;
  const month = monthOf(opts.today);
  const entries: PotEntry<M>[] = [];
  const opening = round(Math.max(0, num(pot.data.opening)));
  if (opening) entries.push({ type: "opening", amount: opening, date: "", at: pot.created_at });
  let putIn = 0;
  let spent = 0;
  let paid = 0;
  let mIn = 0;
  let mSpent = 0;
  for (const m of money) {
    if (!mine(m, currency)) continue;
    const amt = num(m.data.amount);
    if (m.data.type === "income") {
      for (const sp of m.data.split || []) {
        if (sp.pot_id !== pot.id) continue;
        const a = num(sp.amount);
        if (!(a > 0)) continue;
        putIn += a;
        if (monthOf(m.data.date) === month) mIn += a;
        entries.push({ type: "income", amount: round(a), date: m.data.date, money: m, note: m.data.note || m.data.category, at: m.created_at });
      }
    } else if (m.data.pot_id === pot.id && amt > 0) {
      spent += amt;
      paid += amt;
      if (monthOf(m.data.date) === month) mSpent += amt;
      entries.push({ type: "spend", amount: round(amt), date: m.data.date, money: m, note: m.data.note || m.data.category, at: m.created_at });
    }
  }
  let movedIn = 0;
  let movedOut = 0;
  let mMovedOut = 0;
  for (const mv of potMoves(pot, pots)) {
    const a = num(mv.amount);
    if (!(a > 0)) continue;
    if (mv.dir === "in") {
      movedIn += a;
      if (monthOf(mv.date) === month) mIn += a;
    } else {
      movedOut += a;
      if (monthOf(mv.date) === month) mMovedOut += a;
    }
    entries.push({ type: mv.dir === "in" ? "move_in" : "move_out", amount: round(a), date: mv.date, other: mv.other, note: mv.note });
  }
  const balance = round(opening + putIn + movedIn - movedOut - spent);
  const target = num(pot.data.target) > 0 ? num(pot.data.target) : 0;
  const type = pot.data.type;
  const date = typeof pot.data.target_date === "string" && pot.data.target_date ? pot.data.target_date : null;
  let progress: number | null = null;
  let monthNeed = 0;
  let perMonth: number | null = null;
  let owed: number | null = null;
  const before = balance - mIn + mMovedOut + mSpent; // what was in it when this month began
  if (type === "spend") {
    if (target) progress = mSpent / target;
    monthNeed = target;
  } else if (type === "bills") {
    if (target) progress = mIn / target;
    monthNeed = target;
  } else if (type === "save") {
    if (target) {
      progress = Math.max(0, balance) / target;
      if (date) {
        monthNeed = Math.max(0, Math.round((target - before) / monthsLeft(opts.today, date)));
        perMonth = Math.max(0, Math.round((target - balance) / monthsLeft(opts.today, date)));
      }
    }
  } else if (type === "debt") {
    if (target) {
      owed = round(Math.max(0, target - paid));
      progress = Math.min(1, paid / target);
      if (date) {
        const paidBefore = paid - mSpent;
        monthNeed = Math.max(0, Math.round((target - paidBefore - Math.max(0, before)) / monthsLeft(opts.today, date)));
        perMonth = Math.max(0, Math.round((owed - Math.max(0, balance)) / monthsLeft(opts.today, date)));
      }
    }
  }
  entries.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.at || 0) - (a.at || 0));
  return {
    balance,
    opening,
    putIn: round(putIn),
    movedIn: round(movedIn),
    movedOut: round(movedOut),
    spent: round(spent),
    month: { key: month, in: round(mIn), out: round(mMovedOut), spent: round(mSpent) },
    over: balance < 0,
    progress: progress == null ? null : Math.max(0, progress),
    meter: type === "spend" ? "use" : "fill",
    paid: round(paid),
    owed,
    monthNeed: round(monthNeed),
    stillNeeded: round(Math.max(0, monthNeed - mIn)),
    perMonth,
    entries,
  };
}

// where a pot stands, in a line: "60,000 left · 40,000 of 100,000 spent this month"
export function potStanding(pot: { data: PotData }, s: PotSummary<any>, currency: string): string {
  const cur = pot.data.currency || currency;
  const m = (n: number) => moneyWord(n, cur);
  const target = num(pot.data.target) > 0 ? num(pot.data.target) : 0;
  if (s.over) return `${m(-s.balance)} over: move money in to cover it`;
  switch (pot.data.type) {
    case "spend":
      return [`${m(s.balance)} left`, target ? `${m(s.month.spent)} of ${m(target)} spent this month` : ""].filter(Boolean).join(" · ");
    case "bills":
      if (!target) return `${m(s.balance)} in it`;
      return s.stillNeeded > 0 ? `${m(s.month.in)} of ${m(target)} put in this month · ${m(s.balance)} in it` : `Ready for this month · ${m(s.balance)} in it`;
    case "save": {
      if (!target) return `${m(s.balance)} saved`;
      const pct = Math.min(100, Math.round((s.progress || 0) * 100));
      if (s.balance >= target) return `Goal reached: ${m(s.balance)} saved`;
      const by = pot.data.target_date && s.perMonth ? ` · ${m(s.perMonth)} a month to reach it by ${monthYearWord(pot.data.target_date)}` : "";
      return `${pct}% of ${m(target)} saved${by}`;
    }
    case "debt": {
      const aside = s.balance > 0 ? ` · ${m(s.balance)} set aside` : "";
      if (!target) return `${m(s.paid)} paid${aside}`;
      if (s.owed === 0) return `Paid off: ${m(s.paid)}`;
      return `${m(s.owed || 0)} still owed of ${m(target)}${aside}`;
    }
  }
  return `${m(s.balance)} in it`;
}

// a pot's rule in words: "Gets 30% of each income"
export function ruleWords(rule: PotRule | null | undefined, currency: string): string {
  if (!rule) return "";
  if (rule.kind === "percent") return `Gets ${num(rule.value)}% of each income`;
  if (rule.kind === "fixed") return `Gets ${moneyWord(num(rule.value), currency)} of each income`;
  return "Gets what it still needs this month";
}

// a split cleaned: real pots only, amounts above 0, one line per pot, and never more than the income
export function cleanSplit(raw: unknown, amount: number, isPot: (id: string) => boolean): PotSplit[] {
  const total = num(amount);
  const by = new Map<string, number>();
  for (const s of Array.isArray(raw) ? raw : []) {
    const id = s && typeof s === "object" ? String((s as any).pot_id ?? (s as any).pot ?? "").trim() : "";
    const a = round(num(s && (s as any).amount));
    if (!id || !isPot(id) || !(a > 0)) continue;
    by.set(id, round((by.get(id) || 0) + a));
  }
  const out: PotSplit[] = [];
  let left = round(Math.max(0, total));
  for (const [pot_id, a] of by) {
    const take = round(Math.min(a, left));
    if (take > 0) out.push({ pot_id, amount: take });
    left = round(left - take);
  }
  return out;
}

// what an income's split adds up to
export const splitTotal = (split: PotSplit[] | undefined) => round((split || []).reduce((n, s) => n + num(s.amount), 0));

// How an income splits by your pots' rules: fixed amounts and what pots still need this month
// first (in your order), then shares of the income, never more than the income. Whole amounts.
export function ruleSplit(pots: Po[], money: Mo[], amount: number, opts: { today: string; currency: string; except?: string }): PotSplit[] {
  const total = Math.max(0, num(amount));
  let left = total;
  const out = new Map<string, number>();
  const live = sortPots(pots.filter((p) => !p.data.archived && p.data.rule && (p.data.currency || opts.currency) === opts.currency));
  // the income being changed doesn't count toward what pots already got this month
  const others = opts.except ? money.filter((m) => m.id !== opts.except) : money;
  const give = (id: string, want: number) => {
    const a = Math.round(Math.min(Math.max(0, want), left));
    if (a > 0) {
      out.set(id, (out.get(id) || 0) + a);
      left -= a;
    }
  };
  for (const p of live) {
    const r = p.data.rule as PotRule;
    if (r.kind === "fixed") give(p.id, num(r.value));
    else if (r.kind === "fill") give(p.id, potSummary(p, pots, others, opts).stillNeeded);
  }
  for (const p of live) {
    const r = p.data.rule as PotRule;
    if (r.kind === "percent") give(p.id, (total * Math.min(100, Math.max(0, num(r.value)))) / 100);
  }
  return Array.from(out.entries()).map(([pot_id, a]) => ({ pot_id, amount: a }));
}

export interface MonthJobs {
  earned: number;
  jobs: { pot_id: string; amount: number }[]; // what each pot got this month from income (and from money not in a pot)
  notInPot: number; // earned but given no job
  spentFromPots: number;
  spentNoPot: number; // your own spending that came out of no pot
  freeLeft: number; // of the money not in a pot, what's left after the spending that came out of no pot
}

// Where a month's money went: what each pot got, what was given no job, and what's left of it.
// Pots that don't exist any more count as no pot.
export function monthJobs(money: Mo[], pots: Po[], month: string, currency: string): MonthJobs {
  const known = new Set(pots.map((p) => p.id));
  const got = new Map<string, number>();
  let earned = 0;
  let split = 0;
  let fromFree = 0;
  let spentFromPots = 0;
  let spentNoPot = 0;
  for (const m of money) {
    if (!mine(m, currency) || monthOf(m.data.date) !== month) continue;
    const amt = num(m.data.amount);
    if (m.data.type === "income") {
      earned += amt;
      for (const s of m.data.split || []) {
        if (!known.has(s.pot_id) || !(num(s.amount) > 0)) continue;
        got.set(s.pot_id, (got.get(s.pot_id) || 0) + num(s.amount));
        split += num(s.amount);
      }
    } else if (m.data.pot_id && known.has(m.data.pot_id)) spentFromPots += amt;
    else spentNoPot += amt;
  }
  for (const p of pots)
    for (const mv of p.data.moves || []) {
      if (mv.other !== null || monthOf(mv.date) !== month || !(num(mv.amount) > 0)) continue;
      const a = mv.dir === "in" ? num(mv.amount) : -num(mv.amount);
      got.set(p.id, (got.get(p.id) || 0) + a);
      fromFree += a;
    }
  const order = new Map(sortPots(pots).map((p, i) => [p.id, i]));
  const jobs = Array.from(got.entries())
    .filter(([, a]) => Math.abs(a) > 0.004)
    .sort((a, b) => (order.get(a[0]) || 0) - (order.get(b[0]) || 0))
    .map(([pot_id, a]) => ({ pot_id, amount: round(a) }));
  const notInPot = round(earned - split - fromFree);
  return { earned: round(earned), jobs, notInPot, spentFromPots: round(spentFromPots), spentNoPot: round(spentNoPot), freeLeft: round(notInPot - spentNoPot) };
}

// The pot this spending most likely comes out of, from what you did before: the last spending with
// the same note, else the pot used most for the same category in the last four months.
export function suggestPot(money: Mo[], what: { note?: string; category?: string; today: string }, isPot: (id: string) => boolean): string | null {
  const note = String(what.note || "")
    .trim()
    .toLowerCase();
  const past = money
    .filter((m) => m.data.type === "expense" && !m.data.paid_from && m.data.pot_id && isPot(m.data.pot_id))
    .sort((a, b) => b.data.date.localeCompare(a.data.date) || (b.created_at || 0) - (a.created_at || 0));
  if (note) {
    const same = past.find((m) => String(m.data.note || "").trim().toLowerCase() === note);
    if (same) return same.data.pot_id as string;
  }
  if (!what.category) return null;
  const since = monthIndex(what.today) - 4;
  const count = new Map<string, number>();
  for (const m of past) if (m.data.category === what.category && monthIndex(m.data.date) >= since) count.set(m.data.pot_id as string, (count.get(m.data.pot_id as string) || 0) + 1);
  let best: string | null = null;
  let most = 0;
  for (const [id, n] of count) if (n > most) ((best = id), (most = n));
  return best;
}

// Moving money: which pot record keeps the move, and the move. From a pot: kept on it, going out;
// from money not in a pot: kept on the pot it goes into. Null when there's nothing to move.
export function potMoveFor(from: string | null, to: string | null, amount: number, date: string, note?: string): { pot_id: string; move: PotMove } | null {
  const a = round(num(amount));
  if (!(a > 0) || from === to || (!from && !to)) return null;
  const move: PotMove = Object.assign(from ? { dir: "out" as const, other: to || null } : { dir: "in" as const, other: null }, { amount: a, date }, note ? { note } : {});
  return { pot_id: (from || to) as string, move };
}

// a pot's data with one more move
export const withPotMove = (pot: { data: PotData }, move: PotMove): PotData => Object.assign({}, pot.data, { moves: (pot.data.moves || []).concat([move]) });
