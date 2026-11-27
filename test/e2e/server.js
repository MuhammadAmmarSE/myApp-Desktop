// A Redline server for the desktop tests: the real myapp-backend (from REDLINE_BACKEND_DIR, by
// default ../myapp-backend) on a test database, with a stand-in for DeepSeek, so nothing leaves
// this machine. It answers Capture with a fixed set of things to save, and the assistant with a
// short script: a harmless command, then one that needs your yes, then an answer.
//   TEST_DB_USER=... TEST_DB_PASSWORD=... node test/e2e/server.js [port] [--seed] [--keep]
// The test database (its name must contain "test") is emptied every time it starts, unless
// --keep is given (a restart in the middle of a test: same database, same account).
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dbName = process.env.TEST_DB_NAME || "redline_desktop_test";
if (!/test/.test(dbName)) {
  console.error("TEST_DB_NAME must contain 'test' (it is emptied).");
  process.exit(1);
}
const backend = path.resolve(process.env.REDLINE_BACKEND_DIR || path.join(__dirname, "../../../myapp-backend"));
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 4100);
// --seed fills the account with sample records (test/e2e/seed.js)
const seed = args.includes("--seed") || process.env.REDLINE_E2E_SEED === "1";
const keep = args.includes("--keep");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "redline-e2e-"));
Object.assign(process.env, {
  REDLINE_DB_HOST: process.env.TEST_DB_HOST || "127.0.0.1",
  REDLINE_DB_USER: process.env.TEST_DB_USER || "redline",
  REDLINE_DB_PASSWORD: process.env.TEST_DB_PASSWORD || "redline-test-pw",
  REDLINE_DB_NAME: dbName,
  DEEPSEEK_API_KEY: "test-key",
  DEEPSEEK_MODEL: "text-model",
  DEEPSEEK_VISION_MODEL: "vision-model",
  REDLINE_OPERATOR: "on",
  REDLINE_WORKDIR: work,
  REDLINE_PUBLIC_IP: "203.0.113.7",
});

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (n) => iso(new Date(Date.now() + n * 86400000));

// ---- DeepSeek stand-in
const call = (name, args) => ({ id: `c${Math.random().toString(36).slice(2, 8)}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
function operatorTurn(body) {
  const msgs = body.messages || [];
  const steps = msgs.filter((m) => m.role === "assistant").length;
  const first = (msgs.find((m) => m.role === "user") || {}).content;
  const text = Array.isArray(first) ? first.map((p) => p.text || "").join(" ") : String(first || "");
  if (/photo/i.test(text) || Array.isArray(first)) return { content: "I can see the photo you sent." };
  // your records: looks up "my brother", then proposes his shoe size and a to-do to save
  if (/brother/i.test(text)) {
    if (steps === 0) return { tool_calls: [call("find_records", { query: "sibling", kinds: ["person"] })] };
    if (steps === 1) {
      const him = JSON.parse([...msgs].reverse().find((m) => m.role === "tool").content).records[0];
      return {
        tool_calls: [
          call("propose_changes", {
            why: `${him.data.name}'s shoe size, and a call`,
            changes: [
              { op: "update", id: him.id, set: { details: (him.data.details || []).concat([{ label: "Shoe size", value: "42" }]) } },
              { op: "create", kind: "todo", data: { title: `Call ${him.data.name}`, due: day(0) } },
            ],
          }),
        ],
      };
    }
    return { content: "Your brother is Jamie. His shoe size and a to-do are on a card for you to save." };
  }
  if (steps === 0) return { content: "Checking first.", tool_calls: [call("run_command", { command: "echo all-good", why: "look before changing anything" })] };
  if (steps === 1) return { tool_calls: [call("run_command", { command: `rm -f ${path.join(work, "scratch.txt")}`, why: "tidy up the scratch file" })] };
  const last = [...msgs].reverse().find((m) => m.role === "tool");
  const said = String((last && last.content) || "");
  return { content: /said no/i.test(said) ? "Understood, I left it as it is." : "Done. **Everything** is tidy:\n\n- checked the server\n- removed the scratch file" };
}
function captureTurn(body) {
  const user = (body.messages || []).filter((m) => m.role === "user").pop();
  const text = String((user && user.content) || "");
  if (/what can you do/i.test(text)) return { summary: "", reply: "I keep your to-dos, lists, plans, money and dates.", assistant: false, actions: [] };
  // "Mother gave me 5000 for groceries: atta and eggs": her money, with what to buy with it
  const given = text.match(/(\w+) gave me (\d+) for (\w+)(?::\s*(.+))?/i);
  if (given)
    return {
      summary: `${given[1]}'s money for ${given[3]}.`,
      actions: [
        { type: "fund", from: given[1], amount: Number(given[2]), purpose: given[3][0].toUpperCase() + given[3].slice(1) },
        ...String(given[4] || "")
          .split(/,| and /)
          .map((x) => x.trim())
          .filter(Boolean)
          .map((name) => ({ type: "item", name: name[0].toUpperCase() + name.slice(1), list: "grocery", mode: "store", today: true, from_fund: "new" })),
      ],
    };
  if (/various load/i.test(text)) return { summary: "What you paid.", actions: [{ type: "money", money_type: "expense", amount: 30000, category: "Other", note: "Paid to various load", date: day(0) }] };
  return {
    summary: "Two things to buy today, a reminder and what you paid.",
    actions: [
      { type: "item", name: "Milk", list: "grocery", mode: "store", today: true },
      { type: "item", name: "Bread", list: "grocery", mode: "store", today: true },
      { type: "reminder", text: "Call the bank", date: day(1), time: "11:00" },
      { type: "money", money_type: "expense", amount: 1200, category: "Fuel", note: "Fuel", date: day(0) },
    ],
  };
}
const standIn = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    const message = body.tools ? Object.assign({ role: "assistant", content: null }, operatorTurn(body)) : { role: "assistant", content: JSON.stringify(captureTurn(body)) };
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message, finish_reason: message.tool_calls ? "tool_calls" : "stop" }], usage: { total_tokens: 100 } }));
  });
});

(async () => {
  await new Promise((r) => standIn.listen(0, "127.0.0.1", r));
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${standIn.address().port}`;
  const req = (m) => require(path.join(backend, "src", m));
  const db = req("db");
  const { hashPassword } = req("auth");
  const { createApp } = req("app");
  const pool = db.getPool();
  const now = Date.now();
  if (keep) await db.ensureSchema();
  else {
    const [tables] = await pool.query("SHOW TABLES");
    for (const t of tables.map((r) => Object.values(r)[0])) await pool.query(`DROP TABLE IF EXISTS \`${t}\``);
    await db.ensureSchema();
  }
  const [made] = keep ? [{ insertId: 0 }] : await pool.query("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)", ["me@example.com", "Sam Example", await hashPassword("correct horse battery"), now]);
  if (seed && !keep) {
    const r = await req("sync").push(made.insertId, require("./seed").seedRecords(now), "seed");
    if (r.rejected.length) throw new Error(`seed rejected: ${JSON.stringify(r.rejected[0])}`);
  }
  const server = createApp().listen(port, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  fs.writeFileSync(path.join(work, "scratch.txt"), "x");
  console.log(`WORKDIR ${work}`);
  console.log(`READY http://127.0.0.1:${port}/api`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
process.on("SIGTERM", () => process.exit(0));
