// What Capture and Quick capture share: asking the server to sort out plain words, and how each
// proposed action is shown. The server cleans what the AI says; it is cleaned again here
// (core's cleanActions), shown, and only what you keep is saved.
import { ArrowRightLeft, BellRing, Bookmark, CalendarDays, Cake, CheckSquare, HandCoins, NotebookPen, PiggyBank, ShoppingCart, Wallet, type LucideIcon } from "lucide-react";
import { cleanActions, dayWord, isoDate, isoTime, money, monthDay, POT_TYPE_META, ruleWords, time12, WEEKDAYS_LONG, type Action, type ActionType, type PersonRef, type PotSplit, type PotType } from "@myapp/core";
import { api } from "./api";

export const ACTION_ICON: Record<ActionType, LucideIcon> = { todo: CheckSquare, item: ShoppingCart, event: CalendarDays, reminder: BellRing, money: Wallet, note: NotebookPen, clip: Bookmark, date: Cake, fund: HandCoins, pot: PiggyBank, pot_move: ArrowRightLeft };
export const ACTION_AREA: Record<ActionType, string> = { todo: "To-do", item: "List", event: "Calendar", reminder: "Reminder", money: "Money", note: "Note", clip: "Saved", date: "Date", fund: "Hisaab", pot: "New pot", pot_move: "Pots" };

// a hisaab still open, as Capture tells the server about it (left: what's with you, below 0 owed)
export type OpenFund = { id: string; from: string; purpose: string; left: number };
// one of your pots, as Capture tells the server about it (rule: it splits income by a rule)
export type OpenPot = { id: string; name: string; type: PotType; balance: number; rule?: boolean };

// a pot's name for a card: "new" = the pot made in the same capture, null = money not in a pot
export function potNameOf(actions: Action[], keep: boolean[], pots: OpenPot[]) {
  const fresh = actions.find((a, i) => a.type === "pot" && keep[i] !== false);
  return (ref: string | null) => {
    if (!ref) return "money not in a pot";
    if (ref === "new") return fresh && fresh.type === "pot" ? fresh.name : "the new pot";
    return pots.find((p) => p.id === ref)?.name || "a pot";
  };
}
export const EXAMPLES = [
  "Wife: milk, eggs and bread on the way home",
  "Ammi gave me 5000 for groceries: doodh, anday, atta",
  "Kal ammi ko doctor le jana hai 11 baje",
  "Pay electricity bill by Friday, paid 1,200 for fuel today",
  "Meeting with Bilal Monday 3pm at his office",
  "Save my car's chassis no: NZE161-0123456",
  "What can you do for me?",
];

// whose money an action's hisaab is: "new" (given in the same capture) or an open one's id
export function whoseOf(actions: Action[], keep: boolean[], funds: OpenFund[]) {
  const fresh = actions.find((a, i) => a.type === "fund" && !a.adds_to && keep[i] !== false);
  return (ref?: string) => {
    if (!ref) return "";
    if (ref === "new") return fresh && fresh.type === "fund" ? `${fresh.from}'s` : "";
    const f = funds.find((x) => x.id === ref);
    return f ? `${f.from}'s` : "";
  };
}

