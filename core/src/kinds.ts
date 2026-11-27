// Everything the app stores is a record: { id, kind, data, created_at, updated_at, deleted }.
// One shape for every kind keeps sync simple (the server stores and returns records without
// knowing their fields) and lets a new kind ship without a server migration. Each kind's data
// is typed here, once, for the Android app, the desktop app and the server.

export const KINDS = [
  "todo",
  "item",
  "note",
  "clip",
  "person",
  "date",
  "money",
  "event",
  "reminder",
  "car",
  "car_log",
  "thing",
  "project",
  "client",
  "work_log",
  "server",
  "domain",
  "interest",
  "practice",
  "word",
  "media",
  "wish",
] as const;
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

// Work: projects (for a client or your own), the time spent and payments on them, the clients,
// and the servers and domains they run on. A payment can also be income in Money (money_id).
// Passwords and keys never go here: a server keeps its address and who you log in as, not how.
export const PROJECT_STATUSES = ["idea", "active", "paused", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export interface ProjectData {
  name: string;
  client_id?: string | null;
  status: ProjectStatus | string;
  rate?: number | null; // what an hour is worth (rate_unit hour), or the whole job (fixed)
  rate_unit?: "hour" | "fixed";
  currency?: string;
  start?: string | null; // YYYY-MM-DD
  due?: string | null; // YYYY-MM-DD, when it should be finished
  repo?: string; // where the code lives
  url?: string; // where it's live
  notes?: string;
  pinned?: boolean;
  timer_from?: number | null; // a timer running since then (epoch ms); stopping it logs the time
  [k: string]: unknown;
}
export interface ClientData {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  rate?: number | null; // usual hourly rate, offered for new projects
  notes?: string;
  past?: boolean; // no longer working together: kept, out of the way
  [k: string]: unknown;
}
export interface WorkLogData {
  project_id?: string | null;
  type: "time" | "payment" | string;
  date: string; // YYYY-MM-DD
  minutes?: number | null; // time
  billable?: boolean; // time: counts towards what the client owes (default yes)
  amount?: number | null; // payment received
  note?: string;
  money_id?: string | null; // payment: the income saved in Money
  [k: string]: unknown;
}
export interface ServerData {
  name: string;
  provider?: string; // who hosts it: "Hetzner", "AWS"...
  host?: string; // address or IP
  user?: string; // who you log in as (never the password)
  os?: string;
  cost?: number | null; // a month
  renews_on?: string | null; // YYYY-MM-DD, next bill
  remind?: number[]; // days before it renews that a reminder rings
  notes?: string; // what runs on it
  gone?: boolean; // shut down: kept, out of the way
  [k: string]: unknown;
}
export interface DomainData {
  name: string; // example.com
  registrar?: string;
  expires_on?: string | null; // YYYY-MM-DD
  auto_renew?: boolean;
  cost?: number | null; // a year
  project_id?: string | null;
  server_id?: string | null;
  remind?: number[]; // days before it expires [30, 7, 1]
  notes?: string;
  gone?: boolean; // let it go: kept, out of the way
  [k: string]: unknown;
}

// Interests: what you practise (a language, an instrument, a sport) and how often, words to
// remember (flashcards), games, books and shows, and things you'd like one day.
export interface InterestData {
  name: string;
  goal_min?: number | null; // minutes a week you'd like to spend on it
  notes?: string;
  archived?: boolean;
  [k: string]: unknown;
}
export interface PracticeData {
  interest_id?: string | null;
  date: string; // YYYY-MM-DD
  minutes: number;
  note?: string;
  [k: string]: unknown;
}
export interface WordData {
  interest_id?: string | null; // which language (or subject) it belongs to
  term: string;
  meaning: string;
  say?: string; // how it sounds, in your letters
  example?: string;
  box?: number; // 0..5: how well you know it (each right answer moves it up, a wrong one back to 0)
  due?: string | null; // YYYY-MM-DD: when it comes up again
  right?: number;
  wrong?: number;
  [k: string]: unknown;
}
export const MEDIA_TYPES = ["game", "book", "show", "movie", "course", "other"] as const;
export const MEDIA_STATUSES = ["want", "doing", "done", "dropped"] as const;
export interface MediaData {
  name: string;
  type: (typeof MEDIA_TYPES)[number] | string;
  status: (typeof MEDIA_STATUSES)[number] | string;
  platform?: string; // where: PlayStation, Netflix, Kindle...
  progress?: string; // "Season 2, ep 4", "page 120", "chapter 6"
  rating?: number | null; // 1..5 stars
  started_on?: string | null;
  finished_on?: string | null;
  notes?: string;
  [k: string]: unknown;
}
export interface WishData {
  name: string;
  price?: number | null;
  link?: string;
  priority?: "high" | "normal" | "low";
  notes?: string;
  got?: boolean;
  got_on?: string | null;
  money_id?: string | null; // the expense saved when you got it
  thing_id?: string | null; // and the entry in My things
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
  project: ProjectData;
  client: ClientData;
  work_log: WorkLogData;
  server: ServerData;
  domain: DomainData;
  interest: InterestData;
  practice: PracticeData;
  word: WordData;
  media: MediaData;
  wish: WishData;
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
