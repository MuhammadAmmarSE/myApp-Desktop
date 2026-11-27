// What keeps moving on a quiet page: every running CSS / Web animation (with what it is on), and
// every requestAnimationFrame loop (who asks for frames). Run like test/perf/run.js:
//   xvfb-run -a node test/perf/animations.js [/path …]
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { _electron } = require("playwright-core");

const ROOT = path.resolve(__dirname, "../..");
const BACKEND = path.resolve(process.env.REDLINE_BACKEND_DIR || path.join(ROOT, "../myapp-backend"));
const PORT = Number(process.env.PERF_PORT || 4331);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/todos", "/notes", "/calendar", "/money", "/assistant"];

// count requestAnimationFrame calls by the function that asked
const RAF = `(() => {
  const by = new Map();
  window.__raf = by;
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    const where = (new Error().stack || "").split("\\n").slice(2, 5).map((l) => l.trim().replace(/\\(?file:.*\\/(assets\\/[^:]+:\\d+).*$/, "$1")).join(" < ");
    by.set(where, (by.get(where) || 0) + 1);
    return orig(cb);
  };
})();`;

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
    env: { ...process.env, REDLINE_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "redline-anim-")), REDLINE_E2E: "1", REDLINE_API_URL: `http://127.0.0.1:${PORT}/api` },
  });
  let win;
  for (let i = 0; i < 50 && !win; i++) {
    await app.firstWindow();
    win = app.windows().find((w) => !w.url().includes("quick"));
    if (!win) await sleep(200);
  }
  await win.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  await win.addInitScript(RAF);
  await win.reload();
  await win.getByLabel("Email").fill("me@example.com");
  await win.getByLabel("Password").fill("correct horse battery");
  await win.keyboard.press("Enter");
  await win.getByRole("navigation").waitFor();
  await sleep(3000);
  if (process.env.BG) {
    await win.evaluate(() => (location.hash = "#/settings?section=appearance"));
    await sleep(800);
    await win.locator(`button[data-bg="${process.env.BG}"]`).click();
    await sleep(500);
  }
  await win.mouse.move(2, 450);
  for (const p of PAGES) {
    await win.evaluate((h) => (location.hash = h), `#${p}`);
    await sleep(Number(process.env.SETTLE || 2500));
    const found = await win.evaluate(async () => {
      window.__raf.clear();
      await new Promise((r) => setTimeout(r, 2000));
      const raf = [...window.__raf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      const describe = (el) => {
        if (!el || !el.tagName) return String(el);
        const cls = (el.getAttribute("class") || "").split(/\s+/).slice(0, 4).join(".");
        const label = el.getAttribute("aria-label") || el.getAttribute("data-testid") || "";
        return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${label ? ` "${label}"` : ""}`;
      };
      const anims = document.getAnimations().filter((a) => a.playState === "running").map((a) => {
        const t = a.effect && a.effect.target;
        const timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
        return `${a.constructor.name}${a.animationName ? " " + a.animationName : ""} ${timing.iterations === Infinity ? "∞" : timing.iterations} on ${describe(t)} (inside ${describe(t && t.parentElement)})`;
      });
      return { raf, anims };
    });
    console.log(`\n== ${p}`);
    console.log(`  requestAnimationFrame in 2 s:`);
    for (const [w, n] of found.raf) console.log(`    ${n}  ${w}`);
    console.log(`  running animations: ${found.anims.length}`);
    for (const a of [...new Set(found.anims)].slice(0, 25)) console.log(`    ${a}`);
  }
  await app.close();
  server.kill("SIGTERM");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
