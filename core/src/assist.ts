// The assistant and your records. It may read them (each kind's fields are listed here, and each
// record can be said in a line of words) and propose changes: add a record, change some fields of
// one, or delete one. A proposal is never saved by the server: the app shows it and saves what you
// keep. The server cleans every proposed change against what you have (cleanChange), and the apps
// clean it again before saving, so a bad answer can never write a bad record.
import { cleanRule, cleanTags } from "./actions";
import { isoDate, isoTime, isValidDate, isValidTime, toEpoch } from "./dates";
import { dayWord, money, monthDay, time12 } from "./format";
import { CAR_PAPERS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, isKind, Kind, MAX_RECORD_BYTES, MEDIA_STATUSES, MEDIA_TYPES, PROJECT_STATUSES, RELATIONS, THING_CATEGORIES, type ItemData, type MoneyData, type OwedData } from "./kinds";
import { owedSummary } from "./owed";
import { POT_TYPE_META, POT_TYPES, cleanSplit, potMoveFor, ruleWords, splitTotal } from "./pots";
import { itemsNote, sharedFund } from "./purchase";
import type { SearchDoc } from "./search";
import { minutesInWords } from "./work";

type FieldType =
  | "text" // one line
  | "long" // paragraphs
  | "date" // YYYY-MM-DD
  | "time" // HH:mm
  | "num" // 0 or more
  | "bool"
  | "tags"
  | "days" // reminder days before: [30, 7, 1]
  | "details" // [{ label, value }]
  | "currency" // PKR
  | "split" // an income's pots: [{ pot_id, amount }]
  | "rule" // a pot's share of each income: { kind: percent|fixed|fill, value }
  | { int: [number, number] }
  | { one: readonly string[] }
  | { ref: Kind };

export interface KindSpec {
  label: string; // what the screens call one
  fields: Record<string, FieldType>;
  required: string[]; // must be there when it's added
  anyOf?: string[]; // at least one of these when it's added
}

const one = (list: readonly string[]) => ({ one: list });
const int = (min: number, max: number) => ({ int: [min, max] as [number, number] });
const ref = (kind: Kind) => ({ ref: kind });

