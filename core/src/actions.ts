// Quick capture: the AI reads what you typed and proposes actions; you confirm each one; the app
// turns confirmed actions into records. The server cleans what the AI sent (cleanActions) and the
// apps clean it again before saving, so a bad answer can never write a bad record.

import { isValidDate, isValidTime, toEpoch } from "./dates";
import { EXPENSE_CATEGORIES, FundMove, INCOME_CATEGORIES, Kind, KindData, Relation, RELATIONS } from "./kinds";

// from_fund on an item or an expense: bought with money someone gave you; "new" = the money given
// in the same capture, otherwise the id of a hisaab still open
export type Action =
  | { type: "todo"; title: string; due?: string | null; time?: string | null; priority?: "high" | "normal"; notes?: string }
  | { type: "item"; name: string; qty?: string; list: "grocery" | "shopping"; mode: "store" | "online"; today: boolean; from_fund?: string }
  | { type: "event"; title: string; date: string; time?: string | null; place?: string; note?: string; remind_min?: number | null }
  | { type: "reminder"; text: string; date: string; time: string }
  | { type: "money"; money_type: "expense" | "income"; amount: number; category: string; note?: string; date: string; from_fund?: string }
  | { type: "note"; title: string; body: string; tags: string[] }
  | { type: "clip"; text: string; title?: string; tags: string[] }
  | { type: "date"; title: string; date_kind: "birthday" | "anniversary" | "other"; month: number; day: number; year?: number | null; person?: string | null }
  // money someone gave you to spend for them; adds_to = more money on a hisaab you already have
  | { type: "fund"; from: string; amount: number; purpose: string; date: string; note?: string; adds_to?: string };

export type ActionType = Action["type"];
export const ACTION_TYPES: ActionType[] = ["todo", "item", "event", "reminder", "money", "note", "clip", "date", "fund"];

