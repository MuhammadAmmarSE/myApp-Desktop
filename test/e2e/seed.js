// Sample records for the desktop tests and screenshots: a believable few weeks of someone's
// to-dos, lists, notes, money, dates, car and things, dated around today. Every name, number and
// place is made up.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DAY = 86400000;

function seedRecords(now = Date.now()) {
  const at = (n) => iso(new Date(now + n * DAY));
  const today = new Date(now);
  const month = (n) => {
    const d = new Date(today.getFullYear(), today.getMonth() + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  };
  let n = 0;
  const out = [];
  const add = (kind, data, ageDays = 0) => {
    n += 1;
    const id = `seed${kind.replace("_", "")}${String(n).padStart(4, "0")}`;
    const t = now - ageDays * DAY - n * 1000;
    out.push({ id, kind, data, created_at: t, updated_at: t, deleted: 0 });
    return id;
  };

  // people and their days
  const alex = add("person", { name: "Alex Morgan", relation: "friend", phone: "+10000000001", notes: "Met at the running club.", details: [{ label: "Coffee", value: "Flat white, no sugar" }, { label: "Shirt size", value: "M" }] });
  const jamie = add("person", { name: "Jamie", relation: "sibling", phone: "+10000000002", details: [{ label: "Likes", value: "Board games" }] });
  const mum = add("person", { name: "Mum", relation: "parent", notes: "Prefers a call in the evening." });
  add("person", { name: "Robin Lee", relation: "work", notes: "Design lead." });
  const in9 = new Date(now + 9 * DAY);
  const in24 = new Date(now + 24 * DAY);
  add("date", { title: "Jamie's birthday", kind: "birthday", month: in9.getMonth() + 1, day: in9.getDate(), year: 1994, person_id: jamie, remind: [7, 1, 0] });
  add("date", { title: "Mum and Dad's anniversary", kind: "anniversary", month: in24.getMonth() + 1, day: in24.getDate(), year: 1988, person_id: mum, remind: [7, 0] });
  add("date", { title: "Alex's birthday", kind: "birthday", month: 3, day: 14, year: null, person_id: alex, remind: [1] });

  // to-dos
  add("todo", { title: "Renew the gym membership", due: at(-2), done: false, priority: "high", tags: ["home"] }, 5);
  add("todo", { title: "Send the quarterly report", due: at(0), time: "15:00", done: false, priority: "high", tags: ["work"] }, 3);
  add("todo", { title: "Book a table for Friday", due: at(0), done: false, tags: ["family"] }, 2);
  add("todo", { title: "Water the plants", due: at(0), done: false, repeat: "weekly", tags: ["home"] }, 9);
  add("todo", { title: "Call the plumber about the leak", due: at(1), time: "10:00", done: false, tags: ["home"] }, 1);
  add("todo", { title: "Review the design draft", due: at(3), done: false, tags: ["work"] }, 1);
  add("todo", { title: "Pick a gift for Jamie", due: at(6), done: false, tags: ["family"] }, 1);
  add("todo", { title: "Read the new book", done: false }, 12);
  add("todo", { title: "Pay the internet bill", due: at(-1), done: true, done_at: now - DAY }, 6);
  add("todo", { title: "Return the library books", due: at(-3), done: true, done_at: now - 3 * DAY }, 8);

  // lists
  for (const [name, today2, mode, list, regular] of [
    ["Milk", true, "store", "grocery", true],
    ["Eggs", true, "store", "grocery", true],
    ["Tomatoes", true, "store", "grocery", false],
    ["Olive oil", false, "store", "grocery", false],
    ["Phone case", false, "online", "shopping", false],
    ["Running shoes", false, "online", "shopping", false],
    ["Light bulbs", false, "store", "shopping", false],
  ]) add("item", { name, list, mode, today: today2, done: false, regular });
  add("item", { name: "Bread", list: "grocery", mode: "store", today: true, done: true, done_at: now - 2 * DAY, price: 250, regular: true }, 3);

  // notes and saved text
  add("note", { title: "Trip packing", body: "## Packing\n\n- [x] Passport\n- [ ] Charger\n- [ ] Rain jacket\n\nFlight leaves at **7:40**.", pinned: true, tags: ["travel"] }, 4);
  add("note", { title: "Ideas for the garden", body: "Herbs by the window, a small bench, and lights along the fence.", tags: ["home"] }, 10);
  add("note", { title: "Meeting notes", body: "1. Ship the beta next week\n2. Ask for feedback\n\n> Keep it simple.", tags: ["work"] }, 2);
  add("clip", { title: "Home address", text: "12 Example Street, Sample Town", tags: ["home"], uses: 6 });
  add("clip", { title: "Wi-Fi", text: "network: Home-5G  password: not-a-real-one", tags: ["home"], uses: 3 });
  add("clip", { title: "Deploy", text: "git pull && npm ci && pm2 restart all", tags: ["work"], uses: 9 });

  // money: this month and the last two
  const spend = [
    ["Groceries", 4200, -1], ["Fuel", 6500, -2], ["Eating out", 2800, -4], ["Bills", 9000, -6], ["Groceries", 3600, -8],
    ["Transport", 900, -10], ["Health", 1500, -12], ["Shopping", 5400, -14], ["Groceries", 3900, -20], ["Bills", 9000, -36],
    ["Fuel", 6200, -33], ["Eating out", 3100, -40], ["Groceries", 4100, -45], ["Shopping", 7200, -50], ["Groceries", 3800, -62],
  ];
  for (const [category, amount, d] of spend) if (new Date(now + d * DAY) <= today) add("money", { type: "expense", amount, currency: "PKR", category, note: category, date: at(d), account: "card" }, -d);
  const m0 = month(0);
  const m1 = month(-1);
  add("money", { type: "income", amount: 180000, currency: "PKR", category: "Salary", note: "Salary", date: `${m0.y}-${String(m0.m).padStart(2, "0")}-01`, account: "bank", recurring: "monthly" });
  add("money", { type: "income", amount: 180000, currency: "PKR", category: "Salary", note: "Salary", date: `${m1.y}-${String(m1.m).padStart(2, "0")}-01`, account: "bank", recurring: "monthly" });
  add("money", { type: "expense", amount: 25000, currency: "PKR", category: "Rent", note: "Rent", date: `${m0.y}-${String(m0.m).padStart(2, "0")}-05`, account: "bank", recurring: "monthly" });

  // plans
  add("event", { title: "Dentist", date: at(2), time: "16:30", place: "Sample Clinic", remind_min: 60 });
  add("event", { title: "Dinner with Alex", date: at(4), time: "20:00", place: "The usual place", person_id: alex });
  add("event", { title: "Team offsite", date: at(11), note: "Bring the laptop." });
  add("reminder", { text: "Take the bins out", at: now + 5 * 3600000, done: false });

  // car
  const car = add("car", { name: "Corolla", plate: "ABC-123", model: "Toyota Corolla 2020", fuel: "petrol", odometer: 48200 }, 120);
  let odo = 45000;
  for (let i = 8; i >= 1; i -= 1) {
    odo += 380 + (i % 3) * 40;
    add("car_log", { car_id: car, type: "fuel", date: at(-i * 11), amount: 6000 + (i % 3) * 300, odometer: odo, litres: 22 + (i % 2), full: true }, i * 11);
  }
  add("car_log", { car_id: car, type: "service", date: at(-40), title: "Oil change", amount: 8500, odometer: 46100, next_date: at(50), next_km: 51100 }, 40);
  add("car_log", { car_id: car, type: "paper", date: at(-340), title: "Insurance", number: "POL-0001", next_date: at(25), remind: [30, 7, 1] }, 340);
  add("car_log", { car_id: car, type: "paper", date: at(-200), title: "Registration", next_date: at(165), remind: [30, 7] }, 200);

  // things
  add("thing", { name: "Laptop", category: "Laptop", brand: "Sample Book 14", serial: "SN-000-111", bought_on: at(-300), price: 210000, shop: "Tech Store", warranty_until: at(65), remind: [30, 7] }, 300);
  add("thing", { name: "Fridge", category: "Appliance", brand: "Cool 400", bought_on: at(-700), price: 120000, shop: "Home Store", warranty_until: at(400) }, 700);
  add("thing", { name: "Headphones", category: "Electronics", brand: "Quiet 3", bought_on: at(-380), price: 30000, warranty_until: at(-15) }, 380);
  add("thing", { name: "Old phone", category: "Phone", brand: "Pocket 8", bought_on: at(-900), price: 60000, gone: true }, 900);
  return out;
}

module.exports = { seedRecords };