// What the assistant may write in each kind. Fields the apps keep for themselves (when something
// was done, links to the expense it made, a running timer, a word's review boxes) aren't here.
export const KIND_SPECS: Record<Kind, KindSpec> = {
  todo: {
    label: "To-do",
    fields: { title: "text", notes: "long", due: "date", time: "time", done: "bool", priority: one(["high", "normal"]), repeat: one(["daily", "weekly", "monthly"]), tags: "tags" },
    required: ["title"],
  },
  item: {
    label: "List item",
    fields: { name: "text", qty: "text", list: one(["grocery", "shopping"]), mode: one(["store", "online"]), today: "bool", done: "bool", link: "text", note: "text", price: "num", regular: "bool", fund_id: ref("fund") },
    required: ["name"],
  },
  note: { label: "Note", fields: { title: "text", body: "long", pinned: "bool", tags: "tags" }, required: [], anyOf: ["title", "body"] },
  clip: { label: "Saved text", fields: { text: "long", title: "text", tags: "tags", pinned: "bool" }, required: ["text"] },
  person: { label: "Person", fields: { name: "text", relation: one(RELATIONS), phone: "text", notes: "long", details: "details" }, required: ["name"] },
  date: {
    label: "Date",
    fields: { title: "text", kind: one(["birthday", "anniversary", "other"]), month: int(1, 12), day: int(1, 31), year: int(1900, 2200), person_id: ref("person"), remind: "days" },
    required: ["title", "month", "day"],
  },
  money: {
    label: "Money",
    fields: {
      type: one(["expense", "income"]),
      amount: "num",
      currency: "currency",
      category: "text",
      note: "text",
      date: "date",
      account: one(["cash", "bank", "card", "wallet"]),
      recurring: one(["monthly"]),
      paid_from: ref("fund"),
      settles: ref("fund"),
      pot_id: ref("pot"),
      split: "split",
    },
    required: ["amount"],
  },
  event: { label: "Event", fields: { title: "text", date: "date", time: "time", place: "text", note: "long", person_id: ref("person"), remind_min: int(0, 10080) }, required: ["title", "date"] },
  // a reminder is stored as a moment (at); the assistant gives its day and time
  reminder: { label: "Reminder", fields: { text: "text", date: "date", time: "time", done: "bool" }, required: ["text", "time"] },
  car: { label: "Car", fields: { name: "text", plate: "text", model: "text", fuel: one(["petrol", "diesel", "hybrid", "electric", "cng"]), odometer: "num" }, required: ["name"] },
  car_log: {
    label: "Car log",
    fields: {
      car_id: ref("car"),
      type: one(["fuel", "service", "paper"]),
      date: "date",
      amount: "num",
      odometer: "num",
      litres: "num",
      full: "bool",
      title: "text",
      number: "text",
      notes: "long",
      next_date: "date",
      next_km: "num",
      remind: "days",
    },
    required: ["type", "date"],
  },
  thing: {
    label: "Thing",
    fields: {
      name: "text",
      category: one(THING_CATEGORIES),
      brand: "text",
      serial: "text",
      bought_on: "date",
      price: "num",
      shop: "text",
      receipt_no: "text",
      warranty_until: "date",
      remind: "days",
      notes: "long",
      gone: "bool",
    },
    required: ["name"],
  },
  project: {
    label: "Project",
    fields: {
      name: "text",
      client_id: ref("client"),
      status: one(PROJECT_STATUSES),
      rate: "num",
      rate_unit: one(["hour", "fixed"]),
      currency: "currency",
      start: "date",
      due: "date",
      repo: "text",
      url: "text",
      notes: "long",
      pinned: "bool",
    },
    required: ["name"],
  },
  client: { label: "Client", fields: { name: "text", company: "text", phone: "text", email: "text", rate: "num", notes: "long", past: "bool" }, required: ["name"] },
  work_log: { label: "Work log", fields: { project_id: ref("project"), type: one(["time", "payment"]), date: "date", minutes: int(1, 1440), billable: "bool", amount: "num", note: "text" }, required: ["date"] },
  server: {
    label: "Server",
    fields: { name: "text", provider: "text", host: "text", user: "text", os: "text", cost: "num", renews_on: "date", remind: "days", notes: "long", gone: "bool" },
    required: ["name"],
  },
  domain: {
    label: "Domain",
    fields: {
      name: "text",
      registrar: "text",
      expires_on: "date",
      auto_renew: "bool",
      cost: "num",
      project_id: ref("project"),
      server_id: ref("server"),
      remind: "days",
      notes: "long",
      gone: "bool",
    },
    required: ["name"],
  },
  interest: { label: "Interest", fields: { name: "text", goal_min: int(0, 10080), notes: "long", archived: "bool" }, required: ["name"] },
  practice: { label: "Practice", fields: { interest_id: ref("interest"), date: "date", minutes: int(1, 1440), note: "text" }, required: ["date", "minutes"] },
  word: { label: "Word", fields: { interest_id: ref("interest"), term: "text", meaning: "text", say: "text", example: "text" }, required: ["term", "meaning"] },
  media: {
    label: "Game, book or show",
    fields: {
      name: "text",
      type: one(MEDIA_TYPES),
      status: one(MEDIA_STATUSES),
      platform: "text",
      progress: "text",
      rating: int(1, 5),
      started_on: "date",
      finished_on: "date",
      notes: "long",
    },
    required: ["name"],
  },
  wish: { label: "Wish", fields: { name: "text", price: "num", link: "text", priority: one(["high", "normal", "low"]), notes: "long", got: "bool", got_on: "date" }, required: ["name"] },
  memory: { label: "Memory", fields: { text: "long", topic: "text" }, required: ["text"] },
  // money someone gave you to spend for them; what you spend of it is money with paid_from, and
  // settling it (giving back, keeping, being paid back) is done on its hisaab page in the app
  fund: { label: "Money given to you to spend", fields: { from: "text", person_id: ref("person"), purpose: "text", amount: "num", currency: "currency", date: "date", notes: "long" }, required: ["from", "amount"] },
  // a pot for your own money; what's in it comes from incomes' splits (money split), spending out
  // of it is money with pot_id, and moving money between pots is the change op "move"
  pot: {
    label: "Pot",
    fields: { name: "text", type: one(POT_TYPES), target: "num", target_date: "date", rule: "rule", opening: "num", currency: "currency", archived: "bool", notes: "long", order: int(0, 999) },
    required: ["name"],
  },
  // their own money with someone: kept with them (keeping) or lent (loan). Taking some back, being
  // paid back, giving more or letting the rest go is the change op "owed"
  owed: {
    label: "Money with someone",
    fields: { type: one(["keeping", "loan"]), who: "text", person_id: ref("person"), amount: "num", currency: "currency", date: "date", account: one(["cash", "bank", "card", "wallet"]), due: "date", notes: "long" },
    required: ["who", "amount"],
  },
};

// the fields of every kind in words, for the AI's tool description
export function describeKinds(): string {
  const word = (t: FieldType): string => {
    if (typeof t === "string")
      return t === "days" ? "days-before list like [7,1]" : t === "details" ? "[{label,value}]" : t === "split" ? "[{pot_id,amount}]" : t === "rule" ? "{kind:percent|fixed|fill,value}" : t;
    if ("one" in t) return t.one.join("|");
    if ("int" in t) return `${t.int[0]}-${t.int[1]}`;
    return `id of a ${t.ref}`;
  };
  return (Object.keys(KIND_SPECS) as Kind[])
    .map((k) => {
      const s = KIND_SPECS[k];
      const fields = Object.entries(s.fields).map(([f, t]) => `${f}${s.required.includes(f) ? "*" : ""} (${word(t)})`);
      return `${k}: ${fields.join(", ")}`;
    })
    .join("\n");
}

const MAX_TEXT = 300;
const MAX_LONG = 20000;
const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v === "string" && v.trim()) return Number(v.replace(/[,\s]/g, "").replace(/^[^\d.-]+/, ""));
  return NaN;
};
const blank = (v: unknown) => v === undefined || v === "" || (Array.isArray(v) && !v.length);

