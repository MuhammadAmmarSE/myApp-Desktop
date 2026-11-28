// Everything the screens may ask the main process to do. Each handler checks what it is given:
// the page is treated as untrusted input even though it is our own.
import fs from "fs";
import os from "os";
import path from "path";
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, systemPreferences } from "electron";
import { CH, type Alert, type Command, type Draft, type HttpMethod, type Prefs, type QuickContext, type StoredRec } from "@shared/ipc";
import { request } from "./http";
import { clearToken, normaliseServer, previousUser, saveSession, session, BUILT_IN_SERVER } from "./session";
import { loadRecords, markClean, putRecords, setMeta, wipeRecords } from "./records";
import { getPrefs, setPrefs } from "./prefs";
import { schedule, show as showNotification, testNotification } from "./reminders";
import { applyStartAtLogin } from "./startup";
import { recordKeys, registerQuickShortcut, registerTalkShortcut } from "./shortcuts";
import { buildMenu } from "./menu";
import { broadcast, command, hideQuick, mainWindow, openQuick, setQuitting, winState } from "./windows";
import { buildTrayMenu } from "./tray";

let quickContext: QuickContext | null = null;
const MAX_TEXT_FILE = 50 * 1024 * 1024;
const MAX_IMAGE = 25 * 1024 * 1024;
const MAX_SEND_FILE = 10 * 1024 * 1024; // what the server takes, each (20 MB together)
const MAX_SAVE_FILE = 25 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic", ".bmp": "image/bmp" };

const touchIdAvailable = () => {
  try {
    return process.platform === "darwin" && systemPreferences.canPromptTouchID();
  } catch {
    return false;
  }
};

const deviceName = () => {
  const host = os.hostname().replace(/\.local$/, "");
  const kind = process.platform === "darwin" ? "Mac" : process.platform === "win32" ? "Windows PC" : "Linux PC";
  return `${kind}${host ? ` (${host})` : ""}`.slice(0, 120);
};

// Chromium draws without the graphics card when its driver is blocked (common on older or remote
// Windows PCs): blur and full-window movement then cost real CPU, so the screens use lighter effects.
function gpuMode(): "hardware" | "software" {
  try {
    const status = app.getGPUFeatureStatus() as unknown as Record<string, string>;
    return /^enabled/.test(String(status.gpu_compositing || "")) ? "hardware" : "software";
  } catch {
    return "hardware";
  }
}

export function applyPrefs(p: Prefs, changed: Partial<Prefs>): string | undefined {
  let error: string | undefined;
  if ("startAtLogin" in changed || "startHidden" in changed) error = applyStartAtLogin(p.startAtLogin, p.startHidden);
  if ("quickShortcut" in changed) error = registerQuickShortcut(p.quickShortcut) || error;
  if ("talkShortcut" in changed) error = registerTalkShortcut(p.talkShortcut) || error;
  if ("quickShortcut" in changed || "talkShortcut" in changed) buildMenu();
  if ("zoom" in changed) for (const w of BrowserWindow.getAllWindows()) w.webContents.setZoomFactor(p.zoom);
  buildTrayMenu();
  broadcast(CH.evPrefs, p);
  return error;
}