// the words a card shows, and which field the title edits. rules: how an income with no split of
// its own is split by your pots' rules ([] = not split); true = it is, but the split isn't known here
export function describe(
  a: Action,
  currency: string,
  whose: (ref?: string) => string = () => "",
  potName: (ref: string | null) => string = () => "a pot",
  rules: (amount: number) => PotSplit[] | true = () => [],
): { title: string; edit: string; detail: string } {
  const theirs = (ref?: string) => (whose(ref) ? ` · with ${whose(ref)} money` : "");
  const splitWords = (sp: { name: string; amount: number }[]) => sp.map((x) => `${x.name} ${money(x.amount, currency)}`).join(", ");
  switch (a.type) {
    case "todo":
      return { title: a.title, edit: "title", detail: [a.due ? dayWord(a.due) : "No date", a.time ? time12(a.time) : "", a.priority === "high" ? "High priority" : ""].filter(Boolean).join(" · ") };
    case "item":
      return { title: a.qty ? `${a.name} (${a.qty})` : a.name, edit: "name", detail: `${a.list === "grocery" ? "Grocery" : "Shopping"} · ${a.mode === "online" ? "order online" : a.today ? "buy today" : "buy later"}${theirs(a.from_fund)}` };
    case "event":
      return { title: a.title, edit: "title", detail: [dayWord(a.date), a.time ? time12(a.time) : "", a.place || ""].filter(Boolean).join(" · ") };
    case "reminder":
      return { title: a.text, edit: "text", detail: `${dayWord(a.date)} at ${time12(a.time)}` };
    case "money": {
      let pots = "";
      if (a.money_type === "expense" && a.pot) pots = ` · from ${potName(a.pot)}`;
      else if (a.money_type === "income" && a.split) pots = ` · into ${splitWords(a.split.map((x) => ({ name: potName(x.pot), amount: x.amount })))}`;
      else if (a.money_type === "income") {
        const auto = rules(a.amount);
        if (auto === true) pots = " · split by your pots' rules";
        else if (auto.length) pots = ` · by your rules: ${splitWords(auto.map((x) => ({ name: potName(x.pot_id), amount: x.amount })))}`;
      }
      return { title: a.note || a.category, edit: "note", detail: `${a.money_type === "income" ? "Earned" : "Spent"} ${money(a.amount, currency)} · ${a.category} · ${dayWord(a.date)}${theirs(a.from_fund)}${pots}` };
    }
    case "note":
      return { title: a.title, edit: "title", detail: a.body.slice(0, 120) };
    case "clip":
      return { title: a.title || a.text, edit: a.title ? "title" : "text", detail: a.tags.length ? a.tags.map((t) => `#${t}`).join(" ") : "Saved text" };
    case "date":
      return { title: a.title, edit: "title", detail: [monthDay(a.month, a.day), a.year ? String(a.year) : "", a.person ? `for ${a.person}` : "", "every year"].filter(Boolean).join(" · ") };
    case "fund":
      return a.adds_to
        ? { title: a.purpose, edit: "purpose", detail: `${a.from} gave ${money(a.amount, currency)} more, on ${whose(a.adds_to) || "their"} hisaab · ${dayWord(a.date)}` }
        : { title: a.purpose, edit: "purpose", detail: `${a.from} gave you ${money(a.amount, currency)} to spend · ${dayWord(a.date)} · not your own money` };
    case "pot": {
      const meta = POT_TYPE_META[a.pot_type];
      return {
        title: a.name,
        edit: "name",
        detail: [`${meta.name} pot`, a.target ? `${meta.target.toLowerCase()} ${money(a.target, currency)}` : "", a.target_date ? `by ${dayWord(a.target_date)}` : "", a.rule ? ruleWords(a.rule, currency).toLowerCase() : "", a.opening ? `${money(a.opening, currency)} already in it` : ""].filter(Boolean).join(" · "),
      };
    }
    case "pot_move":
      return { title: a.note || "Move money", edit: "note", detail: `${money(a.amount, currency)}: ${potName(a.from)} → ${potName(a.to)} · ${dayWord(a.date)}` };
  }
}

export type CaptureResult = { summary: string; reply: string; assistant: boolean; actions: Action[] };

export async function sortOut(text: string, ctx: { currency: string; people: PersonRef[]; funds?: OpenFund[]; pots?: OpenPot[] }): Promise<CaptureResult> {
  const funds = (ctx.funds || []).slice(0, 20);
  const pots = (ctx.pots || []).slice(0, 30);
  const now = new Date();
  const r = await api<{ summary?: string; reply?: string; assistant?: boolean; actions?: Action[] }>(
    "POST",
    "/ai/capture",
    {
      text,
      context: {
        today: isoDate(now),
        time: isoTime(now),
        weekday: WEEKDAYS_LONG[now.getDay()],
        currency: ctx.currency,
        people: ctx.people.map((p) => ({ name: p.name, relation: p.relation })),
        funds,
        pots: pots.map((p) => ({ id: p.id, name: p.name, type: p.type, balance: p.balance })),
      },
    },
    { timeoutMs: 60000 },
  );
  return {
    actions: cleanActions(r.actions, { today: isoDate(now), funds: funds.map((f) => f.id), pots: pots.map((p) => p.id) }),
    summary: typeof r.summary === "string" ? r.summary : "",
    reply: typeof r.reply === "string" ? r.reply.trim() : "",
    assistant: r.assistant === true,
  };
}

// what you typed, kept so it can be run again (newest first, no repeats)
export const remember = (list: string[], text: string, max = 8) => [text, ...list.filter((t) => t !== text)].slice(0, max);