type Cleaned = { value: unknown } | { error: string };
// one field's value -> its clean form; null clears it
function cleanField(name: string, type: FieldType, v: unknown, ctx: { get: (id: string) => Found | null }): Cleaned {
  if (v === null) return { value: null };
  if (typeof type === "object" && "ref" in type) {
    const id = typeof v === "string" ? v.trim() : "";
    const r = id ? ctx.get(id) : null;
    if (!r || r.kind !== type.ref) return { error: `${name}: there's no ${type.ref} with that id` };
    return { value: id };
  }
  if (typeof type === "object" && "one" in type) {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    const hit = type.one.find((x) => x.toLowerCase() === s);
    return hit ? { value: hit } : { error: `${name} is one of ${type.one.join(", ")}` };
  }
  if (typeof type === "object" && "int" in type) {
    const n = Math.round(num(v));
    return Number.isFinite(n) && n >= type.int[0] && n <= type.int[1] ? { value: n } : { error: `${name} is a whole number from ${type.int[0]} to ${type.int[1]}` };
  }
  switch (type) {
    case "text": {
      const s = oneLine(v, MAX_TEXT);
      return { value: s || null };
    }
    case "long": {
      const s = typeof v === "string" ? v.trim().slice(0, MAX_LONG) : oneLine(v, MAX_LONG);
      return { value: s || null };
    }
    case "date":
      return isValidDate(v) ? { value: v } : { error: `${name} is a date like 2026-12-31` };
    case "time":
      return isValidTime(v) ? { value: v } : { error: `${name} is a time like 14:30` };
    case "num": {
      const n = num(v);
      return Number.isFinite(n) && n >= 0 && n <= 1e12 ? { value: Math.round(n * 100) / 100 } : { error: `${name} is a number, 0 or more` };
    }
    case "bool":
      return v === true || v === "true" || v === 1 ? { value: true } : v === false || v === "false" || v === 0 ? { value: false } : { error: `${name} is true or false` };
    case "tags":
      return { value: cleanTags(v) };
    case "days": {
      if (!Array.isArray(v)) return { error: `${name} is a list of days before, like [7, 1, 0]` };
      const days = v
        .map((x) => Math.round(num(x)))
        .filter((n) => n >= 0 && n <= 365)
        .filter((n, i, a) => a.indexOf(n) === i)
        .sort((a, b) => b - a)
        .slice(0, 6);
      return { value: days };
    }
    case "details": {
      if (!Array.isArray(v)) return { error: `${name} is a list like [{"label":"Shoe size","value":"38"}]` };
      const list = v
        .map((d) => ({ label: oneLine(d && d.label, 60), value: oneLine(d && d.value, MAX_TEXT) }))
        .filter((d) => d.label && d.value)
        .slice(0, 40);
      return { value: list };
    }
    case "currency": {
      const s = typeof v === "string" ? v.trim().toUpperCase() : "";
      return /^[A-Z]{3}$/.test(s) ? { value: s } : { error: `${name} is a 3-letter currency code like PKR` };
    }
    case "split": {
      if (!Array.isArray(v)) return { error: `${name} is a list like [{"pot_id":"...","amount":100000}]` };
      for (const x of v) {
        const id = x && typeof x === "object" ? String(x.pot_id ?? x.pot ?? "").trim() : "";
        const r = id ? ctx.get(id) : null;
        if (!r || r.kind !== "pot") return { error: `${name}: there's no pot with the id ${id || "(none)"}` };
      }
      return { value: cleanSplit(v, 1e12, () => true) };
    }
    case "rule": {
      const r = cleanRule(v);
      return r ? { value: r } : { error: `${name} is {"kind":"percent","value":30}, {"kind":"fixed","value":25000} or {"kind":"fill"}` };
    }
  }
  return { error: `${name} can't be written` };
}

const category = (v: unknown, type: unknown) => {
  const list: readonly string[] = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const s = oneLine(v, 40).toLowerCase();
  return list.find((c) => c.toLowerCase() === s) || list.find((c) => s && c.toLowerCase().startsWith(s)) || "Other";
};

// a record found by id: what cleaning and the screens need of it
export interface Found {
  kind: Kind;
  data: any;
}

export type Change =
  | { op: "create"; kind: Kind; data: Record<string, unknown> }
  | { op: "update"; id: string; kind: Kind; set: Record<string, unknown>; title: string }
  | { op: "remove"; id: string; kind: Kind; title: string }
  // money moved between pots (from / to null = money not in a pot); kept on one pot record
  | { op: "move"; kind: "pot"; from: string | null; to: string | null; amount: number; date: string; note?: string; title: string }
  // several list items bought together for one price: one expense, every item pointing at it
  | { op: "buy"; kind: "item"; ids: string[]; amount: number; date: string; account: NonNullable<MoneyData["account"]>; fund: string | null; pot_id?: string | null; note?: string; title: string }
  // a step on your money with someone: took some back / they paid back (back), or gave / lent more
  | { op: "step"; kind: "owed"; id: string; step: "back" | "more"; amount: number; date: string; note?: string; title: string };

