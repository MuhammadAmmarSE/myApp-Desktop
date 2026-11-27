// What Search looks through: every record, every page, and things you can do (add something,
// switch the theme, sync). Each entry says how it looks and what opening it does; the ranking is
// core's `search`, the same as on the phone.
import { THEMES, isoDate, minutesInWords, type Kind, type Rec, type SearchDoc } from "@myapp/core";
import { dayWord, money, monthDay, shortDate, time12 } from "./format";
import { logTitle } from "./car";
import type { EditKind } from "@/store/ui";

export type Group = "do" | Kind;
export type Entry = SearchDoc & { group: Group; detail?: string; open: Open; kbd?: string };
export type Open =
  | { to: string }
  | { edit: EditKind; rec?: Rec | null; preset?: Record<string, unknown> }
  | { copy: string; rec: Rec<"clip"> }
  | { set: Record<string, unknown>; say: string }
  | { run: "sync" | "quick" | "shortcuts" | "export" | "capture" | "talk" };

export const GROUP_WORD: Record<Group, string> = {
  do: "Go to and do",
  todo: "To-dos",
  item: "Lists",
  note: "Notes",
  clip: "Saved",
  event: "Events",
  reminder: "Reminders",
  date: "Dates",
  person: "People",
  money: "Money",
  thing: "My things",
  car: "Cars",
  car_log: "Car log",
  project: "Projects",
  client: "Clients",
  work_log: "Work log",
  server: "Servers",
  domain: "Domains",
  interest: "Interests",
  practice: "Practice",
  word: "Words",
  media: "Games, books & shows",
  wish: "Wishlist",
  fund: "Money given to you to spend",
  memory: "What the assistant remembers",
};
export const GROUP_ORDER: Group[] = [
  "do",
  "todo",
  "item",
  "note",
  "clip",
  "event",
  "reminder",
  "date",
  "person",
  "money",
  "thing",
  "car",
  "car_log",
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
  "fund",
  "memory",
];

