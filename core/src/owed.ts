// Your own money with someone else (an "owed" record): kept with them, to take from whenever you
// need it ("Abu has 150,000 of mine"), or lent to them, to be paid back ("Ali borrowed 20,000").
// It's yours either way: never your spending, and the month's totals don't change. These are the
// sums the phone, the computer and the assistant all use. Pure, so it's tested here once.
import type { MoneyData, OwedData, OwedMove, OwedMoveType, OwedType } from "./kinds";
import { money as moneyWord, shortDate } from "./format";

type R = { id: string; data: OwedData; deleted?: 0 | 1 };

const round = (n: number) => Math.round(n * 100) / 100;

export const OWED_TYPE_WORD: Record<OwedType, string> = { keeping: "Keeping it for you", loan: "Lent" };

// what each step is called, by kind ("Took 20,000" from Abu; Ali "paid back 20,000")
export function owedMoveWord(type: OwedType, move: OwedMoveType): string {
  if (move === "more") return type === "loan" ? "Lent more" : "Gave more to keep";
  if (move === "forgave") return "Let the rest go";
  return type === "loan" ? "Paid back" : "Took some back";
}

export interface OwedSummary {
  given: number; // what they got from you, first and later
  back: number; // what you took back, or what they paid back
  forgiven: number; // a loan's rest let go (your spending)
  left: number; // still with them
  part: number; // 0..1 of it back (a loan's progress)
  overdue: boolean; // a loan past the day they said they'd pay
}

export function owedSummary(rec: { data: OwedData }, today = ""): OwedSummary {
  const moves = rec.data.moves || [];
  const sum = (t: OwedMoveType) => moves.filter((m) => m.type === t).reduce((n, m) => n + (Number(m.amount) || 0), 0);
  const given = round((Number(rec.data.amount) || 0) + sum("more"));
  const back = round(sum("back"));
  const forgiven = round(sum("forgave"));
  const left = round(Math.max(0, given - back - forgiven));
  return {
    given,
    back,
    forgiven,
    left,
    part: given > 0 ? Math.min(1, (back + forgiven) / given) : 0,
    overdue: rec.data.type === "loan" && left > 0 && !!rec.data.due && !!today && rec.data.due < today,
  };
}

// the most that can come back in one step: what's still with them
export const owedLeft = (rec: { data: OwedData }) => owedSummary(rec).left;

// its data with one more step; closed once nothing is left with them (giving more opens it again)
export function owedWithMove(rec: { data: OwedData }, move: OwedMove): OwedData {
  const amount = round(Math.max(0, Number(move.amount) || 0));
  const capped = move.type === "more" ? amount : Math.min(amount, owedSummary(rec).left);
  const data: OwedData = Object.assign({}, rec.data, { moves: (rec.data.moves || []).concat([Object.assign({}, move, { amount: capped })]) });
  const left = owedSummary({ data }).left;
  data.closed = left <= 0;
  data.closed_on = data.closed ? move.date : null;
  return data;
}

// its data without one step (taking a step back), open again if something is left
export function owedWithoutMove(rec: { data: OwedData }, index: number): OwedData {
  const moves = (rec.data.moves || []).filter((_, i) => i !== index);
  const data: OwedData = Object.assign({}, rec.data, { moves });
  const left = owedSummary({ data }).left;
  data.closed = left <= 0;
  data.closed_on = data.closed ? data.closed_on || null : null;
  return data;
}

// a loan's rest let go: the expense it becomes in Money (the money is really gone now)
export function forgivenExpense(rec: { id: string; data: OwedData }, amount: number, date: string, currency: string): MoneyData {
  return {
    type: "expense",
    amount: round(amount),
    currency: rec.data.currency || currency,
    category: "Gifts",
    note: `Let go of what ${rec.data.who} still owed`,
    date,
    account: rec.data.account || "cash",
    recurring: null,
  };
}

export interface OwedTotals<T extends R = R> {
  keeping: number; // kept with others for you
  lent: number; // lent and not yet paid back
  total: number;
  open: { rec: T; left: number; overdue: boolean }[]; // biggest first
}