// a money record's pot fields made sense of: only your own money goes in pots, only spending comes
// out of one, only income is split, and a split is never more than the income
function potFields(out: Record<string, unknown>, data: any) {
  const type = out.type ?? data.type;
  const fund = out.paid_from ?? data.paid_from;
  const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v);
  if ((fund || type === "income") && (has(out.pot_id) || has(data.pot_id))) out.pot_id = null;
  if ((fund || type !== "income") && (has(out.split) || has(data.split))) out.split = null;
  if (Array.isArray(out.split)) {
    const amount = Number(out.amount ?? data.amount) || 0;
    out.split = cleanSplit(out.split, amount, () => true);
  }
}

// the fields of `raw` that `kind` has, cleaned; with what was wrong and what was left out
function cleanFields(kind: Kind, raw: unknown, ctx: { get: (id: string) => Found | null }) {
  const spec = KIND_SPECS[kind];
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  const ignored: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { out, errors: ["give the fields as an object"], ignored };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const type = spec.fields[k];
    if (!type) {
      ignored.push(k);
      continue;
    }
    if (v === undefined) continue;
    const c = cleanField(k, type, v, ctx);
    if ("error" in c) errors.push(c.error);
    else out[k] = c.value;
  }
  return { out, errors, ignored };
}

const byteSize = (v: unknown) => {
  const s = JSON.stringify(v);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? (i++, 4) : 3;
  }
  return n;
};

export type CleanResult = { change: Change; ignored: string[] } | { error: string };

