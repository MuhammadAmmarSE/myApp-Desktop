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
});
console.log(`core: ${n} checks passed`);