// Where each action lands, in words the screens use.
export const ACTION_AREA: Record<ActionType, string> = {
  todo: "To-do",
  item: "List",
  event: "Calendar",
  reminder: "Reminder",
  money: "Money",
  note: "Note",
  clip: "Saved",
  date: "Dates",
  fund: "Hisaab",
};

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const longStr = (v: unknown, max = 20000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (list.find((x) => x.toLowerCase() === s) as T) || fallback;
};
const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v === "string") return Number(v.replace(/[,\s]/g, "").replace(/^[^\d.-]+/, ""));
  return NaN;
};
export const cleanTags = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s]+/) : [])
    .map((t) => str(t, 32).toLowerCase().replace(/^#/, "").replace(/[^a-z0-9\-_ ]/g, "").trim())
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 8);
const category = (v: unknown, type: "expense" | "income") => {
  const list: readonly string[] = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const s = str(v, 40).toLowerCase();
  return list.find((c) => c.toLowerCase() === s) || list.find((c) => s && c.toLowerCase().startsWith(s)) || "Other";
};

// ctx.funds: the ids of the hisaabs still open, the only ones an action may point at
export interface CaptureCtx {
  today: string;
  funds?: string[];
}
const fundRef = (v: unknown, ctx: CaptureCtx) => {
  const s = str(v, 64);
  if (!s) return undefined;
  if (s.toLowerCase() === "new") return "new";
  return (ctx.funds || []).includes(s) ? s : undefined;
};

// One raw action from the AI -> a clean Action, or null when it can't be used.
export function cleanAction(raw: any, ctx: CaptureCtx): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const type = str(raw.type, 20).toLowerCase();
  const date = (v: unknown) => (isValidDate(v) ? (v as string) : null);
  const time = (v: unknown) => (isValidTime(v) ? (v as string) : null);
  switch (type) {
    case "todo": {
      const title = str(raw.title, 200);
      if (!title) return null;
      return { type, title, due: date(raw.due), time: time(raw.time), priority: raw.priority === "high" ? "high" : "normal", notes: str(raw.notes, 1000) || undefined };
    }
    case "item": {
      const name = str(raw.name, 120);
      if (!name) return null;
      const mode = oneOf(raw.mode, ["store", "online"] as const, "store");
      const item: Action = { type, name, qty: str(raw.qty, 40) || undefined, list: oneOf(raw.list, ["grocery", "shopping"] as const, "grocery"), mode, today: mode === "store" ? raw.today !== false : false };
      const from_fund = fundRef(raw.from_fund, ctx);
      return from_fund ? Object.assign(item, { from_fund }) : item;
    }
    case "event": {
      const title = str(raw.title, 200);
      const d = date(raw.date);
      if (!title || !d) return null;
      const rm = num(raw.remind_min);
      return { type, title, date: d, time: time(raw.time), place: str(raw.place, 200) || undefined, note: str(raw.note, 1000) || undefined, remind_min: Number.isFinite(rm) && rm >= 0 && rm <= 10080 ? Math.round(rm) : null };
    }
    case "reminder": {
      const text = str(raw.text, 300);
      const d = date(raw.date) || ctx.today;
      const t = time(raw.time);
      if (!text || !t) return null;
      return { type, text, date: d, time: t };
    }
    case "money": {
      const money_type = oneOf(raw.money_type ?? raw.kind, ["expense", "income"] as const, "expense");
      const amount = Math.round(num(raw.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return null;
      const m: Action = { type, money_type, amount, category: category(raw.category, money_type), note: str(raw.note, 300) || undefined, date: date(raw.date) || ctx.today };
      // only spending comes out of money someone gave you
      const from_fund = money_type === "expense" ? fundRef(raw.from_fund, ctx) : undefined;
      return from_fund ? Object.assign(m, { from_fund }) : m;
    }
    case "note": {
      const body = longStr(raw.body);
      const title = str(raw.title, 120) || body.split("\n")[0].slice(0, 60);
      if (!title && !body) return null;
      return { type, title, body, tags: cleanTags(raw.tags) };
    }
    case "clip": {
      const text = longStr(raw.text, 10000);
      if (!text) return null;
      return { type, text, title: str(raw.title, 120) || undefined, tags: cleanTags(raw.tags) };
    }
    case "date": {
      const month = Math.round(num(raw.month));
      const day = Math.round(num(raw.day));
      const title = str(raw.title, 120);
      if (!title || !(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
      const y = Math.round(num(raw.year));
      return { type, title, date_kind: oneOf(raw.date_kind, ["birthday", "anniversary", "other"] as const, "other"), month, day, year: y >= 1900 && y <= 2200 ? y : null, person: str(raw.person, 80) || null };
    }
    case "fund": {
      const amount = Math.round(num(raw.amount) * 100) / 100;
      const from = str(raw.from ?? raw.person, 80);
      if (!from || !Number.isFinite(amount) || amount <= 0 || amount > 1e12) return null;
      const f: Action = { type, from, amount, purpose: str(raw.purpose, 60) || "Shopping", date: date(raw.date) || ctx.today, note: str(raw.note, 300) || undefined };
      const adds_to = fundRef(raw.adds_to, ctx);
      return adds_to && adds_to !== "new" ? Object.assign(f, { adds_to }) : f;
    }
    default:
      return null;
  }
}

export function cleanActions(raw: unknown, ctx: CaptureCtx, max = 20): Action[] {
  const list = (Array.isArray(raw) ? raw : [])
    .map((a) => cleanAction(a, ctx))
    .filter((a): a is Action => !!a)
    .slice(0, max);
  // "new" points at money given in this same capture; with none, or more than one, there's
  // nothing to point at
  const fresh = list.filter((a) => a.type === "fund" && !a.adds_to).length;
  if (fresh !== 1) for (const a of list) if ((a.type === "item" || a.type === "money") && a.from_fund === "new") delete a.from_fund;
  return list;
}

// the move a "they gave more" action adds to the hisaab it names
export const fundMoveOf = (a: Extract<Action, { type: "fund" }>): FundMove => ({ type: "more", amount: a.amount, date: a.date, note: a.note });

export interface PersonRef {
  id: string;
  name: string;
  relation: Relation;
}

// "wife", "my wife", "Ali" -> the matching person, if there is one.
export const findPerson = (people: PersonRef[], ref?: string | null) => {
  const s = (ref || "").toLowerCase().replace(/^my\s+/, "").trim();
  if (!s) return null;
  const rel = (RELATIONS as readonly string[]).includes(s) ? s : s === "mother" || s === "father" || s === "mom" || s === "dad" ? "parent" : s === "brother" || s === "sister" ? "sibling" : "";
  return people.find((p) => p.name.toLowerCase() === s) || (rel ? people.find((p) => p.relation === rel) : undefined) || people.find((p) => p.name.toLowerCase().split(/\s+/)[0] === s.split(/\s+/)[0]) || null;
};

export type Draft = { [K in Kind]: { kind: K; data: KindData[K] } }[Kind];

// A confirmed action -> the records it creates. ctx.fundOf turns from_fund ("new" or an id) into
// the id of the hisaab it belongs to (the apps create the new one first). More money on a hisaab
// you have creates nothing: the apps add fundMoveOf(action) to it.
export function actionToRecords(a: Action, ctx: { currency: string; people: PersonRef[]; fundOf?: (ref: string) => string | null }): Draft[] {
  const fund = (ref?: string) => (ref && ctx.fundOf ? ctx.fundOf(ref) : null);
  switch (a.type) {
    case "todo":
      return [{ kind: "todo", data: { title: a.title, due: a.due ?? null, time: a.time ?? null, done: false, priority: a.priority || "normal", notes: a.notes, repeat: null, tags: [] } }];
    case "item":
      return [{ kind: "item", data: Object.assign({ name: a.name, qty: a.qty, list: a.list, mode: a.mode, today: a.today, done: false }, fund(a.from_fund) ? { fund_id: fund(a.from_fund) } : {}) }];
    case "event":
      return [{ kind: "event", data: { title: a.title, date: a.date, time: a.time ?? null, place: a.place, note: a.note, remind_min: a.remind_min ?? (a.time ? 60 : null) } }];
    case "reminder":
      return [{ kind: "reminder", data: { text: a.text, at: toEpoch(a.date, a.time), done: false } }];
    case "money":
      return [
        { kind: "money", data: Object.assign({ type: a.money_type, amount: a.amount, currency: ctx.currency, category: a.category, note: a.note, date: a.date, account: "cash" as const }, fund(a.from_fund) ? { paid_from: fund(a.from_fund) } : {}) },
      ];
    case "note":
      return [{ kind: "note", data: { title: a.title, body: a.body, tags: a.tags, pinned: false } }];
    case "clip":
      return [{ kind: "clip", data: { text: a.text, title: a.title, tags: a.tags, pinned: false, uses: 0 } }];
    case "date": {
      const person = findPerson(ctx.people, a.person);
      return [{ kind: "date", data: { title: a.title, kind: a.date_kind, month: a.month, day: a.day, year: a.year ?? null, person_id: person ? person.id : null, remind: [7, 1, 0] } }];
    }
    case "fund": {
      if (a.adds_to) return [];
      const person = findPerson(ctx.people, a.from);
      return [{ kind: "fund", data: { from: a.from, person_id: person ? person.id : null, purpose: a.purpose, amount: a.amount, currency: ctx.currency, date: a.date, notes: a.note, moves: [], closed: false } }];
    }
  }
}

// Save confirmed actions in the right order: new money given to spend first, then what was bought
// with it (pointing at it), then more money on hisaabs you have. create makes a record and gives its
// id; addMore adds a "they gave more" step to a hisaab. Returns the ids made, in order.
export function saveActions(actions: Action[], ctx: { currency: string; people: PersonRef[]; create: (kind: Kind, data: KindData[Kind]) => string; addMore: (fundId: string, move: FundMove) => void }): string[] {
  const made: string[] = [];
  let fresh: string | null = null;
  for (const a of actions) {
    if (a.type !== "fund" || a.adds_to) continue;
    for (const d of actionToRecords(a, ctx)) {
      const id = ctx.create(d.kind, d.data);
      made.push(id);
      fresh = fresh || id;
    }
  }
  const fundOf = (ref: string) => (ref === "new" ? fresh : ref);
  for (const a of actions) {
    if (a.type === "fund") {
      if (a.adds_to) ctx.addMore(a.adds_to, fundMoveOf(a));
      continue;
    }
    for (const d of actionToRecords(a, Object.assign({}, ctx, { fundOf }))) made.push(ctx.create(d.kind, d.data));
  }
  return made;
}