// One proposed change from the AI -> a clean change, or why it can't be used. ctx.get finds one of
// your records (not deleted) by id.
export function cleanChange(raw: any, ctx: { today: string; get: (id: string) => Found | null }): CleanResult {
  if (!raw || typeof raw !== "object") return { error: "a change is an object" };
  const op = String(raw.op || raw.action || "").toLowerCase();
  if (op === "create" || op === "add") {
    const kind = raw.kind;
    if (!isKind(kind)) return { error: `there's no kind called ${String(kind)}` };
    const spec = KIND_SPECS[kind];
    const { out, errors, ignored } = cleanFields(kind, raw.data ?? raw.fields, ctx);
    if (errors.length) return { error: errors.join("; ") };
    for (const f of spec.required) if (blank(out[f]) || out[f] === null) return { error: `a new ${kind} needs ${f}` };
    if (spec.anyOf && !spec.anyOf.some((f) => !blank(out[f]) && out[f] !== null)) return { error: `a new ${kind} needs ${spec.anyOf.join(" or ")}` };
    for (const k of Object.keys(out)) if (out[k] === null) delete out[k];
    if (kind === "money") {
      if (!((out.amount as number) > 0)) return { error: "money needs an amount above 0" };
      out.category = category(out.category, out.type);
      potFields(out, {});
      for (const k of ["pot_id", "split"]) if (out[k] === null || (Array.isArray(out[k]) && !(out[k] as unknown[]).length)) delete out[k];
    }
    if (kind === "fund" && !((out.amount as number) > 0)) return { error: "money given to you needs an amount above 0" };
    if (kind === "work_log") {
      const type = out.type || (out.amount ? "payment" : "time");
      if (type === "time" && !out.minutes) return { error: "time on a project needs minutes" };
      if (type === "payment" && !((out.amount as number) > 0)) return { error: "a payment needs an amount above 0" };
      out.type = type;
    }
    if (kind === "car_log" && out.type === "paper" && out.title && !(CAR_PAPERS as readonly string[]).includes(out.title as string)) out.title = "Other";
    if (byteSize(out) > MAX_RECORD_BYTES) return { error: "that's too big for one record" };
    return { change: { op: "create", kind, data: out }, ignored };
  }
  if (op === "update" || op === "edit" || op === "change") {
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const found = id ? ctx.get(id) : null;
    if (!found) return { error: "there's no record with that id (find it first)" };
    const { out, errors, ignored } = cleanFields(found.kind, raw.set ?? raw.data ?? raw.fields, ctx);
    if (errors.length) return { error: errors.join("; ") };
    if (!Object.keys(out).length) return { error: "say which fields change" };
    const spec = KIND_SPECS[found.kind];
    for (const f of spec.required) if (f in out && (out[f] === null || blank(out[f]))) return { error: `${f} can't be emptied` };
    if (found.kind === "money") {
      if ("amount" in out && !((out.amount as number) > 0)) return { error: "money needs an amount above 0" };
      if ("category" in out || "type" in out) out.category = category(out.category ?? found.data.category, out.type ?? found.data.type);
      // a smaller amount trims the split it already had
      if ("amount" in out && !("split" in out) && Array.isArray(found.data.split) && found.data.split.length && splitTotal(found.data.split) > (out.amount as number)) out.split = found.data.split;
      potFields(out, found.data);
    }
    if (byteSize(Object.assign({}, found.data, out)) > MAX_RECORD_BYTES) return { error: "that's too big for one record" };
    return { change: { op: "update", id, kind: found.kind, set: out, title: describeRecord(found.kind, found.data).title }, ignored };
  }
  if (op === "move") {
    // money moved between pots: from / to a pot's id, or nothing for money not in a pot
    const end = (v: unknown): string | null | false => {
      const id = typeof v === "string" ? v.trim() : "";
      if (!id || id === "free" || id === "null") return null;
      const r = ctx.get(id);
      return r && r.kind === "pot" ? id : false;
    };
    const from = end(raw.from);
    const to = end(raw.to);
    if (from === false || to === false) return { error: "there's no pot with that id (find it first)" };
    if (from === to) return { error: "say a pot to move from and a different one to move to" };
    const amount = Math.round(num(raw.amount) * 100) / 100;
    if (!(amount > 0 && amount <= 1e12)) return { error: "a move needs an amount above 0" };
    const date = isValidDate(raw.date) ? (raw.date as string) : ctx.today;
    const note = oneLine(raw.note, 200) || undefined;
    if (!potMoveFor(from, to, amount, date)) return { error: "nothing to move" };
    const name = (id: string | null) => (id ? describeRecord("pot", (ctx.get(id) as Found).data).title : "money not in a pot");
    return { change: Object.assign({ op: "move" as const, kind: "pot" as const, from, to, amount, date, title: `${name(from)} → ${name(to)}` }, note ? { note } : {}), ignored: [] };
  }
  if (op === "buy") {
    // things on the list bought together for one price: ids are the items, amount what it all cost
    const ids: string[] = Array.from(new Set<string>((Array.isArray(raw.ids) ? raw.ids : Array.isArray(raw.items) ? raw.items : []).filter((x: unknown): x is string => typeof x === "string" && !!x.trim()).map((x: string) => x.trim())));
    if (!ids.length) return { error: "say which list items were bought (their ids)" };
    if (ids.length > 50) return { error: "at most 50 items in one purchase" };
    const items: { id: string; data: ItemData }[] = [];
    for (const id of ids) {
      const f = ctx.get(id);
      if (!f || f.kind !== "item") return { error: `there's no list item with the id ${id} (find it first)` };
      const d = f.data as ItemData;
      if (d.money_id && ctx.get(d.money_id)) return { error: `${d.name} already has its price in Money` };
      items.push({ id, data: d });
    }
    const amount = Math.round(num(raw.amount) * 100) / 100;
    if (!(amount > 0 && amount <= 1e12)) return { error: "a purchase needs what it all cost, above 0" };
    const date = isValidDate(raw.date) ? (raw.date as string) : ctx.today;
    const account = (["cash", "bank", "card", "wallet"] as const).find((a) => a === raw.account) || "cash";
    // whose money: a hisaab's id, or theirs ("mine"/null); left out, the one the items are marked for
    const given = raw.paid_from ?? raw.fund ?? raw.fund_id;
    let fund: string | null;
    if (given === undefined) fund = sharedFund(items);
    else if (typeof given === "string" && given.trim() && !/^(mine|me|own|null|none)$/i.test(given.trim())) {
      const f = ctx.get(given.trim());
      if (!f || f.kind !== "fund") return { error: "there's no hisaab with that id (find it first)" };
      fund = given.trim();
    } else fund = null;
    let pot: string | null = null;
    if (!fund && typeof raw.pot_id === "string" && raw.pot_id.trim()) {
      const p = ctx.get(raw.pot_id.trim());
      if (!p || p.kind !== "pot") return { error: "there's no pot with that id (find it first)" };
      pot = raw.pot_id.trim();
    }
    const note = oneLine(raw.note, 200) || undefined;
    const change: Change = { op: "buy", kind: "item", ids, amount, date, account, fund, title: itemsNote(items) };
    if (pot) change.pot_id = pot;
    if (note) change.note = note;
    return { change, ignored: [] };
  }
  if (op === "step") {
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const found = id ? ctx.get(id) : null;
    if (!found || found.kind !== "owed") return { error: "there's no money with someone with that id (find it first)" };
    const d = found.data as OwedData;
    const step: "back" | "more" = raw.step === "more" || raw.move === "more" ? "more" : "back";
    const amount = Math.round(num(raw.amount) * 100) / 100;
    if (!(amount > 0 && amount <= 1e12)) return { error: "a step needs an amount above 0" };
    const left = owedSummary({ data: d }).left;
    if (step === "back" && !(left > 0)) return { error: `nothing of theirs is left with ${d.who}` };
    if (step === "back" && amount > left) return { error: `${d.who} has only ${left} left; ask whether they meant that` };
    const date = isValidDate(raw.date) ? (raw.date as string) : ctx.today;
    const note = oneLine(raw.note, 200) || undefined;
    return { change: Object.assign({ op: "step" as const, kind: "owed" as const, id, step, amount, date, title: describeRecord("owed", d).title }, note ? { note } : {}), ignored: [] };
  }
  if (op === "remove" || op === "delete") {
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const found = id ? ctx.get(id) : null;
    if (!found) return { error: "there's no record with that id (find it first)" };
    return { change: { op: "remove", id, kind: found.kind, title: describeRecord(found.kind, found.data).title }, ignored: [] };
  }
  return { error: "op is create, update, remove, move, buy or step" };
}