export function registerIpc() {
  const winOf = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);

  ipcMain.handle(CH.appInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    packaged: app.isPackaged,
    dataDir: app.getPath("userData"),
    touchId: touchIdAvailable(),
    gpu: gpuMode(),
  }));
  ipcMain.handle(CH.openExternal, async (_e, url: string) => {
    if (typeof url !== "string" || !/^(https?:\/\/|mailto:|tel:)/i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });
  ipcMain.on(CH.quit, () => {
    setQuitting();
    app.quit();
  });

  ipcMain.on(CH.winMinimize, (e) => winOf(e)?.minimize());
  ipcMain.on(CH.winToggleMax, (e) => {
    const w = winOf(e);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.on(CH.winClose, (e) => winOf(e)?.close());
  ipcMain.handle(CH.winState, () => winState());
  ipcMain.on(CH.winZoom, (_e, factor: number) => {
    const p = setPrefs({ zoom: factor });
    applyPrefs(p, { zoom: p.zoom });
  });

  ipcMain.handle(CH.api, (_e, method: HttpMethod, pathname: string, body?: unknown, opts?: { timeoutMs?: number }) => request(method, pathname, body, { timeoutMs: opts?.timeoutMs }));

  ipcMain.handle(CH.session, () => session());
  ipcMain.handle(CH.signIn, async (_e, input: { server: string; email: string; password: string }) => {
    const server = normaliseServer(input?.server || BUILT_IN_SERVER);
    const email = String(input?.email || "").trim();
    const password = String(input?.password || "");
    if (!email || !password) return { ok: false, code: "MISSING", message: "Enter your email and password.", status: 0 };
    const r = await request<{ token: string; user: { id: number; email: string; name: string } }>(
      "POST",
      "/auth/sign-in",
      { email, password, device_name: deviceName(), platform: "desktop" },
      { server, token: null },
    );
    if (!r.ok) return r;
    // a different account on this computer: start from an empty copy
    const before = previousUser();
    const replaced = !!before && before.id !== r.data.user.id;
    if (replaced) await wipeRecords();
    await saveSession(server, r.data.user, r.data.token);
    return { ok: true, data: { user: r.data.user, replaced } };
  });
  ipcMain.handle(CH.signOut, async () => {
    await request("POST", "/auth/sign-out", {}, { timeoutMs: 6000 }).catch(() => null);
    await clearToken();
    await wipeRecords();
  });

  // confirm it is you before approving an assistant step: Touch ID on a Mac that has it,
  // otherwise the screens ask for the account password (checked by the server)
  ipcMain.handle(CH.identity, async (_e, reason: string) => {
    if (touchIdAvailable()) {
      try {
        await systemPreferences.promptTouchID(String(reason || "approve this step").slice(0, 120));
        return { method: "touchid", ok: true };
      } catch (e: any) {
        return { method: "touchid", ok: false, message: e?.message ? "Touch ID didn't confirm it was you." : undefined };
      }
    }
    return { method: "password" };
  });
  ipcMain.handle(CH.confirmPassword, (_e, password: string) => {
    if (typeof password !== "string" || !password) return { ok: false, code: "MISSING", message: "Enter your password.", status: 0 };
    return request("POST", "/auth/confirm", { password: password.slice(0, 200) }, { timeoutMs: 15000 });
  });

  // the microphone: a Mac asks you the first time (with the words in electron-builder.yml); Windows
  // has a switch for it in its privacy settings. The page itself only gets audio (index.ts).
  ipcMain.handle(CH.micAccess, async () => {
    if (process.platform !== "darwin" && process.platform !== "win32") return "granted";
    try {
      const s = systemPreferences.getMediaAccessStatus("microphone");
      if (s === "granted") return "granted";
      if (s === "not-determined" && process.platform === "darwin") return (await systemPreferences.askForMediaAccess("microphone")) ? "granted" : "denied";
      if (s === "restricted") return "restricted";
      return s === "denied" ? "denied" : "granted";
    } catch {
      return "granted"; // can't tell: let Chromium try
    }
  });

  ipcMain.handle(CH.dbLoad, () => loadRecords());
  ipcMain.handle(CH.dbPut, (_e, recs: StoredRec[]) => putRecords(recs));
  ipcMain.handle(CH.dbClean, (_e, list: { id: string; updated_at: number }[]) => markClean(list));
  ipcMain.handle(CH.dbMeta, (_e, key: string, value: string) => setMeta(key, value));
  ipcMain.handle(CH.dbWipe, () => wipeRecords());

  // Settings recording a shortcut: only the main window, the one asking
  ipcMain.on(CH.shortcutsRecord, (e, on: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    recordKeys(win && win === mainWindow ? win : null, on === true);
  });

  ipcMain.handle(CH.prefsGet, () => getPrefs());
  ipcMain.handle(CH.prefsSet, (_e, patch: Partial<Prefs>) => {
    const before = getPrefs();
    const p = setPrefs(patch);
    const changed: Partial<Prefs> = {};
    for (const k of Object.keys(p) as (keyof Prefs)[]) if (p[k] !== before[k]) (changed as any)[k] = p[k];
    let error = applyPrefs(p, changed);
    // a shortcut that can't be used goes back to the one that worked
    if (error && ("quickShortcut" in changed || "talkShortcut" in changed)) {
      const back = setPrefs("quickShortcut" in changed ? { quickShortcut: before.quickShortcut } : { talkShortcut: before.talkShortcut });
      if ("quickShortcut" in changed) registerQuickShortcut(back.quickShortcut);
      else registerTalkShortcut(back.talkShortcut);
      buildMenu();
      buildTrayMenu();
      broadcast(CH.evPrefs, back);
      return { prefs: back, error };
    }
    return { prefs: p, error };
  });

  ipcMain.handle(CH.remindersSchedule, (_e, alerts: Alert[]) => schedule(alerts));
  ipcMain.handle(CH.remindersTest, () => testNotification());
  ipcMain.handle(CH.notify, (e, n: { title: string; body: string; url: string }) => {
    if (!n || typeof n.title !== "string") return;
    if (!getPrefs().notifications) return;
    // no need to say it to someone looking at the window
    const w = winOf(e);
    if (w && w.isVisible() && w.isFocused()) return;
    showNotification({ title: n.title.slice(0, 200), body: String(n.body || "").slice(0, 400), url: typeof n.url === "string" && n.url.startsWith("/") ? n.url : "/" });
  });

  ipcMain.handle(CH.saveText, async (e, input: { name: string; text: string; filters?: { name: string; extensions: string[] }[] }) => {
    const w = winOf(e);
    const opts = { defaultPath: path.join(app.getPath("documents"), path.basename(String(input?.name || "redline.txt"))), filters: input?.filters };
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    await fs.promises.writeFile(r.filePath, String(input?.text ?? ""), "utf8");
    return r.filePath;
  });
  ipcMain.handle(CH.openText, async (e, input: { filters?: { name: string; extensions: string[] }[] }) => {
    const w = winOf(e);
    const opts: Electron.OpenDialogOptions = { properties: ["openFile"], filters: input?.filters };
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    if (r.canceled || !r.filePaths[0]) return null;
    const st = await fs.promises.stat(r.filePaths[0]);
    if (st.size > MAX_TEXT_FILE) throw new Error("That file is too big to open.");
    return { name: path.basename(r.filePaths[0]), text: await fs.promises.readFile(r.filePaths[0], "utf8") };
  });
  ipcMain.handle(CH.pickImages, async (e, max: number) => {
    const w = winOf(e);
    const opts: Electron.OpenDialogOptions = { properties: ["openFile", "multiSelections"], filters: [{ name: "Images", extensions: Object.keys(IMAGE_TYPES).map((x) => x.slice(1)) }] };
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    if (r.canceled) return [];
    const out = [];
    for (const p of r.filePaths.slice(0, Math.max(1, Math.min(8, Number(max) || 4)))) {
      const type = IMAGE_TYPES[path.extname(p).toLowerCase()];
      const st = await fs.promises.stat(p);
      if (!type || st.size > MAX_IMAGE) continue;
      out.push({ name: path.basename(p), data: `data:${type};base64,${(await fs.promises.readFile(p)).toString("base64")}` });
    }
    return out;
  });

  // files for the assistant: any kind, each up to 10 MB, together within what's left (`room`)
  ipcMain.handle(CH.pickFiles, async (e, max: number, room: number) => {
    const w = winOf(e);
    const opts: Electron.OpenDialogOptions = { properties: ["openFile", "multiSelections"] };
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    if (r.canceled) return { files: [], skipped: [] };
    const files = [];
    const skipped: string[] = [];
    let left = Math.max(0, Number(room) || 0);
    for (const p of r.filePaths.slice(0, Math.max(1, Math.min(4, Number(max) || 4)))) {
      const st = await fs.promises.stat(p);
      if (!st.isFile() || st.size > MAX_SEND_FILE || st.size > left) {
        skipped.push(path.basename(p));
        continue;
      }
      left -= st.size;
      files.push({ name: path.basename(p), size: st.size, data: (await fs.promises.readFile(p)).toString("base64") });
    }
    return { files, skipped };
  });
  // a file the assistant has, saved where the person chooses
  ipcMain.handle(CH.saveFile, async (e, input: { name: string; data: string }) => {
    const data = String(input?.data || "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || (data.length * 3) / 4 > MAX_SAVE_FILE) throw new Error("That file couldn't be saved.");
    const w = winOf(e);
    const opts = { defaultPath: path.join(app.getPath("downloads"), path.basename(String(input?.name || "file"))) };
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    await fs.promises.writeFile(r.filePath, Buffer.from(data, "base64"));
    return r.filePath;
  });

  ipcMain.on(CH.clipboard, (_e, text: string) => clipboard.writeText(String(text ?? "")));
  // only text, and only when a page asks (Saved's "Paste as new")
  ipcMain.handle(CH.clipboardRead, async () => String((await clipboard.readText()) || "").slice(0, 20000));

  ipcMain.on(CH.quickOpen, () => openQuick());
  ipcMain.on(CH.quickClose, () => hideQuick());
  ipcMain.handle(CH.quickContext, () => quickContext);
  ipcMain.on(CH.quickSetContext, (_e, ctx: QuickContext) => {
    if (ctx && typeof ctx === "object")
      quickContext = {
        currency: String(ctx.currency || ""),
        themeId: String(ctx.themeId || ""),
        motion: ctx.motion === "reduced" ? "reduced" : "full",
        people: Array.isArray(ctx.people) ? ctx.people.slice(0, 500) : [],
        funds: Array.isArray(ctx.funds)
          ? ctx.funds
              .filter((f) => f && typeof f.id === "string")
              .slice(0, 20)
              .map((f) => ({ id: f.id.slice(0, 64), from: String(f.from || "").slice(0, 60), purpose: String(f.purpose || "").slice(0, 60), left: Number(f.left) || 0 }))
          : [],
        pots: Array.isArray(ctx.pots)
          ? ctx.pots
              .filter((p) => p && typeof p.id === "string")
              .slice(0, 30)
              .map((p) => ({ id: p.id.slice(0, 64), name: String(p.name || "").slice(0, 60), type: ["spend", "bills", "save", "debt"].includes(p.type) ? p.type : "spend", balance: Number(p.balance) || 0, rule: !!p.rule }))
          : [],
        owed: Array.isArray(ctx.owed)
          ? ctx.owed
              .filter((o) => o && typeof o.id === "string")
              .slice(0, 20)
              .map((o) => ({ id: o.id.slice(0, 64), who: String(o.who || "").slice(0, 60), type: o.type === "loan" ? ("loan" as const) : ("keeping" as const), left: Number(o.left) || 0 }))
          : [],
      };
  });
  // the quick window doesn't keep records: what it saves is made by the main window
  ipcMain.handle(CH.quickSave, (_e, drafts: Draft[], say: string) => {
    if (!mainWindow || !Array.isArray(drafts)) return false;
    command({ type: "create", drafts: drafts.slice(0, 50), say: typeof say === "string" ? say.slice(0, 120) : undefined }, { show: false });
    return true;
  });
  ipcMain.on(CH.quickToMain, (_e, cmd: Command) => {
    hideQuick();
    if (cmd && typeof cmd === "object" && typeof (cmd as any).type === "string") command(cmd);
  });

  ipcMain.on(CH.badge, (_e, n: number) => {
    const count = Math.max(0, Math.min(999, Math.round(Number(n) || 0)));
    try {
      app.setBadgeCount(count);
    } catch {
      /* not supported here */
    }
  });
}
