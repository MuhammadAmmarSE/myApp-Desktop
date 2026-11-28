// A Redline server for the desktop tests: the real myapp-backend (from REDLINE_BACKEND_DIR, by
// default ../myapp-backend) on a test database, with stand-ins for DeepSeek and ElevenLabs, so
// nothing leaves this machine. It answers Capture with a fixed set of things to save, and the assistant with a
// short script: a harmless command, then one that needs your yes, then an answer (or, asked to
// tell "my website session" something, sends it to that saved Claude session). Anything heard
// through the (fake) microphone is written down as "Read me something short".
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
  REDLINE_UPLOADS_DIR: path.join(work, "uploads"),
  REDLINE_PUBLIC_IP: "203.0.113.7",
  ELEVENLABS_API_KEY: "stand-in-eleven-key",
  // Claude Code's command line: the backend's stand-in (it says a message was delivered, and a few
  // seconds later reports back to the address the message gave, as Claude is asked to)
  CLAUDE_BIN: path.join(backend, "test", "fixtures", "bin", "claude"),
  FAKE_CLAUDE_LOG: path.join(work, "claude.log"),
  FAKE_CLAUDE_REPORT: "done",
  FAKE_CLAUDE_REPORT_MS: "6000",
  // the shop session's turns, for the to and fro (written below)
  FAKE_CLAUDE_PLAN: path.join(work, "claude-plan.json"),
  // where Claude reports back to (on a real server, its public https address)
  REDLINE_PUBLIC_URL: `http://127.0.0.1:${port}`,
});

fs.writeFileSync(
  process.env.FAKE_CLAUDE_PLAN,
  JSON.stringify({
    session_01ShopAbcd: [
      { expect: "checkout page", reports: [{ status: "needs_you", summary: "Checkout is built and the tests pass. May I push it to main?", after_ms: 1500 }] },
      { expect: "^Yes, push it to main\\.$", reports: [{ status: "needs_you", summary: "Pushed to main. May I delete the old branch feature/cart?", after_ms: 1500 }] },
      { expect: "open a pull request", reports: [{ status: "done", summary: "Kept feature/cart and opened a pull request for the cleanup.", pull_request: "https://github.com/example/shop/pull/12", after_ms: 1500 }] },
    ],
  })
);

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (n) => iso(new Date(Date.now() + n * 86400000));

