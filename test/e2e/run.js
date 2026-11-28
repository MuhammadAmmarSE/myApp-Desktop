// End-to-end scenarios: the built app (npm run build first) in real Electron, against the real
// server on a test database (test/e2e/server.js), with a stand-in for DeepSeek. Each scenario
// works the screens the way a person would and then checks the server's database, so a pass
// means the change was made, saved on this computer and synced.
//
//   npm run build && npm run e2e            (Linux without a display: xvfb-run -a npm run e2e)
//   E2E_ONLY=capture,todos npm run e2e      just some scenarios (sign-in always runs)
//   E2E_OUT=./e2e-out                       where screenshots of failures go
//
// Needs MariaDB/MySQL with a user that may create the test database (TEST_DB_USER,
// TEST_DB_PASSWORD, TEST_DB_NAME containing "test"), and myapp-backend next to this repo
// (or REDLINE_BACKEND_DIR).
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { _electron } = require("playwright-core");

const ROOT = path.resolve(__dirname, "../..");
const BACKEND = path.resolve(process.env.REDLINE_BACKEND_DIR || path.join(ROOT, "../myapp-backend"));
const PORT = Number(process.env.E2E_PORT || 4310);
const API = `http://127.0.0.1:${PORT}/api`;
const OUT = path.resolve(process.env.E2E_OUT || path.join(os.tmpdir(), "redline-e2e-out"));
const ONLY = process.env.E2E_ONLY ? process.env.E2E_ONLY.split(",") : null;
// what the fake microphone plays: quiet, two seconds of voice-like sound, quiet
const SPEECH = require("./speech").speechWav(path.join(os.tmpdir(), "redline-e2e-speech.wav"));
const EMAIL = "me@example.com";
const PASSWORD = "correct horse battery";
fs.mkdirSync(OUT, { recursive: true });

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (n) => iso(new Date(Date.now() + n * 86400000));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the server
let server = null;
let workdir = "";
function startServer(flags) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, "server.js"), String(PORT), ...flags], { env: { ...process.env, REDLINE_BACKEND_DIR: BACKEND }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    const timer = setTimeout(() => reject(new Error(`server didn't start:\n${log}`)), 30000);
    p.stdout.on("data", (b) => {
      log += b;
      const w = /WORKDIR (\S+)/.exec(log);
      if (w) workdir = w[1];
      if (/READY/.test(log)) {
        clearTimeout(timer);
        resolve(p);
      }
    });
    p.stderr.on("data", (b) => (log += b));
    p.on("exit", (code) => code && reject(new Error(`server exited ${code}:\n${log}`)));
  });
}
const stopServer = async () => {
  if (!server) return;
  const s = server;
  server = null;
  s.kill("SIGTERM");
  await new Promise((r) => s.once("exit", r));
};

// ---- the database
const mysql = require(path.join(BACKEND, "node_modules/mysql2/promise"));
let pool;
const db = () =>
  (pool ||= mysql.createPool({ host: process.env.TEST_DB_HOST || "127.0.0.1", user: process.env.TEST_DB_USER || "redline", password: process.env.TEST_DB_PASSWORD || "redline-test-pw", database: process.env.TEST_DB_NAME || "redline_desktop_test", connectionLimit: 2 }));
async function records(kind) {
  const [rows] = await db().query("SELECT id, data, deleted, updated_at FROM records WHERE kind = ?", [kind]);
  return rows.map((r) => ({ id: r.id, deleted: !!r.deleted, updated_at: Number(r.updated_at), data: typeof r.data === "string" ? JSON.parse(r.data) : r.data }));
}
const live = async (kind) => (await records(kind)).filter((r) => !r.deleted);
async function until(what, fn, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}${last instanceof Error ? `: ${last.message}` : ""}`);
}

// ---- the app
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "redline-e2e-data-"));
let app;
let win;
const errors = [];
async function launch() {
  app = await _electron.launch({
    executablePath: require("electron"),
    // a fake microphone that "says" something (test/e2e/speech.js), and no real one
    args: [path.join(ROOT, "out/main/index.js"), "--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${SPEECH}%noloop`],
    env: { ...process.env, REDLINE_DATA_DIR: dataDir, REDLINE_E2E: "1", REDLINE_API_URL: API },
  });
  // the Quick capture window is made at start too: take the main one
  win = await until("the main window", async () => {
    await app.firstWindow();
    return app.windows().find((w) => !w.url().includes("quick"));
  });
  win.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  win.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text()) && errors.push(`console: ${m.text()}`));
  win.setDefaultTimeout(10000);
  await win.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  await win.waitForLoadState("domcontentloaded");
}
const go = async (to) => {
  await win.evaluate((h) => (location.hash = h), `#${to}`);
  await sleep(500);
};
const dialog = () => win.locator('[role="dialog"]').last();
const saveDialog = async () => {
  await win.keyboard.press("Control+Enter");
  await dialog().waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
};
const field = (label) => dialog().getByLabel(label, { exact: true });
const menuClick = (top, label) =>
  app.evaluate(({ Menu }, [t, l]) => {
    const item = Menu.getApplicationMenu().items.find((i) => i.label === t).submenu.items.find((i) => i.label === l);
    item.click();
  }, [top, label]);

// ---- scenarios
const results = [];
async function scenario(name, fn, always = false) {
  if (ONLY && !always && !ONLY.some((o) => name.toLowerCase().includes(o.toLowerCase()))) return;
  const t0 = Date.now();
  const before = errors.length;
  try {
    await fn();
    if (errors.length > before) throw new Error(errors.slice(before).join("\n"));
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  ✗ ${name}\n      ${String(e.message).split("\n").slice(0, 6).join("\n      ")}`);
    const shot = path.join(OUT, `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
    await win?.screenshot({ path: shot }).catch(() => {});
    console.log(`      screenshot: ${shot}`);
    await win?.keyboard.press("Escape").catch(() => {});
    await win?.keyboard.press("Escape").catch(() => {});
  }
}