// pages and actions, always there
export function commands(mod = "Ctrl"): Entry[] {
  const page = (id: string, title: string, to: string, keywords: string, kbd?: string): Entry => ({ id: `page:${id}`, kind: "page", group: "do", title, keywords: `open go ${keywords}`, detail: "Page", open: { to }, kbd });
  const act = (id: string, title: string, keywords: string, open: Open, detail = "Action", kbd?: string): Entry => ({ id: `act:${id}`, kind: "action", group: "do", title, keywords, detail, open, kbd });
  return [
    page("today", "Today", "/", "home dashboard start overview", `${mod} 1`),
    page("calendar", "Calendar", "/calendar", "month week agenda schedule events plan", `${mod} 2`),
    page("todos", "To-dos", "/todos", "tasks todo checklist reminders", `${mod} 3`),
    page("lists", "Lists", "/lists", "shopping grocery buy order online", `${mod} 4`),
    page("notes", "Notes", "/notes", "notebook write markdown", `${mod} 5`),
    page("saved", "Saved text", "/saved", "clips copy paste snippets"),
    page("money", "Money", "/money", "expenses spending income budget charts", `${mod} 6`),
    page("memory", "What the assistant remembers", "/settings?section=memory", "memory memories remember about me preferences ai knows"),
    page("people", "People and dates", "/people", "birthdays anniversaries family contacts", `${mod} 7`),
    page("car", "My car", "/car", "fuel petrol service insurance papers vehicle"),
    page("things", "My things", "/things", "warranty receipts gadgets appliances"),
    page("work", "Work", "/work", "projects clients hours time freelance invoices paid"),
    page("servers", "Servers", "/work?tab=servers", "vps hosting ssh bill"),
    page("domains", "Domains", "/work?tab=domains", "website renew expire registrar dns"),
    page("interests", "Interests", "/interests", "hobbies practice streak language music gym"),
    page("words", "Words", "/interests?tab=words", "flashcards vocabulary learn language review"),
    page("media", "Games, books and shows", "/interests?tab=media", "playing reading watching series movies"),
    page("wishlist", "Wishlist", "/interests?tab=wishlist", "want buy one day gift"),
    page("assistant", "Assistant", "/assistant", "ai server github help chats", `${mod} 8`),
    page("settings", "Settings", "/settings", "preferences account theme background shortcuts", `${mod} ,`),
    act("capture", "Capture with AI", "tell ai add write quick", { run: "capture" }, "Action", `${mod} Shift C`),
    act("quick", "Quick capture window", "floating spotlight anywhere global", { run: "quick" }),
    act("talk", "Talk to the assistant", "voice speak say microphone mic dictate", { run: "talk" }),
    act("todo", "New to-do", "add task create", { edit: "todo" }, "Action", `${mod} N`),
    act("item", "Add to a list", "buy shopping grocery create", { edit: "item" }),
    act("expense", "Add an expense", "spent money paid create", { edit: "money" }, "Action", `${mod} Shift E`),
    act("income", "Add income", "earned salary money received", { edit: "money", preset: { type: "income" } }),
    act("fund", "Someone gave me money to spend", "hisaab mother gave money groceries spend for them account owe", { to: "/money?add=fund" }),
    act("event", "Add an event", "calendar meeting appointment create", { edit: "event" }),
    act("reminder", "Set a reminder", "remind alert ring create", { edit: "reminder" }),
    act("note", "New note", "write create", { to: "/notes/new" }, "Action", `${mod} Shift N`),
    act("clip", "Save some text", "clip copy paste create", { edit: "clip" }),
    act("date", "Add a date", "birthday anniversary remember create", { edit: "date" }),
    act("person", "Add a person", "family friend contact create", { edit: "person" }),
    act("thing", "Add something you own", "warranty receipt create", { edit: "thing" }),
    act("time", "Log time", "work hours project timer", { edit: "work_log", preset: { type: "time" } }),
    act("paid", "Got paid", "work payment client income", { edit: "work_log", preset: { type: "payment" } }),
    act("project", "New project", "work client create", { edit: "project" }),
    act("domain", "Add a domain", "website renew create", { edit: "domain" }),
    act("server", "Add a server", "vps hosting create", { edit: "server" }),
    act("practice", "Log practice", "interest hobby minutes streak", { edit: "practice" }),
    act("word", "Add a word", "flashcard vocabulary learn create", { edit: "word" }),
    act("wish", "Add to the wishlist", "want buy gift create", { edit: "wish" }),
    act("sync", "Sync now", "refresh upload download server", { run: "sync" }, "Action", `${mod} R`),
    act("export", "Export my data", "backup download json csv", { run: "export" }),
    act("shortcuts", "Keyboard shortcuts", "keys help hotkeys", { run: "shortcuts" }, "Action", `${mod} /`),
    act("calm", "Calm motion", "reduce animation still accessibility", { set: { motion: "reduced" }, say: "Calm motion on" }, "Setting"),
    act("full", "Full motion", "animation move", { set: { motion: "full" }, say: "Full motion on" }, "Setting"),
    act("aurora", "Aurora background", "wallpaper live glow", { set: { background: "aurora" }, say: "Aurora background on" }, "Setting"),
    act("plain", "Plain background", "wallpaper none simple", { set: { background: "none" }, say: "Plain background on" }, "Setting"),
    act("compact", "Compact density", "dense small tight", { set: { density: "compact" }, say: "Compact layout on" }, "Setting"),
    act("comfortable", "Comfortable density", "roomy spacious", { set: { density: "comfortable" }, say: "Comfortable layout on" }, "Setting"),
    ...THEMES.map((t) => act(`theme-${t.id}`, `${t.name} theme`, `theme colour color ${t.mode} ${t.tagline}`, { set: { themeId: t.id }, say: `${t.name} theme on` }, "Theme")),
  ];
}

