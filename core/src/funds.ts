// Money someone gave you to spend for them (a fund), worked out the same way by the phone, the
// computer and the assistant: what they gave, what you've spent of it, what's left with you or
// what they owe you, and the hisaab to give them. Pure, so it's tested here once.
import { EXPENSE_CATEGORIES, type FundData, type FundMove, type FundMoveType, type ItemData, type MoneyData } from "./kinds";
import { shortDate, money as moneyWord } from "./format";
import { addDays } from "./dates";
import { inListOrder, itemLabel, itemsNote } from "./purchase";

type R<D> = { id: string; data: D; created_at?: number };

const round = (n: number) => Math.round(n * 100) / 100;

export const FUND_MOVE_WORD: Record<FundMoveType, string> = {
  more: "They gave more",
  returned: "You gave back what was left",
  kept: "You kept what was left (your income)",
  paid_back: "They paid you back",
  covered: "You covered it yourself (your spending)",
};

type Mo = R<MoneyData>;
type It = R<ItemData>;

// M and I are whatever record type was passed in, so the screens get their own records back
export interface FundSummary<M extends Mo = Mo, I extends It = It> {
  received: number; // what they gave, first and later
  spent: number; // what you spent of it
  returned: number;
  kept: number;
  paidBack: number;
  covered: number;
  // what's still with you (above 0) or what they owe you (below 0)
  left: number;
  state: "holding" | "over" | "even";
  spends: M[]; // what you bought with it, oldest first
  toBuy: I[]; // list items still to buy with it
  unpriced: I[]; // bought, but no price yet
}

export function fundSummary<M extends Mo, I extends It>(fund: R<FundData>, money: M[], items: I[] = []): FundSummary<M, I> {
  const moves = fund.data.moves || [];
  const sum = (t: FundMoveType) => moves.filter((m) => m.type === t).reduce((n, m) => n + (Number(m.amount) || 0), 0);
  const received = round((Number(fund.data.amount) || 0) + sum("more"));
  const spends = money.filter((m) => m.data.paid_from === fund.id).sort((a, b) => a.data.date.localeCompare(b.data.date) || (a.created_at || 0) - (b.created_at || 0));
  // a refund of something bought with it goes back onto it
  const spent = round(spends.reduce((n, m) => n + (m.data.type === "income" ? -1 : 1) * (Number(m.data.amount) || 0), 0));
  const returned = round(sum("returned"));
  const kept = round(sum("kept"));
  const paidBack = round(sum("paid_back"));
  const covered = round(sum("covered"));
  const left = round(received - spent - returned - kept + paidBack + covered);
  const mine = items.filter((i) => i.data.fund_id === fund.id);
  // an item whose purchase was deleted has no price again
  const live = new Set(money.filter((m) => !(m as { deleted?: unknown }).deleted).map((m) => m.id));
  return {
    received,
    spent,
    returned,
    kept,
    paidBack,
    covered,
    left,
    state: left > 0 ? "holding" : left < 0 ? "over" : "even",
    spends,
    toBuy: mine.filter((i) => !i.data.done),
    unpriced: mine.filter((i) => i.data.done && (!i.data.money_id || !live.has(i.data.money_id))),
  };
}

// a fund's data with one more move, closed when nothing is left with you and nothing is owed
export function withMove(fund: R<FundData>, move: FundMove, money: Mo[], items: It[] = []): FundData {
  const data: FundData = Object.assign({}, fund.data, { moves: (fund.data.moves || []).concat([move]) });
  const s = fundSummary({ id: fund.id, data }, money, items);
  const settling = move.type !== "more";
  data.closed = settling && s.left === 0 && !s.toBuy.length;
  data.closed_on = data.closed ? move.date : null;
  return data;
}

// the expense category for what you cover yourself, from what the money was for
export function fundCategory(fund: { data: FundData }): string {
  const p = String(fund.data.purpose || "").toLowerCase();
  return EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === p) || EXPENSE_CATEGORIES.find((c) => p && c.toLowerCase().startsWith(p.slice(0, 4))) || "Family";
}

// "Groceries · from Mother"
export const fundTitle = (fund: { data: FundData }) => `${fund.data.purpose || "Money"} · from ${fund.data.from || "someone"}`;

// where it stands, in words: "750 left with you", "300 over: Mother owes you", "Settled"
export function fundStanding(fund: { data: FundData }, s: FundSummary<Mo, It>, currency: string): string {
  const cur = fund.data.currency || currency;
  if (fund.data.closed) return "Settled";
  if (s.state === "holding") return `${moneyWord(s.left, cur)} left with you`;
  if (s.state === "over") return `${moneyWord(-s.left, cur)} over: ${fund.data.from || "they"} owe${fund.data.from ? "s" : ""} you`;
  return s.toBuy.length ? "All spent so far" : "All spent";
}

