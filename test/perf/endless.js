// Which mounted components carry an endless motion animation, and where they sit in the tree.
// Run like test/perf/run.js:  xvfb-run -a node test/perf/endless.js [/path …]
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { _electron } = require("playwright-core");
const ROOT = path.resolve(__dirname, "../..");
const BACKEND = path.resolve(process.env.REDLINE_BACKEND_DIR || path.join(ROOT, "../myapp-backend"));
const PORT = Number(process.env.PERF_PORT || 4332);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/todos", "/notes", "/money"];
(async () => {
  const server = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(ROOT, "test/e2e/server.js"), String(PORT), "--seed"], { env: { ...process.env, REDLINE_BACKEND_DIR: BACKEND }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    p.stdout.on("data", (b) => ((log += b), /READY/.test(log) && resolve(p)));
    p.stderr.on("data", (b) => (log += b));
    setTimeout(() => reject(new Error(log)), 30000);
  });
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [path.join(ROOT, "out/main/index.js"), "--no-sandbox"],
    env: { ...process.env, REDLINE_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "redline-endless-")), REDLINE_E2E: "1", REDLINE_API_URL: `http://127.0.0.1:${PORT}/api` },
  });
  let win;
  for (let i = 0; i < 50 && !win; i++) {
    await app.firstWindow();
    win = app.windows().find((w) => !w.url().includes("quick"));
    if (!win) await sleep(200);
  }
  await win.getByLabel("Email").fill("me@example.com");
  await win.getByLabel("Password").fill("correct horse battery");
  await win.keyboard.press("Enter");
  await win.getByRole("navigation").waitFor();
  await sleep(3000);
  for (const p of PAGES) {
    await win.evaluate((h) => (location.hash = h), `#${p}`);
    await sleep(2500);
    const found = await win.evaluate(() => {
      const el = document.getElementById("root");
      const key = Object.keys(el).find((k) => k.startsWith("__reactContainer$"));
      const out = [];
      const nameOf = (f) => {
        const t = f.type;
        if (!t) return null;
        if (typeof t === "string") return null;
        if (typeof t === "function") return t.displayName || t.name;
        return t.displayName || (t.render && (t.render.displayName || t.render.name)) || (t.type && (t.type.displayName || t.type.name)) || null;
      };
      const endless = (tr) => {
        if (!tr || typeof tr !== "object") return false;
        if (tr.repeat === Infinity) return true;
        return Object.values(tr).some((v) => v && typeof v === "object" && v.repeat === Infinity);
      };
      const walk = (f, trail) => {
        while (f) {
          const n = nameOf(f);
          const t = n ? [...trail, n] : trail;
          const p = f.memoizedProps;
          if (p && typeof p === "object" && (endless(p.transition) || (p.style && typeof p.style.animation === "string" && /infinite/.test(p.style.animation)))) {
            const host = typeof f.type === "string" ? f.type : n;
            out.push(`${host}: ${t.filter((x) => !/^(Fragment|MotionComponent|LayoutGroup|PresenceChild|PopChild|PopChildMeasure|MeasureLayout|MeasureLayoutWithContext|AnimatePresence|Suspense)$/.test(x)).slice(-6).join(" > ")}`);
          }
          walk(f.child, t);
          f = f.sibling;
        }
      };
      walk(el[key], []);
      return out;
    });
    console.log(`\n== ${p}`);
    for (const f of [...new Set(found)]) console.log("  " + f);
  }
  await app.close();
  server.kill("SIGTERM");
})().catch((e) => (console.error(e), process.exit(1)));