// every record, worded for a result row
export function recordEntries(lists: { [K in Kind]: Rec<K>[] }, ctx: { currency: string; people: Map<string, string>; cars: Map<string, string> }): Entry[] {
  const today = isoDate();
  const out: Entry[] = [];
  const named = (list: { id: string; data: { name?: string } }[]) => new Map(list.map((r) => [r.id, r.data.name || ""]));
  const projects = named(lists.project);
  const clients = named(lists.client);
  const interests = named(lists.interest);
  for (const t of lists.todo)
    out.push({
      id: t.id,
      kind: "todo",
      group: "todo",
      title: t.data.title,
      body: t.data.notes,
      keywords: (t.data.tags || []).join(" "),
      detail: [t.data.done ? "Done" : t.data.due ? dayWord(t.data.due, today) : "No date", t.data.time ? time12(t.data.time) : ""].filter(Boolean).join(" · "),
      open: { edit: "todo", rec: t },
    });
  for (const i of lists.item)
    out.push({
      id: i.id,
      kind: "item",
      group: "item",
      title: i.data.name,
      body: [i.data.note, i.data.qty].filter(Boolean).join(" "),
      keywords: i.data.list,
      detail: [i.data.list === "grocery" ? "Grocery" : "Shopping", i.data.done ? "bought" : i.data.today ? "buy today" : ""].filter(Boolean).join(" · "),
      open: { edit: "item", rec: i },
    });
  for (const n of lists.note)
    out.push({ id: n.id, kind: "note", group: "note", title: n.data.title || "Untitled", body: n.data.body, keywords: n.data.tags.join(" "), detail: (n.data.body || "").replace(/\s+/g, " ").slice(0, 70), open: { to: `/notes/${n.id}` } });
  for (const c of lists.clip)
    out.push({ id: c.id, kind: "clip", group: "clip", title: c.data.title || c.data.text, body: c.data.title ? c.data.text : "", keywords: c.data.tags.join(" "), detail: "Enter copies it · Shift+Enter edits", open: { copy: c.data.text, rec: c } });
  for (const e of lists.event)
    out.push({
      id: e.id,
      kind: "event",
      group: "event",
      title: e.data.title,
      body: [e.data.place, e.data.note].filter(Boolean).join(" "),
      detail: [dayWord(e.data.date, today), e.data.time ? time12(e.data.time) : "", e.data.place].filter(Boolean).join(" · "),
      open: { edit: "event", rec: e },
    });
  for (const r of lists.reminder) {
    const d = new Date(r.data.at);
    out.push({
      id: r.id,
      kind: "reminder",
      group: "reminder",
      title: r.data.text,
      detail: [r.data.done ? "Done" : dayWord(isoDate(d), today), time12(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)].join(" · "),
      open: { edit: "reminder", rec: r },
    });
  }
  for (const d of lists.date) {
    const who = d.data.person_id ? ctx.people.get(d.data.person_id) : "";
    out.push({ id: d.id, kind: "date", group: "date", title: d.data.title, keywords: [who, d.data.kind].filter(Boolean).join(" "), detail: [monthDay(d.data.month, d.data.day), who].filter(Boolean).join(" · "), open: { edit: "date", rec: d } });
  }
  for (const p of lists.person)
    out.push({
      id: p.id,
      kind: "person",
      group: "person",
      title: p.data.name,
      body: [p.data.notes, ...(p.data.details || []).map((x) => `${x.label} ${x.value}`)].filter(Boolean).join(" "),
      keywords: [p.data.relation, p.data.phone].filter(Boolean).join(" "),
      detail: [p.data.relation, p.data.phone].filter(Boolean).join(" · "),
      open: { to: `/people?person=${p.id}` },
    });
  for (const m of lists.money)
    out.push({
      id: m.id,
      kind: "money",
      group: "money",
      title: m.data.note || m.data.category,
      body: m.data.category,
      keywords: `${m.data.type} ${m.data.amount}`,
      detail: `${m.data.type === "income" ? "Earned" : "Spent"} ${money(m.data.amount, m.data.currency || ctx.currency)} · ${shortDate(m.data.date, today)}${m.data.paid_from ? " · on a hisaab" : ""}`,
      open: m.data.paid_from ? { to: `/funds/${m.data.paid_from}` } : { edit: "money", rec: m },
    });
  for (const f of lists.fund || [])
    out.push({
      id: f.id,
      kind: "fund",
      group: "fund",
      title: `${f.data.purpose || "Money"} · from ${f.data.from}`,
      body: f.data.notes,
      keywords: `hisaab ${f.data.from} ${f.data.amount}`,
      detail: `Gave you ${money(f.data.amount, f.data.currency || ctx.currency)} · ${shortDate(f.data.date, today)}${f.data.closed ? " · settled" : ""}`,
      open: { to: `/funds/${f.id}` },
    });
  for (const m of lists.memory || []) out.push({ id: m.id, kind: "memory", group: "memory", title: m.data.text, keywords: m.data.topic, detail: m.data.topic ? `Remembered · ${m.data.topic}` : "Remembered", open: { to: "/settings?section=memory" } });
  for (const t of lists.thing)
    out.push({
      id: t.id,
      kind: "thing",
      group: "thing",
      title: t.data.name,
      body: [t.data.brand, t.data.shop, t.data.notes].filter(Boolean).join(" "),
      keywords: [t.data.category, t.data.serial, t.data.receipt_no].filter(Boolean).join(" "),
      detail: [t.data.brand, t.data.gone ? "no longer have" : t.data.warranty_until ? `warranty to ${shortDate(t.data.warranty_until, today)}` : ""].filter(Boolean).join(" · "),
      open: { edit: "thing", rec: t },
    });
  for (const c of lists.car)
    out.push({ id: c.id, kind: "car", group: "car", title: c.data.name, keywords: [c.data.plate, c.data.model].filter(Boolean).join(" "), detail: [c.data.model, c.data.plate].filter(Boolean).join(" · "), open: { to: `/car?car=${c.id}` } });
  for (const l of lists.car_log)
    out.push({
      id: l.id,
      kind: "car_log",
      group: "car_log",
      title: logTitle(l.data),
      body: [l.data.number, l.data.notes].filter(Boolean).join(" "),
      keywords: `${l.data.type} ${l.data.car_id ? ctx.cars.get(l.data.car_id) || "" : ""}`,
      detail: [shortDate(l.data.date, today), l.data.amount ? money(l.data.amount, ctx.currency) : "", l.data.car_id ? ctx.cars.get(l.data.car_id) : ""].filter(Boolean).join(" · "),
      open: { edit: "car_log", rec: l },
    });
  for (const p of lists.project)
    out.push({
      id: p.id,
      kind: "project",
      group: "project",
      title: p.data.name,
      body: [p.data.notes, p.data.repo, p.data.url].filter(Boolean).join(" "),
      keywords: [p.data.status, p.data.client_id ? clients.get(p.data.client_id) : ""].filter(Boolean).join(" "),
      detail: [p.data.client_id ? `For ${clients.get(p.data.client_id) || "a client"}` : "Your own", p.data.status].join(" · "),
      open: { to: `/work/${p.id}` },
    });
  for (const c of lists.client)
    out.push({
      id: c.id,
      kind: "client",
      group: "client",
      title: c.data.name,
      body: c.data.notes,
      keywords: [c.data.company, c.data.email, c.data.phone].filter(Boolean).join(" "),
      detail: [c.data.company, c.data.past ? "past client" : ""].filter(Boolean).join(" · ") || "Client",
      open: { edit: "client", rec: c },
    });
  for (const l of lists.work_log)
    out.push({
      id: l.id,
      kind: "work_log",
      group: "work_log",
      title: l.data.note || (l.data.type === "payment" ? "Payment" : "Time"),
      keywords: `${l.data.type} ${l.data.project_id ? projects.get(l.data.project_id) || "" : ""}`,
      detail: [shortDate(l.data.date, today), l.data.type === "payment" ? money(l.data.amount || 0, ctx.currency) : minutesInWords(l.data.minutes || 0), l.data.project_id ? projects.get(l.data.project_id) : ""].filter(Boolean).join(" · "),
      open: { edit: "work_log", rec: l },
    });
  for (const s of lists.server)
    out.push({
      id: s.id,
      kind: "server",
      group: "server",
      title: s.data.name,
      body: s.data.notes,
      keywords: [s.data.provider, s.data.host, s.data.os].filter(Boolean).join(" "),
      detail: [s.data.provider, s.data.host].filter(Boolean).join(" · ") || "Server",
      open: { edit: "server", rec: s },
    });
  for (const d of lists.domain)
    out.push({
      id: d.id,
      kind: "domain",
      group: "domain",
      title: d.data.name,
      body: d.data.notes,
      keywords: d.data.registrar,
      detail: d.data.auto_renew ? "Renews itself" : d.data.expires_on ? `Expires ${shortDate(d.data.expires_on, today)}` : "Domain",
      open: { edit: "domain", rec: d },
    });
  for (const i of lists.interest)
    out.push({ id: i.id, kind: "interest", group: "interest", title: i.data.name, body: i.data.notes, detail: i.data.goal_min ? `${minutesInWords(i.data.goal_min)} a week` : "Interest", open: { edit: "interest", rec: i } });
  for (const p of lists.practice)
    out.push({
      id: p.id,
      kind: "practice",
      group: "practice",
      title: p.data.note || (p.data.interest_id ? interests.get(p.data.interest_id) || "Practice" : "Practice"),
      keywords: p.data.interest_id ? interests.get(p.data.interest_id) : "",
      detail: `${shortDate(p.data.date, today)} · ${minutesInWords(p.data.minutes)}`,
      open: { edit: "practice", rec: p },
    });
  for (const w of lists.word)
    out.push({
      id: w.id,
      kind: "word",
      group: "word",
      title: w.data.term,
      body: [w.data.meaning, w.data.example].filter(Boolean).join(" "),
      keywords: [w.data.say, w.data.interest_id ? interests.get(w.data.interest_id) : ""].filter(Boolean).join(" "),
      detail: w.data.meaning,
      open: { edit: "word", rec: w },
    });
  for (const m of lists.media)
    out.push({
      id: m.id,
      kind: "media",
      group: "media",
      title: m.data.name,
      body: [m.data.notes, m.data.progress].filter(Boolean).join(" "),
      keywords: [m.data.type, m.data.platform, m.data.status].filter(Boolean).join(" "),
      detail: [m.data.type, m.data.platform, m.data.progress].filter(Boolean).join(" · "),
      open: { edit: "media", rec: m },
    });
  for (const w of lists.wish)
    out.push({
      id: w.id,
      kind: "wish",
      group: "wish",
      title: w.data.name,
      body: w.data.notes,
      detail: [w.data.price ? money(w.data.price, ctx.currency) : "", w.data.got ? "got it" : ""].filter(Boolean).join(" · ") || "Wishlist",
      open: { edit: "wish", rec: w },
    });
  return out;
}
