// Everything the app stores is a record: { id, kind, data, created_at, updated_at, deleted }.
// One shape for every kind keeps sync simple (the server stores and returns records without
// knowing their fields) and lets a new kind ship without a server migration. Each kind's data
// is typed here, once, for the Android app, the desktop app and the server.

export const KINDS = ["todo", "item", "note", "clip", "person", "date", "money", "event", "reminder", "car", "car_log", "thing"] as const;
export type Kind = (typeof KINDS)[number];
export const isKind = (k: unknown): k is Kind => typeof k === "string" && (KINDS as readonly string[]).includes(k);

export type Repeat = "daily" | "weekly" | "monthly" | null;

export interface TodoData {
  title: string;
  notes?: string;
  due?: string | null; // YYYY-MM-DD, local
  time?: string | null; // HH:mm, local
  done: boolean;
  done_at?: number | null;
  priority?: "high" | "normal";
  repeat?: Repeat;
  tags?: string[];
}

// A grocery or shopping list entry. "Buy today" = mode store + today; "Order online" = mode online.
export interface ItemData {
  name: string;
  qty?: string;
  list: "grocery" | "shopping";
  mode: "store" | "online";
  today: boolean;
  done: boolean;
  done_at?: number | null;
  link?: string;
  note?: string;
  price?: number | null;
  regular?: boolean; // shows in Regulars, to add again in one tap
  money_id?: string | null; // the expense saved when it was bought
}

export interface NoteData {
  title: string;
  body: string;
  pinned?: boolean;
  tags: string[];
}

// Text kept to use later: an address, an account number, a command, a reply.
export interface ClipData {
  title?: string;
  text: string;
  tags: string[];
  pinned?: boolean;
  uses?: number;
}

export const RELATIONS = ["me", "wife", "husband", "son", "daughter", "parent", "sibling", "family", "friend", "work", "other"] as const;
export type Relation = (typeof RELATIONS)[number];

export interface PersonData {
  name: string;
  relation: Relation;
  phone?: string;
  notes?: string;
  details?: { label: string; value: string }[]; // sizes, likes, gift ideas...
}

// A date that comes back every year (birthday, anniversary) -- month/day, optional year.
export interface DateData {
  title: string;
  kind: "birthday" | "anniversary" | "other";
  month: number; // 1-12
  day: number; // 1-31
  year?: number | null;
  person_id?: string | null;
  remind: number[]; // days before: [7, 1, 0]
}

export interface MoneyData {
  type: "expense" | "income";
  amount: number;
  currency: string;
  category: string;
  note?: string;
  date: string; // YYYY-MM-DD
  account?: "cash" | "bank" | "card" | "wallet";
  recurring?: "monthly" | null;
}

export interface EventData {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:mm
  place?: string;
  note?: string;
  person_id?: string | null;
  remind_min?: number | null; // minutes before
}

export interface ReminderData {
  text: string;
  at: number; // epoch ms
  done: boolean;
  done_at?: number | null;
}

// My car: the car itself, and its log (fuel fill-ups, services, papers). The log's costs are
// also saved in Money (money_id) so spending stays in one place.
export interface CarData {
  name: string; // what you call it: "Corolla"
  plate?: string;
  model?: string; // make, model and year, as you'd say it
  fuel?: "petrol" | "diesel" | "hybrid" | "electric" | "cng";
  odometer?: number; // km, the last reading you gave
  [k: string]: unknown;
}
export type CarLogType = "fuel" | "service" | "paper";
export const CAR_PAPERS = ["Insurance", "Registration", "Token tax", "Driving licence", "Fitness", "Other"] as const;
export const CAR_SERVICES = ["Oil change", "Tuning", "Tyres", "Battery", "Brakes", "AC", "Wash", "Other"] as const;
export interface CarLogData {
  car_id?: string;
  type: CarLogType | string;
  date: string; // YYYY-MM-DD: filled up, serviced, or (paper) renewed
  amount?: number | null; // what it cost
  odometer?: number | null; // km on the clock then
  litres?: number | null; // fuel
  full?: boolean; // fuel: filled to full (km per litre is worked out between full fills)
  title?: string; // service: "Oil change"; paper: "Insurance"
  number?: string; // paper: policy or document number
  notes?: string;
  next_date?: string | null; // service: next due; paper: expires
  next_km?: number | null; // service: next due at this reading
  remind?: number[]; // paper: days before it expires [30, 7, 1]
  money_id?: string | null; // the expense saved in Money for it
  [k: string]: unknown;
}
// My things: what you own, where and when you bought it, and its warranty. A price can also be
// saved in Money (money_id), when the purchase is recent enough to belong there.
export const THING_CATEGORIES = ["Phone", "Laptop", "Electronics", "Appliance", "Furniture", "Watch", "Tools", "Other"] as const;
export interface ThingData {
  name: string;
  category?: string;
  brand?: string; // brand and model, as you'd say it
  serial?: string;
  bought_on?: string | null; // YYYY-MM-DD
  price?: number | null;
  shop?: string;
  receipt_no?: string;
  warranty_until?: string | null; // YYYY-MM-DD, the last day it's covered
  remind?: number[]; // days before the warranty ends that a reminder rings [30, 7]
  notes?: string;
  gone?: boolean; // sold, given away or thrown out: kept for the record, out of the way
  money_id?: string | null; // the expense saved in Money for it
  [k: string]: unknown;
}

export interface KindData {
  todo: TodoData;
  item: ItemData;
  note: NoteData;
  clip: ClipData;
  person: PersonData;
  date: DateData;
  money: MoneyData;
  event: EventData;
  reminder: ReminderData;
  car: CarData;
  car_log: CarLogData;
  thing: ThingData;
}

export interface Rec<K extends Kind = Kind> {
  id: string;
  kind: K;
  data: KindData[K];
  created_at: number;
  updated_at: number;
  deleted: 0 | 1;
}

// The largest record the server accepts (a long note fits many times over).
export const MAX_RECORD_BYTES = 256 * 1024;

export const EXPENSE_CATEGORIES = [
  "Groceries",
  "Food & dining",
  "Fuel",
  "Car",
  "Bills & utilities",
  "Home",
  "Family",
  "Kids",
  "Health",
  "Shopping",
  "Gadgets",
  "Education",
  "Travel",
  "Gifts",
  "Charity",
  "Other",
] as const;
export const INCOME_CATEGORIES = ["Salary", "Freelance", "Business", "Gift", "Refund", "Other"] as const;