(async () => {
  console.log(`Redline desktop end-to-end (server ${API})`);
  server = await startServer(["--seed"]);
  await launch();

  await scenario(
    "sign-in: a wrong password is refused, the right one opens your day",
    async () => {
      await win.getByLabel("Email").fill(EMAIL);
      await win.getByLabel("Password").fill("not my password");
      await win.keyboard.press("Enter");
      await win.getByText("That email and password don't match.").waitFor({ timeout: 8000 });
      await win.getByLabel("Password").fill(PASSWORD);
      await win.keyboard.press("Enter");
      await win.getByTestId("greeting").waitFor({ timeout: 15000 });
      if (!/Sam/.test(await win.getByTestId("greeting").innerText())) throw new Error("greeting doesn't use the name");
    },
    true,
  );

  await scenario("today: the account's records arrive from the server", async () => {
    await win.getByText("Send the quarterly report").first().waitFor({ timeout: 15000 });
    await win.getByText("Dentist").first().waitFor();
    // the sidebar counts what's waiting
    await win.locator("nav").getByText("To-dos").first().click();
    await win.getByTestId("todos").waitFor();
  });

  await scenario("capture: plain words become to-dos, list items, a reminder and money, and only what you keep is saved", async () => {
    const milkBefore = (await live("item")).filter((r) => r.data.name === "Milk").length;
    const breadBefore = (await live("item")).filter((r) => r.data.name === "Bread").length;
    await go("/capture");
    await win.getByLabel("What to capture").fill("Milk and bread on the way home, call the bank tomorrow at 11, paid 1200 for fuel");
    await win.keyboard.press("Control+Enter");
    await win.getByTestId("review").waitFor({ timeout: 15000 });
    const keep = win.getByTestId("review").getByLabel("Keep");
    if ((await keep.count()) !== 4) throw new Error(`expected 4 cards, got ${await keep.count()}`);
    await keep.nth(1).click(); // not the bread
    await win.getByTestId("save-all").click();
    await until("milk on the server", async () => (await live("item")).filter((r) => r.data.name === "Milk").length === milkBefore + 1);
    if ((await live("item")).filter((r) => r.data.name === "Bread").length !== breadBefore) throw new Error("bread was saved though it was unticked");
    const reminder = await until("the reminder", async () => (await live("reminder")).find((r) => r.data.text === "Call the bank"));
    const at = new Date(reminder.data.at);
    if (iso(at) !== day(1) || at.getHours() !== 11) throw new Error(`reminder at ${at}`);
    await until("the fuel expense", async () => (await live("money")).find((r) => r.data.amount === 1200 && r.data.category === "Fuel" && r.data.date === day(0)));
    // the reminder is handed to the main process, which rings it even with the window closed
    await until("the reminder scheduled", async () => {
      const f = path.join(dataDir, "reminders.json");
      if (!fs.existsSync(f)) return false;
      const alerts = JSON.parse(fs.readFileSync(f, "utf8")).alerts || [];
      return alerts.some((a) => /Call the bank/.test(`${a.title} ${a.body}`) && a.at === at.getTime());
    });
  });

  await scenario("to-dos: the quick-add line reads the day, time, tag and priority", async () => {
    await go("/todos?view=upcoming");
    const box = win.getByTestId("quick-add");
    await box.fill("Pay the water bill tomorrow 9am #home !");
    await win.getByTestId("quick-preview").waitFor();
    await box.press("Enter");
    const t = await until("the new to-do", async () => (await live("todo")).find((r) => r.data.title === "Pay the water bill"));
    const d = t.data;
    if (d.due !== day(1) || d.time !== "09:00" || d.priority !== "high" || String(d.tags) !== "home") throw new Error(JSON.stringify(d));
    await win.getByTestId("todo-list").getByText("Pay the water bill").waitFor();
  });

  await scenario("to-dos: select two with Ctrl-click and tick both at once", async () => {
    await go("/todos?view=today");
    const list = win.getByTestId("todo-list");
    const a = list.locator("[data-todo]").filter({ hasText: "Water the plants" });
    const b = list.locator("[data-todo]").filter({ hasText: "Book a table for Friday" });
    // a plain click opens a to-do; Ctrl-click chooses it
    await a.locator("text=Water the plants").click({ modifiers: ["Control"] });
    await b.locator("text=Book a table for Friday").click({ modifiers: ["Control"] });
    await win.getByTestId("bulk-bar").waitFor();
    await win.getByTestId("bulk-bar").getByRole("button", { name: "Tick" }).click();
    await until("both ticked on the server", async () => {
      const all = await live("todo");
      return ["Water the plants", "Book a table for Friday"].every((t) => all.find((r) => r.data.title === t && r.data.done));
    });
  });

  await scenario("to-dos: drag a card on the board to another day", async () => {
    await go("/todos?view=all");
    await win.getByRole("tab", { name: "Board" }).click();
    const board = win.getByTestId("todo-board");
    await board.waitFor();
    const card = board.locator("[data-todo]").filter({ hasText: "Read the new book" });
    await card.dragTo(board.locator('[data-column="tomorrow"]'));
    await until("moved to tomorrow", async () => (await live("todo")).find((r) => r.data.title === "Read the new book" && r.data.due === day(1)));
    await win.getByRole("tab", { name: "List" }).click();
  });

  await scenario("calendar: month, week, day and agenda, a new event, and dragging a to-do to another day", async () => {
    await go("/calendar?view=month");
    await win.getByTestId("calendar").getByText("Dentist").first().waitFor();
    await win.keyboard.press("w");
    await win.getByTestId("timegrid").waitFor();
    await win.keyboard.press("d");
    await win.getByTestId("timegrid").waitFor();
    await win.keyboard.press("a");
    await win.getByTestId("agenda").waitFor();
    await win.getByTestId("agenda").getByText("Dinner with Alex").waitFor();
    await win.keyboard.press("m");
    await win.keyboard.press("n");
    await dialog().getByLabel("Title").fill("Team lunch");
    await saveDialog();
    await until("the event", async () => (await live("event")).find((r) => r.data.title === "Team lunch"));
    // a to-do chip dragged onto another day
    const target = day(4);
    const chip = win.locator('[data-day] [data-item="todo"]').filter({ hasText: "Pick a gift" }).first();
    if (await chip.count()) {
      await chip.dragTo(win.locator(`[data-day="${target}"]`));
      await until("the to-do moved", async () => (await live("todo")).find((r) => r.data.title === "Pick a gift for Jamie" && r.data.due === target));
    } else throw new Error("the to-do isn't on the month grid");
  });

  await scenario("notes: write one, it saves itself, and ticking a box in the preview changes the text", async () => {
    await go("/notes");
    await win.getByTestId("notes").waitFor();
    await win.keyboard.press("n");
    await win.getByTestId("note-title").fill("Holiday list");
    await win.getByTestId("note-body").fill("- [ ] Tickets\n- [ ] Hotel");
    const n = await until("the note", async () => (await live("note")).find((r) => r.data.title === "Holiday list" && r.data.body.includes("Hotel")));
    await win.getByRole("tab", { name: "Read" }).click();
    await win.getByTestId("note-preview").locator('input[type="checkbox"]').first().click();
    await until("ticked in the text", async () => (await live("note")).find((r) => r.id === n.id && r.data.body.startsWith("- [x] Tickets")));
  });

  await scenario("notes: a note saved while offline goes to the AI in one click, and is done once saved", async () => {
    await go("/notes/new");
    // the editor opens in the mode it was last left in
    if (
      !(await win
        .getByTestId("note-title")
        .isVisible()
        .catch(() => false))
    )
      await win.getByRole("tab", { name: "Write" }).click();
    await win.getByTestId("note-title").fill("30k paid to various Load");
    await win.getByTestId("note-body").fill("30k paid to various Load");
    await win.getByLabel("Tags").fill("inbox");
    await win.getByLabel("Tags").press("Tab");
    const note = await until("the inbox note", async () => (await live("note")).find((r) => r.data.title === "30k paid to various Load" && (r.data.tags || []).includes("inbox")));
    await win.getByTestId("note-inbox").getByRole("button", { name: "Send to AI" }).click();
    await win.getByTestId("review").waitFor({ timeout: 15000 });
    await win.getByTestId("save-all").click();
    await until("the expense", async () => (await live("money")).find((r) => r.data.amount === 30000 && r.data.note === "Paid to various load"));
    await until("the note done", async () => !(await live("note")).find((r) => r.id === note.id));
    await win.getByText(/and the note is done/).waitFor();
    // another one that isn't needed any more: from Capture (and Undo brings it back), then from Notes
    await go("/notes/new");
    if (
      !(await win
        .getByTestId("note-title")
        .isVisible()
        .catch(() => false))
    )
      await win.getByRole("tab", { name: "Write" }).click();
    await win.getByTestId("note-title").fill("call the plumber about the tap");
    await win.getByTestId("note-body").fill("call the plumber about the tap");
    await win.getByLabel("Tags").fill("inbox");
    await win.getByLabel("Tags").press("Tab");
    const spare = await until("the second inbox note", async () => (await live("note")).find((r) => r.data.title === "call the plumber about the tap" && (r.data.tags || []).includes("inbox")));
    await win.getByTestId("note-inbox").getByRole("button", { name: "Send to AI" }).click();
    await win.getByTestId("review").waitFor({ timeout: 15000 });
    await win.getByTestId("not-needed").click();
    await until("the note deleted", async () => !(await live("note")).find((r) => r.id === spare.id));
    await win.getByRole("status").filter({ hasText: "Deleted the note" }).getByRole("button", { name: "Undo" }).click();
    await until("the note back", async () => (await live("note")).find((r) => r.id === spare.id));
    await go("/notes");
    await win.getByTestId("inbox-banner").getByTestId("inbox-drop").click();
    await until("deleted from Notes", async () => !(await live("note")).find((r) => r.id === spare.id));
  });

  await scenario("lists: commas add several, and ticking one marks it bought", async () => {
    await go("/lists");
    const add = win.getByLabel("Buy today: new item");
    await add.fill("Apples, Pears");
    await add.press("Enter");
    await until("both items", async () => {
      const items = await live("item");
      return ["Apples", "Pears"].every((n) => items.find((r) => r.data.name === n && r.data.today && r.data.mode === "store"));
    });
    const row = win.locator("[data-item]").filter({ hasText: "Apples" }).first();
    await row.getByRole("checkbox").first().click();
    await until("apples bought", async () => (await live("item")).find((r) => r.data.name === "Apples" && r.data.done));
  });

  await scenario("hisaab: Mother's money from Capture, bought from the list and the page, she pays back the extra, and it stays out of my spending", async () => {
    await go("/capture");
    await win.getByLabel("What to capture").fill("Mother gave me 5000 for groceries: atta and eggs");
    await win.keyboard.press("Control+Enter");
    await win.getByTestId("review").waitFor({ timeout: 15000 });
    await win.getByTestId("review").getByText("Hisaab").first().waitFor();
    await win
      .getByTestId("review")
      .getByText(/with Mother's money/)
      .first()
      .waitFor();
    await win.getByTestId("save-all").click();
    const fund = await until("the hisaab on the server", async () => (await live("fund")).find((r) => r.data.from === "Mother" && r.data.amount === 5000));
    await until("both items on it", async () => (await live("item")).filter((r) => r.data.fund_id === fund.id).length === 2);
    // ticking Atta asks what it cost; it goes on her hisaab
    await go("/lists");
    const row = win.locator("[data-item]").filter({ hasText: "Atta" }).first();
    await row.getByText("Mother's money").waitFor();
    await row.getByRole("checkbox").first().click();
    await dialog().getByText("Bought Atta?").waitFor();
    await dialog().getByLabel("Price paid").fill("1800");
    await saveDialog();
    await until("Atta's cost on the hisaab", async () => (await live("money")).find((r) => r.data.paid_from === fund.id && r.data.amount === 1800));
    // Money lists it apart, not among my own entries
    await go("/money");
    await win
      .getByTestId("held-for-others")
      .getByText(/3,200 left with you/)
      .waitFor();
    if (
      await win
        .getByTestId("money-rows")
        .getByText("Atta")
        .count()
        .catch(() => 0)
    )
      throw new Error("her money is listed as mine");
    await win.getByTestId("held-for-others").getByText("Groceries · from Mother").click();
    await win.getByTestId("fund").waitFor();
    // a purchase on the page takes it over: she owes me 300
    await win.getByTestId("add-purchase").click();
    await dialog().getByLabel("Amount").fill("3000");
    await field("What you bought").fill("Rice and oil");
    await dialog().getByRole("button", { name: "Groceries", exact: true }).click();
    await saveDialog();
    await win.getByTestId("fund-standing").getByText("Rs 200", { exact: true }).waitFor();
    // the eggs, bought from the page with their price: over by 300
    await win.locator("[data-tobuy]").filter({ hasText: "Eggs" }).getByRole("button", { name: "Bought" }).click();
    await dialog().getByLabel("Price paid").fill("500");
    await saveDialog();
    await win
      .getByTestId("fund-standing")
      .getByText(/Mother owes you/)
      .waitFor();
    await win.getByRole("button", { name: "They paid you back" }).click();
    await dialog().getByRole("button", { name: "Paid back" }).click();
    await until("settled on the server", async () => (await live("fund")).find((r) => r.id === fund.id && r.data.closed && (r.data.moves || []).some((m) => m.type === "paid_back" && m.amount === 300)));
    await win.getByTestId("fund-standing").getByText("Settled", { exact: true }).waitFor();
    // the hisaab to send her
    await win.getByTestId("copy-hisaab").click();
    const text = await until("the hisaab copied", async () => {
      const t = await app.evaluate(({ clipboard }) => clipboard.readText());
      return /Hisaab: Groceries, from Mother/.test(t) && t;
    });
    for (const line of ["Atta", "Rice and oil", "Eggs", "Total spent: Rs 5,300", "Spent over: Rs 300", "Paid back to me", "Settled."]) if (!text.includes(line)) throw new Error(`the hisaab doesn't say "${line}":\n${text}`);
  });

  await scenario("hisaab: what you already bought with her money, put on it afterwards (from the hisaab, and from Money); one was yours after all", async () => {
    const spend = async (amount, what) => {
      await go("/money");
      await win.getByRole("button", { name: "Expense" }).click();
      await dialog().getByLabel("Amount").fill(amount);
      await field("What for").fill(what);
      await dialog().getByRole("button", { name: "Groceries", exact: true }).click();
      await saveDialog();
      return until(`${what} on the server`, async () => (await live("money")).find((r) => r.data.note === what && !r.data.paid_from));
    };
    // groceries noted as my own spending, then my sister gives me 5,000 for them
    const bread = await spend("250", "Bread");
    const yogurt = await spend("680", "Yogurt");
    await win.getByRole("button", { name: "Someone gave me money to spend" }).click();
    await dialog().getByLabel("How much they gave").fill("5000");
    await dialog().getByLabel("Who gave it").fill("Sister");
    await dialog().getByRole("button", { name: "Groceries", exact: true }).click();
    await saveDialog();
    const fund = await until("her hisaab on the server", async () => (await live("fund")).find((r) => r.data.from === "Sister" && r.data.amount === 5000));
    await go("/money");
    await win.getByTestId("held-for-others").getByText("Groceries · from Sister").click();
    await win.getByTestId("fund").waitFor();
    // the hisaab offers them; ticking says what will be left
    await win.getByTestId("attach-open").click();
    await dialog().getByRole("checkbox", { name: /^Bread, / }).click();
    await dialog().getByRole("checkbox", { name: /^Yogurt, / }).click();
    await dialog().getByTestId("attach-after").getByText("Rs 930 from Sister's money: leaves Rs 4,070 with you").waitFor();
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "hisaab-attach.png") });
    await dialog().getByRole("button", { name: "Put 2 on Sister's hisaab" }).click();
    await until("both on her hisaab", async () => (await live("money")).filter((r) => r.data.paid_from === fund.id && [bread.id, yogurt.id].includes(r.id)).length === 2);
    await win.getByTestId("fund-standing").getByText("Rs 4,070", { exact: true }).waitFor();
    // milk, from Money: right-click it and put it on her hisaab
    const milk = await spend("300", "Milk");
    await win.getByTestId("money-rows").getByText("Milk").click({ button: "right" });
    await win.getByRole("menuitem", { name: "Put on Sister's hisaab" }).click();
    await until("the milk on her hisaab", async () => (await live("money")).find((r) => r.id === milk.id && r.data.paid_from === fund.id));
    await win.getByTestId("held-for-others").getByText(/3,770 left with you/).waitFor();
    if (await win.getByTestId("money-rows").getByText("Bread").count()) throw new Error("her purchase still listed as mine");
    // the milk was mine after all: off her hisaab, back in my spending
    await win.getByTestId("held-for-others").getByText("Groceries · from Sister").click();
    await win.getByTestId("fund-spends").getByText("Milk").click({ button: "right" });
    await win.getByRole("menuitem", { name: "Make it my own spending" }).click();
    await until("the milk mine again", async () => (await live("money")).find((r) => r.id === milk.id && !r.data.paid_from));
    await win.getByTestId("fund-standing").getByText("Rs 4,070", { exact: true }).waitFor();
  });

  await scenario("one price for several: five vegetables for 1,000 picked with Ctrl-click, one taken back, none, bought again by bank; and on a hisaab", async () => {
    const month = new Date().toISOString().slice(0, 7);
    const spent = async () => (await live("money")).filter((r) => r.data.type === "expense" && !r.data.paid_from && String(r.data.date).startsWith(month)).reduce((n, r) => n + Number(r.data.amount), 0);
    const VEG = ["Tomatoes", "Onions", "Potatoes", "Peas", "Spinach"];
    // the names a purchase's note lists ("Onions, Peas and Tomatoes")
    const named = (note) => String(note || "").split(/, | and /).sort().join("|");
    const before = await spent();
    await go("/lists");
    const add = win.getByLabel("Buy today: new item");
    await add.fill(VEG.join(", "));
    await add.press("Enter");
    const ids = await until("five on today's list", async () => {
      // the newest of each name (an older Tomatoes may be on the list already)
      const items = (await live("item")).filter((r) => VEG.includes(r.data.name) && !r.data.done).sort((a, b) => b.created_at - a.created_at);
      return VEG.every((n) => items.find((r) => r.data.name === n)) && VEG.map((n) => items.find((r) => r.data.name === n).id);
    });
    // pick all five with Ctrl-click, and price them together
    const rowOf = (i) => win.locator(`[data-item="${ids[i]}"]`);
    for (let i = 0; i < 5; i++) await rowOf(i).click({ modifiers: ["Control"] });
    await win.getByTestId("bulk-one-price").click();
    await dialog().getByLabel("What it all cost").fill("1000");
    await dialog().getByTestId("purchase-summary").getByText("5 things for Rs 1,000 · about Rs 200 each").waitFor();
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "purchase.png") });
    await saveDialog();
    const m = await until("one purchase for all five", async () => {
      const all = await live("money");
      const hit = all.find((r) => r.data.amount === 1000 && named(r.data.note) === VEG.slice().sort().join("|"));
      const items = (await live("item")).filter((r) => ids.includes(r.id));
      return hit && items.every((i) => i.data.done && i.data.money_id === hit.id && !i.data.price) && hit;
    });
    if ((await spent()) !== before + 1000) throw new Error(`spent ${before} -> ${await spent()}, not +1000`);
    // Peas weren't bought: only Peas comes back; the 1,000 stays for the other four
    await win.getByRole("button", { name: "Show", exact: true }).click();
    await win.locator("[data-bought]").filter({ hasText: "Peas" }).getByRole("button", { name: "Not bought" }).click();
    await dialog().getByText("It was bought together with 4 other things for Rs 1,000.").waitFor();
    await dialog().getByRole("button", { name: "Only Peas" }).click();
    await until("peas back, the 1,000 kept for four", async () => {
      const peas = (await live("item")).find((r) => r.id === ids[3]);
      const hit = (await live("money")).find((r) => r.id === m.id);
      return peas && !peas.data.done && !peas.data.money_id && hit && hit.data.amount === 1000 && named(hit.data.note) === VEG.filter((n) => n !== "Peas").sort().join("|");
    });
    if ((await spent()) !== before + 1000) throw new Error("taking one back changed what was spent");
    // none of them were: all four back on the list, the 1,000 out of Money
    await win.locator("[data-bought]").filter({ hasText: "Onions" }).getByRole("button", { name: "Not bought" }).click();
    await dialog().getByRole("button", { name: "None of the 4" }).click();
    await until("all back on the list, the purchase gone", async () => {
      const items = (await live("item")).filter((r) => ids.includes(r.id));
      return !(await live("money")).find((r) => r.id === m.id) && items.every((i) => !i.data.done && !i.data.money_id);
    });
    if ((await spent()) !== before) throw new Error("the 1,000 is still counted");
    // bought after all, ticked without a price: one price for them from "bought without a price", by bank
    for (let i = 0; i < 5; i++) await rowOf(i).getByRole("checkbox").first().click();
    await win.getByTestId("unpriced").getByText(/\d+ bought without a price/).waitFor();
    await win.getByTestId("unpriced").click();
    // only the five (anything else bought without a price stays as it is)
    const ticked = dialog().locator('[role="checkbox"][aria-checked="true"]');
    for (const label of await ticked.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))) if (!VEG.includes(label)) await dialog().getByRole("checkbox", { name: label, exact: true }).click();
    if ((await ticked.count()) !== 5) throw new Error(`${await ticked.count()} ticked, not the five`);
    await dialog().getByLabel("What it all cost").fill("800");
    await dialog().getByRole("tab", { name: "Bank" }).click();
    await saveDialog();
    await until("800 by bank for the five", async () => {
      const hit = (await live("money")).find((r) => r.data.amount === 800 && r.data.account === "bank");
      const items = (await live("item")).filter((r) => ids.includes(r.id));
      return hit && items.every((i) => i.data.done && i.data.money_id === hit.id);
    });
    if ((await spent()) !== before + 800) throw new Error("800 not counted once");
    // on a hisaab: my aunt gave 3,000; mangoes, bananas and grapes for 900 of it
    await go("/money");
    await win.getByRole("button", { name: "Someone gave me money to spend" }).click();
    await dialog().getByLabel("How much they gave").fill("3000");
    await dialog().getByLabel("Who gave it").fill("Aunt");
    await dialog().getByRole("button", { name: "Groceries", exact: true }).click();
    await saveDialog();
    const fund = await until("her hisaab", async () => (await live("fund")).find((r) => r.data.from === "Aunt" && r.data.amount === 3000));
    // a new hisaab opens by itself
    await win.getByTestId("fund").waitFor();
    await win.getByLabel("Something to buy").fill("Mangoes, Bananas, Grapes");
    await win.getByLabel("Something to buy").press("Enter");
    await until("three on her list", async () => (await live("item")).filter((r) => r.data.fund_id === fund.id).length === 3);
    await win.getByTestId("fund-one-price").click();
    await dialog().getByRole("button", { name: "Tick all 3" }).click();
    await dialog().getByLabel("What it all cost").fill("900");
    await dialog().getByTestId("purchase-summary").getByText(/Aunt's money: leaves Rs 2,100 with you/).waitFor();
    await saveDialog();
    await win.getByTestId("fund-standing").getByText("Rs 2,100", { exact: true }).waitFor();
    await until("900 on her hisaab, the three bought", async () => {
      const hit = (await live("money")).find((r) => r.data.paid_from === fund.id && r.data.amount === 900);
      return hit && (await live("item")).filter((r) => r.data.fund_id === fund.id).every((i) => i.data.done && i.data.money_id === hit.id);
    });
    await win.getByTestId("fund-spends").getByText("3 things from the list").waitFor();
    if ((await spent()) !== before + 800) throw new Error("her money counted as mine");
  });

  await scenario("pots: an income given jobs, spending out of a pot, money moved and taken back, and pots from Capture", async () => {
    await go("/money");
    const pots = win.getByTestId("pots");
    await pots.getByRole("button", { name: "Make the pot Personal" }).click();
    const personal = await until("Personal on the server", async () => (await live("pot")).find((r) => r.data.name === "Personal" && r.data.type === "spend"));
    // after the first pot the other starters are still offered
    await pots.getByRole("button", { name: "Make the pot Loan" }).click();
    const loan = await until("Loan on the server", async () => (await live("pot")).find((r) => r.data.name === "Loan" && r.data.type === "debt"));
    if (personal.data.color === loan.data.color) throw new Error("two pots share a colour");
    // earned 300,000: 100,000 for personal spending, 100,000 towards the loan, the rest not in a pot
    await win.getByRole("button", { name: "Money in", exact: true }).click();
    await dialog().getByLabel("Amount").fill("300000");
    await dialog().getByRole("button", { name: "Salary", exact: true }).click();
    await dialog().getByLabel("Into Personal").fill("100000");
    await dialog().getByLabel("Into Loan").fill("100000");
    await dialog().getByText("Rs 100,000 not in a pot").waitFor();
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "pots-split.png") });
    await saveDialog();
    await until("the income split on the server", async () =>
      (await live("money")).find((r) => r.data.type === "income" && r.data.amount === 300000 && (r.data.split || []).length === 2 && r.data.split.every((x) => x.amount === 100000)),
    );
    await pots.locator(`[data-pot="${personal.id}"]`).getByText("Rs 100,000").first().waitFor();
    // spending out of Personal
    await win.getByRole("button", { name: "Expense", exact: true }).click();
    await dialog().getByLabel("Amount").fill("25000");
    await dialog().getByRole("button", { name: "Food & dining", exact: true }).click();
    await field("What for").fill("Dinner out");
    await dialog().getByRole("button", { name: /^Personal, Rs 100,000/ }).click();
    await saveDialog();
    await until("the dinner out of Personal", async () => (await live("money")).find((r) => r.data.note === "Dinner out" && r.data.pot_id === personal.id));
    await win.getByTestId("money-rows").locator(`[data-pot-of="${personal.id}"]`).first().waitFor();
    // the next dinner suggests the same pot
    await win.getByRole("button", { name: "Expense", exact: true }).click();
    await dialog().getByRole("button", { name: "Food & dining", exact: true }).click();
    await field("What for").fill("Dinner out");
    await dialog().getByText("Picked from what you did before.").waitFor();
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "pots-picker.png") });
    await win.keyboard.press("Escape");
    await dialog().waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    // the pot's page: move 10,000 to the loan, then take it back
    await pots.locator(`[data-pot="${personal.id}"]`).click();
    await win.getByTestId("pot").waitFor();
    await win.getByTestId("pot-balance").getByText("Rs 75,000").waitFor();
    await win.getByRole("button", { name: /^Move out/ }).click();
    await dialog().getByLabel("Amount").fill("10000");
    await dialog().getByRole("button", { name: /^Loan ·/ }).click();
    await saveDialog();
    await until("the move on the server", async () => (await live("pot")).find((r) => r.id === personal.id && (r.data.moves || []).some((m) => m.dir === "out" && m.other === loan.id && m.amount === 10000)));
    await win.getByTestId("pot-balance").getByText("Rs 65,000").waitFor();
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "pot-page.png") });
    const moved = win.locator('[data-pot-entry="move_out"]').first();
    await moved.hover();
    await moved.getByRole("button", { name: "Take back: To Loan" }).click();
    await until("the move taken back", async () => (await live("pot")).find((r) => r.id === personal.id && !(r.data.moves || []).length));
    await win.getByTestId("pot-balance").getByText("Rs 75,000").waitFor();
    // by words: spending out of a pot, a move, and a new pot with a rule
    await go("/capture");
    await win.getByLabel("What to capture").fill("Loan installment 20000 from the loan pot, move 5000 from personal into it, and start a wedding pot");
    await win.keyboard.press("Control+Enter");
    await win.getByTestId("review").waitFor({ timeout: 15000 });
    await win.getByTestId("review").getByText("Personal → Loan").first().waitFor();
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "pots-capture.png") });
    await win.getByTestId("save-all").click();
    await until("the installment out of Loan", async () => (await live("money")).find((r) => r.data.note === "Loan installment" && r.data.pot_id === loan.id && r.data.amount === 20000));
    await until("5,000 moved to Loan", async () => (await live("pot")).find((r) => r.id === personal.id && (r.data.moves || []).some((m) => m.other === loan.id && m.amount === 5000)));
    await until("the Wedding pot", async () => (await live("pot")).find((r) => r.data.name === "Wedding" && r.data.type === "save" && r.data.rule && r.data.rule.kind === "percent"));
    // where the month's money went
    await go("/money");
    await win.getByTestId("pot-jobs").waitFor();
    if (process.env.E2E_SHOTS) {
      await win.getByTestId("pots").scrollIntoViewIfNeeded();
      await win.screenshot({ path: path.join(OUT, "pots-money.png") });
    }
  });

  await scenario("money with others: Abu keeps some of mine, I take some back (and take that back), lend Ali by Capture, and let the rest go", async () => {
    await go("/money");
    const netBefore = await win.getByTestId("net").innerText();
    await win.getByTestId("add-keeping").click();
    await dialog().getByLabel("How much").fill("150000");
    if ((await dialog().getByLabel("How much").inputValue()) !== "150,000") throw new Error("the amount isn't grouped as it's typed");
    await field("Who has it").fill("Abu");
    await saveDialog();
    const abu = await until("Abu's on the server", async () => (await live("owed")).find((r) => r.data.who === "Abu" && r.data.type === "keeping" && r.data.amount === 150000));
    await win.getByTestId("owed").waitFor();
    await win.getByTestId("owed-left").getByText("Rs 150,000").waitFor();
    // took 20,000 of it back, then that step taken back
    await win.getByTestId("owed-back").click();
    await dialog().getByLabel("Amount").fill("20000");
    await saveDialog();
    await until("20,000 back on the server", async () => (await live("owed")).find((r) => r.id === abu.id && (r.data.moves || []).some((m) => m.type === "back" && m.amount === 20000)));
    await win.getByTestId("owed-left").getByText("Rs 130,000").waitFor();
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "owed-page.png") });
    const step = win.locator('[data-owed-step="back"]').first();
    await step.hover();
    await step.getByRole("button", { name: "Take back: Took some back" }).click();
    await until("the step taken back", async () => (await live("owed")).find((r) => r.id === abu.id && !(r.data.moves || []).length));
    await win.getByTestId("owed-left").getByText("Rs 150,000").waitFor();
    // Money: still yours, so what's left over is the same, with how much of it Abu has
    await go("/money");
    await win.getByTestId("net-with-others").getByText("Rs 150,000 of your money is with Abu").waitFor();
    // on top: what's with you now, worked out from what's left this month
    await win.getByTestId("hand-line").getByText(`${netBefore} left this month − Rs 150,000 given to others`).waitFor();
    const n = (t) => Number(t.replace(/[^\d]/g, "")) * (/−/.test(t) ? -1 : 1);
    if (n(await win.getByTestId("hand").innerText()) !== n(netBefore) - 150000) throw new Error(`with you now: ${await win.getByTestId("hand").innerText()} from ${netBefore}`);
    await win.getByTestId("with-others").locator(`[data-owed="${abu.id}"]`).waitFor();
    if (process.env.E2E_SHOTS) {
      await win.getByTestId("with-others").scrollIntoViewIfNeeded();
      await win.screenshot({ path: path.join(OUT, "owed-money.png") });
    }
    // by words: a loan to Ali, and 10,000 back from Abu
    await go("/capture");
    await win.getByLabel("What to capture").fill("lent Ali 20000 and took 10000 from Abu");
    await win.keyboard.press("Control+Enter");
    await win.getByTestId("review").waitFor({ timeout: 15000 });
    await win.getByTestId("review").getByText("Took Rs 10,000 from what Abu has").first().waitFor();
    await win.getByTestId("save-all").click();
    const ali = await until("the loan to Ali", async () => (await live("owed")).find((r) => r.data.who === "Ali" && r.data.type === "loan" && r.data.amount === 20000));
    await until("10,000 back from Abu", async () => (await live("owed")).find((r) => r.id === abu.id && (r.data.moves || []).some((m) => m.type === "back" && m.amount === 10000)));
    // Ali won't pay it back: the rest let go becomes spending
    await go(`/owed/${ali.id}`);
    await win.getByTestId("owed-let-go").click();
    await win.getByRole("button", { name: "Let it go" }).click();
    await until("the loan settled", async () => (await live("owed")).find((r) => r.id === ali.id && r.data.closed && (r.data.moves || []).some((m) => m.type === "forgave" && m.amount === 20000 && m.money_id)));
    await until("a gift of 20,000 in Money", async () => (await live("money")).find((r) => r.data.type === "expense" && r.data.amount === 20000 && r.data.category === "Gifts"));
    await win.getByTestId("owed-left").getByText("Settled").waitFor();
  });

  await scenario("settings: what the assistant remembers, added and forgotten", async () => {
    await go("/settings?section=memory");
    await win.getByLabel("Something to remember").fill("I take chai without sugar");
    await win.getByLabel("About", { exact: true }).fill("food");
    await win.getByTestId("memory-add").getByRole("button", { name: "Remember" }).click();
    const m = await until("the memory on the server", async () => (await live("memory")).find((r) => r.data.text === "I take chai without sugar" && r.data.topic === "food"));
    const row = win.locator(`[data-memory="${m.id}"]`);
    await row.hover();
    await row.getByRole("button", { name: "Forget" }).click();
    await until("forgotten on the server", async () => !(await live("memory")).some((r) => r.id === m.id));
  });

  await scenario("nudges: the app's own check finds a to-do past its day; a reminder the assistant sets is saved by itself, waits on Today, is snoozed, done, and cleared", async () => {
    // no quiet hours (the run may be at any hour), and the assistant's reminders save by themselves
    await go("/settings?section=nudges");
    const box = win.getByTestId("nudge-settings");
    await box.waitFor();
    const quiet = box.getByRole("switch", { name: "Quiet hours" });
    if ((await quiet.getAttribute("aria-checked")) === "true") await quiet.click();
    await box.getByRole("tab", { name: "Save by itself" }).click();
    await until("saving by itself chosen", async () => (await box.getByRole("tab", { name: "Save by itself" }).getAttribute("aria-selected")) === "true");
    // the app's own check: the gym membership is two days late
    const own = await until("the app's own nudge on the server", async () => (await live("nudge")).find((r) => r.data.created_by === "app" && /gym membership/i.test(r.data.text)), 25000);
    // ask for a reminder: it's saved by itself, no click
    await go("/assistant");
    await win.getByTestId("chat-list").waitFor();
    await win.keyboard.press("n");
    await win.getByTestId("composer").fill("Remind me to water the balcony plants");
    await win.getByTestId("send").click();
    const card = win.getByTestId("proposal");
    await card.waitFor({ timeout: 30000 });
    await card.getByText("Saved by itself").waitFor({ timeout: 15000 });
    const mine = await until("the reminder on the server", async () => (await live("nudge")).find((r) => r.data.created_by === "assistant" && r.data.text === "Water the balcony plants"));
    // the assistant's page lists it
    await go("/assistant");
    await win.getByTestId("assistant-nudges").getByText("Water the balcony plants").waitFor({ timeout: 15000 });
    // Today has the card
    await go("/");
    await win.getByTestId("nudge-card").waitFor({ timeout: 15000 });
    await win.screenshot({ path: path.join(OUT, "nudge-today.png") }).catch(() => {});
    // on the Nudges page: snooze it for an hour, then mark it done, then clear the history
    await go("/nudges");
    const now = win.getByTestId("nudges-now");
    await now.waitFor();
    const row = (id) => win.locator(`[data-nudge="${id}"], [data-nudge-row="${id}"]`).first();
    await row(mine.id).waitFor();
    if ((await win.locator(`[data-nudge="${mine.id}"]`).count()) === 1) await win.locator(`[data-nudge="${mine.id}"]`).getByTestId("nudge-hour").click();
    else {
      await row(mine.id).getByRole("button", { name: /What to do with/ }).click();
      await win.getByRole("menuitem", { name: "Snooze for an hour" }).click();
    }
    await until("snoozed on the server", async () => (await live("nudge")).find((r) => r.id === mine.id && r.data.status === "snoozed" && r.data.snooze_until > Date.now() + 30 * 60000));
    const later = win.getByTestId("nudges-later");
    await later.getByText("Water the balcony plants").waitFor();
    await later.locator(`[data-nudge-row="${mine.id}"]`).getByRole("button", { name: /What to do with/ }).click();
    await win.getByRole("menuitem", { name: "Done" }).click();
    await until("done on the server", async () => (await live("nudge")).find((r) => r.id === mine.id && r.data.status === "done"));
    const history = win.getByTestId("nudges-history");
    await history.getByText("Water the balcony plants").waitFor();
    await history.getByTestId("nudges-clear").click();
    await until("the history cleared on the server", async () => !(await live("nudge")).some((r) => r.id === mine.id));
    // the app's own one is still waiting (or snoozed), not cleared with the history
    if (!(await live("nudge")).some((r) => r.id === own.id)) throw new Error("clearing the history took a waiting nudge too");
  });

  await scenario("claude sessions: given once in Settings, sent work by the assistant, opened in Claude", async () => {
    // links open in the browser through the main process: record them instead (nothing reaches claude.ai)
    await app.evaluate(({ shell }) => {
      global.__opened = [];
      shell.openExternal = async (u) => void global.__opened.push(u);
    });
    const opened = () => app.evaluate(() => global.__opened.slice());
    await go("/settings?section=assistant");
    const box = win.getByTestId("claude-sessions");
    await box.waitFor({ timeout: 15000 });
    await box.getByText("None yet.", { exact: false }).waitFor();
    await box.getByLabel("The session's link").fill("https://example.com/not-claude");
    await box.getByText("isn't a Claude session link", { exact: false }).waitFor();
    if (await box.getByRole("button", { name: "Add session" }).isEnabled()) throw new Error("a link that isn't Claude's can be added");
    await box.getByLabel("The session's link").fill("https://claude.ai/code/session_01WebsiteAbcd?tab=1");
    await box.getByText("That's a Claude session.").waitFor();
    await box.getByLabel("Its name").fill("website");
    await box.getByLabel("What it works on").fill("the shop's website repo");
    await box.getByRole("button", { name: "Add session" }).click();
    const row = box.locator('[data-claude-session="website"]');
    await row.getByText("nothing sent yet", { exact: false }).waitFor();
    if (process.env.E2E_SHOTS) await box.screenshot({ path: path.join(OUT, "claude-sessions.png") });
    const [[saved]] = await db().query("SELECT session_id, note FROM claude_sessions WHERE name = 'website'");
    if (!saved || saved.session_id !== "session_01WebsiteAbcd" || saved.note !== "the shop's website repo") throw new Error(`saved: ${JSON.stringify(saved)}`);
    // the assistant sends it work; the step opens the session in Claude
    await go("/assistant");
    await win.getByTestId("chat-list").waitFor();
    await win.keyboard.press("n");
    await win.getByTestId("composer").fill("Tell my website session to add a contact page");
    await win.getByTestId("send").click();
    await win.getByTestId("timeline").getByText("Sent it to your website session", { exact: false }).waitFor({ timeout: 30000 });
    await win.getByTestId("timeline").getByText("Sent to “website” on Claude").waitFor();
    await win.getByTestId("timeline").getByText("Claude will report back here when it finishes or needs you", { exact: false }).waitFor();
    const chat = await win.evaluate(() => location.hash.replace(/^#/, ""));
    await win.getByTestId("timeline").getByRole("button", { name: "Open the session in Claude" }).click();
    await until("the session opened in the browser", async () => (await opened()).includes("https://claude.ai/code/session_01WebsiteAbcd"));
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "claude-sent.png") });
    // a few seconds later Claude reports back: on another page a toast says so, and Open goes to the
    // chat, where the report is a card with the way to the session and its pull request
    await go("/today");
    const told = win.getByRole("status").filter({ hasText: "Claude · website: Finished" });
    await told.waitFor({ timeout: 20000 });
    await told.getByRole("button", { name: "Open" }).click();
    await until("back in the chat", async () => (await win.evaluate(() => location.hash.replace(/^#/, ""))) === chat);
    const card = win.getByTestId("timeline").locator('[data-claude-report="done"]');
    await card.getByText("Added the contact page and opened a pull request.").waitFor();
    await card.getByText("Finished").waitFor();
    await card.getByRole("button", { name: "Pull request" }).click();
    await until("the pull request opened in the browser", async () => (await opened()).includes("https://github.com/example/site/pull/7"));
    const [[report]] = await db().query("SELECT status, session_name, pull_request FROM claude_reports");
    if (!report || report.status !== "done" || report.session_name !== "website") throw new Error(`report: ${JSON.stringify(report)}`);
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "claude-report.png") });
    // the report woke the chat, which says so: the chat list shows that as its newest line
    await win.getByTestId("timeline").getByText("Claude finished: the contact page is in pull request 7.").waitFor({ timeout: 20000 });
    await go("/assistant");
    await win.getByTestId("chat-list").getByText("Claude finished: the contact page is in pull request 7.").waitFor();
    // back in Settings: what it last reported, renamed, forgotten and put back
    await go("/settings?section=assistant");
    await box.getByTestId("claude-sessions-about").getByText("Allowed domains", { exact: false }).waitFor();
    await row.getByText("finished just now", { exact: false }).waitFor({ timeout: 15000 });
    await row.locator("[data-last-report]").getByText("Added the contact page", { exact: false }).waitFor();
    await row.getByRole("button", { name: "More for website" }).click();
    await win.getByRole("menuitem", { name: "Rename or change its note" }).click();
    await box.getByLabel("New name").fill("shop site");
    await box.getByLabel("New name").press("Enter");
    const renamed = box.locator('[data-claude-session="shop site"]');
    await renamed.waitFor();
    await renamed.getByRole("button", { name: "More for shop site" }).click();
    await win.getByRole("menuitem", { name: "Forget it here" }).click();
    await until("forgotten on the server", async () => !(await db().query("SELECT id FROM claude_sessions"))[0].length);
    await win.getByRole("status").filter({ hasText: "Forgot “shop site”" }).getByRole("button", { name: "Undo" }).click();
    await renamed.waitFor();
    await until("back on the server", async () => (await db().query("SELECT id FROM claude_sessions WHERE name = 'shop site'"))[0].length === 1);
  });

  await scenario("claude to and fro: it asks, the assistant drafts the answer, you approve with your password; a no with what to say instead; then it finishes", async () => {
    await app.evaluate(({ shell }) => {
      global.__opened = [];
      shell.openExternal = async (u) => void global.__opened.push(u);
    });
    const opened = () => app.evaluate(() => global.__opened.slice());
    await go("/settings?section=assistant");
    const box = win.getByTestId("claude-sessions");
    await box.waitFor({ timeout: 15000 });
    await box.getByLabel("The session's link").fill("https://claude.ai/code/session_01ShopAbcd");
    await box.getByLabel("Its name").fill("shop");
    await box.getByRole("button", { name: "Add session" }).click();
    await box.locator('[data-claude-session="shop"]').waitFor();
    await go("/assistant");
    await win.getByTestId("chat-list").waitFor();
    await win.keyboard.press("n");
    await win.getByTestId("composer").fill("Have my shop session build checkout and push it to main");
    await win.getByTestId("send").click();
    const tl = win.getByTestId("timeline");
    await tl.getByText("Sent it to your shop session; it will report back here.").waitFor({ timeout: 30000 });
    // Claude asks; the chat wakes and the assistant's answer waits for you, beside Claude's question
    await tl.locator('[data-claude-report="needs_you"]').getByText("May I push it to main?", { exact: false }).waitFor({ timeout: 20000 });
    const ask = tl.locator('[data-ask="pending"]');
    await ask.locator("[data-claude-question]").getByText("Checkout is built and the tests pass. May I push it to main?").waitFor({ timeout: 20000 });
    await ask.locator("[data-claude-answer]").getByText("Yes, push it to main.").waitFor();
    await ask.getByText("Why: You asked for checkout to go to main once the tests pass.").waitFor();
    await tl.locator('[data-claude-report="needs_you"]').getByRole("button", { name: "Answer in Claude" }).waitFor();
    const [[before]] = await db().query("SELECT last_message FROM claude_sessions WHERE name = 'shop'");
    if (/Yes, push/.test(before.last_message || "")) throw new Error("the answer went before it was approved");
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "claude-ask.png") });
    // approving needs your password
    await ask.getByTestId("approve").click();
    const pw = dialog().getByLabel("Password");
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await until("the answer went to Claude", async () => /^Yes, push it to main\./.test((await db().query("SELECT last_message FROM claude_sessions WHERE name = 'shop'"))[0][0].last_message || ""));
    await tl.getByText("Told Claude.").first().waitFor({ timeout: 20000 });
    // it asks again: say no, and what to tell it instead
    await tl.locator("[data-claude-question]").getByText("Pushed to main. May I delete the old branch feature/cart?").waitFor({ timeout: 20000 });
    const ask2 = tl.locator('[data-ask="pending"]');
    await ask2.locator("[data-claude-answer]").getByText("Yes, delete feature/cart.").waitFor();
    await ask2.getByRole("button", { name: "No", exact: true }).click();
    await ask2.getByLabel("What to tell Claude instead").fill("keep it, open a pull request instead");
    await ask2.getByRole("button", { name: "Say no" }).click();
    await tl.locator('[data-ask="denied"]').getByText("keep it, open a pull request instead", { exact: false }).waitFor({ timeout: 15000 });
    // the assistant drafts that instead; it waits for you again
    const ask3 = tl.locator('[data-ask="pending"]');
    await ask3.locator("[data-claude-answer]").getByText("Don't delete feature/cart; open a pull request for the cleanup instead.").waitFor({ timeout: 20000 });
    const [[mid]] = await db().query("SELECT last_message FROM claude_sessions WHERE name = 'shop'");
    if (/delete feature\/cart\.$/.test(mid.last_message || "") || /^Yes, delete/.test(mid.last_message || "")) throw new Error("the answer you said no to went");
    await ask3.getByTestId("approve").click();
    await dialog().getByLabel("Password").fill(PASSWORD);
    await dialog().getByLabel("Password").press("Enter");
    // it finishes; the chat wakes once more and says so
    const done = tl.locator('[data-claude-report="done"]');
    await done.getByText("Kept feature/cart and opened a pull request for the cleanup.").waitFor({ timeout: 20000 });
    await tl.getByText("Claude kept feature/cart and opened pull request 12.").waitFor({ timeout: 20000 });
    await done.getByRole("button", { name: "Pull request" }).click();
    await until("the pull request opened", async () => (await opened()).includes("https://github.com/example/shop/pull/12"));
    const [qs] = await db().query("SELECT q.closed_how FROM claude_questions q JOIN claude_sessions s ON s.id = q.session_row_id WHERE s.name = 'shop' ORDER BY q.report_id");
    if (qs.map((q) => q.closed_how).join(",") !== "answered,answered") throw new Error(`questions: ${JSON.stringify(qs)}`);
    const [ap] = await db().query("SELECT a.status FROM op_approvals a WHERE a.summary LIKE 'Answer Claude in “shop”%' ORDER BY a.id");
    if (ap.map((a) => a.status).join(",") !== "approved,denied,approved") throw new Error(`approvals: ${JSON.stringify(ap)}`);
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "claude-done.png") });
  });

  await scenario("settings: the natural voice from the server; a voice picked here reads answers", async () => {
    await go("/settings?section=assistant");
    await win.getByText(/ElevenLabs on your server · 28,800 characters left this month/).waitFor();
    await win.getByRole("button", { name: "The voice" }).click();
    await win.getByRole("option", { name: /Warm one/ }).click();
    const log = path.join(workdir, "voice.log");
    if (fs.existsSync(log)) fs.unlinkSync(log);
    await win.getByRole("button", { name: "Hear it" }).click();
    await win.getByRole("button", { name: "Stop" }).waitFor();
    await win.screenshot({ path: path.join(OUT, "voice-settings.png") }).catch(() => {});
    const said = await until("read aloud through the server", async () => fs.existsSync(log) && fs.readFileSync(log, "utf8"));
    if (!/^speak VoiceWarmWarmWarm002 Hi! This is how I'll read your answers/.test(said)) throw new Error(`read with the wrong voice: ${said}`);
    await win.getByRole("button", { name: "Hear it" }).waitFor({ timeout: 8000 });
  });

  await scenario("money: an expense typed in the editor reaches the month", async () => {
    await go("/money");
    await win.getByRole("button", { name: "Expense" }).click();
    await dialog().getByLabel("Amount").fill("750");
    await field("What for").fill("Cinema");
    // Save waits for a category, and says so
    await dialog().getByTestId("form-why").getByText("Pick a category").waitFor();
    await dialog().getByRole("button", { name: "Other", exact: true }).click();
    await saveDialog();
    await until("the expense", async () => (await live("money")).find((r) => r.data.amount === 750 && r.data.type === "expense" && r.data.note === "Cinema"));
    await win.getByTestId("money-rows").getByText("Cinema").waitFor();
  });

  await scenario("people: add someone and see their card", async () => {
    await go("/people");
    await win.getByRole("button", { name: /Add a person/ }).click();
    await dialog().getByLabel("Name").fill("Taylor Reed");
    await field("Phone").fill("+10000000009");
    await saveDialog();
    await until("the person", async () => (await live("person")).find((r) => r.data.name === "Taylor Reed" && r.data.phone === "+10000000009"));
    await win.locator("[data-person]").filter({ hasText: "Taylor Reed" }).click();
    await win.getByTestId("person-card").getByText("Taylor Reed").waitFor();
  });

  await scenario("car: a fill-up moves the odometer on and goes into Money", async () => {
    await go("/car");
    const before = (await live("car_log")).length;
    await win.getByRole("button", { name: "Add fuel" }).click();
    await field("Cost (PKR)").fill("5800");
    await field("Litres").fill("21");
    await field("On the clock (km)").fill("48850");
    await saveDialog();
    const log = await until("the fill-up", async () => (await live("car_log")).find((r) => r.data.type === "fuel" && r.data.odometer === 48850));
    if ((await live("car_log")).length !== before + 1) throw new Error("expected one new log entry");
    if (log.data.money_id) await until("its expense", async () => (await live("money")).find((r) => r.id === log.data.money_id && r.data.amount === 5800));
    await until("odometer shown", async () => /48,850/.test(await win.getByTestId("odometer").innerText()));
  });

  await scenario("things: add something with its price in Money", async () => {
    await go("/things");
    await win.getByRole("button", { name: /Add a thing/ }).click();
    await dialog().getByLabel("Name").fill("Camera");
    await field("Price (PKR)").fill("95000");
    await saveDialog();
    const t = await until("the thing", async () => (await live("thing")).find((r) => r.data.name === "Camera" && r.data.price === 95000));
    if (t.data.money_id) await until("its expense", async () => (await live("money")).find((r) => r.id === t.data.money_id));
    await win.getByTestId("thing-grid").getByText("Camera").waitFor();
  });

  await scenario("work: a project, its timer, and a payment that goes into Money as income", async () => {
    await go("/work");
    await win.getByTestId("renewals").getByText("example.net").waitFor();
    await win.getByRole("button", { name: /^Add/ }).click();
    await win.getByRole("menuitem", { name: "New project" }).click();
    await dialog().getByPlaceholder("Project name, e.g. Shop website").fill("Shop app");
    await field("Hourly rate (PKR)").fill("2500");
    await saveDialog();
    const p = await until("the project", async () => (await live("project")).find((r) => r.data.name === "Shop app" && r.data.rate === 2500 && r.data.rate_unit === "hour"));
    await win.locator(`[data-project="${p.id}"]`).click();
    await win.getByTestId("work-project").getByRole("heading", { name: "Shop app" }).waitFor();
    await win.getByTestId("timer").getByRole("button", { name: /Start/ }).click();
    await until("the timer running", async () => (await live("project")).find((r) => r.id === p.id && typeof r.data.timer_from === "number"));
    await win.getByTestId("timer").getByRole("button", { name: /Stop/ }).click();
    await dialog().getByRole("button", { name: /Log time/ }).waitFor();
    await saveDialog();
    await until("the time logged", async () => (await live("work_log")).find((r) => r.data.project_id === p.id && r.data.type === "time" && r.data.minutes >= 1));
    if ((await live("project")).find((r) => r.id === p.id).data.timer_from) throw new Error("the timer is still running");
    await win.getByRole("button", { name: /Got paid/ }).click();
    await field("Got paid (PKR)").fill("5000");
    await saveDialog();
    const pay = await until("the payment", async () => (await live("work_log")).find((r) => r.data.project_id === p.id && r.data.type === "payment" && r.data.amount === 5000));
    await until("its income in Money", async () => (await live("money")).find((r) => r.id === pay.data.money_id && r.data.type === "income" && r.data.category === "Freelance"));
    await win.getByTestId("project-log").getByText("+").first().waitFor();
  });

  await scenario("work: a domain about to expire is renewed for a year in one click, and Undo puts it back", async () => {
    await go("/work");
    const d = (await live("domain")).find((r) => r.data.name === "example.net");
    await win.locator(`[data-renewal="${d.id}"]`).getByRole("button", { name: /Renewed/ }).click();
    const year = Number(d.data.expires_on.slice(0, 4)) + 1;
    await until("a year on", async () => (await live("domain")).find((r) => r.id === d.id && r.data.expires_on === `${year}${d.data.expires_on.slice(4)}`));
    await win.getByRole("button", { name: "Undo" }).click();
    await until("back as it was", async () => (await live("domain")).find((r) => r.id === d.id && r.data.expires_on === d.data.expires_on));
    await go("/work?tab=domains");
    await win.getByTestId("domain-table").getByText("example.com").waitFor();
  });

  await scenario("interests: practice in a click, a word typed as word = meaning, and going over words with the keys", async () => {
    await go("/interests");
    const arabic = (await live("interest")).find((r) => r.data.name === "Arabic");
    const before = (await live("practice")).length;
    await win.locator(`[data-interest="${arabic.id}"]`).getByRole("button", { name: "+15 min" }).click();
    await until("the practice", async () => (await live("practice")).length === before + 1 && (await live("practice")).find((r) => r.data.interest_id === arabic.id && r.data.minutes === 15 && r.data.date === day(0)));
    await go("/interests?tab=words");
    await win.getByTestId("quick-word").fill("shams = sun");
    await win.keyboard.press("Enter");
    await until("the word", async () => (await live("word")).find((r) => r.data.term === "shams" && r.data.meaning === "sun"));
    await win.getByRole("button", { name: /Go over them/ }).click();
    const seen = new Set();
    for (let i = 0; i < 8; i++) {
      if (await win.getByTestId("review-done").isVisible().catch(() => false)) break;
      // the card going away fades out over the next one: read the one that's coming in
      const term = await win.getByTestId("review-term").last().innerText();
      await win.keyboard.press("Space");
      await win.getByRole("button", { name: new RegExp(`^${term}: `) }).waitFor();
      seen.add(term);
      await win.keyboard.press("ArrowRight");
      await win.getByRole("button", { name: new RegExp(`^${term}: `) }).waitFor({ state: "detached" });
    }
    await win.getByTestId("review-done").waitFor();
    if (!seen.has("shams") || !seen.has("kitab")) throw new Error(`went over ${[...seen].join(", ")}`);
    await until("the words moved on", async () => (await live("word")).find((r) => r.data.term === "shams" && r.data.box === 1 && r.data.due === day(1)));
    await win.keyboard.press("Escape");
  });

  await scenario("saved: paste from the clipboard, then one click copies it back", async () => {
    await go("/saved");
    await app.evaluate(({ clipboard }) => clipboard.writeText("IBAN-TEST-0001"));
    await win.getByRole("button", { name: "Paste as new" }).click();
    if (await dialog().count()) await saveDialog();
    const c = await until("the clip", async () => (await live("clip")).find((r) => r.data.text === "IBAN-TEST-0001"));
    await app.evaluate(({ clipboard }) => clipboard.writeText("something else"));
    await win.locator(`[data-clip="${c.id}"]`).click();
    await until("copied back", async () => (await app.evaluate(({ clipboard }) => clipboard.readText())) === "IBAN-TEST-0001");
    await until("use counted", async () => (await live("clip")).find((r) => r.id === c.id && (r.data.uses || 0) >= 1));
  });

  await scenario("search: Ctrl K finds a record and opens it", async () => {
    await go("/");
    await win.keyboard.press("Control+k");
    await win.getByLabel("Search", { exact: true }).fill("dentist");
    await win.locator('[role="option"]').filter({ hasText: "Dentist" }).first().waitFor();
    await win.keyboard.press("Enter");
    await until("the event opened", async () => (await dialog().getByLabel("Title").inputValue().catch(() => "")) === "Dentist");
    await win.keyboard.press("Escape");
  });

  await scenario("assistant: a risky step waits for your password, then the work finishes", async () => {
    await go("/assistant");
    await win.getByTestId("composer").fill("Tidy the server please");
    await win.getByTestId("send").click();
    await win.getByTestId("approve").waitFor({ timeout: 30000 });
    await win.getByTestId("approve").click();
    const box = dialog().getByLabel("Password");
    await box.fill("wrong one");
    await box.press("Enter");
    await dialog().getByRole("alert").waitFor({ timeout: 8000 });
    await box.fill(PASSWORD);
    await box.press("Enter");
    await win.getByTestId("timeline").getByText("Everything").waitFor({ timeout: 30000 });
    if (workdir && fs.existsSync(path.join(workdir, "scratch.txt"))) throw new Error("the approved command didn't run");
    await win.getByTestId("timeline").locator("strong").filter({ hasText: "Everything" }).waitFor();
  });

  await scenario("assistant: saying no stops the step and the AI is told", async () => {
    if (workdir) fs.writeFileSync(path.join(workdir, "scratch.txt"), "x");
    await go("/assistant");
    await win.getByTestId("chat-list").waitFor();
    await win.keyboard.press("n");
    await win.getByTestId("composer").fill("Tidy it again");
    await win.getByTestId("send").click();
    await win.getByTestId("approve").waitFor({ timeout: 30000 });
    await win.getByRole("button", { name: "No", exact: true }).click();
    await win.getByLabel("Why not").fill("not today");
    await win.getByRole("button", { name: "Say no" }).click();
    await win.getByTestId("timeline").getByText("Understood, I left it as it is.").waitFor({ timeout: 30000 });
    if (workdir && !fs.existsSync(path.join(workdir, "scratch.txt"))) throw new Error("the refused command ran anyway");
  });

  await scenario("assistant: it knows your people, and saves what it proposes when you click", async () => {
    await go("/assistant");
    await win.getByTestId("chat-list").waitFor();
    await win.keyboard.press("n");
    await win.getByTestId("composer").fill("What's my brother's name? Add his shoe size 42 and remind me to call him");
    await win.getByTestId("send").click();
    const card = win.getByTestId("proposal");
    await card.waitFor({ timeout: 30000 });
    await win.getByTestId("timeline").getByText("Your brother is Jamie.", { exact: false }).waitFor({ timeout: 30000 });
    await win.getByTestId("timeline").getByText("Looked through your records", { exact: false }).waitFor();
    await card.getByText("Change person").waitFor();
    await card.getByText("Shoe size 42", { exact: false }).waitFor();
    await card.getByText("Call Jamie").waitFor();
    await card.getByRole("button", { name: "Save all 2" }).click();
    await until("both saved", async () => (await card.getByText("Saved", { exact: true }).count()) === 2);
    // saved here like any change, and synced to the server
    await until("the to-do on the server", async () => (await live("todo")).find((r) => r.data.title === "Call Jamie"));
    await until("his shoe size on the server", async () => (await live("person")).find((r) => r.data.name === "Jamie" && (r.data.details || []).some((d) => d.label === "Shoe size" && d.value === "42")));
  });

  await scenario("assistant: a file dropped on the box goes with the message, is read, and saves from the chat", async () => {
    const NOTE = "Meeting at 5pm with the plumber.\nBring the keys.";
    await go("/assistant");
    await win.getByTestId("chat-list").waitFor();
    // the server says it takes files once its status is in (the connection chips show it)
    await win.getByRole("button", { name: /Server/ }).first().waitFor({ timeout: 20000 });
    await win.keyboard.press("n");
    await win.getByTestId("composer").waitFor();
    // dropped on the box, the way a file dragged from a folder arrives
    await win.evaluate((note) => {
      const dt = new DataTransfer();
      dt.items.add(new File([note], "plumber-notes.txt", { type: "text/plain" }));
      const box = document.querySelector('[data-testid="composer-box"]');
      box.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
      box.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, NOTE);
    await win.getByTestId("attached-file").getByText("plumber-notes.txt").waitFor();
    await win.getByTestId("composer").fill("What does this say?");
    await win.waitForTimeout(900);
    await win.screenshot({ path: path.join(OUT, "file-attached.png") }).catch(() => {});
    await win.getByTestId("send").click();
    await win.getByTestId("timeline").getByText("I read plumber-notes.txt. It says: Meeting at 5pm with the plumber.", { exact: false }).waitFor({ timeout: 30000 });
    const chip = win.getByTestId("sent-file");
    await chip.getByText("plumber-notes.txt").waitFor();
    // the new chat is in the list straight away, not at the list's next check (every 10 s)
    await win.getByTestId("chat-list").getByText("What does this say?", { exact: true }).waitFor({ timeout: 4000 });
    await win.waitForTimeout(900);
    await win.screenshot({ path: path.join(OUT, "file-sent.png") }).catch(() => {});
    // Save: the save dialog answers with a path here, and the file lands there as it was sent
    const out = path.join(os.tmpdir(), `redline-e2e-file-${Date.now()}.txt`);
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, out);
    await chip.getByRole("button", { name: "Save plumber-notes.txt" }).click();
    await until("saved to disk as sent", async () => fs.existsSync(out) && fs.readFileSync(out, "utf8") === NOTE);
    fs.rmSync(out, { force: true });
  });

  await scenario("assistant: an unsent message and its photo wait in the box while you're elsewhere; the photo opens large, is cropped, turned and drawn on, and goes edited", async () => {
    await go("/assistant");
    await win.getByTestId("chat-list").waitFor();
    await win.getByRole("button", { name: /Server/ }).first().waitFor({ timeout: 20000 });
    await win.keyboard.press("n");
    const composer = win.getByTestId("composer");
    await composer.waitFor();
    await composer.fill("Half a thought about the trip");
    // a 400 x 300 picture dropped on the box
    await win.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 300;
      const ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 400, 300);
      g.addColorStop(0, "#3355ff");
      g.addColorStop(1, "#ff8833");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 400, 300);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "trip.png", { type: "image/png" }));
      const box = document.querySelector('[data-testid="composer-box"]');
      box.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
      box.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await win.getByTestId("attached-photo").waitFor();
    // elsewhere and back: the words and the photo are still there
    await go("/todos");
    await win.getByTestId("composer").waitFor({ state: "detached" });
    await go("/assistant");
    await composer.waitFor();
    if ((await composer.inputValue()) !== "Half a thought about the trip") throw new Error(`the words weren't kept: "${await composer.inputValue()}"`);
    if ((await win.getByTestId("attached-photo").count()) !== 1) throw new Error("the photo wasn't kept");
    // open it large and edit it
    await win.getByTestId("attached-photo").click();
    const editor = win.getByTestId("photo-editor");
    await editor.waitFor();
    const large = editor.getByTestId("photo-large");
    const size = () => large.evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight }));
    await until("the photo loaded", async () => (await size()).w === 400);
    await win.screenshot({ path: path.join(OUT, "photo-open.png") }).catch(() => {});
    // crop: drag over the middle, Crop
    await editor.getByRole("button", { name: "Crop" }).click();
    const b = await large.boundingBox();
    await win.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.1);
    await win.mouse.down();
    await win.mouse.move(b.x + b.width * 0.35, b.y + b.height * 0.4, { steps: 4 });
    await win.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.7, { steps: 4 });
    await win.mouse.up();
    await editor.getByTestId("crop-box").waitFor();
    await win.screenshot({ path: path.join(OUT, "photo-crop.png") }).catch(() => {});
    await editor.getByTestId("crop-apply").click();
    const cropped = await until("cropped", async () => {
      const s = await size();
      return s.w < 400 && s.w > 150 && s.h < 300 && s.h > 150 && s;
    });
    // turned right: width and height swap
    await editor.getByRole("button", { name: "Turn right" }).click();
    await until("turned", async () => {
      const s = await size();
      return s.w === cropped.h && s.h === cropped.w;
    });
    // drawn on
    await editor.getByRole("button", { name: "Draw" }).click();
    await editor.getByTestId("photo-pens").waitFor();
    const d = await large.boundingBox();
    await win.mouse.move(d.x + d.width * 0.2, d.y + d.height * 0.5);
    await win.mouse.down();
    await win.mouse.move(d.x + d.width * 0.5, d.y + d.height * 0.3, { steps: 6 });
    await win.mouse.move(d.x + d.width * 0.8, d.y + d.height * 0.6, { steps: 6 });
    await win.mouse.up();
    await win.screenshot({ path: path.join(OUT, "photo-draw.png") }).catch(() => {});
    // undo takes the line away, a second line stays
    await win.keyboard.press("Control+z");
    await win.mouse.move(d.x + d.width * 0.3, d.y + d.height * 0.7);
    await win.mouse.down();
    await win.mouse.move(d.x + d.width * 0.7, d.y + d.height * 0.7, { steps: 6 });
    await win.mouse.up();
    await editor.getByRole("button", { name: "Done drawing" }).click();
    await editor.getByTestId("photo-save").click();
    await editor.waitFor({ state: "detached" });
    // the photo in the box is the edited one: taller than wide now
    const thumb = await win.getByTestId("attached-photo").locator("img").evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight }));
    if (!(thumb.h > thumb.w)) throw new Error(`the edited photo isn't in the box: ${JSON.stringify(thumb)}`);
    // sent: the chat opens, its own box is empty, and the new-chat box starts empty next time
    await win.getByTestId("send").click();
    await win.locator("[data-user-message]").getByText("Half a thought about the trip").waitFor({ timeout: 30000 });
    if ((await win.getByTestId("composer").inputValue()) !== "") throw new Error("the chat's box isn't empty");
    // a reply not sent yet waits in this chat's box
    await win.getByTestId("composer").fill("And book the hotel");
    const chat = await win.evaluate(() => location.hash);
    await go("/money");
    await go(chat.replace(/^#/, ""));
    await win.getByTestId("composer").waitFor();
    await until("the reply kept", async () => (await win.getByTestId("composer").inputValue()) === "And book the hotel");
    // the photo that went opens large too, to look at (no editing tools)
    await win.locator("[data-user-message]").getByRole("button", { name: "Open the photo" }).first().click();
    await editor.waitFor();
    if (await editor.getByTestId("photo-tools").count()) throw new Error("a sent photo shouldn't have editing tools");
    await win.screenshot({ path: path.join(OUT, "photo-sent.png") }).catch(() => {});
    await win.keyboard.press("Escape");
    await editor.waitFor({ state: "detached" });
    await go("/assistant");
    await composer.waitFor();
    if ((await composer.inputValue()) !== "") throw new Error(`the new-chat box kept what was sent: "${await composer.inputValue()}"`);
  });

  await scenario("assistant: a reply with a very long link stays inside its bubble, and so does a long message", async () => {
    await go("/assistant");
    await win.getByTestId("chat-list").waitFor();
    await win.getByRole("button", { name: /Server/ }).first().waitFor({ timeout: 20000 });
    const composer = win.getByTestId("composer");
    await composer.waitFor();
    await composer.fill(`Give me a long link ${"y".repeat(200)}`);
    await win.getByTestId("send").click();
    const reply = win.locator("[data-reply]").last();
    await reply.getByText("Then I'll finish it.", { exact: false }).waitFor({ timeout: 30000 });
    await win.waitForTimeout(500);
    const fits = await win.evaluate(() => {
      const bad = [];
      const timeline = document.querySelector('[data-testid="timeline"]');
      const edge = timeline.getBoundingClientRect().right + 1;
      for (const el of document.querySelectorAll("[data-reply] *, [data-user-message] *")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > edge) bad.push(`${el.tagName}.${String(el.className).slice(0, 40)} ends at ${Math.round(r.right)} > ${Math.round(edge)}`);
      }
      return bad.slice(0, 5);
    });
    await win.screenshot({ path: path.join(OUT, "long-link.png") }).catch(() => {});
    if (fits.length) throw new Error(`text runs out of the chat:\n${fits.join("\n")}`);
  });

  await scenario("talking: it hears you, stops when you do, sends what you said, reads the answer aloud and listens for your reply", async () => {
    const log = path.join(workdir, "voice.log");
    if (fs.existsSync(log)) fs.unlinkSync(log);
    await go("/assistant");
    await win.getByTestId("chat-list").waitFor();
    await win.getByRole("button", { name: /Server/ }).first().waitFor({ timeout: 20000 });
    const box = win.getByTestId("composer-box");
    await box.getByTestId("mic").click();
    // listening: the meter follows the sound
    await win.getByTestId("hearing").getByText(/Listening/).waitFor();
    await win.getByTestId("mic-level").waitFor();
    await win.waitForTimeout(1500);
    await win.screenshot({ path: path.join(OUT, "voice-listening.png") }).catch(() => {});
    // the voice stops, so it does: the recording goes straight to the assistant, which writes it
    // down and starts at once; the answer is read aloud line by line as it's written
    await win.locator("[data-user-message]").getByText("Read me something short").waitFor({ timeout: 30000 });
    await win.getByTestId("timeline").getByText("Here is something short: the kettle is on.").waitFor({ timeout: 30000 });
    if (!/spoken=1/.test(win.url())) throw new Error(`not opened as a spoken chat: ${win.url()}`);
    const said = await until("the answer read aloud", async () => {
      const t = fs.existsSync(log) && fs.readFileSync(log, "utf8");
      return t && /^speak \S+ Here is something short/m.test(t) && t;
    });
    if (!/^listen audio\/webm \d+/m.test(said)) throw new Error(`the recording didn't reach the server as webm:\n${said}`);
    // read as the server wrote it, a line at a time: speech events before a reply marked as read
    const [evs] = await db().query("SELECT type, data FROM op_events WHERE run_id = (SELECT MAX(id) FROM op_runs) AND type IN ('speech', 'reply') ORDER BY id");
    const types = evs.map((e) => e.type);
    const lastReply = evs.filter((e) => e.type === "reply").pop();
    if (!types.includes("speech") || !lastReply || !JSON.parse(typeof lastReply.data === "string" ? lastReply.data : JSON.stringify(lastReply.data)).voiced) throw new Error(`not read aloud as it was written: ${types.join(", ")}`);
    // read to its end, it listens for your reply; Esc lets it go without sending anything
    await box.locator('[data-testid="mic"][data-state="listening"]').waitFor({ timeout: 20000 });
    await win.screenshot({ path: path.join(OUT, "voice-follow-up.png") }).catch(() => {});
    await win.keyboard.press("Escape");
    await box.locator('[data-testid="mic"][data-state="idle"]').waitFor();
    await win.waitForTimeout(800);
    if ((await win.locator("[data-user-message]").count()) !== 1) throw new Error("something more was sent");
    if (await win.getByTestId("voice-error").count()) throw new Error(`an error: ${await win.getByTestId("voice-error").innerText()}`);
  });

  await scenario("talking to Capture: read back in its own words, a spoken change made by the AI, and a yes saves it", async () => {
    const log = path.join(workdir, "voice.log");
    if (fs.existsSync(log)) fs.unlinkSync(log);
    fs.writeFileSync(path.join(workdir, "says.txt"), ["doodh aur anday", "aur chai bhi", "haan ji"].join("\n"));
    await go("/capture");
    await win.getByTestId("mic").first().click();
    await until("the words in the box", async () => (await win.getByLabel("What to capture").inputValue()) === "doodh aur anday", 25000);
    await win.getByTestId("sort-out").click();
    await win.getByTestId("review").getByText("Doodh aur anday aaj ki list mein.").waitFor({ timeout: 20000 });
    await until("read back with a question", async () => fs.existsSync(log) && /^speak \S+ Doodh aur anday, aaj ki list mein\. Save kar doon\?/m.test(fs.readFileSync(log, "utf8")), 20000);
    // read to its end, it listens; "aur chai bhi" is a change, and the AI makes it
    await win.getByTestId("answer-listening").waitFor({ timeout: 20000 });
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "capture-answer-listening.png") });
    await until("tea added", async () => (await win.getByTestId("review").locator("input").evaluateAll((els) => els.map((e) => e.value))).includes("Chai"), 30000);
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "capture-changed.png") });
    // "haan ji": saved, and it says so in your words
    await until("the three on the server", async () => (await live("item")).filter((r) => ["Doodh", "Anday", "Chai"].includes(r.data.name)).length === 3, 30000);
    await until("said done", async () => /^speak \S+ Ho gaya\./m.test(fs.readFileSync(log, "utf8")), 15000);
    if (fs.readFileSync(path.join(workdir, "says.txt"), "utf8").trim()) throw new Error("not everything said was heard");
  });

  await scenario("talking to the assistant: its card saved by saying yes, the yes kept out of the chat", async () => {
    const before = (await live("todo")).filter((r) => r.data.title === "Call Jamie").length;
    const log = path.join(workdir, "voice.log");
    if (fs.existsSync(log)) fs.unlinkSync(log);
    fs.writeFileSync(path.join(workdir, "says.txt"), ["What's my brother's name? Add his shoe size 42 and remind me to call him", "yes"].join("\n"));
    await go("/assistant");
    await win.getByTestId("chat-list").waitFor();
    const box = win.getByTestId("composer-box");
    await box.getByTestId("mic").click();
    await win.getByTestId("timeline").getByText("Your brother is Jamie.", { exact: false }).waitFor({ timeout: 40000 });
    // read aloud, then it listens: "yes" saves the card
    await until("the to-do saved", async () => (await live("todo")).filter((r) => r.data.title === "Call Jamie").length === before + 1, 40000);
    await until("said saved", async () => /^speak \S+ Saved\.$/m.test(fs.readFileSync(log, "utf8")), 15000);
    if ((await win.locator("[data-user-message]").count()) !== 1) throw new Error("the yes went into the chat");
  });

  await scenario("talking: the talk shortcut opens the assistant listening, and stops it; \"Waits for me\" keeps what you said in the box", async () => {
    await go("/settings?section=assistant");
    await win.getByRole("tab", { name: "Waits for me" }).click();
    await go("/todos");
    const registered = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("Alt+Space"));
    if (!registered) throw new Error("Alt+Space isn't registered");
    const talk = () =>
      app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes("#/quick"));
        w.webContents.send("ev:command", { type: "talk" }); // what the shortcut sends
      });
    await talk();
    const box = win.getByTestId("composer-box");
    await box.locator('[data-testid="mic"][data-state="listening"]').waitFor({ timeout: 15000 });
    if (!/#\/assistant\?voice=1/.test(win.url())) throw new Error(`not on the assistant: ${win.url()}`);
    await win.waitForTimeout(1200);
    await talk(); // again: stop, and it's written down into the box
    await until("what you said in the box", async () => (await win.getByTestId("composer").inputValue()) === "Read me something short", 20000);
    await win.waitForTimeout(2000);
    if (!/#\/assistant\?voice=1/.test(win.url())) throw new Error("it was sent without you");
    await win.getByTestId("composer").fill("");
    await go("/settings?section=assistant");
    await win.getByRole("tab", { name: "Sends by itself" }).click();
  });

  await scenario("talking: Settings shows what it heard, and the talk shortcut", async () => {
    await go("/settings?section=assistant");
    await win.getByTestId("talk-shortcut").getByText("Alt + Space").waitFor();
    const row = win.getByText("Talking to it").locator("xpath=ancestor::*[.//button[@data-testid='mic']][1]");
    await row.getByTestId("mic").click();
    await win.getByText("Listening… say something").waitFor();
    await win.waitForTimeout(1200);
    await row.getByTestId("mic").click();
    await win.getByTestId("heard").getByText("“Read me something short”").waitFor({ timeout: 20000 });
    await win.screenshot({ path: path.join(OUT, "voice-settings-talk.png") }).catch(() => {});
  });

  await scenario("talking: a new talk shortcut recorded by pressing keys (a plain key explained, Esc keeps the old one, Ctrl+K taken from search)", async () => {
    // keys the way the keyboard sends them (through the window, where the menu and Redline's own
    // shortcuts would see them first), not straight into the page
    const key = (type, keyCode, modifiers = []) =>
      app.evaluate(({ BrowserWindow }, [t, k, m]) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes("quick")).webContents.sendInputEvent({ type: t, keyCode: k, modifiers: m }), [type, keyCode, modifiers]);
    const press = async (keyCode, modifiers = []) => {
      await key("keyDown", keyCode, modifiers);
      await key("keyUp", keyCode, modifiers);
    };
    await go("/settings?section=assistant");
    const btn = win.getByTestId("talk-shortcut");
    const hint = win.getByTestId("talk-shortcut-hint");
    await btn.getByText("Alt + Space").waitFor();
    // Ctrl+K opens search when nothing is recording
    await press("K", ["control"]);
    await win.locator('[role="dialog"][aria-label="Search everything"]').waitFor();
    await win.keyboard.press("Escape");
    await win.locator('[role="dialog"][aria-label="Search everything"]').waitFor({ state: "detached" });
    // Esc keeps what it was
    await btn.click();
    await win.locator('[data-testid="talk-shortcut"][data-recording="1"]').waitFor();
    await press("Escape");
    await btn.getByText("Alt + Space").waitFor();
    // a key on its own can't be a shortcut, and it says so; holding Ctrl shows as it's held
    await btn.click();
    await press("T");
    await hint.getByText(/Hold Ctrl or Alt with it/).waitFor();
    await key("keyDown", "Control", ["control"]);
    await btn.getByText("Ctrl + …").waitFor();
    // Ctrl+K: recorded, and search stays shut
    await press("K", ["control"]);
    await key("keyUp", "Control");
    await btn.getByText("Ctrl + K").waitFor();
    await win.getByText("Talk: Ctrl + K").waitFor();
    if (await win.locator('[role="dialog"][aria-label="Search everything"]').count()) throw new Error("search opened while recording");
    const saved = await win.evaluate(() => window.redline.prefs.get());
    if (saved.talkShortcut !== "CommandOrControl+K") throw new Error(`saved ${saved.talkShortcut}`);
    if (process.env.E2E_SHOTS) await win.screenshot({ path: path.join(OUT, "talk-shortcut.png") });
    // back to Alt+Space, pressed in the page (the page's own keys work too)
    await btn.click();
    await win.keyboard.press("Alt+Space");
    await btn.getByText("Alt + Space").waitFor();
    await until("Alt+Space saved", async () => (await win.evaluate(() => window.redline.prefs.get())).talkShortcut === "Alt+Space");
  });

  await scenario("settings: theme, wallpaper, effects and text size apply at once", async () => {
    await go("/settings?section=appearance");
    const accent = () => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-accent").trim());
    const was = await accent();
    await win.locator('[data-theme-card="midnight"]').click();
    await until("the accent changes", async () => (await accent()) !== was);
    await win.locator('[data-bg="peaks"]').click();
    await until("the wallpaper shows", async () => (await win.locator('[data-wallpaper="peaks"] [style*="url("]').count()) === 2);
    // effects: Full blurs the wallpaper behind the glass, Light doesn't; Auto follows the graphics card
    const glass = () => win.evaluate(() => ({ effects: document.documentElement.dataset.effects, filter: getComputedStyle(document.documentElement).getPropertyValue("--glass-filter").trim() }));
    const effect = (name) => win.locator('[data-testid="effects"] [role="tab"]', { hasText: name }).click();
    await effect("Full");
    await until("the glass blurs the wallpaper", async () => {
      const g = await glass();
      return g.effects === "full" && g.filter.startsWith("blur(");
    });
    await effect("Light");
    await until("light effects: no blur", async () => {
      const g = await glass();
      return g.effects === "light" && g.filter === "none";
    });
    await effect("Auto");
    const gpu = await win.locator('[data-testid="effects"]').getAttribute("data-gpu");
    await until("Auto follows the graphics card", async () => (await glass()).effects === (gpu === "software" ? "light" : "full"));
    await win.getByRole("button", { name: "110%" }).click();
    await until("zoomed", async () => Math.abs((await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.getTitle().includes("Quick"))?.webContents.getZoomFactor())) - 1.1) < 0.01);
    await win.getByRole("button", { name: "100%" }).click();
    await win.locator('[data-theme-card="redline"]').click();
    await win.locator('[data-bg="aurora"]').click();
  });

  await scenario("quick capture: the small window sorts out a line and saves it", async () => {
    const milkBefore = (await live("item")).filter((r) => r.data.name === "Milk").length;
    await menuClick("File", "Quick capture");
    const quick = await until("the quick window", async () => app.windows().find((w) => w.url().includes("quick")));
    await quick.getByTestId("quick-text").waitFor();
    await quick.getByTestId("quick-text").fill("milk and bread, call the bank at 11");
    await quick.keyboard.press("Enter");
    await quick.getByTestId("quick-review").waitFor({ timeout: 15000 });
    await quick.keyboard.press("Enter");
    await until("saved from the quick window", async () => (await live("item")).filter((r) => r.data.name === "Milk").length === milkBefore + 1);
    await until("the window put away", async () => !(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === "Quick capture" && w.isVisible()))));
  });

  await scenario("quick capture: money given to spend arrives with what to buy, linked to it", async () => {
    await menuClick("File", "Quick capture");
    const quick = await until("the quick window", async () => app.windows().find((w) => w.url().includes("quick")));
    await quick.getByTestId("quick-text").waitFor();
    await quick.getByTestId("quick-text").fill("Father gave me 2000 for medicine: panadol");
    await quick.keyboard.press("Enter");
    await quick.getByTestId("quick-review").waitFor({ timeout: 15000 });
    await quick.getByText(/with Father's money/).waitFor();
    await quick.keyboard.press("Enter");
    const fund = await until("the hisaab", async () => (await live("fund")).find((r) => r.data.from === "Father" && r.data.amount === 2000));
    await until("panadol on it", async () => (await live("item")).find((r) => r.data.name === "Panadol" && r.data.fund_id === fund.id));
  });

  await scenario("offline: changes made with no server are kept and sent when it comes back", async () => {
    await stopServer();
    await go("/todos?view=anytime");
    await win.getByTestId("quick-add").fill("Written while offline");
    await win.getByTestId("quick-add").press("Enter");
    await win.getByText("Written while offline").first().waitFor();
    await menuClick("File", "Sync now");
    await win.getByTestId("sync-line").getByText(/Offline|to send/).waitFor({ timeout: 15000 });
    server = await startServer(["--keep"]);
    await menuClick("File", "Sync now");
    await until("sent after reconnecting", async () => (await live("todo")).find((r) => r.data.title === "Written while offline"), 20000);
  });

  await scenario("restart: still signed in, records on this computer before the first sync", async () => {
    await app.close();
    await launch();
    await win.getByTestId("greeting").waitFor({ timeout: 15000 });
    await go("/todos?view=anytime");
    await win.getByText("Written while offline").first().waitFor();
  });

  await scenario("sign-out: back to the sign-in screen, this computer's copy cleared", async () => {
    await go("/settings?section=account");
    await win.getByRole("button", { name: "Sign out", exact: true }).first().click();
    await dialog().getByRole("button", { name: "Sign out" }).click();
    await win.getByLabel("Email").waitFor({ timeout: 15000 });
    await until("records cleared on disk", async () => {
      const f = path.join(dataDir, "records.json");
      return fs.existsSync(f) && Object.keys(JSON.parse(fs.readFileSync(f, "utf8")).records || {}).length === 0;
    });
  });

  await app.close().catch(() => {});
  await stopServer();
  await pool?.end().catch(() => {});
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} scenarios passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await app?.close().catch(() => {});
  await stopServer().catch(() => {});
  process.exit(1);
});