// A new record's data from a clean create: what the app's own forms would fill in. ctx.potColor:
// the colour a new pot gets (the first one no pot has)
export function newRecordData(change: Extract<Change, { op: "create" }>, ctx: { currency: string; today: string; potColor?: number }): any {
  const d: any = Object.assign({}, change.data);
  switch (change.kind) {
    case "todo":
      return Object.assign({ done: false, priority: "normal", repeat: null, tags: [], due: null, time: null }, d);
    case "item": {
      const mode = d.mode || "store";
      return Object.assign({ list: "grocery", done: false }, d, { mode, today: mode === "store" ? d.today !== false : false });
    }
    case "note":
      return Object.assign({ body: "", tags: [], pinned: false }, d, {
        title:
          d.title ||
          String(d.body || "")
            .split("\n")[0]
            .slice(0, 60),
      });
    case "clip":
      return Object.assign({ tags: [], pinned: false, uses: 0 }, d);
    case "person":
      return Object.assign({ relation: "other" }, d);
    case "date":
      return Object.assign({ kind: "other", year: null, person_id: null, remind: [7, 1, 0] }, d);
    case "money":
      return Object.assign({ type: "expense", currency: ctx.currency, date: ctx.today, account: "cash" }, d, { category: category(d.category, d.type || "expense") });
    case "event":
      return Object.assign({ time: null }, d, { remind_min: d.remind_min ?? (d.time ? 60 : null) });
    case "reminder": {
      const { date, time, ...rest } = d;
      return Object.assign({ done: false }, rest, { at: toEpoch(date || ctx.today, time) });
    }
    case "project":
      return Object.assign({ status: "active", rate_unit: "hour" }, d);
    case "work_log":
      return d.type === "time" ? Object.assign({ billable: true }, d) : d;
    case "media":
      return Object.assign({ type: "other", status: "want" }, d);
    case "word":
      return Object.assign({ box: 0, due: ctx.today, right: 0, wrong: 0 }, d);
    case "wish":
      return Object.assign({ priority: "normal", got: false }, d);
    case "fund":
      return Object.assign({ purpose: "Shopping", currency: ctx.currency, date: ctx.today, moves: [], closed: false }, d);
    case "pot":
      return Object.assign({ type: "spend", currency: ctx.currency, moves: [], archived: false }, typeof ctx.potColor === "number" ? { color: ctx.potColor } : {}, d);
    case "owed":
      return Object.assign({ type: "keeping", currency: ctx.currency, date: ctx.today, account: "cash", moves: [], closed: false }, d);
    default:
      return d;
  }
}

// A record's data after a clean update (null clears a field)
export function updatedRecordData(kind: Kind, prev: any, set: Record<string, unknown>): any {
  const next: any = Object.assign({}, prev);
  for (const [k, v] of Object.entries(set)) {
    if (kind === "reminder" && (k === "date" || k === "time")) continue;
    if (v === null) delete next[k];
    else next[k] = v;
  }
  if (kind === "reminder" && ("date" in set || "time" in set)) {
    const was = new Date(prev.at || Date.now());
    next.at = toEpoch((set.date as string) || isoDate(was), (set.time as string) || isoTime(was));
  }
  if (kind === "money" && ("type" in set || "category" in set)) next.category = category(next.category, next.type);
  return next;
}

// ---------- in words ----------

const RELATION_WORD: Record<string, string> = { me: "Me", wife: "Wife", husband: "Husband", son: "Son", daughter: "Daughter", parent: "Parent", sibling: "Brother or sister", family: "Family", friend: "Friend", work: "Work", other: "" };
const join = (parts: unknown[]) => parts.filter((p) => p !== undefined && p !== null && p !== "" && p !== false).join(" · ");

