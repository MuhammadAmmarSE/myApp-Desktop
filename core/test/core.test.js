// Plain node checks of the shared core (built to dist/ first: npm test).
const assert = require("assert");
const c = require("../dist");
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("  ok  " + name); };

ok("dates: valid and invalid", () => {
  assert.strictEqual(c.isValidDate("2026-02-29"), false);
  assert.strictEqual(c.isValidDate("2028-02-29"), true);
  assert.strictEqual(c.isValidTime("24:00"), false);
  assert.strictEqual(c.addDays("2026-12-31", 1), "2027-01-01");
});
ok("nextOccurrence: later this year, next year, 29 Feb", () => {
  assert.strictEqual(c.nextOccurrence(12, 21, "2026-11-26"), "2026-12-21");
  assert.strictEqual(c.nextOccurrence(3, 1, "2026-11-26"), "2027-03-01");
  assert.strictEqual(c.nextOccurrence(2, 29, "2026-11-26"), "2027-02-28");
  assert.strictEqual(c.nextOccurrence(11, 26, "2026-11-26"), "2026-11-26");
  assert.strictEqual(c.yearsAt(2025, "2026-12-21"), 1);
});
ok("cleanActions: keeps good ones, drops bad ones", () => {
  const out = c.cleanActions([
    { type: "item", name: " milk ", list: "grocery", mode: "store" },
    { type: "item", name: "phone case", list: "shopping", mode: "online", today: true },
    { type: "money", money_type: "expense", amount: "2,500", category: "home", note: "AC advance" },
    { type: "money", amount: -5 },
    { type: "reminder", text: "AC technician at 11", date: "2026-11-27", time: "10:30" },
    { type: "reminder", text: "no time" },
    { type: "event", title: "Dinner at her parents'", date: "2026-11-28", time: "20:00" },
    { type: "date", title: "Wife's birthday", date_kind: "birthday", month: 4, day: 12, person: "wife" },
    { type: "date", title: "bad", month: 13, day: 1 },
    { type: "clip", text: "IBAN PK00 0000", tags: ["#Bank", "bank", "ids!"] },
    { type: "launch_rocket" },
    null,
  ], { today: "2026-11-26" });
  assert.strictEqual(out.length, 7);
  assert.deepStrictEqual(out[0], { type: "item", name: "milk", qty: undefined, list: "grocery", mode: "store", today: true });
  assert.strictEqual(out[1].today, false, "online items are never 'buy today'");
  assert.strictEqual(out[2].amount, 2500);
  assert.strictEqual(out[2].category, "Home");
  assert.strictEqual(out[2].date, "2026-11-26");
  assert.deepStrictEqual(out[6].tags, ["bank", "ids"]);
});
ok("actionToRecords: reminder time, person match, currency", () => {
  const people = [{ id: "p1", name: "Sara", relation: "wife" }, { id: "p2", name: "Ali", relation: "son" }];
  const [r] = c.actionToRecords({ type: "reminder", text: "x", date: "2026-11-27", time: "10:30" }, { currency: "PKR", people });
  const d = new Date(r.data.at);
  assert.strictEqual(d.getHours(), 10); assert.strictEqual(d.getMinutes(), 30); assert.strictEqual(d.getDate(), 27);
  const [dt] = c.actionToRecords({ type: "date", title: "Birthday", date_kind: "birthday", month: 4, day: 12, person: "my wife" }, { currency: "PKR", people });
  assert.strictEqual(dt.data.person_id, "p1");
  const [dt2] = c.actionToRecords({ type: "date", title: "Birthday", date_kind: "birthday", month: 12, day: 21, person: "Ali" }, { currency: "PKR", people });
  assert.strictEqual(dt2.data.person_id, "p2");
  const [m] = c.actionToRecords({ type: "money", money_type: "expense", amount: 150, category: "Food & dining", date: "2026-11-26" }, { currency: "PKR", people });
  assert.strictEqual(m.data.currency, "PKR");
});
ok("themes: every theme has every colour", () => {
  const keys = Object.keys(c.THEMES[0].colors);
  for (const t of c.THEMES) for (const k of keys) assert.ok(t.colors[k], `${t.id}.${k}`);
  assert.strictEqual(c.themeById("nope").id, "redline");
});
ok("car: km per litre between full fills, partial fills counted, cost per km", () => {
  const L = (date, odometer, litres, amount, full) => ({ data: { type: "fuel", date, odometer, litres, amount, full } });
  const logs = [L("2026-11-01", 10000, 40, 10000, true), L("2026-11-08", 10200, 15, 3750, false), L("2026-11-15", 10500, 25, 6250, true), { data: { type: "service", date: "2026-11-10", odometer: 10300, amount: 5000 } }];
  const e = c.fuelEconomy(logs);
  assert.strictEqual(e.km, 500);
  assert.strictEqual(e.litres, 40, "15 + 25 litres after the first full fill");
  assert.strictEqual(e.kmPerLitre, 12.5);
  assert.strictEqual(e.costPerKm, 20, "10,000 spent over 500 km");
  assert.strictEqual(c.fuelEconomy([L("2026-11-01", 10000, 40, 10000, true)]).kmPerLitre, null, "one fill says nothing yet");
  assert.strictEqual(c.latestOdometer({ name: "Car", odometer: 9800 }, logs), 10500);
});
ok("car: papers expire, the newest of each kind counts", () => {
  const P = (title, date, next_date) => ({ data: { type: "paper", title, date, next_date } });
  assert.deepStrictEqual(c.paperStatus(P("Insurance", "2025-12-01", "2026-11-20").data, "2026-11-26"), { state: "expired", days: -6 });
  assert.strictEqual(c.paperStatus(P("Insurance", "2025-12-01", "2026-12-20").data, "2026-11-26").state, "soon");
  assert.strictEqual(c.paperStatus(P("Token tax", "2026-07-01", "2027-06-30").data, "2026-11-26").state, "ok");
  const papers = c.currentPapers([P("Insurance", "2025-12-01", "2026-11-20"), P("Insurance", "2026-11-21", "2027-11-20"), P("Token tax", "2026-07-01", "2027-06-30")]);
  assert.deepStrictEqual(papers.map((p) => p.data.next_date), ["2027-06-30", "2027-11-20"], "the renewed insurance replaces the old one");
  assert.deepStrictEqual(c.reminderDays("2027-06-30"), ["2027-05-31", "2027-06-23", "2027-06-29"]);
});
ok("car: the next service, by date or by km", () => {
  const S = (date, next_date, next_km) => ({ data: { type: "service", date, next_date, next_km } });
  const due = c.serviceDue([S("2026-06-01", "2026-12-01", 15000), S("2026-01-01", "2026-06-01", 10000)], 14700, "2026-11-26");
  assert.strictEqual(due.log.data.date, "2026-06-01", "the latest service sets what's next");
  assert.strictEqual(due.days, 5);
  assert.strictEqual(due.km, 300);
  assert.strictEqual(due.due, true);
  assert.strictEqual(c.serviceDue([S("2026-06-01", "2027-06-01", 20000)], 14700, "2026-11-26").due, false);
  assert.strictEqual(c.serviceDue([], 14700, "2026-11-26"), null);
  assert.deepStrictEqual(c.carSpend([{ data: { type: "fuel", date: "2026-11-02", amount: 9000 } }, { data: { type: "service", date: "2026-11-10", amount: 5000 } }, { data: { type: "fuel", date: "2026-10-30", amount: 8000 } }], "2026-11-01"), { total: 14000, fuel: 9000 });
});
ok("things: warranties from a purchase, ending and ended", () => {
  assert.strictEqual(c.addMonths("2026-01-31", 1), "2026-02-28", "the last day when the month is shorter");
  assert.strictEqual(c.addMonths("2026-11-26", 12), "2027-11-26");
  assert.strictEqual(c.addMonths("2024-02-29", 12), "2025-02-28");
  const T = (name, warranty_until, price, gone) => ({ data: { name, warranty_until, price, gone } });
  assert.deepStrictEqual(c.warrantyStatus(T("TV", "2026-12-10").data, "2026-11-26"), { state: "ending", days: 14 });
  assert.deepStrictEqual(c.warrantyStatus(T("TV", "2026-11-26").data, "2026-11-26"), { state: "ending", days: 0 }, "covered on its last day");
  assert.strictEqual(c.warrantyStatus(T("TV", "2026-11-25").data, "2026-11-26").state, "ended");
  assert.strictEqual(c.warrantyStatus(T("TV", "2028-01-01").data, "2026-11-26").state, "covered");
  assert.strictEqual(c.warrantyStatus(T("TV", null).data, "2026-11-26").state, "none");
  assert.strictEqual(c.warrantyLeft(400), "13 months");
  assert.strictEqual(c.warrantyLeft(800), "2 years");
  assert.strictEqual(c.warrantyLeft(12), "12 days");
  assert.strictEqual(c.warrantyLeft(0), "ends today");
  const s = c.thingsSummary([T("Phone", "2026-12-01", 90000), T("Fridge", "2028-05-01", 120000), T("Old TV", "2026-12-02", 40000, true), T("Chair", null, null)], "2026-11-26");
  assert.strictEqual(s.count, 3, "gone things don't count");
  assert.strictEqual(s.value, 210000);
  assert.strictEqual(s.covered, 2);
  assert.deepStrictEqual(s.ending.map((t) => t.data.name), ["Phone"]);
});
ok("today: the day's timed things in order, and what's next", () => {
  const day = "2026-11-26";
  const at = (t) => c.toEpoch(day, t);
  const items = c.dayTimeline(
    {
      event: [{ id: "e1", data: { title: "Dentist", date: day, time: "15:30", place: "Clinic" } }, { id: "e2", data: { title: "All-day", date: day } }, { id: "e3", data: { title: "Tomorrow", date: "2026-11-27", time: "09:00" } }],
      reminder: [{ id: "r1", data: { text: "Call home", at: at("09:00"), done: true } }, { id: "r2", data: { text: "Pay the bill", at: at("18:00") } }, { id: "r3", data: { text: "Yesterday", at: at("09:00") - 86400000 } }],
      todo: [{ id: "t1", data: { title: "Send report", due: day, time: "11:00" } }, { id: "t2", data: { title: "No time", due: day } }],
    },
    day,
  );
  assert.deepStrictEqual(items.map((i) => i.id), ["r1", "t1", "e1", "r2"], "only timed things today, earliest first");
  assert.strictEqual(items[2].detail, "Clinic");
  assert.strictEqual(items[0].done, true);
  const n = c.nextUp(items, at("12:00"));
  assert.strictEqual(n.item.id, "e1");
  assert.strictEqual(n.inMs, 3.5 * 3600000);
  assert.strictEqual(c.nextUp(items, at("15:35")).item.id, "e1", "still next for a few minutes after it starts");
  assert.strictEqual(c.nextUp(items, at("15:45")).item.id, "r2");
  assert.strictEqual(c.nextUp(items, at("19:00")), null);
  assert.strictEqual(c.countdown(30000), "now");
  assert.strictEqual(c.countdown(5 * 60000), "in 5 min");
  assert.strictEqual(c.countdown(80 * 60000), "in 1 h 20 min");
  assert.strictEqual(c.countdown(7 * 3600000 + 600000), "in 7 h");
  assert.strictEqual(c.dayProgress(day, at("12:00")), 0.5);
});
ok("search: ranks titles over bodies, every word must match", () => {
  const docs = [
    { id: "1", kind: "note", title: "Car insurance renewal", body: "policy number on the card" },
    { id: "2", kind: "todo", title: "Buy milk" },
    { id: "3", kind: "note", title: "Groceries", body: "milk, eggs, bread" },
    { id: "4", kind: "person", title: "Café owner", keywords: "coffee" },
    { id: "5", kind: "note", title: "Netflix password" },
  ];
  assert.deepStrictEqual(c.search(docs, "milk").map((h) => h.doc.id), ["2", "3"], "a title match beats a body match");
  assert.deepStrictEqual(c.search(docs, "car ins").map((h) => h.doc.id), ["1"], "word starts");
  assert.deepStrictEqual(c.search(docs, "insurance policy").map((h) => h.doc.id), ["1"], "words across title and body");
  assert.deepStrictEqual(c.search(docs, "milk policy"), [], "every word has to be found");
  assert.deepStrictEqual(c.search(docs, "cafe").map((h) => h.doc.id), ["4"], "accents don't matter");
  assert.deepStrictEqual(c.search(docs, "coffee").map((h) => h.doc.id), ["4"], "keywords count");
  assert.deepStrictEqual(c.search(docs, "ntflx").map((h) => h.doc.id), ["5"], "letters in order find it");
  assert.deepStrictEqual(c.search(docs, "  "), []);
  const pages = [
    { id: "a", kind: "action", title: "Carbon theme" },
    { id: "b", kind: "page", title: "My car" },
    { id: "c", kind: "action", title: "Capture something" },
    { id: "d", kind: "note", title: "Car service checklist" },
  ];
  assert.deepStrictEqual(c.search(pages, "car").map((h) => h.doc.id), ["d", "b", "a"], "the word itself beats the start of a longer word; no loose letter matches");
  assert.strictEqual(c.normalize("  Héllo   WORLD "), "hello world");
});
ok("format: dates, times and money as the screens show them", () => {
  assert.strictEqual(c.dayWord("2026-11-26", "2026-11-26"), "Today");
  assert.strictEqual(c.dayWord("2026-11-27", "2026-11-26"), "Tomorrow");
  assert.strictEqual(c.dayWord("2026-11-29", "2026-11-26"), "Sunday");
  assert.strictEqual(c.dayWord("2027-01-10", "2026-11-26"), "Sun 10 Jan 2027");
  assert.strictEqual(c.shortDate("2026-12-10", "2026-11-26"), "10 Dec");
  assert.strictEqual(c.time12("17:05"), "5:05pm");
  assert.strictEqual(c.time12("09:00"), "9am");
  assert.strictEqual(c.money(1234567.5, "PKR"), "Rs 1,234,567.50");
  assert.strictEqual(c.money(-20, "USD"), "−$20");
  assert.strictEqual(c.compact(48500), "48.5k");
  assert.strictEqual(c.compact(1240000), "1.24M");
  assert.strictEqual(c.plural(1, "item"), "1 item");
  assert.strictEqual(c.greeting(14), "Good afternoon");
});
ok("derive: what's coming up, month totals, to-do order", () => {
  const today = "2026-11-26";
  const up = c.upcoming(
    {
      date: [{ id: "d1", data: { title: "Sara's birthday", kind: "birthday", month: 11, day: 28, year: 1990, person_id: "p1", remind: [] } }, { id: "d2", data: { title: "Far", kind: "other", month: 6, day: 1, remind: [] } }],
      event: [{ id: "e1", data: { title: "Dentist", date: "2026-11-27", time: "15:30" } }],
      reminder: [],
      person: [{ id: "p1", data: { name: "Sara", relation: "wife" } }],
    },
    30,
    today,
  );
  assert.deepStrictEqual(up.map((u) => u.key), ["e1", "d1"], "soonest first, only within 30 days");
  assert.strictEqual(up[1].detail, "Sara · turns 36");
  const t = c.monthTotals([{ data: { type: "expense", amount: 100, currency: "PKR", category: "Food", date: "2026-11-02" } }, { data: { type: "income", amount: 500, currency: "PKR", category: "Salary", date: "2026-11-01" } }, { data: { type: "expense", amount: 40, currency: "USD", category: "Food", date: "2026-11-03" } }], "2026-11", "PKR");
  assert.deepStrictEqual([t.spent, t.earned, t.net], [100, 500, 400], "other currencies aren't added in");
  assert.strictEqual(c.nextDue("2026-01-31", "monthly"), "2026-02-28");
});
ok("today: progress, spending pace and the brief", () => {
  const now = c.toEpoch("2026-11-26", "12:00");
  const todos = [{ data: { title: "a", due: "2026-11-26", done: false } }, { data: { title: "b", due: "2026-11-20", done: false } }, { data: { title: "c", due: "2026-11-26", done: true, done_at: now - 3600000 } }];
  assert.deepStrictEqual(c.todoProgress(todos, "2026-11-26"), { open: 2, done: 1, total: 3, progress: 1 / 3 });
  const pace = c.moneyPace([{ data: { type: "expense", amount: 120, date: "2026-11-10", category: "x" } }, { data: { type: "expense", amount: 100, date: "2026-10-12", category: "x" } }, { data: { type: "expense", amount: 900, date: "2026-10-30", category: "x" } }], "2026-11-26", "PKR");
  assert.deepStrictEqual([pace.now, pace.before], [120, 100], "last month only up to the same day");
  assert.strictEqual(c.briefLine({ next: { title: "Dentist", when: "in 2 h" }, open: 1, done: 0, heads: 2 }), "Next: Dentist in 2 h · 1 to-do left · 2 heads-ups");
  assert.strictEqual(c.briefLine({ next: null, open: 0, done: 3, heads: 0 }), "To-dos all done");
});
ok("operator: events become messages and step cards", () => {
  const ev = (id, type, data, run_id = 7) => ({ id, run_id, at: id * 1000, type, data });
  const items = c.buildTimeline([ev(1, "user", { text: "check disk" }), ev(2, "tool", { call_id: "c1", tool: "run_command", args: { command: "df -h" } }), ev(3, "output", { text: "50G free" }), ev(4, "approval", { approval_id: 9, summary: "Restart nginx?" }), ev(5, "reply", { text: "Plenty of room." })], 7);
  assert.deepStrictEqual(items.map((i) => i.kind), ["user", "step", "reply"]);
  assert.strictEqual(items[1].output, "50G free");
  assert.strictEqual(items[1].ask.summary, "Restart nginx?");
  assert.deepStrictEqual(c.pendingAsks(items).map((a) => a.approvalId), [9]);
  // files sent with a message: named, never anything odd
  const sent = c.buildTimeline([ev(1, "user", { text: "", files: [{ id: 4, name: "invoice.pdf", kind: "pdf", bytes: 2048, pages: 2 }, null, { id: 0, name: "x" }, { id: 5, name: "a.txt", kind: "text", bytes: "9" }] })], 7);
  assert.deepStrictEqual(sent[0].files, [
    { id: 4, name: "invoice.pdf", kind: "pdf", bytes: 2048, pages: 2 },
    { id: 5, name: "a.txt", kind: "text", bytes: 9, pages: null },
  ]);
  assert.deepStrictEqual(items[0].files, [], "no files: an empty list");
});
ok("kinds: work and interests are known", () => {
  for (const k of ["project", "client", "work_log", "server", "domain", "interest", "practice", "word", "media", "wish"]) assert.ok(c.isKind(k), k);
  assert.ok(!c.isKind("password"));
});
ok("work: week start, minutes in words, project time and money", () => {
  assert.strictEqual(c.weekStart("2026-11-26"), "2026-11-23"); // Thursday → Monday
  assert.strictEqual(c.weekStart("2026-11-29"), "2026-11-23"); // Sunday belongs to the week before
  assert.strictEqual(c.weekStart("2026-11-23"), "2026-11-23");
  assert.strictEqual(c.minutesInWords(45), "45 min");
  assert.strictEqual(c.minutesInWords(60), "1 h");
  assert.strictEqual(c.minutesInWords(150), "2 h 30 min");
  const logs = [
    { data: { project_id: "p", type: "time", date: "2026-11-24", minutes: 90 } },
    { data: { project_id: "p", type: "time", date: "2026-11-20", minutes: 60, billable: false } },
    { data: { project_id: "p", type: "time", date: "2026-11-25", minutes: 30 } },
    { data: { project_id: "p", type: "payment", date: "2026-11-25", amount: 50 } },
    { data: { project_id: "q", type: "time", date: "2026-11-25", minutes: 600 } },
  ];
  const s = c.projectStats(logs, "p", "2026-11-26");
  assert.deepStrictEqual(s, { minutes: 180, billable: 120, thisWeek: 120, paid: 50, last: "2026-11-25" });
  assert.deepStrictEqual(c.projectOwed({ name: "Site", status: "active", rate: 40, rate_unit: "hour" }, logs, "p"), { worth: 80, paid: 50, owed: 30 });
  assert.deepStrictEqual(c.projectOwed({ name: "Site", status: "active", rate: 500, rate_unit: "fixed" }, logs, "p"), { worth: 500, paid: 50, owed: 450 });
  assert.strictEqual(c.projectOwed({ name: "Mine", status: "active" }, logs, "p"), null);
  assert.strictEqual(c.projectOwed({ name: "Overpaid", status: "active", rate: 10, rate_unit: "hour" }, logs, "p").owed, 0);
});
ok("work: renewals due, soonest first, auto-renew and gone left out", () => {
  const out = c.renewalsDue(
    {
      domain: [
        { id: "a", data: { name: "late.com", expires_on: "2026-11-20" } },
        { id: "b", data: { name: "soon.com", expires_on: "2026-12-10" } },
        { id: "c", data: { name: "auto.com", expires_on: "2026-12-01", auto_renew: true } },
        { id: "d", data: { name: "far.com", expires_on: "2027-06-01" } },
        { id: "e", data: { name: "gone.com", expires_on: "2026-12-01", gone: true } },
      ],
      server: [
        { id: "s", data: { name: "VPS", renews_on: "2026-11-30" } },
        { id: "t", data: { name: "Big box", renews_on: "2026-12-20" } },
      ],
    },
    "2026-11-26",
  );
  assert.deepStrictEqual(out.map((x) => x.id), ["a", "s", "b"]);
  assert.strictEqual(out[0].days, -6);
  assert.strictEqual(c.daysWord(0), "today");
  assert.strictEqual(c.daysWord(12), "in 12 days");
  assert.strictEqual(c.daysWord(-3), "3 days ago");
  const sum = c.workSummary(
    {
      project: [{ id: "p", data: { name: "Site", status: "active", rate: 40, rate_unit: "hour" } }, { id: "i", data: { name: "Idea", status: "idea", rate: 1000, rate_unit: "fixed" } }],
      work_log: [
        { data: { project_id: "p", type: "time", date: "2026-11-24", minutes: 120 } },
        { data: { project_id: "p", type: "payment", date: "2026-11-02", amount: 30 } },
        { data: { project_id: "p", type: "payment", date: "2026-10-30", amount: 10 } },
      ],
      server: [{ id: "s", data: { name: "VPS", cost: 12 } }, { id: "g", data: { name: "Old", cost: 99, gone: true } }],
    },
    "2026-11-26",
  );
  assert.deepStrictEqual(sum, { active: 1, weekMinutes: 120, paidMonth: 30, owed: 40, serverCost: 12 });
});
ok("interests: flashcards move up when known, back to the start when not", () => {
  assert.deepStrictEqual(c.reviewWord({ term: "kitab", meaning: "book" }, true, "2026-11-26"), { box: 1, due: "2026-11-27", right: 1, wrong: 0 });
  assert.deepStrictEqual(c.reviewWord({ term: "kitab", meaning: "book", box: 3, right: 3 }, true, "2026-11-26"), { box: 4, due: "2026-12-10", right: 4, wrong: 0 });
  assert.deepStrictEqual(c.reviewWord({ term: "kitab", meaning: "book", box: 5 }, true, "2026-11-26").box, 5);
  assert.deepStrictEqual(c.reviewWord({ term: "kitab", meaning: "book", box: 4, right: 4 }, false, "2026-11-26"), { box: 0, due: "2026-11-26", right: 4, wrong: 1 });
  const words = [
    { id: "a", data: { term: "a", meaning: "", box: 2, due: "2026-11-26", interest_id: "ar" } },
    { id: "b", data: { term: "b", meaning: "", box: 0, interest_id: "ar" } },
    { id: "c", data: { term: "c", meaning: "", box: 1, due: "2026-11-20", interest_id: "ar" } },
    { id: "d", data: { term: "d", meaning: "", box: 3, due: "2026-12-01", interest_id: "ar" } },
    { id: "e", data: { term: "e", meaning: "", due: "2026-11-01", interest_id: "fr" } },
  ];
  assert.deepStrictEqual(c.dueWords(words, "2026-11-26", "ar").map((w) => w.id), ["b", "c", "a"]);
  assert.strictEqual(c.dueWords(words, "2026-11-26").length, 4);
  const p = c.wordProgress([{ data: { box: 5 } }, { data: { box: 4 } }, { data: {} }, { data: { box: 9 } }]);
  assert.deepStrictEqual(p, { total: 4, boxes: [1, 0, 0, 0, 1, 2], known: 3 });
});
ok("interests: practice this week, last 7 days, streak", () => {
  const pr = [
    { data: { interest_id: "ar", date: "2026-11-26", minutes: 20 } },
    { data: { interest_id: "ar", date: "2026-11-25", minutes: 15 } },
    { data: { interest_id: "ar", date: "2026-11-24", minutes: 10 } },
    { data: { interest_id: "ar", date: "2026-11-22", minutes: 30 } },
    { data: { interest_id: "gu", date: "2026-11-26", minutes: 60 } },
  ];
  assert.strictEqual(c.practiceThisWeek(pr, "2026-11-26", "ar"), 45);
  assert.strictEqual(c.practiceThisWeek(pr, "2026-11-26"), 105);
  assert.deepStrictEqual(c.last7Days(pr, "2026-11-26", "ar"), [0, 0, 30, 0, 10, 15, 20]);
  assert.strictEqual(c.practiceStreak(pr, "2026-11-26", "ar"), 3);
  assert.strictEqual(c.practiceStreak(pr, "2026-11-27", "ar"), 3, "today not done yet keeps yesterday's streak");
  assert.strictEqual(c.practiceStreak(pr, "2026-11-28", "ar"), 0);
});
ok("money: months, summaries, trend, pace, recurring", () => {
  assert.strictEqual(c.prevMonth("2026-01"), "2025-12");
  assert.strictEqual(c.nextMonth("2026-12"), "2027-01");
  assert.strictEqual(c.endOfMonth("2028-02"), "2028-02-29");
  assert.strictEqual(c.monthName("2026-11"), "November 2026");
  assert.strictEqual(c.monthDays("2026-11").length, 30);
  const recs = [
    { id: "a", data: { type: "expense", amount: 100, currency: "PKR", category: "Food & dining", date: "2026-11-02" } },
    { id: "b", data: { type: "expense", amount: 300, currency: "PKR", category: "Fuel", date: "2026-11-10" } },
    { id: "c", data: { type: "income", amount: 1000, currency: "PKR", category: "Salary", date: "2026-11-01" } },
    { id: "d", data: { type: "expense", amount: 40, currency: "USD", category: "Food & dining", date: "2026-11-03" } },
    { id: "e", data: { type: "expense", amount: 200, currency: "PKR", category: "Bills & utilities", date: "2026-10-05", recurring: "monthly" } },
  ];
  const s = c.monthSummary(recs, "2026-11", "PKR");
  assert.deepStrictEqual([s.spent, s.earned, s.net, s.count], [400, 1000, 600, 3], "other currencies aren't added in");
  assert.deepStrictEqual(s.categories.map((x) => x.category), ["Fuel", "Food & dining"], "biggest first");
  assert.strictEqual(s.categories[0].share, 0.75);
  const trend = c.monthlyTrend(recs, "2026-11", "PKR", 3);
  assert.deepStrictEqual(trend.map((t) => t.month), ["2026-09", "2026-10", "2026-11"]);
  assert.deepStrictEqual([trend[1].spent, trend[2].spent], [200, 400]);
  const pace = c.dailyPace(recs, "2026-11-10", "PKR");
  assert.deepStrictEqual([pace.spent, pace.perDay, pace.projected, pace.daysLeft], [400, 40, 1200, 20]);
  assert.deepStrictEqual(c.topExpenses(recs, "2026-11", "PKR", 2).map((r) => r.id), ["b", "a"]);
  assert.strictEqual(c.nextRecurring("2026-01-31", "monthly", "2026-02-01"), "2026-02-28", "a 31st falls on the last day");
  assert.strictEqual(c.nextRecurring("2026-11-05", "monthly", "2026-11-27"), "2026-12-05");
  assert.strictEqual(c.nextRecurring("2026-11-05", null, "2026-11-27"), null);
  assert.deepStrictEqual(c.dueSoon(recs, "2026-11-27", "PKR", 10).map((d) => d.date), ["2026-12-05"]);
  const cmp = c.monthCompare(recs, "2026-11-10", "PKR");
  assert.deepStrictEqual([cmp.now, cmp.before], [400, 200], "last month only up to the same day");
  assert.strictEqual(cmp.change, 1);
});
ok("assist: cleanChange makes a clean create, update and remove", () => {
  const recs = {
    p1: { kind: "person", data: { name: "Sara", relation: "wife" } },
    t1: { kind: "todo", data: { title: "Call the plumber", done: false } },
    m1: { kind: "money", data: { type: "expense", amount: 500, currency: "PKR", category: "Fuel", date: "2026-11-20" } },
    r1: { kind: "reminder", data: { text: "Pills", at: new Date(2026, 10, 27, 9, 0).getTime(), done: false } },
  };
  const ctx = { today: "2026-11-27", get: (id) => recs[id] || null };
  const a = c.cleanChange({ op: "create", kind: "date", data: { title: " Sara's birthday ", kind: "Birthday", month: "4", day: 12, person_id: "p1", colour: "red" } }, ctx);
  assert.deepStrictEqual(a.change, { op: "create", kind: "date", data: { title: "Sara's birthday", kind: "birthday", month: 4, day: 12, person_id: "p1" } });
  assert.deepStrictEqual(a.ignored, ["colour"]);
  assert.match(c.cleanChange({ op: "create", kind: "date", data: { title: "x", month: 4, day: 12, person_id: "t1" } }, ctx).error, /no person/);
  assert.match(c.cleanChange({ op: "create", kind: "event", data: { title: "Dinner", date: "28/11" } }, ctx).error, /date like/);
  assert.match(c.cleanChange({ op: "create", kind: "todo", data: {} }, ctx).error, /needs title/);
  assert.match(c.cleanChange({ op: "create", kind: "spaceship", data: {} }, ctx).error, /no kind/);
  const m = c.cleanChange({ op: "add", kind: "money", data: { amount: "1,200", category: "fuel", type: "expense" } }, ctx);
  assert.deepStrictEqual(m.change.data, { amount: 1200, category: "Fuel", type: "expense" });
  assert.match(c.cleanChange({ op: "create", kind: "money", data: { amount: 0 } }, ctx).error, /amount/);
  const u = c.cleanChange({ op: "update", id: "p1", set: { phone: "0300 0000000", details: [{ label: "Shoe size", value: "38" }, { label: "", value: "x" }] } }, ctx);
  assert.deepStrictEqual(u.change, { op: "update", id: "p1", kind: "person", set: { phone: "0300 0000000", details: [{ label: "Shoe size", value: "38" }] }, title: "Sara" });
  assert.match(c.cleanChange({ op: "update", id: "p1", set: { name: "" } }, ctx).error, /can't be emptied/);
  assert.match(c.cleanChange({ op: "update", id: "nope", set: { name: "x" } }, ctx).error, /no record/);
  assert.deepStrictEqual(c.cleanChange({ op: "update", id: "m1", set: { category: "food & dining" } }, ctx).change.set, { category: "Food & dining" });
  assert.deepStrictEqual(c.cleanChange({ op: "delete", id: "t1" }, ctx).change, { op: "remove", id: "t1", kind: "todo", title: "Call the plumber" });
});
ok("assist: new and changed records get what the forms would fill in", () => {
  const today = "2026-11-27";
  const money = c.newRecordData({ op: "create", kind: "money", data: { amount: 300, category: "Fuel" } }, { currency: "PKR", today });
  assert.deepStrictEqual(money, { type: "expense", currency: "PKR", date: today, account: "cash", amount: 300, category: "Fuel" });
  const rem = c.newRecordData({ op: "create", kind: "reminder", data: { text: "Pills", time: "21:00" } }, { currency: "PKR", today });
  assert.strictEqual(rem.at, c.toEpoch(today, "21:00"));
  assert.ok(!("time" in rem) && rem.done === false);
  const item = c.newRecordData({ op: "create", kind: "item", data: { name: "Milk", mode: "online" } }, { currency: "PKR", today });
  assert.deepStrictEqual([item.list, item.mode, item.today, item.done], ["grocery", "online", false, false]);
  const was = { text: "Pills", at: new Date(2026, 10, 27, 9, 0).getTime(), done: false };
  const next = c.updatedRecordData("reminder", was, { time: "10:30" });
  assert.strictEqual(next.at, new Date(2026, 10, 27, 10, 30).getTime());
  assert.deepStrictEqual(c.updatedRecordData("person", { name: "Sara", relation: "wife", phone: "1" }, { phone: null }), { name: "Sara", relation: "wife" });
});
ok("assist: records in words, and found by search", () => {
  const p = { id: "p1", kind: "person", data: { name: "Sara", relation: "wife", details: [{ label: "Shoe size", value: "38" }] } };
  assert.deepStrictEqual(c.describeRecord("person", p.data), { title: "Sara", detail: "Wife · 1 details" });
  const docs = [p, { id: "t1", kind: "todo", data: { title: "Buy a gift", done: false } }].map(c.recordDoc);
  assert.deepStrictEqual(c.search(docs, "wife").map((h) => h.doc.id), ["p1"]);
  assert.deepStrictEqual(c.search(docs, "shoe size").map((h) => h.doc.id), ["p1"]);
  const ch = c.describeChange({ op: "update", id: "p1", kind: "person", set: { phone: "0300", notes: null }, title: "Sara" });
  assert.deepStrictEqual(ch, { verb: "Change person", title: "Sara", detail: "Phone: 0300 · Notes: cleared" });
  assert.ok(c.describeKinds().includes("person: name* (text), relation (me|wife"));
});
ok("timeline: a proposal and what you did with it", () => {
  const ev = (id, type, data) => ({ id, run_id: 1, at: id, type, data });
  const items = c.buildTimeline([
    ev(1, "user", { text: "add milk" }),
    ev(2, "tool", { call_id: "c1", tool: "propose_changes", args: {} }),
    ev(3, "proposal", { call_id: "c1", changes: [{ op: "create", kind: "item", data: { name: "Milk" } }, { op: "remove", id: "t1", kind: "todo", title: "x" }], dropped: [] }),
    ev(4, "tool_result", { call_id: "c1", ok: true, summary: "2 changes" }),
    ev(5, "proposal_decided", { call_id: "c1", results: [{ index: 0, saved: true, record_id: "r9" }] }),
    ev(6, "proposal_decided", { call_id: "c1", results: [{ index: 0, saved: false }, { index: 1, saved: false }] }),
  ], 1);
  const step = items.find((i) => i.kind === "step");
  assert.strictEqual(step.proposal.changes.length, 2);
  assert.deepStrictEqual(step.proposal.decided, { 0: { saved: true, recordId: "r9" }, 1: { saved: false, recordId: undefined } }, "a decision stands once made");
});
ok("guide: every kind of record belongs to a built feature; features are found by what you'd ask", () => {
  for (const k of c.KINDS)
    assert.ok(
      c.FEATURES.some((f) => f.status === "built" && (f.kinds || []).includes(k)),
      `no feature keeps ${k}: add it to guide.ts`,
    );
  for (const k of c.KINDS) assert.ok(c.KIND_SPECS[k], `${k} has no fields in assist.ts`);
  const ids = c.FEATURES.map((f) => f.id);
  assert.strictEqual(new Set(ids).size, ids.length, "feature ids are unique");
  for (const f of c.FEATURES) assert.ok(f.name && f.what && f.where, `${f.id} says what it is and where`);
  assert.strictEqual(c.guideFor("how do I log fuel").features[0].id, "car");
  assert.strictEqual(c.guideFor("wishlist").features[0].id, "interests");
  assert.strictEqual(c.guideFor("timer").features[0].id, "work");
  assert.strictEqual(c.guideFor("zzqx").matched, false);
  const brief = c.featuresInBrief();
  assert.ok(brief.includes("- Work [project, client, work_log, server, domain]") && brief.includes("Coming next, not built yet: Health (medicines, weight, visits)"));
  assert.ok(c.routesInGuide("phone").includes("/work/[id]") && c.routesInGuide("desktop").includes("/work/:id"));
});
ok("memory: a kind of its own, proposed and described like any record", () => {
  const ch = c.cleanChange({ op: "create", kind: "memory", data: { text: "Works from home on Fridays", topic: "work" } }, { today: "2026-11-27", get: () => null });
  assert.deepStrictEqual(ch.change.data, { text: "Works from home on Fridays", topic: "work" });
  assert.deepStrictEqual(c.describeChange(ch.change), { verb: "New memory", title: "Works from home on Fridays", detail: "About work" });
});
ok("hisaab: what they gave, what you spent, left, over, settled, and the text to send", () => {
  const fund = { id: "f1", data: { from: "Mother", purpose: "Groceries", amount: 5000, currency: "PKR", date: "2026-11-20", moves: [] } };
  const items = [
    { id: "i1", data: { name: "Milk", qty: "2 L", list: "grocery", mode: "store", today: true, done: true, money_id: "m1", fund_id: "f1" } },
    { id: "i2", data: { name: "Eggs", list: "grocery", mode: "store", today: true, done: true, fund_id: "f1" } },
    { id: "i3", data: { name: "Flour", list: "grocery", mode: "store", today: true, done: false, fund_id: "f1" } },
    { id: "i4", data: { name: "Mine", list: "grocery", mode: "store", today: true, done: false } },
  ];
  const money = [
    { id: "m1", data: { type: "expense", amount: 600, currency: "PKR", category: "Groceries", date: "2026-11-21", paid_from: "f1" } },
    { id: "m2", data: { type: "expense", amount: 3400, currency: "PKR", category: "Groceries", note: "Rice and oil", date: "2026-11-22", paid_from: "f1" } },
    { id: "m3", data: { type: "expense", amount: 900, currency: "PKR", category: "Food", date: "2026-11-22" } },
  ];
  let s = c.fundSummary(fund, money, items);
  assert.deepStrictEqual([s.received, s.spent, s.left, s.state], [5000, 4000, 1000, "holding"]);
  assert.deepStrictEqual([s.toBuy.map((i) => i.id), s.unpriced.map((i) => i.id), s.spends.map((m) => m.id)], [["i3"], ["i2"], ["m1", "m2"]]);
  // your own spending leaves hers out
  assert.strictEqual(c.monthSummary(money, "2026-11", "PKR").spent, 900);
  assert.strictEqual(c.monthTotals(money, "2026-11", "PKR").spent, 900);
  assert.deepStrictEqual(
    c.ownMoney(money).map((m) => m.id),
    ["m3"],
  );
  assert.strictEqual(c.fundStanding(fund, s, "PKR"), "Rs 1,000 left with you");
  // she gives more, you spend over it
  let data = c.withMove(fund, { type: "more", amount: 500, date: "2026-11-23" }, money, items);
  assert.strictEqual(data.closed, false);
  const over = money.concat([{ id: "m4", data: { type: "expense", amount: 1800, currency: "PKR", category: "Groceries", date: "2026-11-24", paid_from: "f1" } }]);
  s = c.fundSummary({ id: "f1", data }, over, items);
  assert.deepStrictEqual([s.received, s.spent, s.left, s.state], [5500, 5800, -300, "over"]);
  assert.strictEqual(c.fundStanding({ data }, s, "PKR"), "Rs 300 over: Mother owes you");
  // flour bought (no price): she pays you back the 300 and it's settled
  const done = items.map((i) => (i.id === "i3" ? { id: "i3", data: Object.assign({}, i.data, { done: true }) } : i));
  data = c.withMove({ id: "f1", data }, { type: "paid_back", amount: 300, date: "2026-11-25" }, over, done);
  assert.deepStrictEqual([data.closed, data.closed_on], [true, "2026-11-25"]);
  s = c.fundSummary({ id: "f1", data }, over, done);
  const text = c.hisaabText({ id: "f1", data }, s, { currency: "PKR", today: "2026-11-27", items: done });
  for (const line of ["Hisaab: Groceries, from Mother", "Received in all: Rs 5,500", "- Milk (2 L),", "- Rice and oil,", "Total spent: Rs 5,800", "Bought, price not noted yet: Eggs, Flour", "Spent over: Rs 300", "Paid back to me", "Settled."])
    assert.ok(text.includes(line), `hisaab says "${line}":\n${text}`);
  assert.ok(!text.includes("Still to buy"));
  // keeping what's left is your income; covering the extra is your spending
  assert.strictEqual(c.fundCategory({ data: { purpose: "groceries" } }), "Groceries");
  assert.strictEqual(c.fundCategory({ data: { purpose: "Bills for the house" } }), "Bills & utilities");
  assert.strictEqual(c.fundCategory({ data: { purpose: "Eid clothes" } }), "Family");
});
ok("capture: money given to spend, the items bought with it, and more money on a hisaab you have", () => {
  const out = c.cleanActions(
    [
      { type: "fund", from: "Mother", amount: "5,000", purpose: "Groceries" },
      { type: "item", name: "Milk", from_fund: "new" },
      { type: "item", name: "Eggs", from_fund: "f9" },
      { type: "money", money_type: "expense", amount: 300, category: "groceries", from_fund: "new" },
      { type: "money", money_type: "income", amount: 300, from_fund: "new" },
      { type: "fund", from: "Father", amount: 1000, adds_to: "f1" },
      { type: "fund", from: "", amount: 10 },
    ],
    { today: "2026-11-27", funds: ["f1"] },
  );
  assert.deepStrictEqual(
    out.map((a) => [a.type, a.from_fund || a.adds_to || ""]),
    [
      ["fund", ""],
      ["item", "new"],
      ["item", ""],
      ["money", "new"],
      ["money", ""],
      ["fund", "f1"],
    ],
  );
  assert.strictEqual(out[0].amount, 5000);
  // two new hisaabs in one capture: "new" points at neither
  const two = c.cleanActions(
    [
      { type: "fund", from: "A", amount: 1 },
      { type: "fund", from: "B", amount: 1 },
      { type: "item", name: "x", from_fund: "new" },
    ],
    { today: "2026-11-27" },
  );
  assert.strictEqual(two[2].from_fund, undefined);
  const people = [{ id: "p1", name: "Ammi", relation: "parent" }];
  const fundOf = (ref) => (ref === "new" ? "fNEW" : ref);
  assert.deepStrictEqual(c.actionToRecords(out[0], { currency: "PKR", people, fundOf })[0].data.person_id, "p1");
  assert.strictEqual(c.actionToRecords(out[1], { currency: "PKR", people, fundOf })[0].data.fund_id, "fNEW");
  assert.strictEqual(c.actionToRecords(out[3], { currency: "PKR", people, fundOf })[0].data.paid_from, "fNEW");
  assert.deepStrictEqual(c.actionToRecords(out[5], { currency: "PKR", people, fundOf }), []);
  assert.deepStrictEqual(c.fundMoveOf(out[5]), { type: "more", amount: 1000, date: "2026-11-27", note: undefined });
  // saved in order: the new hisaab first, what was bought with it pointing at it, more money on an old one
  const made = [];
  const moves = [];
  let n = 0;
  const ids = c.saveActions(out, { currency: "PKR", people, create: (kind, data) => (made.push({ kind, data }), `r${++n}`), addMore: (id, move) => moves.push([id, move.amount]) });
  assert.deepStrictEqual(
    made.map((m) => m.kind),
    ["fund", "item", "item", "money", "money"],
  );
  assert.deepStrictEqual([made[1].data.fund_id, made[2].data.fund_id, made[3].data.paid_from, made[4].data.paid_from], ["r1", undefined, "r1", undefined]);
  assert.deepStrictEqual(moves, [["f1", 1000]]);
  assert.strictEqual(ids.length, 5);
  // the assistant: a new hisaab, and money spent out of one
  const get = (id) => (id === "f1" ? { kind: "fund", data: { from: "Mother", purpose: "Groceries", amount: 5000, date: "2026-11-20" } } : null);
  const f = c.cleanChange({ op: "create", kind: "fund", data: { from: "Mother", amount: 2000, purpose: "Medicine" } }, { today: "2026-11-27", get });
  assert.deepStrictEqual(c.describeChange(f.change, { currency: "PKR" }).title, "Medicine · from Mother");
  assert.ok(c.cleanChange({ op: "create", kind: "money", data: { amount: 100, paid_from: "f1" } }, { today: "2026-11-27", get }).change);
  assert.ok(c.cleanChange({ op: "create", kind: "money", data: { amount: 100, paid_from: "f2" } }, { today: "2026-11-27", get }).error.includes("no fund"));
});
ok("operator: Claude sessions on claude.ai", () => {
  assert.strictEqual(c.parseClaudeSession("https://claude.ai/code/session_01AbCdEf?tab=x"), "session_01AbCdEf");
  assert.strictEqual(c.parseClaudeSession("claude.ai/code/cse_12345678/"), "cse_12345678");
  assert.strictEqual(c.parseClaudeSession(" session_01AbCdEf "), "session_01AbCdEf");
  assert.strictEqual(c.parseClaudeSession("https://example.com/code/session_01AbCdEf"), null);
  assert.strictEqual(c.parseClaudeSession("session_01; rm -rf /"), null);
  const sent = c.describeStep({ kind: "step", tool: "claude_send", args: { session: "website", message: "Add a contact page" }, status: "ok" });
  assert.deepStrictEqual(sent, { title: "Sent to “website” on Claude", code: "Add a contact page", why: "" });
  // an answer to something Claude asked: what happened to it is in the title
  const ask = (state) => ({ approvalId: 1, summary: "", detail: {}, state, note: "", at: 1 });
  const answer = (state) => c.describeStep({ kind: "step", tool: "claude_send", args: { session: "shop", message: "Yes, push it." }, status: "ok", ask: ask(state) }).title;
  assert.deepStrictEqual(
    ["pending", "approved", "denied", "superseded", "expired"].map(answer),
    ["Answer for “shop”", "Answered “shop” on Claude", "Answer for “shop”, not sent", "Answer for “shop”, not sent", "Answer for “shop”, not sent"]
  );
  assert.strictEqual(c.describeStep({ kind: "step", tool: "claude_save_session", args: { name: "website", note: "o/site" }, status: "ok" }).code, "website · o/site");
  assert.strictEqual(c.describeStep({ kind: "step", tool: "claude_sessions", args: {}, status: "ok" }).title, "Looked at your Claude sessions");
  assert.strictEqual(c.claudeLinkIn("Sent to “website”. Its answer shows in the session: https://claude.ai/code/session_01AbCdEf"), "https://claude.ai/code/session_01AbCdEf");
  assert.strictEqual(c.claudeLinkIn("Saved"), null);
  // a session reporting back becomes its own item in the conversation
  const tl = c.buildTimeline(
    [
      { id: 1, run_id: 5, at: 1000, type: "user", data: { text: "tell website to add a page" } },
      { id: 2, run_id: 5, at: 2000, type: "claude_report", data: { session: "website", session_url: "https://claude.ai/code/session_01AbCdEf", status: "needs_you", summary: "Which colour?", pull_request: "https://evil.example.com/x" } },
      { id: 3, run_id: 5, at: 3000, type: "claude_report", data: { session: "website", session_url: "javascript:alert(1)", status: "bogus", summary: "Done.", pull_request: "https://github.com/o/site/pull/7" } },
    ],
    5,
  );
  const reps = tl.filter((x) => x.kind === "claude_report");
  assert.deepStrictEqual(
    reps.map((r) => [r.session, r.status, r.summary, r.pullRequest, r.sessionUrl]),
    [
      ["website", "needs_you", "Which colour?", null, "https://claude.ai/code/session_01AbCdEf"],
      ["website", "working", "Done.", "https://github.com/o/site/pull/7", ""],
    ],
  );
  assert.strictEqual(c.reportStatusWords("needs_you"), "Needs you");
});
ok("pots: give money jobs, spend from them, move between them", () => {
  const today = "2026-11-28";
  const pots = [
    { id: "pP", created_at: 1, data: { name: "Personal", type: "spend", target: 120000, color: 0, moves: [] } },
    { id: "pL", created_at: 2, data: { name: "Loan", type: "debt", target: 500000, target_date: "2027-06-30", color: 1, moves: [] } },
    { id: "pS", created_at: 3, data: { name: "Savings", type: "save", target: 240000, target_date: "2027-04-30", rule: { kind: "percent", value: 10 }, color: 2, opening: 20000, moves: [] } },
  ];
  // earned 300,000: 100,000 personal, 100,000 loan, the rest given no job
  const money = [
    { id: "m1", created_at: 10, data: { type: "income", amount: 300000, currency: "PKR", category: "Freelance", date: "2026-11-05", split: [{ pot_id: "pP", amount: 100000 }, { pot_id: "pL", amount: 100000 }] } },
    { id: "m2", created_at: 11, data: { type: "expense", amount: 15000, currency: "PKR", category: "Food & dining", note: "Dinner", date: "2026-11-10", pot_id: "pP" } },
    { id: "m3", created_at: 12, data: { type: "expense", amount: 40000, currency: "PKR", category: "Loans & debt", note: "Loan installment", date: "2026-11-12", pot_id: "pL" } },
    { id: "m4", created_at: 13, data: { type: "expense", amount: 8000, currency: "PKR", category: "Fuel", date: "2026-11-14" } },
    // spent out of someone else's money: never in a pot
    { id: "m5", created_at: 14, data: { type: "expense", amount: 999, currency: "PKR", category: "Groceries", date: "2026-11-15", paid_from: "f1", pot_id: "pP" } },
    // dollars aren't added to rupees
    { id: "m6", created_at: 15, data: { type: "expense", amount: 50, currency: "USD", category: "Gadgets", date: "2026-11-16", pot_id: "pP" } },
  ];
  // moved 10,000 from personal to savings (kept on personal), and 5,000 from money not in a pot into savings
  pots[0].data.moves = [{ dir: "out", other: "pS", amount: 10000, date: "2026-11-20" }];
  pots[2].data.moves = [{ dir: "in", other: null, amount: 5000, date: "2026-11-21" }];
  const opts = { today, currency: "PKR" };
  const P = c.potSummary(pots[0], pots, money, opts);
  assert.deepStrictEqual([P.balance, P.putIn, P.spent, P.movedOut, P.month.spent], [75000, 100000, 15000, 10000, 15000]);
  assert.strictEqual(c.potStanding(pots[0], P, "PKR"), "Rs 75,000 left · Rs 15,000 of Rs 120,000 spent this month");
  assert.strictEqual(P.meter, "use");
  assert.deepStrictEqual(P.entries.map((e) => e.type), ["move_out", "spend", "income"]);
  const L = c.potSummary(pots[1], pots, money, opts);
  assert.deepStrictEqual([L.balance, L.paid, L.owed], [60000, 40000, 460000]);
  assert.strictEqual(c.potStanding(pots[1], L, "PKR"), "Rs 460,000 still owed of Rs 500,000 · Rs 60,000 set aside");
  // (460,000 owed - 60,000 already set aside) over the 8 months to June
  assert.strictEqual(L.perMonth, 50000);
  const S = c.potSummary(pots[2], pots, money, opts);
  assert.deepStrictEqual([S.balance, S.opening, S.movedIn], [35000, 20000, 15000]);
  assert.strictEqual(c.potStanding(pots[2], S, "PKR"), "15% of Rs 240,000 saved · Rs 34,167 a month to reach it by April 2027");
  // where November's money went; it adds up to the month's overall total
  const j = c.monthJobs(money, pots, "2026-11", "PKR");
  assert.deepStrictEqual(j.jobs, [{ pot_id: "pP", amount: 100000 }, { pot_id: "pL", amount: 100000 }, { pot_id: "pS", amount: 5000 }]);
  assert.deepStrictEqual([j.earned, j.notInPot, j.spentFromPots, j.spentNoPot, j.freeLeft], [300000, 95000, 55000, 8000, 87000]);
  const net = c.monthSummary(money, "2026-11", "PKR").net;
  const inPots = [P, L, S].reduce((n, s) => n + s.month.in - s.month.out - s.month.spent, 0);
  assert.strictEqual(inPots + j.freeLeft, net);
  // spending more than a pot has
  const over = money.concat([{ id: "m7", created_at: 16, data: { type: "expense", amount: 80000, currency: "PKR", category: "Shopping", date: "2026-11-25", pot_id: "pP" } }]);
  const O = c.potSummary(pots[0], pots, over, opts);
  assert.ok(O.over);
  assert.strictEqual(c.potStanding(pots[0], O, "PKR"), "Rs 5,000 over: move money in to cover it");
  // a pot deleted: its spending counts as no pot
  assert.strictEqual(c.monthJobs(money, pots.slice(1), "2026-11", "PKR").spentNoPot, 23000);
});
ok("pots: rules split an income; suggestions; moves; colours", () => {
  const today = "2026-11-28";
  const pots = [
    { id: "b", created_at: 1, data: { name: "Bills", type: "bills", target: 30000, rule: { kind: "fill" }, color: 0, order: 0 } },
    { id: "s", created_at: 2, data: { name: "Savings", type: "save", rule: { kind: "percent", value: 20 }, color: 1, order: 1 } },
    { id: "r", created_at: 3, data: { name: "Rent", type: "bills", rule: { kind: "fixed", value: 50000 }, color: 2, order: 2 } },
    { id: "x", created_at: 4, data: { name: "Old", type: "spend", rule: { kind: "percent", value: 50 }, archived: true, color: 3 } },
  ];
  // bills already got 10,000 this month, so the fill tops it up by 20,000
  const money = [{ id: "i0", created_at: 1, data: { type: "income", amount: 10000, currency: "PKR", category: "Other", date: "2026-11-02", split: [{ pot_id: "b", amount: 10000 }] } }];
  const opts = { today, currency: "PKR" };
  assert.deepStrictEqual(c.ruleSplit(pots, money, 200000, opts), [{ pot_id: "b", amount: 20000 }, { pot_id: "r", amount: 50000 }, { pot_id: "s", amount: 40000 }]);
  // a small income fills in order and never goes past what came in
  assert.deepStrictEqual(c.ruleSplit(pots, money, 30000, opts), [{ pot_id: "b", amount: 20000 }, { pot_id: "r", amount: 10000 }]);
  // editing the income that filled bills doesn't count it twice
  assert.deepStrictEqual(c.ruleSplit(pots, money, 10000, Object.assign({ except: "i0" }, opts)), [{ pot_id: "b", amount: 10000 }]);
  assert.strictEqual(c.ruleWords({ kind: "percent", value: 20 }, "PKR"), "Gets 20% of each income");
  assert.strictEqual(c.ruleWords({ kind: "fixed", value: 50000 }, "PKR"), "Gets Rs 50,000 of each income");
  // a split cleaned: real pots, merged, trimmed to the income
  const isPot = (id) => ["b", "s"].includes(id);
  assert.deepStrictEqual(c.cleanSplit([{ pot_id: "b", amount: 600 }, { pot_id: "nope", amount: 5 }, { pot_id: "b", amount: 100 }, { pot_id: "s", amount: "500" }], 1000, isPot), [{ pot_id: "b", amount: 700 }, { pot_id: "s", amount: 300 }]);
  // the pot this spending comes out of, from before
  const past = [
    { id: "e1", created_at: 1, data: { type: "expense", amount: 1, currency: "PKR", category: "Fuel", note: "Petrol", date: "2026-10-01", pot_id: "s" } },
    { id: "e2", created_at: 2, data: { type: "expense", amount: 1, currency: "PKR", category: "Fuel", date: "2026-11-01", pot_id: "b" } },
    { id: "e3", created_at: 3, data: { type: "expense", amount: 1, currency: "PKR", category: "Fuel", date: "2026-11-03", pot_id: "b" } },
  ];
  assert.strictEqual(c.suggestPot(past, { note: "petrol", category: "Fuel", today }, isPot), "s");
  assert.strictEqual(c.suggestPot(past, { note: "car wash", category: "Fuel", today }, isPot), "b");
  assert.strictEqual(c.suggestPot(past, { category: "Health", today }, isPot), null);
  // moves: kept on the pot money leaves, or on the one it goes into from money not in a pot
  assert.deepStrictEqual(c.potMoveFor("s", "b", 500, "2026-11-28"), { pot_id: "s", move: { dir: "out", other: "b", amount: 500, date: "2026-11-28" } });
  assert.deepStrictEqual(c.potMoveFor(null, "b", 500, "2026-11-28", "top up"), { pot_id: "b", move: { dir: "in", other: null, amount: 500, date: "2026-11-28", note: "top up" } });
  assert.strictEqual(c.potMoveFor("b", "b", 500, "2026-11-28"), null);
  assert.strictEqual(c.potMoveFor(null, null, 500, "2026-11-28"), null);
  // colours: the first slot no pot has, and the same pot keeps its colour
  assert.strictEqual(c.nextPotColor(pots), 4);
  assert.strictEqual(c.potColor(9, "dark"), c.POT_COLORS.dark[1]);
  assert.deepStrictEqual(c.sortPots(pots).map((p) => p.id), ["b", "s", "r", "x"]);
});
ok("pots: capture actions and the assistant's changes", () => {
  const out = c.cleanActions(
    [
      { type: "money", money_type: "income", amount: "300,000", category: "freelance", split: [{ pot: "pP", amount: 100000 }, { pot: "pL", amount: "100k" }, { pot: "zz", amount: 5 }, { pot: "pP", amount: 250000 }] },
      { type: "money", money_type: "expense", amount: 2500, category: "fuel", pot: "pP" },
      { type: "money", money_type: "expense", amount: 300, category: "groceries", pot: "pL", from_fund: "f1" },
      { type: "pot", name: "Wedding", pot_type: "save", target: "500000", target_date: "2027-06-01", rule: { kind: "percent", value: 15 } },
      { type: "pot_move", from: "pP", to: "new", amount: 10000 },
      { type: "pot_move", from: "free", to: "pL", amount: 5000 },
      { type: "pot_move", from: "pP", to: "pP", amount: 5 },
      { type: "money", money_type: "expense", amount: 900, pot: "new" },
    ],
    { today: "2026-11-28", funds: ["f1"], pots: ["pP", "pL"] },
  );
  // "100k" isn't a number, the unknown pot is dropped, and the split stops at the income
  assert.deepStrictEqual(out[0].split, [{ pot: "pP", amount: 300000 }]);
  assert.strictEqual(out[1].pot, "pP");
  // someone else's money is never in your pots
  assert.deepStrictEqual([out[2].from_fund, out[2].pot], ["f1", undefined]);
  assert.deepStrictEqual([out[3].name, out[3].pot_type, out[3].target, out[3].target_date, out[3].rule], ["Wedding", "save", 500000, "2027-06-01", { kind: "percent", value: 15 }]);
  assert.deepStrictEqual([out[4].from, out[4].to, out[5].from, out[5].to], ["pP", "new", null, "pL"]);
  assert.strictEqual(out.length, 7);
  assert.strictEqual(out[6].pot, "new");
  // with no new pot in the capture, nothing can point at one
  const lone = c.cleanActions([{ type: "pot_move", from: "pP", to: "new", amount: 1 }, { type: "money", money_type: "expense", amount: 9, pot: "new" }], { today: "2026-11-28", pots: ["pP"] });
  assert.deepStrictEqual(lone.map((a) => [a.type, a.pot]), [["money", undefined]]);
  // saved: the new pot first; an income with no split of its own gets the rules' split
  const made = [];
  const moves = [];
  let k = 0;
  const actions = out.concat(c.cleanActions([{ type: "money", money_type: "income", amount: 1000, category: "salary" }], { today: "2026-11-28" }));
  c.saveActions(actions, {
    currency: "PKR",
    people: [],
    potColor: 5,
    create: (kind, data) => (made.push({ kind, data }), `r${++k}`),
    addMore: () => {},
    addPotMove: (id, move) => moves.push([id, move.dir, move.other, move.amount]),
    autoSplit: (amount) => [{ pot_id: "pS", amount: amount / 10 }],
  });
  assert.deepStrictEqual(made[0], { kind: "pot", data: { name: "Wedding", type: "save", target: 500000, target_date: "2027-06-01", rule: { kind: "percent", value: 15 }, currency: "PKR", moves: [], archived: false, color: 5 } });
  assert.deepStrictEqual(made[1].data.split, [{ pot_id: "pP", amount: 300000 }]);
  assert.deepStrictEqual([made[2].data.pot_id, made[3].data.pot_id, made[3].data.paid_from, made[4].data.pot_id], ["pP", undefined, "f1", "r1"]);
  assert.deepStrictEqual(made[5].data.split, [{ pot_id: "pS", amount: 100 }]);
  assert.deepStrictEqual(moves, [["pP", "out", "r1", 10000], ["pL", "in", null, 5000]]);
  // the assistant: a new pot, an income split, spending from a pot, a move
  const recs = { pP: { kind: "pot", data: { name: "Personal", type: "spend" } }, pL: { kind: "pot", data: { name: "Loan", type: "debt", target: 500000 } }, m1: { kind: "money", data: { type: "income", amount: 300000, category: "Freelance", date: "2026-11-05", split: [{ pot_id: "pP", amount: 200000 }] } } };
  const get = (id) => recs[id] || null;
  const cc = (ch) => c.cleanChange(ch, { today: "2026-11-28", get });
  const pot = cc({ op: "create", kind: "pot", data: { name: "Bills", type: "bills", target: 30000, rule: { kind: "fill" } } });
  assert.strictEqual(c.describeChange(pot.change, { currency: "PKR" }).detail, "Bills pot · Needed each month Rs 30,000 · Gets what it still needs this month");
  assert.strictEqual(c.newRecordData(pot.change, { currency: "PKR", today: "2026-11-28", potColor: 3 }).color, 3);
  const inc = cc({ op: "create", kind: "money", data: { type: "income", amount: 1000, split: [{ pot_id: "pP", amount: 800 }, { pot_id: "pL", amount: 800 }] } });
  assert.deepStrictEqual(inc.change.data.split, [{ pot_id: "pP", amount: 800 }, { pot_id: "pL", amount: 200 }]);
  assert.ok(cc({ op: "create", kind: "money", data: { type: "income", amount: 1, split: [{ pot_id: "m1", amount: 1 }] } }).error.includes("no pot"));
  // spending isn't split, and income doesn't come out of a pot
  assert.deepStrictEqual(cc({ op: "create", kind: "money", data: { type: "expense", amount: 5, pot_id: "pP", split: [{ pot_id: "pL", amount: 5 }] } }).change.data, { type: "expense", amount: 5, pot_id: "pP", category: "Other" });
  // a smaller income trims its split; a change to spending drops it
  assert.deepStrictEqual(cc({ op: "update", id: "m1", set: { amount: 150000 } }).change.set, { amount: 150000, split: [{ pot_id: "pP", amount: 150000 }] });
  assert.deepStrictEqual(cc({ op: "update", id: "m1", set: { type: "expense" } }).change.set, { type: "expense", category: "Other", split: null });
  const mv = cc({ op: "move", from: "pP", to: "pL", amount: "20000" });
  assert.deepStrictEqual(c.describeChange(mv.change, { currency: "PKR", today: "2026-11-28" }), { verb: "Move money", title: "Personal → Loan", detail: "Rs 20,000 · Today" });
  assert.strictEqual(cc({ op: "move", from: null, to: "pL", amount: 1 }).change.title, "money not in a pot → Loan");
  assert.ok(cc({ op: "move", from: "pP", to: "m1", amount: 1 }).error);
  assert.ok(cc({ op: "move", from: "pP", to: "pP", amount: 1 }).error);
  assert.strictEqual(c.describeRecord("money", recs.m1.data).detail.includes("1 pot got Rs 200,000"), true);
  assert.ok(c.guideFor("pots").features.some((f) => f.id === "pots"));
});
ok("a spoken yes or no to 'shall I save it?', in English, Roman Urdu and Urdu; anything more is a change", () => {
  for (const y of ["Yes", "yes.", "OK save it", "go ahead", "haan", "Haan ji", "ji haan, save kar do", "theek hai", "save kar do na", "bilkul", "ہاں", "جی ہاں ٹھیک ہے", "yes yes", "ok please"]) assert.strictEqual(c.spokenAnswer(y), "yes", y);
  for (const x of ["No", "no no", "cancel", "nahi", "Nahin, rehne do", "mat karo", "نہیں", "don't save", "never mind"]) assert.strictEqual(c.spokenAnswer(x), "no", x);
  for (const m of ["make it thirty thousand", "haan but not the bread", "nahi, 30 hazaar thi", "and eggs too", "", "yes and add milk to the list for tomorrow please", "what is the time"]) assert.strictEqual(c.spokenAnswer(m), null, m);
});
ok("a hisaab: what you bought yesterday with your own money, put on it afterwards", () => {
  const fund = { id: "f1", data: { from: "Mother", purpose: "Groceries", amount: 5000, date: "2026-11-28", moves: [] } };
  const m = (id, data) => ({ id, created_at: 1, data: Object.assign({ type: "expense", currency: "PKR", date: "2026-11-27" }, data) });
  const money = [
    m("roti", { amount: 250, category: "Groceries", note: "bari wali double roti" }),
    m("anday", { amount: 600, category: "Groceries", note: "anday", pot_id: "pP" }),
    m("dahi", { amount: 680, category: "Groceries", note: "dahi" }),
    m("bill", { amount: 9000, category: "Bills & utilities", date: "2026-11-27", recurring: "monthly" }),
    m("week", { amount: 3600, category: "Groceries", note: "the weekly shop", date: "2026-11-20" }),
    m("old", { amount: 100, category: "Groceries", date: "2026-11-01" }),
    m("theirs", { amount: 50, category: "Groceries", paid_from: "f2" }),
    m("pay", { type: "income", amount: 1000, category: "Salary" }),
  ];
  const cand = c.fundCandidates(fund, money, { today: "2026-11-28" });
  assert.deepStrictEqual(cand.map((x) => [x.rec.id, x.likely]), [["roti", true], ["anday", true], ["dahi", true], ["week", true], ["bill", false]], "two weeks back, on no hisaab, groceries first");
  assert.deepStrictEqual(cand.filter((x) => x.recent).map((x) => x.rec.id), ["roti", "anday", "dahi"], "tick them all: yesterday's groceries, not last week's shop");
  const moved = money.map((x) => (["roti", "anday", "dahi"].includes(x.id) ? Object.assign({}, x, { data: c.onFund(x.data, "f1") }) : x));
  assert.strictEqual(moved[1].data.pot_id, null, "their money is in no pot");
  const s = c.fundSummary(fund, moved);
  assert.deepStrictEqual([s.spent, s.left, s.state], [1530, 3470, "holding"]);
  assert.strictEqual(c.fundStanding(fund, s, "PKR"), "Rs 3,470 left with you");
  assert.strictEqual(c.monthTotals(c.ownMoney(moved), "2026-11", "PKR").spent, 12700, "off your own spending");
  assert.strictEqual(c.fundAfter(fund, c.fundSummary(fund, money), 1530, "PKR"), "leaves Rs 3,470 with you");
  assert.strictEqual(c.fundAfter(fund, c.fundSummary(fund, money), 6000, "PKR"), "Mother would owe you Rs 1,000");
  assert.strictEqual(c.onFund(moved[0].data, null).paid_from, null, "and back as your own");
});
ok("five vegetables bought together for one price: one expense, every item on it, nothing counted twice", () => {
  const T = "2026-11-28";
  const at = Date.parse(`${T}T09:00:00`);
  const it = (id, name, data) => ({ id, created_at: 1, updated_at: 1, deleted: 0, data: Object.assign({ name, list: "grocery", mode: "store", today: true, done: false }, data) });
  const veg = [it("v1", "Tomatoes", { qty: "1 kg" }), it("v2", "Onions"), it("v3", "Potatoes", { done: true, done_at: at }), it("v4", "Peas"), it("v5", "Spinach")];
  const other = [it("o1", "Shirt", { list: "shopping", today: false }), it("o2", "Milk", { done: true, done_at: at, money_id: "m-milk", price: 200 }), it("o3", "Old", { done: true, done_at: at - 30 * 86400000 })];
  const money = [{ id: "m-milk", data: { type: "expense", amount: 200, currency: "PKR", category: "Groceries", date: T } }];
  // what can be priced: bought without a price first, then today's list, then the rest; never one already priced or long ago
  const can = c.buyableItems(veg.concat(other), money, { today: T });
  assert.deepStrictEqual(can.map((i) => i.id), ["v3", "v2", "v4", "v5", "v1", "o1"]);
  assert.strictEqual(c.itemsNote(veg), "Tomatoes (1 kg), Onions, Potatoes, Peas and Spinach");
  assert.strictEqual(c.itemsNote(veg.concat(veg), 6), "Tomatoes (1 kg), Onions, Potatoes, Peas, Spinach and 5 more");
  const d = c.purchaseData(veg, { amount: 1000, currency: "PKR", date: T, account: "cash" });
  assert.deepStrictEqual([d.type, d.amount, d.category, d.account, d.note, d.paid_from, d.pot_id], ["expense", 1000, "Groceries", "cash", "Potatoes, Tomatoes (1 kg), Onions, Peas and Spinach", undefined, undefined], "added together: the one already ticked first, then as listed");
  // ticked ones follow the order they were ticked, whatever order they came in
  const tickedVeg = veg.map((i, n) => Object.assign({}, i, { data: Object.assign({}, i.data, { done: true, done_at: at + n * 1000 }) }));
  assert.strictEqual(c.purchaseData(tickedVeg.slice().reverse(), { amount: 1, currency: "PKR", date: T }).note, "Tomatoes (1 kg), Onions, Potatoes, Peas and Spinach");
  const added = veg.map((i, n) => Object.assign({}, i, { created_at: 10 + n, data: Object.assign({}, i.data, { done: true, done_at: at + (5 - n) * 1000 }) }));
  assert.strictEqual(c.purchaseData(added.slice().reverse(), { amount: 1, currency: "PKR", date: T }).note, "Tomatoes (1 kg), Onions, Potatoes, Peas and Spinach", "as added to the list");
  // one off the purchase: the note loses it (in any order), a note you wrote stays
  assert.strictEqual(c.noteWithout(d.note, veg, veg.filter((i) => i.id !== "v4")), "Potatoes, Tomatoes (1 kg), Onions and Spinach");
  assert.strictEqual(c.noteWithout("Sabzi from the market", veg, veg.slice(1)), null);
  assert.strictEqual(c.noteWithout(d.note, veg, []), null);
  assert.strictEqual(c.purchaseData([other[0]], { amount: 1500, currency: "PKR", date: T }).category, "Shopping");
  assert.strictEqual(c.purchaseData(veg, { amount: 1000, currency: "PKR", date: T, fundId: "f1", potId: "p1" }).pot_id, undefined, "their money is in no pot");
  // saved: one expense, the five on it, no price of their own; the month counts 1,000 once
  const m = { id: "m-veg", data: d };
  const items = veg.map((i) => Object.assign({}, i, { data: c.boughtData(i, m.id, null, at + 1000) })).concat(other);
  assert.ok(items.slice(0, 5).every((i) => i.data.done && i.data.money_id === "m-veg" && i.data.price === null));
  assert.strictEqual(items[2].data.done_at, at, "already bought: it keeps when");
  assert.strictEqual(c.monthTotals([m].concat(money), "2026-11", "PKR").spent, 1200);
  assert.deepStrictEqual(c.boughtWith(items[0], items).map((i) => i.id), ["v2", "v3", "v4", "v5"]);
  assert.strictEqual(c.itemsOfMoney("m-veg", items).length, 5);
  assert.deepStrictEqual(c.buyableItems(items, [m].concat(money), { today: T }).map((i) => i.id), ["o1"], "nothing left to price");
  // the purchase deleted in Money: they're bought without a price again, and can be priced again
  assert.deepStrictEqual(c.buyableItems(items, money, { today: T }).map((i) => i.id).sort(), ["o1", "v1", "v2", "v3", "v4", "v5"]);
  assert.strictEqual(c.perItem(1000, 5), 200);
  assert.strictEqual(c.sharedFund([it("a", "A", { fund_id: "f1" }), it("b", "B", { fund_id: "f1" })]), "f1");
  assert.strictEqual(c.sharedFund([it("a", "A", { fund_id: "f1" }), it("b", "B")]), null);
});
ok("one price for several on a hisaab: what's left, the message to send, and a deleted purchase", () => {
  const fund = { id: "f1", data: { from: "Mother", purpose: "Groceries", amount: 5000, date: "2026-11-28", moves: [] } };
  const it = (id, name) => ({ id, data: { name, list: "grocery", mode: "store", today: true, done: true, money_id: "m1", fund_id: "f1" } });
  const items = [it("a", "Tomatoes"), it("b", "Onions"), it("c", "Peas")];
  const money = [{ id: "m1", created_at: 1, data: { type: "expense", amount: 1000, currency: "PKR", category: "Groceries", date: "2026-11-28", paid_from: "f1", note: "Tomatoes, Onions and Peas" } }];
  const s = c.fundSummary(fund, money, items);
  assert.deepStrictEqual([s.spent, s.left, s.unpriced.length], [1000, 4000, 0]);
  const text = c.hisaabText(fund, s, { currency: "PKR", today: "2026-11-28", items });
  assert.ok(text.includes("- Tomatoes, Onions and Peas, 28 Nov: Rs 1,000"), text);
  assert.strictEqual(c.monthTotals(c.ownMoney(money), "2026-11", "PKR").spent, 0, "her money, not mine");
  // deleted in Money: off the hisaab, and the three are bought without a price again
  const gone = c.fundSummary(fund, [], items);
  assert.deepStrictEqual([gone.spent, gone.left, gone.unpriced.map((i) => i.id)], [0, 5000, ["a", "b", "c"]]);
});
ok("the assistant proposes a purchase of several list items for one price", () => {
  const recs = {
    v1: { kind: "item", data: { name: "Tomatoes", list: "grocery", mode: "store", today: true, done: true, fund_id: "f1" } },
    v2: { kind: "item", data: { name: "Onions", list: "grocery", mode: "store", today: true, done: false, fund_id: "f1" } },
    v3: { kind: "item", data: { name: "Milk", list: "grocery", mode: "store", today: true, done: true, money_id: "m1" } },
    m1: { kind: "money", data: { type: "expense", amount: 200, currency: "PKR", category: "Groceries", date: "2026-11-28" } },
    f1: { kind: "fund", data: { from: "Mother", purpose: "Groceries", amount: 5000, date: "2026-11-28" } },
    p1: { kind: "pot", data: { name: "Personal", type: "spend" } },
  };
  const ctx = { today: "2026-11-28", get: (id) => recs[id] || null };
  const r = c.cleanChange({ op: "buy", ids: ["v1", "v2", "v1"], amount: "1,000", date: "2026-11-27" }, ctx);
  assert.deepStrictEqual(r.change, { op: "buy", kind: "item", ids: ["v1", "v2"], amount: 1000, date: "2026-11-27", account: "cash", fund: "f1", title: "Tomatoes and Onions" }, "whose money: the one they're marked for");
  assert.strictEqual(c.cleanChange({ op: "buy", ids: ["v1", "v2"], amount: 1000, paid_from: "mine", pot_id: "p1", account: "bank" }, ctx).change.fund, null);
  assert.strictEqual(c.cleanChange({ op: "buy", ids: ["v1", "v2"], amount: 1000, paid_from: "mine", pot_id: "p1" }, ctx).change.pot_id, "p1");
  assert.strictEqual(c.cleanChange({ op: "buy", ids: ["v1"], amount: 1000, pot_id: "p1" }, ctx).change.pot_id, undefined, "their money is in no pot");
  assert.ok(/already has its price/.test(c.cleanChange({ op: "buy", ids: ["v1", "v3"], amount: 1000 }, ctx).error));
  assert.ok(/no list item/.test(c.cleanChange({ op: "buy", ids: ["f1"], amount: 1000 }, ctx).error));
  assert.ok(/above 0/.test(c.cleanChange({ op: "buy", ids: ["v1"], amount: 0 }, ctx).error));
  const w = c.describeChange(r.change, { currency: "PKR", today: "2026-11-28", fundName: "Mother's money" });
  assert.deepStrictEqual(w, { verb: "Bought together", title: "Tomatoes and Onions", detail: "2 items for Rs 1,000 · from Mother's money · Yesterday" });
});
ok("owed: money kept with someone, taken back bit by bit", () => {
  const rec = { id: "o1", data: { type: "keeping", who: "Abu", amount: 150000, currency: "PKR", date: "2026-11-01", account: "cash", moves: [], closed: false } };
  let s = c.owedSummary(rec);
  assert.deepStrictEqual([s.given, s.back, s.left, s.overdue], [150000, 0, 150000, false]);
  assert.strictEqual(c.owedLine(rec, "PKR"), "Abu has Rs 150,000 of yours");
  let d = c.owedWithMove(rec, { type: "back", amount: 20000, date: "2026-11-10" });
  assert.strictEqual(c.owedSummary({ data: d }).left, 130000);
  assert.strictEqual(d.closed, false);
  d = c.owedWithMove({ data: d }, { type: "more", amount: 5000, date: "2026-11-12" });
  assert.strictEqual(c.owedSummary({ data: d }).given, 155000);
  // taking back more than they have is capped at what's left, and closes it
  d = c.owedWithMove({ data: d }, { type: "back", amount: 999999, date: "2026-11-20" });
  assert.deepStrictEqual([c.owedSummary({ data: d }).left, d.moves[2].amount, d.closed, d.closed_on], [0, 135000, true, "2026-11-20"]);
  assert.strictEqual(c.owedLine({ data: d }, "PKR"), "All of it back from Abu");
  // taking that step back opens it again
  const u = c.owedWithoutMove({ data: d }, 2);
  assert.deepStrictEqual([c.owedSummary({ data: u }).left, u.closed, u.closed_on], [135000, false, null]);
  // giving more to a settled one opens it again
  const again = c.owedWithMove({ data: d }, { type: "more", amount: 1000, date: "2026-11-25" });
  assert.deepStrictEqual([again.closed, again.closed_on], [false, null]);
  assert.strictEqual(c.owedMoveWord("keeping", "back"), "Took some back");
  assert.strictEqual(c.owedMoveWord("keeping", "more"), "Gave more to keep");
});
ok("owed: a loan, paid back, overdue, the rest let go as spending", () => {
  const rec = { id: "o2", data: { type: "loan", who: "Ali", amount: 50000, currency: "PKR", date: "2026-10-01", due: "2026-11-15", account: "bank", moves: [{ type: "back", amount: 20000, date: "2026-11-01" }], closed: false } };
  let s = c.owedSummary(rec, "2026-11-28");
  assert.deepStrictEqual([s.left, s.part, s.overdue], [30000, 0.4, true]);
  assert.strictEqual(c.owedSummary(rec, "2026-11-10").overdue, false);
  assert.strictEqual(c.owedLine(rec, "PKR", "2026-11-28"), "Ali owes you Rs 30,000 of Rs 50,000 · was due 15 Nov");
  const e = c.forgivenExpense(rec, 30000, "2026-11-28", "PKR");
  assert.deepStrictEqual([e.type, e.amount, e.category, e.account, e.currency], ["expense", 30000, "Gifts", "bank", "PKR"]);
  const d = c.owedWithMove(rec, { type: "forgave", amount: 30000, date: "2026-11-28", money_id: "m9" });
  s = c.owedSummary({ data: d }, "2026-11-28");
  assert.deepStrictEqual([s.left, s.forgiven, s.overdue, d.closed], [0, 30000, false, true]);
  assert.strictEqual(c.owedLine({ data: d }, "PKR"), "Ali paid it all back");
  const text = c.owedText(rec, "PKR", "2026-11-28");
  assert.ok(/^Udhaar · Ali/.test(text) && /lent Rs 50,000/.test(text) && /paid back Rs 20,000/.test(text) && /Left: Rs 30,000/.test(text) && /To pay back by 15 Nov/.test(text), text);
  assert.ok(/^Amanat · Abu/.test(c.owedText({ data: { type: "keeping", who: "Abu", amount: 100, date: "2026-11-01" } }, "PKR")));
});
ok("owed: totals of your money with others", () => {
  const recs = [
    { id: "a", data: { type: "keeping", who: "Abu", amount: 150000, date: "2026-11-01", moves: [{ type: "back", amount: 10000, date: "2026-11-05" }] } },
    { id: "b", data: { type: "loan", who: "Ali", amount: 20000, date: "2026-11-01" } },
    { id: "c", data: { type: "loan", who: "Sara", amount: 5000, date: "2026-11-01", closed: true } },
    { id: "d", data: { type: "loan", who: "Omar", amount: 100, currency: "USD", date: "2026-11-01" } },
    { id: "e", deleted: 1, data: { type: "keeping", who: "Bilal", amount: 9000, date: "2026-11-01" } },
  ];
  const t = c.owedTotals(recs, "PKR");
  assert.deepStrictEqual([t.keeping, t.lent, t.total, t.open.map((x) => x.rec.id)], [140000, 20000, 160000, ["a", "b"]]);
});
ok("owed: capture files it, and a step on one you have", () => {
  const ctx = { today: "2026-11-28", owed: ["o1"] };
  const acts = c.cleanActions(
    [
      { type: "owed", who: "Abu", amount: "150,000" },
      { type: "owed", owed_type: "loan", who: "Ali", amount: 20000, due: "2026-12-05", account: "bank" },
      { type: "owed", owed_type: "keeping", who: "Sara", amount: 100, due: "2026-12-05" },
      { type: "owed", who: "", amount: 5 },
      { type: "owed_move", owed: "o1", move: "back", amount: "20k" },
      { type: "owed_move", owed: "o1", amount: 20000 },
      { type: "owed_move", owed: "nope", move: "back", amount: 100 },
    ],
    ctx,
  );
  assert.deepStrictEqual(acts[0], { type: "owed", owed_type: "keeping", who: "Abu", amount: 150000, date: "2026-11-28", note: undefined });
  assert.deepStrictEqual([acts[1].owed_type, acts[1].due, acts[1].account], ["loan", "2026-12-05", "bank"]);
  assert.strictEqual(acts[2].due, undefined, "only a loan has a day to pay back by");
  assert.deepStrictEqual(acts.slice(3).map((a) => [a.type, a.move]), [["owed_move", "back"]], "an amount it can't read, or a record that isn't open, is dropped");
  const recs = c.actionToRecords(acts[1], { currency: "PKR", people: [{ id: "p1", name: "Ali", relation: "friend" }] });
  assert.deepStrictEqual(recs[0].data, { type: "loan", who: "Ali", person_id: "p1", amount: 20000, currency: "PKR", date: "2026-11-28", account: "bank", due: "2026-12-05", moves: [], closed: false });
  const made = [];
  const moved = [];
  c.saveActions(acts, { currency: "PKR", people: [], create: (kind, data) => (made.push([kind, data.who]), "id" + made.length), addMore: () => {}, addOwedMove: (id, mv) => moved.push([id, mv]) });
  assert.deepStrictEqual(made, [["owed", "Abu"], ["owed", "Ali"], ["owed", "Sara"]]);
  assert.deepStrictEqual(moved, [["o1", { type: "back", amount: 20000, date: "2026-11-28" }]]);
  assert.strictEqual(c.ACTION_AREA.owed, "With others");
});
ok("owed: the assistant can propose it, and fills in what it leaves out", () => {
  const ctx = { today: "2026-11-28", currency: "PKR", get: () => null };
  const r = c.cleanChange({ op: "create", kind: "owed", data: { who: "Abu", amount: "150,000" } }, ctx);
  assert.ok(r.change, JSON.stringify(r));
  assert.deepStrictEqual([r.change.data.who, r.change.data.amount], ["Abu", 150000]);
  assert.match(c.cleanChange({ op: "create", kind: "owed", data: { amount: 5 } }, ctx).error || "", /who/);
  const abu = { kind: "owed", data: { type: "keeping", who: "Abu", amount: 150000, currency: "PKR", date: "2026-11-01", moves: [] } };
  const g = { today: "2026-11-28", get: (id) => (id === "o1" ? abu : null) };
  const st = c.cleanChange({ op: "step", id: "o1", step: "back", amount: "20,000" }, g);
  assert.deepStrictEqual(st.change, { op: "step", kind: "owed", id: "o1", step: "back", amount: 20000, date: "2026-11-28", title: "With Abu" });
  assert.match(c.cleanChange({ op: "step", id: "o1", step: "back", amount: 200000 }, g).error, /only 150000/);
  assert.match(c.cleanChange({ op: "step", id: "x", amount: 1 }, g).error, /no money with someone/);
  assert.strictEqual(c.cleanChange({ op: "step", id: "o1", step: "more", amount: 200000 }, g).change.step, "more");
  assert.deepStrictEqual(c.describeChange(st.change, { currency: "PKR", today: "2026-11-28", current: abu.data }), { verb: "Took some back", title: "With Abu", detail: "Rs 20,000 · Today · Rs 130,000 left with them" });
  assert.deepStrictEqual(c.describeRecord("owed", { type: "loan", who: "Ali", amount: 20000, date: "2026-11-01", due: "2026-12-05", moves: [{ type: "back", amount: 5000, date: "2026-11-10" }] }, { currency: "PKR", today: "2026-11-28" }).title, "Lent to Ali");
});
ok("amounts as you type them: grouped in the field, plain in the form", () => {
  assert.strictEqual(c.groupTyped("150000"), "150,000");
  assert.strictEqual(c.groupTyped("1,50,000"), "150,000");
  assert.strictEqual(c.groupTyped("1234.567"), "1,234.56");
  assert.strictEqual(c.groupTyped("0012"), "12");
  assert.strictEqual(c.groupTyped("0.5"), "0.5");
  assert.strictEqual(c.groupTyped("."), "0.");
  assert.strictEqual(c.groupTyped("12.3.4"), "12.34");
  assert.strictEqual(c.groupTyped("Rs 2,500"), "2,500");
  assert.strictEqual(c.groupTyped(""), "");
  assert.strictEqual(c.ungroup("150,000.50"), "150000.50");
  assert.strictEqual(c.groupNumber(48200), "48,200");
  assert.strictEqual(c.groupNumber(-1500), "−1,500");
  assert.strictEqual(c.groupNumber(999), "999");
});
ok("owed: what's in your hands this month, after what went to others and came back", () => {
  const abu = { id: "o1", data: { type: "keeping", who: "Abu", amount: 150000, currency: "PKR", date: "2026-11-28", moves: [] } };
  const ali = { id: "o2", data: { type: "loan", who: "Ali", amount: 50000, currency: "PKR", date: "2026-10-02", moves: [{ type: "back", amount: 20000, date: "2026-11-05" }, { type: "forgave", amount: 5000, date: "2026-11-20" }, { type: "more", amount: 1000, date: "2026-10-30" }] } };
  const usd = { id: "o3", data: { type: "loan", who: "Sam", amount: 100, currency: "USD", date: "2026-11-01", moves: [] } };
  const gone = { id: "o4", deleted: 1, data: { type: "loan", who: "X", amount: 9, currency: "PKR", date: "2026-11-01", moves: [] } };
  const nov = c.owedFlow([abu, ali, usd, gone], "2026-11", "PKR");
  assert.deepStrictEqual(nov, { given: 150000, back: 20000, forgiven: 5000 });
  assert.strictEqual(c.inHand(199050, nov), 74050);
  assert.strictEqual(c.inHand(199050, c.owedFlow([abu], "2026-11", "PKR")), 49050, "the 200,000 with 150,000 of it at Abu's");
  assert.deepStrictEqual(c.owedFlow([abu, ali], "2026-10", "PKR"), { given: 51000, back: 0, forgiven: 0 });
  assert.strictEqual(c.flowMoved(c.owedFlow([abu], "2026-09", "PKR")), false);
  assert.deepStrictEqual(c.owedFlow([abu, ali], "2026", "PKR"), { given: 201000, back: 20000, forgiven: 5000 }, "a whole year");
});

// ---------- nudges ----------
const N = (id, data, extra) => Object.assign({ id, kind: "nudge", data: Object.assign({ kind: "message", priority: "normal", status: "pending", created_by: "app", related_ids: [] }, data), deleted: 0, created_at: 0, updated_at: 0 }, extra || {});
const at = (d, t) => c.toEpoch(d, t);
const nudgeWorld = (extra) => {
  const r = (id, kind, data) => ({ id, kind, data, deleted: 0, created_at: 0, updated_at: 0 });
  return Object.assign(
    {
      currency: "PKR",
      nudges: [],
      records: [
        r("t1", "todo", { title: "Pay rent", due: "2026-11-26", done: false, priority: "high" }),
        r("t2", "todo", { title: "Call the bank", due: "2026-11-25", done: false }),
        r("t3", "todo", { title: "Fix the tap", due: "2026-11-27", done: false }),
        r("t4", "todo", { title: "Buy a gift", due: "2026-11-28", done: false }),
        r("t5", "todo", { title: "Old thing", due: "2026-11-01", done: true }),
        r("p1", "person", { name: "Sara", relation: "wife" }),
        r("d1", "date", { title: "Sara's birthday", kind: "birthday", month: 12, day: 1, person_id: "p1", remind: [7, 1, 0] }),
        r("e1", "event", { title: "Dentist", date: "2026-11-29", time: "10:00", place: "Clinic" }),
        r("o1", "owed", { type: "loan", who: "Ali", amount: 5000, currency: "PKR", date: "2026-11-01", due: "2026-11-20", moves: [] }),
        r("f1", "fund", { from: "Ammi", purpose: "Groceries", amount: 5000, currency: "PKR", date: "2026-11-10", moves: [] }),
      ],
    },
    extra || {}
  );
};
const plain = { on: true, categories: { todos: true, events: true, dates: true, money: true, hisaab: true, loans: true, assistant: true }, quiet: { from: "22:00", to: "08:00" }, cap: 4, notify: true, self: false };

ok("nudges: quiet hours, also past midnight, and the moment they end", () => {
  const q = { from: "22:00", to: "08:00" };
  assert.strictEqual(c.inQuietHours(at("2026-11-28", "23:00"), q), true);
  assert.strictEqual(c.inQuietHours(at("2026-11-28", "07:59"), q), true);
  assert.strictEqual(c.inQuietHours(at("2026-11-28", "08:00"), q), false);
  assert.strictEqual(c.inQuietHours(at("2026-11-28", "12:00"), q), false);
  assert.strictEqual(c.inQuietHours(at("2026-11-28", "14:00"), { from: "13:00", to: "15:00" }), true);
  assert.strictEqual(c.inQuietHours(at("2026-11-28", "23:00"), null), false);
  assert.strictEqual(c.afterQuietHours(at("2026-11-28", "23:00"), q), at("2026-11-29", "08:00"), "late at night: the next morning");
  assert.strictEqual(c.afterQuietHours(at("2026-11-28", "02:00"), q), at("2026-11-28", "08:00"), "early: this morning");
  assert.strictEqual(c.afterQuietHours(at("2026-11-28", "12:00"), q), at("2026-11-28", "12:00"));
  const s = c.cleanNudgeSettings({ cap: 9, quiet: { from: "21:00", to: "21:00" }, categories: { money: false, nope: true }, self: true });
  assert.deepStrictEqual([s.cap, s.quiet, s.categories.money, s.categories.todos, s.self, s.on], [4, null, false, true, true, true]);
  assert.strictEqual(c.cleanNudgeSettings({ cap: 0 }).cap, 4);
  assert.strictEqual(c.cleanNudgeSettings({ cap: 2 }).cap, 2);
  assert.deepStrictEqual(c.cleanNudgeSettings(null), c.DEFAULT_NUDGE_SETTINGS);
});

ok("nudges: the daily check makes at most the cap a day, most pressing first, two late to-dos at most", () => {
  const now = at("2026-11-28", "07:00");
  const all = c.nudgeCandidates(nudgeWorld(), now);
  const keys = all.map((x) => x.key).sort();
  assert.deepStrictEqual(keys, ["date:d1:2026-12-01", "event:e1:2026-11-29", "fund:f1:2026-11-10", "owed:o1:2026-11-20", "todo-overdue:t1:2026-11-26", "todo-overdue:t2:2026-11-25", "todo-overdue:t3:2026-11-27", "todos-today:2026-11-28"]);
  const plan = c.planNudges(nudgeWorld(), now, plain);
  assert.deepStrictEqual(
    plan.create.map((x) => x.data.key),
    ["todo-overdue:t1:2026-11-26", "owed:o1:2026-11-20", "todo-overdue:t2:2026-11-25", "fund:f1:2026-11-10"],
    "high first (rent, the late loan), then by time; the third late to-do waits; four is the cap"
  );
  const rent = plan.create[0];
  assert.strictEqual(rent.id, c.nudgeId("todo-overdue:t1:2026-11-26"), "the same id on every device");
  assert.strictEqual(rent.at, at("2026-11-27"), "stamped when its reason began, so what you did elsewhere wins");
  assert.strictEqual(rent.data.due_at, at("2026-11-28", "10:00"));
  assert.deepStrictEqual([rent.data.status, rent.data.created_by, rent.data.category, rent.data.kind, rent.data.priority], ["pending", "app", "todos", "question", "high"]);
  assert.strictEqual(rent.data.text, "“Pay rent” was due on Thu 26 Nov. Do it today, or give it a new day?");
  assert.ok(plan.create[1].data.text.startsWith("Ali was to pay back Rs 5,000"), plan.create[1].data.text);
  assert.strictEqual(plan.create[1].data.priority, "high", "more than a week late");
  // run again with what it made: nothing more today (the cap), and nothing made twice
  const made = plan.create.map((x) => N(x.id, x.data));
  const again = c.planNudges(nudgeWorld({ nudges: made }), now + 3600000, plain);
  assert.deepStrictEqual(again.create, [], "the cap holds across checks");
  assert.deepStrictEqual(again.resolve, []);
  // a cap of two
  assert.strictEqual(c.planNudges(nudgeWorld(), now, Object.assign({}, plain, { cap: 2 })).create.length, 2);
  // switched off: nothing made; a category off: none of those
  assert.strictEqual(c.planNudges(nudgeWorld(), now, Object.assign({}, plain, { on: false })).create.length, 0);
  const noTodos = c.planNudges(nudgeWorld(), now, Object.assign({}, plain, { categories: Object.assign({}, plain.categories, { todos: false }) }));
  assert.ok(noTodos.create.every((x) => x.data.category !== "todos") && noTodos.create.length === 4, JSON.stringify(noTodos.create.map((x) => x.data.key)));
});

ok("nudges: never two about the same record, never the same words twice, never one already made (whatever became of it)", () => {
  const now = at("2026-11-28", "07:00");
  const big = Object.assign({}, plain, { cap: 4 });
  // the assistant is already bringing up the rent and the gift
  const mine = N("ndg_mine", { text: "Rent!", created_by: "assistant", related_ids: ["t1", "t4"], due_at: at("2026-11-28", "12:00") });
  const plan = c.planNudges(nudgeWorld({ nudges: [mine] }), now, big);
  const keys = plan.create.map((x) => x.data.key);
  assert.ok(!keys.includes("todo-overdue:t1:2026-11-26"), "not about the rent again");
  // one dismissed last week with the same words as the loan's; one made before for the bank (done)
  const loanText = c.nudgeCandidates(nudgeWorld(), now).find((x) => x.key.startsWith("owed:")).text;
  const before = [N("ndg_old", { text: loanText.toUpperCase(), status: "dismissed", due_at: at("2026-11-21", "10:00") }), N(c.nudgeId("todo-overdue:t2:2026-11-25"), { text: "x", status: "done", due_at: at("2026-11-27", "10:00") })];
  const p2 = c.planNudges(nudgeWorld({ nudges: before }), now, big);
  const k2 = p2.create.map((x) => x.data.key);
  assert.ok(!k2.includes("owed:o1:2026-11-20"), "the same words (in another case) came up this month");
  assert.ok(!k2.includes("todo-overdue:t2:2026-11-25"), "done once is never made again");
  assert.ok(k2.includes("todo-overdue:t3:2026-11-27"), "so the next late to-do gets its place");
  // the day's list leaves out the to-do already brought up
  const gift = N("ndg_gift", { text: "The gift", created_by: "assistant", related_ids: ["t4"], due_at: at("2026-11-28", "12:00") });
  const w = nudgeWorld({ nudges: [gift] });
  w.records.push({ id: "t6", kind: "todo", data: { title: "Post the letter", due: "2026-11-28", done: false }, deleted: 0 });
  const p3 = c.planNudges(w, now, Object.assign({}, plain, { categories: { todos: true, events: false, dates: false, money: false, hisaab: false, loans: false, assistant: true } }));
  const today = p3.create.find((x) => x.data.key === "todos-today:2026-11-28");
  assert.deepStrictEqual(today && today.data.related_ids, ["t6"], JSON.stringify(p3.create.map((x) => x.data.key)));
  assert.strictEqual(c.nudgeDuplicate({ text: "Rent!", related_ids: [] }, [mine], now), 'the same nudge came up already: "Rent!"');
  assert.match(c.nudgeDuplicate({ text: "Something else", related_ids: ["t4"] }, [mine], now), /already a nudge about that/);
  assert.strictEqual(c.nudgeDuplicate({ text: "Something else", related_ids: ["t4"] }, [mine], now, "ndg_mine"), "", "not a repeat of itself");
  assert.strictEqual(c.nudgeDuplicate({ text: "Something else", related_ids: ["t4"] }, [N("x", { text: "y", status: "done", related_ids: ["t4"], due_at: now })], now), "", "a done one doesn't block");
});

ok("nudges: quiet hours move a new one, and a moved one counts on the day it comes up", () => {
  const evening = Object.assign({}, plain, { quiet: { from: "19:00", to: "21:00" }, categories: { todos: false, events: true, dates: false, money: false, hisaab: false, loans: false, assistant: false } });
  const p = c.planNudges(nudgeWorld(), at("2026-11-28", "07:00"), evening);
  assert.strictEqual(p.create[0].data.key, "event:e1:2026-11-29");
  assert.strictEqual(p.create[0].data.due_at, at("2026-11-28", "21:00"), "the evening before, after quiet hours");
  // opened at 23:30: it comes up the next morning, and that day's cap counts it
  const late = c.planNudges(nudgeWorld(), at("2026-11-28", "23:30"), plain);
  assert.ok(late.create.length && late.create.every((x) => x.data.due_at === at("2026-11-29", "08:00")), JSON.stringify(late.create.map((x) => x.data.due_at)));
  const full = [1, 2, 3, 4].map((i) => N(`ndg_x${i}`, { text: `x${i}`, due_at: at("2026-11-29", "12:00") }));
  assert.strictEqual(c.planNudges(nudgeWorld({ nudges: full }), at("2026-11-28", "23:30"), plain).create.length, 0, "tomorrow is full already");
});

ok("nudges: one whose reason has gone ends by itself; not knowing isn't a reason", () => {
  const now = at("2026-11-28", "09:00");
  const w = nudgeWorld();
  const rentKey = "todo-overdue:t1:2026-11-26";
  const app = N(c.nudgeId(rentKey), { text: "rent", key: rentKey, related_ids: ["t1"], due_at: now });
  const asst = N("ndg_a", { text: "fix it", created_by: "assistant", related_ids: ["t3"], due_at: now });
  const unknown = N("ndg_u", { text: "?", created_by: "assistant", related_ids: ["not_synced_yet"], due_at: now });
  const snoozed = N("ndg_s", { text: "later", created_by: "assistant", status: "snoozed", snooze_until: now + 1, related_ids: ["t5"], due_at: now });
  w.nudges = [app, asst, unknown, snoozed];
  w.records.find((r) => r.id === "t1").data.done = true; // rent paid
  w.records = w.records.filter((r) => r.id !== "t3"); // the tap's to-do deleted
  const byId = new Map(w.records.map((r) => [r.id, r]));
  byId.set("t3", { id: "t3", kind: "todo", data: { title: "Fix the tap" }, deleted: 1 });
  w.get = (id) => byId.get(id);
  const plan = c.planNudges(w, now, plain);
  assert.deepStrictEqual(plan.resolve.map((r) => r.id).sort(), [app.id, "ndg_a", "ndg_s"].sort());
  const r0 = plan.resolve.find((r) => r.id === app.id).data;
  assert.deepStrictEqual([r0.status, r0.resolved, r0.done_at, r0.snooze_until], ["done", true, now, null]);
  assert.strictEqual(c.nudgeEndWord({ data: r0 }), "No longer needed");
  assert.ok(!plan.create.some((x) => x.data.key === rentKey));
  // switched off, it still tidies up
  assert.strictEqual(c.planNudges(w, now, Object.assign({}, plain, { on: false })).resolve.length, 3);
});

ok("nudges: notifications at their time, out of quiet hours, never more than the cap a day, each once", () => {
  const now = at("2026-11-28", "07:00");
  const list = [
    N("a", { text: "a", due_at: at("2026-11-28", "09:00"), priority: "low" }),
    N("b", { text: "b", due_at: at("2026-11-28", "09:00"), priority: "high" }),
    N("c", { text: "c", due_at: at("2026-11-28", "23:00") }), // quiet: tomorrow 08:00
    N("d", { text: "d", due_at: at("2026-11-28", "06:30") }), // late, in quiet hours: at 08:00
    N("e", { text: "e", due_at: at("2026-11-27", "12:00") }), // nineteen hours late: stays in the app
    N("f", { text: "f", due_at: at("2026-11-28", "10:00"), status: "seen" }),
    N("g", { text: "g", due_at: at("2026-11-28", "10:00"), status: "snoozed", snooze_until: at("2026-11-28", "15:00") }),
    N("h", { text: "h", due_at: at("2026-11-28", "11:00"), category: "money" }),
    N("i", { text: "your password: hunter2x", due_at: at("2026-11-28", "16:00"), created_by: "assistant" }),
  ];
  const off = Object.assign({}, plain, { categories: Object.assign({}, plain.categories, { money: false }) });
  const alerts = c.nudgeAlerts(list, now, off, {});
  assert.deepStrictEqual(
    alerts.map((x) => [x.id, x.at]),
    [
      ["d", at("2026-11-28", "08:00")],
      ["b", at("2026-11-28", "09:00")],
      ["a", at("2026-11-28", "09:00")],
      ["g", at("2026-11-28", "15:00")],
      ["c", at("2026-11-29", "08:00")],
    ],
    "the day's four (late one first, then by time and priority), the night one tomorrow"
  );
  assert.strictEqual(alerts[0].late, true);
  assert.strictEqual(alerts.find((x) => x.id === "g").key, `g:${at("2026-11-28", "15:00")}`, "a snooze rings again as its own alert");
  // what this device already rang today counts: two rung, room for two more
  const sent = { "z:1": at("2026-11-28", "06:00"), "y:2": at("2026-11-28", "06:30"), [`b:${at("2026-11-28", "09:00")}`]: at("2026-11-28", "09:00") };
  const later = c.nudgeAlerts(list, at("2026-11-28", "06:45"), off, sent);
  assert.deepStrictEqual(later.filter((x) => c.isoDate(new Date(x.at)) === "2026-11-28").map((x) => x.id), ["d", "b"], "two rung + two = the cap (b was scheduled, not rung yet)");
  // rung already: not again
  const after = c.nudgeAlerts(list, at("2026-11-28", "09:30"), off, { [`b:${at("2026-11-28", "09:00")}`]: at("2026-11-28", "09:00") });
  assert.ok(!after.some((x) => x.id === "b"));
  assert.strictEqual(c.nudgeAlerts(list, now, Object.assign({}, plain, { notify: false })).length, 0);
  const big = c.nudgeAlerts(list, now, Object.assign({}, plain, { cap: 4, quiet: null }));
  assert.ok(big.every((x) => !x.body.includes("hunter2x")) && (big.find((x) => x.id === "i") || { body: "[hidden]" }).body.includes("[hidden]"));
  assert.deepStrictEqual(Object.keys(c.pruneSent({ old: now - 5 * 86400000, new: now - 3600000 }, now)), ["new"]);
});

ok("nudges: what's due now, what's later, what's past; done, snoozed and dismissed", () => {
  const now = at("2026-11-28", "12:00");
  const list = [
    N("late", { text: "1", due_at: at("2026-11-28", "09:00"), priority: "low" }),
    N("high", { text: "2", due_at: at("2026-11-28", "11:00"), priority: "high" }),
    N("soon", { text: "3", due_at: at("2026-11-28", "18:00") }),
    N("snz", { text: "4", due_at: at("2026-11-28", "08:00"), status: "snoozed", snooze_until: at("2026-11-28", "13:00") }),
    N("gone", { text: "5", due_at: at("2026-11-27", "08:00"), status: "dismissed", done_at: 5 }),
    N("off", { text: "6", due_at: at("2026-11-28", "08:00"), category: "money" }),
  ];
  const off = Object.assign({}, plain, { categories: Object.assign({}, plain.categories, { money: false }) });
  assert.deepStrictEqual(c.dueNudges(list, now, off).map((n) => n.id), ["high", "late"]);
  assert.deepStrictEqual(c.laterNudges(list, now, off).map((n) => n.id), ["snz", "soon"]);
  assert.deepStrictEqual(c.pastNudges(list).map((n) => n.id), ["gone"]);
  const t = c.snoozeTimes(now, plain);
  assert.deepStrictEqual([t.hour, t.tomorrow], [at("2026-11-28", "13:00"), at("2026-11-29", "09:00")]);
  assert.strictEqual(c.snoozeTimes(at("2026-11-28", "21:30"), plain).hour, at("2026-11-29", "08:00"), "an hour later is quiet hours: the morning");
  const d = list[0].data;
  assert.strictEqual(c.nudgeAfter(d, "seen", now).status, "seen");
  assert.deepStrictEqual([c.nudgeAfter(d, "done", now).status, c.nudgeAfter(d, "done", now).done_at], ["done", now]);
  assert.strictEqual(c.nudgeAfter(d, "dismiss", now).status, "dismissed");
  assert.deepStrictEqual([c.nudgeAfter(d, { snooze: t.hour }, now).status, c.nudgeAfter(d, { snooze: t.hour }, now).snooze_until], ["snoozed", t.hour]);
  assert.strictEqual(c.nudgeAfter(c.nudgeAfter(d, "done", now), "seen", now).status, "done", "seeing a done one changes nothing");
});

ok("nudges: no password, PIN or key in one", () => {
  assert.strictEqual(c.hideSecrets("wifi password: hunter22"), "wifi password: [hidden]");
  assert.strictEqual(c.hideSecrets("My PIN is 4471, call the bank"), "My PIN is [hidden], call the bank");
  assert.strictEqual(c.hideSecrets("key ghp_abcdefghijklmnopqrstuvwxyz0123456789 here"), "key [hidden] here");
  assert.strictEqual(c.hideSecrets("sk-abcdefghijklmnopqrstuvwxyz123456"), "[hidden]");
  assert.strictEqual(c.hideSecrets("Call Sara about the passport"), "Call Sara about the passport", "ordinary words stay");
});

ok("nudges: the assistant can propose one, and it's cleaned like the rest", () => {
  const recs = { t1: { kind: "todo", data: { title: "Pay rent" } } };
  const ctx = { today: "2026-11-28", get: (id) => recs[id] || null };
  const r = c.cleanChange({ op: "create", kind: "nudge", data: { text: "Rent, PIN is 1234", kind: "question", date: "2026-11-29", time: "18:00", related_ids: ["t1", "nope", "t1"], priority: "high" } }, ctx);
  assert.ok(r.change, JSON.stringify(r));
  assert.deepStrictEqual(r.change.data.related_ids, ["t1"]);
  assert.strictEqual(r.change.data.text, "Rent, PIN is [hidden]");
  const d = c.newRecordData(r.change, { currency: "PKR", today: "2026-11-28" });
  assert.deepStrictEqual(
    [d.status, d.created_by, d.category, d.kind, d.priority, d.due_at, d.date, d.time],
    ["pending", "assistant", "assistant", "question", "high", at("2026-11-29", "18:00"), undefined, undefined]
  );
  assert.strictEqual(c.newRecordData({ op: "create", kind: "nudge", data: { text: "x" } }, { currency: "PKR", today: "2026-11-28" }).due_at, at("2026-11-28", "09:00"), "no day or time: this morning");
  assert.match(c.cleanChange({ op: "create", kind: "nudge", data: { date: "2026-11-29" } }, ctx).error, /needs text/);
  const moved = c.updatedRecordData("nudge", Object.assign({}, d, { status: "snoozed", snooze_until: 5 }), { date: "2026-11-30" });
  assert.deepStrictEqual([moved.due_at, moved.status, moved.snooze_until], [at("2026-11-30", "18:00"), "pending", null]);
  assert.strictEqual(c.updatedRecordData("nudge", d, { status: "done" }).status, "done");
  assert.deepStrictEqual(c.describeRecord("nudge", d, { today: "2026-11-28" }), { title: "Rent, PIN is [hidden]", detail: "A question · Tomorrow at 6pm" });
  assert.ok(c.describeKinds().includes("nudge: text* (text), kind (message|reminder|question)"), c.describeKinds().split("\n").find((l) => l.startsWith("nudge")));
});

ok("memories: the ones that matter to what's asked first, then the newest", () => {
  const m = (id, text, extra, updated) => ({ id, data: Object.assign({ text }, extra || {}), updated_at: updated || 0 });
  const list = [m("m1", "Likes tea", { topic: "food" }, 5), m("m2", "The plumber is Rashid", { topic: "home" }, 1), m("m3", "Sara's shoe size is 38", { related_ids: ["p1"] }, 2), m("m4", "Works from home on Fridays", { topic: "work", date: "2026-11-20" }, 3)];
  assert.deepStrictEqual(c.rankMemories(list, { query: "when is the plumber coming?", today: "2027-01-01" }, 2).map((x) => x.id), ["m2", "m1"]);
  assert.deepStrictEqual(c.rankMemories(list, { query: "a gift for my wife", related: ["p1"] }, 1).map((x) => x.id), ["m3"]);
  assert.deepStrictEqual(c.rankMemories(list, { query: "what about work", today: "2026-11-28" }, 1).map((x) => x.id), ["m4"], "its topic named");
  assert.deepStrictEqual(c.rankMemories(list, { today: "2027-01-01" }, 4).map((x) => x.id), ["m1", "m4", "m3", "m2"], "nothing asked: newest first");
  assert.deepStrictEqual(c.rankMemories(list, { today: "2026-11-28" }, 1).map((x) => x.id), ["m4"], "said lately counts a little");
});
console.log(`core: ${n} checks passed`);