// The hisaab to give them: what they gave, every purchase with its day, what's left or owed, and
// how it was settled. Plain text, to share in a message.
export function hisaabText(fund: R<FundData>, s: FundSummary<Mo, It>, opts: { currency: string; today?: string; items?: It[] }): string {
  const cur = fund.data.currency || opts.currency;
  const m = (n: number) => moneyWord(n, cur);
  const day = (d: string) => shortDate(d, opts.today);
  // what each purchase was: its item, or every item bought together in it
  const byMoney = new Map<string, It[]>();
  for (const i of opts.items || []) if (i.data.money_id) byMoney.set(i.data.money_id, (byMoney.get(i.data.money_id) || []).concat([i]));
  const nameOf = new Map(Array.from(byMoney.entries()).map(([id, list]) => [id, list.length > 1 ? itemsNote(inListOrder(list), 12) : itemLabel(list[0])]));
  const lines: string[] = [];
  lines.push(`Hisaab: ${fund.data.purpose || "money"}, from ${fund.data.from || "you"}`);
  lines.push(`Received ${day(fund.data.date)}: ${m(fund.data.amount)}`);
  for (const mv of (fund.data.moves || []).filter((x) => x.type === "more")) lines.push(`Received ${day(mv.date)}: ${m(mv.amount)}${mv.note ? ` (${mv.note})` : ""}`);
  if (s.received !== fund.data.amount) lines.push(`Received in all: ${m(s.received)}`);
  lines.push("");
  if (s.spends.length) {
    lines.push("Spent:");
    for (const sp of s.spends) {
      const what = nameOf.get(sp.id) || sp.data.note || sp.data.category;
      lines.push(`- ${what}, ${day(sp.data.date)}: ${sp.data.type === "income" ? "-" : ""}${m(sp.data.amount)}`);
    }
    lines.push(`Total spent: ${m(s.spent)}`);
  } else lines.push("Nothing spent yet.");
  if (s.unpriced.length) lines.push(`Bought, price not noted yet: ${s.unpriced.map((i) => i.data.name).join(", ")}`);
  if (s.toBuy.length) lines.push(`Still to buy: ${s.toBuy.map((i) => i.data.name).join(", ")}`);
  lines.push("");
  const settled = (fund.data.moves || []).filter((x) => x.type !== "more");
  const before = round(s.left + s.returned + s.kept - s.paidBack - s.covered);
  if (before > 0) lines.push(`Left: ${m(before)}`);
  else if (before < 0) lines.push(`Spent over: ${m(-before)}`);
  for (const mv of settled) {
    const word = mv.type === "returned" ? "Given back" : mv.type === "kept" ? "Kept" : mv.type === "paid_back" ? "Paid back to me" : "Covered by me";
    lines.push(`${word} ${day(mv.date)}: ${m(mv.amount)}${mv.note ? ` (${mv.note})` : ""}`);
  }
  if (fund.data.closed) lines.push("Settled.");
  else if (s.left > 0 && settled.length) lines.push(`Still left: ${m(s.left)}`);
  else if (s.left < 0 && settled.length) lines.push(`Still owed to me: ${m(-s.left)}`);
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// the funds still open, newest first, each with where it stands
export function openFunds<F extends R<FundData>, M extends Mo, I extends It>(funds: F[], money: M[], items: I[] = []): { fund: F; summary: FundSummary<M, I> }[] {
  return funds
    .filter((f) => !f.data.closed)
    .map((fund) => ({ fund, summary: fundSummary(fund, money, items) }))
    .sort((a, b) => b.fund.data.date.localeCompare(a.fund.data.date));
}

// your own money: what you spent out of someone else's money left out
export const ownMoney = <M extends { data: MoneyData }>(money: M[]): M[] => money.filter((m) => !m.data.paid_from);

// What you may already have bought with their money, paid for as your own: your expenses from two
// weeks before they gave it until today, on no hisaab, newest first. likely: the same category as
// what the money is for (Groceries for groceries money), shown first. recent: likely, and from the
// day before they gave it on (yesterday's groceries for money given today): what "tick them all" ticks.
export function fundCandidates<M extends Mo>(fund: R<FundData>, money: M[], opts: { today: string; days?: number }): { rec: M; likely: boolean; recent: boolean }[] {
  const given = fund.data.date || opts.today;
  const from = addDays(given, -(opts.days ?? 14));
  const near = addDays(given, -1);
  const cat = fundCategory(fund);
  return money
    .filter((m) => m.data.type === "expense" && !m.data.paid_from && m.data.date >= from && m.data.date <= opts.today)
    .map((rec) => {
      const likely = rec.data.category === cat;
      return { rec, likely, recent: likely && rec.data.date >= near };
    })
    .sort((a, b) => Number(b.likely) - Number(a.likely) || b.rec.data.date.localeCompare(a.rec.data.date) || (b.rec.created_at || 0) - (a.rec.created_at || 0));
}

// What an expense's data becomes on a hisaab (off your spending and out of any pot: their money
// is never in a pot, nor a monthly bill of yours), or back as your own (fundId null).
export function onFund(data: MoneyData, fundId: string | null): MoneyData {
  if (!fundId) return Object.assign({}, data, { paid_from: null });
  return Object.assign({}, data, { paid_from: fundId, pot_id: null, split: undefined, recurring: null });
}

// what's left (or owed) once those amounts are on it, in words for before you save
export function fundAfter(fund: { data: FundData }, s: FundSummary<Mo, It>, adding: number, currency: string): string {
  const cur = fund.data.currency || currency;
  const left = round(s.left - adding);
  if (left > 0) return `leaves ${moneyWord(left, cur)} with you`;
  if (left < 0) return `${fund.data.from || "they"} would owe you ${moneyWord(-left, cur)}`;
  return "uses all of it";
}