// A record as a title and one line under it, the way the screens show it
export function describeRecord(kind: Kind, d: any, opts: { currency?: string; today?: string } = {}): { title: string; detail: string } {
  const today = opts.today || isoDate();
  const cur = d && d.currency ? d.currency : opts.currency || "PKR";
  const day = (s: unknown) => (isValidDate(s) ? dayWord(s, today) : "");
  const t = (s: unknown) => (isValidTime(s) ? time12(s) : "");
  if (!d) return { title: KIND_SPECS[kind]?.label || kind, detail: "" };
  switch (kind) {
    case "todo":
      return {
        title: d.title || "To-do",
        detail: join([d.done ? "Done" : d.due ? day(d.due) : "No date", t(d.time), d.priority === "high" ? "High priority" : "", d.repeat ? `Every ${d.repeat === "daily" ? "day" : d.repeat === "weekly" ? "week" : "month"}` : ""]),
      };
    case "item":
      return { title: d.qty ? `${d.name} (${d.qty})` : d.name || "Item", detail: join([d.list === "shopping" ? "Shopping" : "Grocery", d.done ? "Bought" : d.mode === "online" ? "Order online" : d.today ? "Buy today" : "Buy later"]) };
    case "note":
      return {
        title:
          d.title ||
          String(d.body || "")
            .split("\n")[0]
            .slice(0, 60) ||
          "Note",
        detail: String(d.body || "")
          .replace(/\s+/g, " ")
          .slice(0, 90),
      };
    case "clip":
      return { title: d.title || String(d.text || "").slice(0, 60), detail: (d.tags || []).length ? d.tags.map((x: string) => `#${x}`).join(" ") : "Saved text" };
    case "person":
      return { title: d.name || "Someone", detail: join([RELATION_WORD[d.relation] ?? d.relation, d.phone, (d.details || []).length ? `${d.details.length} details` : ""]) };
    case "date":
      return { title: d.title || "Date", detail: join([d.month && d.day ? monthDay(d.month, d.day) : "", d.year, d.kind === "birthday" ? "Birthday" : d.kind === "anniversary" ? "Anniversary" : "", "every year"]) };
    case "money":
      return {
        title: d.note || d.category || "Money",
        detail: join([
          `${d.type === "income" ? "Earned" : "Spent"} ${money(Number(d.amount) || 0, cur)}`,
          d.category,
          day(d.date),
          d.recurring ? "Every month" : "",
          d.paid_from ? "Out of money given to you" : "",
          !d.paid_from && d.type !== "income" && d.pot_id ? "From a pot" : "",
          !d.paid_from && d.type === "income" && Array.isArray(d.split) && d.split.length ? `${d.split.length === 1 ? "1 pot" : `${d.split.length} pots`} got ${money(splitTotal(d.split), cur)}` : "",
        ]),
      };
    case "event":
      return { title: d.title || "Event", detail: join([day(d.date), t(d.time), d.place]) };
    case "reminder": {
      const at = typeof d.at === "number" ? new Date(d.at) : null;
      const when = at ? join([day(isoDate(at)), time12(isoTime(at))]) : join([day(d.date), t(d.time)]);
      return { title: d.text || "Reminder", detail: join([d.done ? "Done" : "", when]) };
    }
    case "car":
      return { title: d.name || "Car", detail: join([d.model, d.plate]) };
    case "car_log":
      return {
        title: d.title || (d.type === "fuel" ? "Fuel" : d.type === "paper" ? "Paper" : "Service"),
        detail: join([day(d.date), d.amount ? money(d.amount, cur) : "", d.litres ? `${d.litres} L` : "", d.next_date ? `Next ${day(d.next_date)}` : ""]),
      };
    case "thing":
      return { title: d.name || "Thing", detail: join([d.brand, d.category, d.warranty_until ? `Warranty until ${d.warranty_until}` : "", d.gone ? "Gone" : ""]) };
    case "project":
      return { title: d.name || "Project", detail: join([d.status, d.due ? `Due ${day(d.due)}` : ""]) };
    case "client":
      return { title: d.name || "Client", detail: join([d.company, d.phone, d.email]) };
    case "work_log":
      return d.type === "payment" ? { title: d.note || "Payment", detail: join([`Got ${money(Number(d.amount) || 0, cur)}`, day(d.date)]) } : { title: d.note || "Time", detail: join([d.minutes ? minutesInWords(d.minutes) : "", day(d.date)]) };
    case "server":
      return { title: d.name || "Server", detail: join([d.provider, d.host, d.renews_on ? `Renews ${day(d.renews_on)}` : ""]) };
    case "domain":
      return { title: d.name || "Domain", detail: join([d.registrar, d.expires_on ? `Expires ${day(d.expires_on)}` : ""]) };
    case "interest":
      return { title: d.name || "Interest", detail: d.goal_min ? `${minutesInWords(d.goal_min)} a week` : "" };
    case "practice":
      return { title: d.note || "Practice", detail: join([d.minutes ? minutesInWords(d.minutes) : "", day(d.date)]) };
    case "word":
      return { title: d.term || "Word", detail: d.meaning || "" };
    case "media":
      return { title: d.name || "Media", detail: join([d.type, d.status, d.progress, d.rating ? `${d.rating}/5` : ""]) };
    case "wish":
      return { title: d.name || "Wish", detail: join([d.price ? money(d.price, cur) : "", d.got ? "Got it" : d.priority === "high" ? "High priority" : ""]) };
    case "memory":
      return { title: d.text || "Memory", detail: d.topic ? `About ${d.topic}` : "Remembered" };
    case "fund":
      return { title: `${d.purpose || "Money"} · from ${d.from || "someone"}`, detail: join([`Gave you ${money(Number(d.amount) || 0, cur)}`, day(d.date), d.closed ? "Settled" : ""]) };
    case "owed": {
      const loan = d.type === "loan";
      const s = owedSummary({ data: d });
      const left = d.closed || !(s.left > 0) ? "Settled" : s.left < s.given ? `${money(s.left, cur)} still with them` : "";
      return { title: loan ? `Lent to ${d.who || "someone"}` : `With ${d.who || "someone"}`, detail: join([`${loan ? "Lent" : "Kept for you"} ${money(Number(d.amount) || 0, cur)}`, day(d.date), loan && d.due && left !== "Settled" ? `back by ${day(d.due)}` : "", left]) };
    }
    case "pot": {
      const meta = POT_TYPE_META[d.type as keyof typeof POT_TYPE_META] || POT_TYPE_META.spend;
      return {
        title: d.name || "Pot",
        detail: join([`${meta.name} pot`, Number(d.target) > 0 ? `${meta.target} ${money(Number(d.target), cur)}` : "", d.target_date ? `by ${day(d.target_date)}` : "", ruleWords(d.rule, cur), d.archived ? "Put away" : ""]),
      };
    }
  }
  return { title: KIND_SPECS[kind as Kind]?.label || String(kind), detail: "" };
}