// ---- DeepSeek stand-in
const call = (name, args) => ({ id: `c${Math.random().toString(36).slice(2, 8)}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
function operatorTurn(body) {
  const msgs = body.messages || [];
  const steps = msgs.filter((m) => m.role === "assistant").length;
  const first = (msgs.find((m) => m.role === "user") || {}).content;
  const text = Array.isArray(first) ? first.map((p) => p.text || "").join(" ") : String(first || "");
  // a file: says what's in it (the first line of its text), so the scenario knows it arrived
  const file = /\[File “([^”]+)”[^\n]*\n"""\n([^\n]*)/.exec(text);
  if (file) return { content: `I read ${file[1]}. It says: ${file[2]}` };
  if (/photo/i.test(text) || Array.isArray(first)) return { content: "I can see the photo you sent." };
  // what the fake microphone "said" (the ElevenLabs stand-in writes it down as this)
  if (/read me something short/i.test(text)) return { content: "Here is something short: the kettle is on." };
  // what the newest message is: a note from the app about Claude's reports, or a tool's result
  const newest = msgs[msgs.length - 1] || {};
  const note = newest.role === "user" && /^\(From the app, not typed by the owner\) Reports from/.test(String(newest.content || "")) ? newest.content : "";
  const result = newest.role === "tool" ? String(newest.content || "") : "";
  // "tell my website session to …": sends it to the saved Claude session called website; its
  // report wakes the chat, which says so
  if (/website session/i.test(text)) {
    if (steps === 0) return { tool_calls: [call("claude_send", { session: "website", message: "Add a contact page to the site, then commit and push." })] };
    if (/“website” finished/.test(note)) return { content: "Claude finished: the contact page is in pull request 7." };
    return { content: "Sent it to your website session. Claude's answer will be in the session." };
  }
  // "have my shop session …": the to and fro. Claude asks to push (it drafts yes: you approve), asks
  // to delete a branch (it drafts yes: you say no and what instead, so it drafts that), then finishes
  if (/shop session/i.test(text)) {
    if (steps === 0) return { tool_calls: [call("claude_send", { session: "shop", message: "In o/shop build the checkout page, run the tests, and push to main when they pass." })] };
    if (result && /"not_done":true/.test(result) && /open a pull request/.test(result))
      return { tool_calls: [call("claude_send", { session: "shop", message: "Don't delete feature/cart; open a pull request for the cleanup instead.", why: "You said to keep the branch and open a pull request." })] };
    if (result && /"answered":true/.test(result)) return { content: "Told Claude." };
    if (/May I push it to main\?/.test(note)) return { tool_calls: [call("claude_send", { session: "shop", message: "Yes, push it to main.", why: "You asked for checkout to go to main once the tests pass." })] };
    if (/May I delete the old branch/.test(note)) return { tool_calls: [call("claude_send", { session: "shop", message: "Yes, delete feature/cart." })] };
    if (/“shop” finished/.test(note)) return { content: "Claude kept feature/cart and opened pull request 12." };
    return { content: "Sent it to your shop session; it will report back here." };
  }
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
  // "doodh aur anday", said out loud: read back with a question; "aur chai bhi" said about it adds tea
  const sys = String((body.messages && body.messages[0] && body.messages[0].content) || "");
  if (/They said this out loud/.test(sys) && /doodh aur anday/i.test(text)) {
    const tea = /aur chai bhi/.test(text);
    return {
      summary: tea ? "Doodh, anday aur chai aaj ki list mein." : "Doodh aur anday aaj ki list mein.",
      speak: tea ? "Doodh, anday aur chai, aaj ki list mein. Save kar doon?" : "Doodh aur anday, aaj ki list mein. Save kar doon?",
      speak_done: "Ho gaya.",
      actions: ["Doodh", "Anday"].concat(tea ? ["Chai"] : []).map((name) => ({ type: "item", name, list: "grocery", mode: "store", today: true })),
    };
  }
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
  // "loan installment …": spending out of the Loan pot, money moved into it, and a new pot (the pots'
  // ids are in what the app sent, as the real AI sees them)
  if (/installment/i.test(text)) {
    const sys = String((body.messages && body.messages[0] && body.messages[0].content) || "");
    const potId = (name) => (sys.match(new RegExp(`id ([\\w-]+) = ${name} \\(`)) || [])[1];
    return {
      summary: "The loan installment from the Loan pot, 5,000 moved into it, and a pot for the wedding.",
      actions: [
        { type: "money", money_type: "expense", amount: 20000, category: "Loans & debt", note: "Loan installment", date: day(0), pot: potId("Loan") },
        { type: "pot_move", from: potId("Personal"), to: potId("Loan"), amount: 5000, date: day(0) },
        { type: "pot", name: "Wedding", pot_type: "save", target: 500000, rule: { kind: "percent", value: 10 } },
      ],
    };
  }
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

// ElevenLabs stand-in: two voices, and a short tone for anything read aloud; what was read, in
// which voice, goes to voice.log in the work folder for the tests to check
const TONE = fs.readFileSync(path.join(__dirname, "tone.mp3"));
const eleven = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const json = (o) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(o));
    if (req.headers["xi-api-key"] !== "stand-in-eleven-key") return res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ detail: { code: "invalid_api_key", message: "no" } }));
    if (req.url.startsWith("/v2/voices"))
      return json({
        voices: [
          { voice_id: "VoiceCalmCalmCalm001", name: "Calm one", category: "premade", labels: { gender: "female", accent: "british" }, preview_url: "" },
          { voice_id: "VoiceWarmWarmWarm002", name: "Warm one", category: "premade", labels: { gender: "male", accent: "american" }, preview_url: "" },
        ],
        has_more: false,
      });
    if (req.url.startsWith("/v1/user/subscription")) return json({ tier: "starter", character_count: 1200, character_limit: 30000 });
    // listening: whatever was recorded is "Read me something short"; what came, and as what, is logged
    if (req.url.startsWith("/v1/speech-to-text")) {
      const body = Buffer.concat(chunks);
      const type = (/Content-Type: (audio\/[\w.+-]+)/.exec(body.toString("latin1")) || [])[1] || "?";
      fs.appendFileSync(path.join(work, "voice.log"), `listen ${type} ${body.length}\n`);
      // a scenario can say what's "heard" next, one line each time (says.txt in the work folder)
      const says = path.join(work, "says.txt");
      let text = "Read me something short";
      if (fs.existsSync(says)) {
        const lines = fs.readFileSync(says, "utf8").split("\n").filter(Boolean);
        if (lines.length) {
          text = lines.shift();
          fs.writeFileSync(says, lines.join("\n"));
        }
      }
      return json({ text, language_code: "eng", audio_duration_secs: 2.4 });
    }
    const m = /^\/v1\/text-to-speech\/([^/?]+)/.exec(req.url);
    if (m) {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      fs.appendFileSync(path.join(work, "voice.log"), `speak ${m[1]} ${body.text}\n`);
      return res.writeHead(200, { "Content-Type": "audio/mpeg" }).end(TONE);
    }
    res.writeHead(404).end();
  });
});

(async () => {
  await new Promise((r) => standIn.listen(0, "127.0.0.1", r));
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${standIn.address().port}`;
  await new Promise((r) => eleven.listen(0, "127.0.0.1", r));
  process.env.ELEVENLABS_BASE_URL = `http://127.0.0.1:${eleven.address().port}`;
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
