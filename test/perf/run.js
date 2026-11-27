// How hard the app works, measured on the built app in real Electron against the real server on a
// test database with sample data (the end-to-end setup: see test/e2e/run.js for what it needs).
//
//   npm run build && node test/perf/run.js          (xvfb-run -a … without a display)
//   REDLINE_PROFILE=1 npm run build                  keeps component names readable in the report
//
// It reports, and fails on the limits at the bottom:
//   - CPU of every Electron process sitting idle on Today, and while the pointer moves, for each
//     background (Aurora, a 3D wallpaper, none);
//   - React work: commits, and which components rendered, while idle, while the pointer moves,
//     per key typed in a note, and per page opened;
//   - memory after going through every page several times (garbage collected first): the JS
//     heap, DOM nodes and event listeners must not keep growing;
//   - how long each page takes to open, and the long tasks while it does.
//
// Effects follow the app's own choice (Auto: light when Chromium draws without the graphics card,
// as it does under xvfb). PERF_EFFECTS=full or light measures one of them instead.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { _electron } = require("playwright-core");

const ROOT = path.resolve(__dirname, "../..");
const BACKEND = path.resolve(process.env.REDLINE_BACKEND_DIR || path.join(ROOT, "../myapp-backend"));
const PORT = Number(process.env.PERF_PORT || 4330);
const API = `http://127.0.0.1:${PORT}/api`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = ["/", "/capture", "/calendar", "/todos", "/lists", "/notes", "/saved", "/money", "/people", "/car", "/things", "/assistant", "/settings"];
const ONLY = process.env.PERF_ONLY ? process.env.PERF_ONLY.split(",") : null;
const want = (part) => !ONLY || ONLY.includes(part);

function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(ROOT, "test/e2e/server.js"), String(PORT), "--seed"], { env: { ...process.env, REDLINE_BACKEND_DIR: BACKEND }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    const t = setTimeout(() => reject(new Error(`server didn't start:\n${log}`)), 30000);
    p.stdout.on("data", (b) => {
      log += b;
      if (/READY/.test(log)) {
        clearTimeout(t);
        resolve(p);
      }
    });
    p.stderr.on("data", (b) => (log += b));
  });
}

// React tells a devtools hook about every commit; this one counts the components that rendered
// (the same test React DevTools uses: a component rendered if it performed work this commit;
// a subtree whose children weren't re-created didn't render at all)
const HOOK = `(() => {
  const r = { commits: 0, renders: {}, mounts: 0 };
  window.__perf = r;
  const nameOf = (f) => {
    const t = f.type;
    if (!t) return null;
    if (typeof t === "function") return t.displayName || t.name || "anonymous";
    if (typeof t === "object") {
      if (t.displayName) return t.displayName;
      const inner = t.render || t.type;
      if (inner) return (inner.displayName || inner.name || "anonymous");
    }
    return null;
  };
  const walk = (f) => {
    while (f) {
      if (f.tag === 0 || f.tag === 1 || f.tag === 11 || f.tag === 14 || f.tag === 15) {
        const mounted = f.alternate === null;
        if (mounted || (f.flags & 1)) {
          const n = nameOf(f);
          if (n) r.renders[n] = (r.renders[n] || 0) + 1;
          if (mounted) r.mounts++;
        }
      }
      if (f.child && !(f.alternate && f.child === f.alternate.child)) walk(f.child);
      f = f.sibling;
    }
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject(x) { const id = this.renderers.size + 1; this.renderers.set(id, x); return id; },
    onCommitFiberRoot(id, root) { r.commits++; walk(root.current.child); },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    checkDCE() {},
  };
  // long tasks (over 50 ms) while the page works
  r.long = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => r.long.push(Math.round(e.duration)))).observe({ entryTypes: ["longtask"] }); } catch {}
})();`;