// every word in a record, for search: titles first, then everything else it holds
export function recordDoc(rec: { id: string; kind: Kind; data: any }): SearchDoc {
  const { title, detail } = describeRecord(rec.kind, rec.data);
  const words: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") words.push(v);
    else if (typeof v === "number") words.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(rec.data);
  const label = KIND_SPECS[rec.kind]?.label || rec.kind;
  return { id: rec.id, kind: rec.kind, title, body: [detail, words.join(" ")].join(" "), keywords: [rec.kind, label, rec.data?.relation, rec.data?.category, rec.data?.type].filter(Boolean).join(" ") };
}

// a change in words, for its card: what happens and to what
export function describeChange(change: Change, opts: { currency?: string; today?: string; current?: any; fundName?: string } = {}): { verb: string; title: string; detail: string } {
  const label = KIND_SPECS[change.kind]?.label || change.kind;
  if (change.op === "move") return { verb: "Move money", title: change.title, detail: join([money(change.amount, opts.currency || "PKR"), dayWord(change.date, opts.today || isoDate()), change.note]) };
  if (change.op === "step") {
    const cur = opts.currency || "PKR";
    const loan = opts.current && opts.current.type === "loan";
    const verb = change.step === "more" ? (loan ? "Lent more" : "Gave more to keep") : loan ? "Paid back" : "Took some back";
    const after = opts.current ? Math.max(0, owedSummary({ data: opts.current }).left + (change.step === "more" ? change.amount : -change.amount)) : null;
    return { verb, title: change.title, detail: join([money(change.amount, cur), dayWord(change.date, opts.today || isoDate()), after != null ? `${money(after, opts.current.currency || cur)} left with them` : "", change.note]) };
  }
  if (change.op === "buy") {
    const whose = change.fund ? (opts.fundName ? `from ${opts.fundName}` : "from money given to you") : change.account !== "cash" ? `paid by ${change.account}` : "";
    return { verb: "Bought together", title: change.title, detail: join([`${change.ids.length} items for ${money(change.amount, opts.currency || "PKR")}`, whose, dayWord(change.date, opts.today || isoDate()), change.note]) };
  }
  if (change.op === "create") {
    const d = newRecordData(change, { currency: opts.currency || "PKR", today: opts.today || isoDate() });
    const w = describeRecord(change.kind, d, opts);
    return { verb: `New ${label.toLowerCase()}`, title: w.title, detail: w.detail };
  }
  if (change.op === "remove") return { verb: `Delete ${label.toLowerCase()}`, title: opts.current ? describeRecord(change.kind, opts.current, opts).title : change.title, detail: "" };
  const title = opts.current ? describeRecord(change.kind, opts.current, opts).title : change.title;
  const cur = opts.currency || "PKR";
  const fields = Object.entries(change.set).map(([k, v]) => {
    if (k === "split" && Array.isArray(v)) return v.length ? `Split: ${v.length === 1 ? "1 pot" : `${v.length} pots`}, ${money(splitTotal(v as any), cur)}` : "Split: none";
    if (k === "rule") return v ? `Rule: ${ruleWords(v as any, cur)}` : "Rule: none";
    return `${fieldWord(k)}: ${valueWord(v)}`;
  });
  return { verb: `Change ${label.toLowerCase()}`, title, detail: fields.join(" · ") };
}

const FIELD_WORD: Record<string, string> = {
  due: "Due",
  qty: "How much",
  relation: "Relation",
  details: "Details",
  person_id: "Person",
  remind: "Remind",
  remind_min: "Remind before",
  bought_on: "Bought",
  warranty_until: "Warranty until",
  renews_on: "Renews",
  expires_on: "Expires",
  started_on: "Started",
  finished_on: "Finished",
  got_on: "Got it",
  next_date: "Next",
  next_km: "Next at km",
  goal_min: "Weekly goal",
  client_id: "Client",
  project_id: "Project",
  server_id: "Server",
  car_id: "Car",
  interest_id: "Interest",
  rate_unit: "Rate per",
  pot_id: "Pot",
  target_date: "By",
};
export const fieldWord = (k: string) => FIELD_WORD[k] || k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ");
export function valueWord(v: unknown): string {
  if (v === null || v === undefined) return "cleared";
  if (v === true) return "yes";
  if (v === false) return "no";
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === "object") return v.map((d: any) => `${d.label} ${d.value}`).join(", ");
    return v.join(", ") || "none";
  }
  const s = String(v);
  return s.length > 80 ? s.slice(0, 79) + "…" : s;
}
