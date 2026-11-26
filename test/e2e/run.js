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
    args: [path.join(ROOT, "out/main/index.js"), "--no-sandbox"],
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
    true
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

  await scenario("settings: theme, wallpaper and text size apply at once", async () => {
    await go("/settings?section=appearance");
    const accent = () => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-accent").trim());
    const was = await accent();
    await win.locator('[data-theme-card="midnight"]').click();
    await until("the accent changes", async () => (await accent()) !== was);
    await win.locator('[data-bg="peaks"]').click();
    await until("the wallpaper shows", async () => (await win.locator('[data-wallpaper="peaks"] [style*="url("]').count()) === 2);
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