// your money with others right now (in this currency): what Money shows beside what's left over
export function owedTotals<T extends R>(recs: T[], currency: string, today = ""): OwedTotals<T> {
  const open = recs
    .filter((r) => !r.deleted && !r.data.closed && (r.data.currency || currency) === currency)
    .map((rec) => {
      const s = owedSummary(rec, today);
      return { rec, left: s.left, overdue: s.overdue };
    })
    .filter((x) => x.left > 0)
    .sort((a, b) => b.left - a.left);
  const keeping = round(open.filter((x) => x.rec.data.type !== "loan").reduce((n, x) => n + x.left, 0));
  const lent = round(open.filter((x) => x.rec.data.type === "loan").reduce((n, x) => n + x.left, 0));
  return { keeping, lent, total: round(keeping + lent), open };
}

// What moved between you and others in a month, in your own money's currency: what left your hands
// (given to keep or lent, first and later), what came back (taken or paid back), and what you let go
// (that's already spending in Money, an expense, so it's added back to what's in your hands).
export interface OwedFlow {
  given: number;
  back: number;
  forgiven: number;
}
// period: a month ("2026-11") or a year ("2026")
export function owedFlow(recs: R[], period: string, currency: string): OwedFlow {
  const flow = { given: 0, back: 0, forgiven: 0 };
  const inPeriod = (d: unknown) => typeof d === "string" && d.slice(0, period.length) === period;
  for (const r of recs) {
    if (r.deleted || (r.data.currency || currency) !== currency) continue;
    if (inPeriod(r.data.date)) flow.given += Number(r.data.amount) || 0;
    for (const m of r.data.moves || []) {
      if (!inPeriod(m.date)) continue;
      const n = Number(m.amount) || 0;
      if (m.type === "more") flow.given += n;
      else if (m.type === "back") flow.back += n;
      else if (m.type === "forgave") flow.forgiven += n;
    }
  }
  return { given: round(flow.given), back: round(flow.back), forgiven: round(flow.forgiven) };
}
// what's in your hands from a month's money: what's left of it (earned less spent), less what went
// to others, plus what came back ("of this 199,050, Abu has 150,000: 49,050 is with you")
export const inHand = (net: number, flow: OwedFlow) => round(net - flow.given + flow.back + flow.forgiven);
// it's worth saying only when something moved that month
export const flowMoved = (flow: OwedFlow) => flow.given > 0 || flow.back > 0 || flow.forgiven > 0;

// one line about it: "Abu has Rs 150,000 of yours" / "Ali owes you Rs 30,000 of Rs 50,000 · due 5 Dec"
export function owedLine(rec: { data: OwedData }, currency: string, today = ""): string {
  const s = owedSummary(rec, today);
  const cur = rec.data.currency || currency;
  if (rec.data.closed || s.left <= 0) return rec.data.type === "loan" ? `${rec.data.who} paid it all back` : `All of it back from ${rec.data.who}`;
  if (rec.data.type === "loan") {
    const of = s.left < s.given ? ` of ${moneyWord(s.given, cur)}` : "";
    const due = rec.data.due ? ` · ${s.overdue ? "was due" : "due"} ${shortDate(rec.data.due)}` : "";
    return `${rec.data.who} owes you ${moneyWord(s.left, cur)}${of}${due}`;
  }
  return `${rec.data.who} has ${moneyWord(s.left, cur)} of yours`;
}

// the whole of it as a message, to send them: what was given, each step, what's left
export function owedText(rec: { data: OwedData }, currency: string, today = ""): string {
  const s = owedSummary(rec, today);
  const cur = rec.data.currency || currency;
  const d = rec.data;
  const lines = [d.type === "loan" ? `Udhaar · ${d.who}` : `Amanat · ${d.who}`, `${shortDate(d.date)}: ${d.type === "loan" ? "lent" : "given to keep"} ${moneyWord(Number(d.amount) || 0, cur)}`];
  for (const m of d.moves || []) lines.push(`${shortDate(m.date)}: ${owedMoveWord(d.type, m.type).toLowerCase()} ${moneyWord(m.amount, cur)}${m.note ? ` (${m.note})` : ""}`);
  lines.push(s.left > 0 ? `Left: ${moneyWord(s.left, cur)}` : "All settled");
  if (d.type === "loan" && d.due && s.left > 0) lines.push(`To pay back by ${shortDate(d.due)}`);
  return lines.join("\n");
}