(async () => {
  const report = { cpu: {}, react: {}, memory: [], pages: {} };
  const server = await startServer();
  global.__server = server;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "redline-perf-"));
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [path.join(ROOT, "out/main/index.js"), "--no-sandbox"],
    env: { ...process.env, REDLINE_DATA_DIR: dataDir, REDLINE_E2E: "1", REDLINE_API_URL: API },
  });
  let win;
  for (let i = 0; i < 50 && !win; i++) {
    await app.firstWindow();
    win = app.windows().find((w) => !w.url().includes("quick"));
    if (!win) await sleep(200);
  }
  win.setDefaultTimeout(15000);
  global.__win = win;
  await win.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  await win.addInitScript(HOOK);
  await win.reload();
  const go = async (to) => {
    await win.evaluate((h) => (location.hash = h), `#${to}`);
    await sleep(700);
  };

  // sign in
  await win.getByLabel("Email").fill("me@example.com");
  await win.getByLabel("Password").fill("correct horse battery");
  await win.keyboard.press("Enter");
  await win.getByRole("navigation").waitFor();
  await sleep(4000); // the first sync settles
  // measured as you use it: the window in front (ambient motion only runs then)
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.getTitle().includes("Quick"));
    if (w) {
      w.show();
      w.focus();
    }
  });
  await sleep(300);
  report.active = await win.evaluate(() => ({ focus: document.hasFocus(), visible: document.visibilityState, attr: document.documentElement.dataset.active || null }));
  report.gpu = await app.evaluate(({ app: a }) => String(a.getGPUFeatureStatus().gpu_compositing));
  if (report.active.attr === "false") {
    // no window manager to give it focus (xvfb): say it's in front, as it would be for you
    await win.evaluate(() => {
      document.documentElement.dataset.active = "true";
      window.dispatchEvent(new Event("focus"));
    });
  }

  const metrics = async () => app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => ({ type: m.type, cpu: m.cpu.percentCPUUsage, mem: Math.round(m.memory.workingSetSize / 1024) })));
  const cpuOver = async (ms, during) => {
    await metrics(); // resets the counters
    const t = Date.now();
    if (during) await during(ms);
    else await sleep(ms);
    const left = ms - (Date.now() - t);
    if (left > 0) await sleep(left);
    const m = await metrics();
    const by = {};
    for (const p of m) by[p.type] = Math.round(((by[p.type] || 0) + p.cpu) * 10) / 10;
    by.total = Math.round(m.reduce((n, p) => n + p.cpu, 0) * 10) / 10;
    return by;
  };
  const moveMouse = async (ms) => {
    const end = Date.now() + ms;
    let i = 0;
    while (Date.now() < end) {
      const a = (i++ / 30) * Math.PI * 2;
      await win.mouse.move(720 + Math.cos(a) * 400, 450 + Math.sin(a) * 250);
      await sleep(16);
    }
  };
  const react = async (fn) => {
    await win.evaluate(() => {
      window.__perf.commits = 0;
      window.__perf.renders = {};
      window.__perf.mounts = 0;
      window.__perf.long = [];
    });
    await fn();
    return win.evaluate(() => {
      const r = window.__perf;
      const top = Object.entries(r.renders).sort((a, b) => b[1] - a[1]);
      return { commits: r.commits, rendered: top.reduce((n, [, c]) => n + c, 0), mounts: r.mounts, top: top.slice(0, 12), long: r.long.slice() };
    });
  };
  const t0 = Date.now();
  const say = (m) => process.env.PERF_DEBUG && console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  const setBackground = async (id) => {
    say(`background ${id}`);
    await go("/settings?section=appearance");
    say(`settings open: ${await win.evaluate(() => location.hash)} cards ${await win.locator("[data-bg]").count()}`);
    await win.locator(`button[data-bg="${id}"]`).click();
    await sleep(800);
    await go("/");
    await win.mouse.move(5, 450);
    await sleep(9000); // the page's entrance and its few pulses are over: what's left is idle
  };

  if (process.env.PERF_EFFECTS) {
    await go("/settings?section=appearance");
    await win.locator(`[data-testid="effects"] [role="tab"]`, { hasText: new RegExp(`^${process.env.PERF_EFFECTS}$`, "i") }).click();
    await sleep(500);
  }
  report.effects = await win.evaluate(() => document.documentElement.dataset.effects || null);

  // ---- CPU per background
  if (want("cpu")) {
    for (const bg of ["aurora", "monolith", "none"]) {
      await setBackground(bg);
      report.cpu[bg] = { idle: await cpuOver(6000), pointer: await cpuOver(4000, moveMouse) };
    }
    // the pages with the orb, sitting still (no background, so only the orb counts)
    await setBackground("none");
    for (const p of ["/capture", "/assistant"]) {
      await go(p);
      await sleep(5000);
      report.cpu[`orb ${p}`] = { idle: await cpuOver(6000), pointer: await cpuOver(4000, moveMouse) };
    }
    await setBackground("aurora");
  }

  // ---- React work
  if (want("react")) {
    await go("/");
    await sleep(1500);
    report.react.idle10s = await react(() => sleep(10000));
    report.react.pointer4s = await react(() => moveMouse(4000));
    // typing in a note
    await go("/notes/new");
    await sleep(1200);
    const editor = win.locator("textarea").first();
    await editor.click();
    report.react.typing20 = await react(async () => {
      for (const ch of "the quick brown fox ") {
        await win.keyboard.type(ch);
        await sleep(60);
      }
      await sleep(600);
    });
    // a to-do's title in the quick-add line
    await go("/todos");
    await sleep(1000);
    const quickAdd = win.getByPlaceholder(/add a to-do/i).first();
    if (await quickAdd.count()) {
      await quickAdd.click();
      report.react.quickAdd20 = await react(async () => {
        for (const ch of "call the bank today ") {
          await win.keyboard.type(ch);
          await sleep(60);
        }
      });
      await win.keyboard.press("Escape");
    }
    // opening pages
    report.react.pages = await react(async () => {
      for (const p of PAGES) await go(p);
    });
  }

  // ---- page opening times
  if (want("pages")) {
    for (const p of PAGES) {
      await go("/");
      await sleep(300);
      const t = await win.evaluate(async (h) => {
        window.__perf.long = [];
        const t0 = performance.now();
        location.hash = h;
        // until the page's own main element has content and two frames have been drawn
        await new Promise((res) => {
          const check = () => {
            const m = document.querySelector("main");
            if (m && m.innerText.length > 20 && !/Opening/.test(m.innerText.slice(0, 40))) requestAnimationFrame(() => requestAnimationFrame(res));
            else setTimeout(check, 5);
          };
          check();
        });
        return { ms: Math.round(performance.now() - t0), long: window.__perf.long.slice() };
      }, `#${p}`);
      report.pages[p] = t;
    }
  }

  // ---- memory over rounds of use
  if (want("memory")) {
    const cdp = await win.context().newCDPSession(win);
    await cdp.send("HeapProfiler.enable");
    const sample = async (label) => {
      for (let i = 0; i < 3; i++) await cdp.send("HeapProfiler.collectGarbage");
      await sleep(300);
      const heap = await cdp.send("Runtime.getHeapUsage");
      const dom = await cdp.send("Memory.getDOMCounters");
      const main = await app.evaluate(() => Math.round(process.memoryUsage().heapUsed / 1024));
      report.memory.push({ label, heapKB: Math.round(heap.usedSize / 1024), nodes: dom.nodes, listeners: dom.jsEventListeners, documents: dom.documents, mainHeapKB: main });
    };
    await go("/");
    await sample("start");
    // PERF_ROUNDS=8 PERF_NOTE=0: more rounds, without the note (each one is saved: a real record)
    const rounds = Number(process.env.PERF_ROUNDS || 4);
    for (let round = 1; round <= rounds; round++) {
      for (const p of PAGES) await go(p);
      // the palette, an editor, a note typed and thrown away
      await go("/");
      await win.keyboard.press("Control+k");
      await sleep(400);
      await win.keyboard.type("milk");
      await sleep(300);
      await win.keyboard.press("Escape");
      await sleep(300);
      if (process.env.PERF_NOTE !== "0") {
        await go("/notes/new");
        await sleep(600);
        await win.locator("textarea").first().click();
        await win.keyboard.type("a passing note " + round);
        await sleep(500);
      }
      await go("/");
      await sample(`round ${round}`);
    }
  }

  await app.close();
  server.kill("SIGTERM");

  // ---- the report
  const out = process.env.PERF_OUT;
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  // limits: work that should not happen at all
  const fails = [];
  if (report.react.idle10s && report.react.idle10s.commits > 1) fails.push(`React committed ${report.react.idle10s.commits} times in 10 s with nothing happening`);
  if (report.react.pointer4s && report.react.pointer4s.commits > 2) fails.push(`moving the pointer made React commit ${report.react.pointer4s.commits} times`);
  if (report.memory.length > 2) {
    const a = report.memory[1];
    const b = report.memory[report.memory.length - 1];
    if (b.heapKB - a.heapKB > 4096) fails.push(`the JS heap grew ${b.heapKB - a.heapKB} KB over ${report.memory.length - 2} rounds`);
    if (b.listeners - a.listeners > 50) fails.push(`${b.listeners - a.listeners} event listeners were left behind`);
    if (b.nodes - a.nodes > 1500) fails.push(`${b.nodes - a.nodes} DOM nodes were left behind`);
  }
  if (fails.length) {
    console.log("\nOVER THE LIMITS:\n  " + fails.join("\n  "));
    process.exit(1);
  }
  console.log("\nwithin the limits");
})().catch(async (e) => {
  console.error(e);
  if (global.__win) await global.__win.screenshot({ path: path.join(os.tmpdir(), "redline-perf-failed.png") }).catch(() => {});
  if (global.__server) global.__server.kill("SIGTERM");
  process.exit(1);
});
