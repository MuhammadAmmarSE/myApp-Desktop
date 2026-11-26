// Redline for the desktop: the app's life. One copy runs at a time (a second start brings the first
// to the front); closing the window keeps it in the tray so reminders still ring; redline:// links
// open a page or Quick capture.
import path from "path";
import { app, BrowserWindow, session as electronSession } from "electron";
import { CH } from "@shared/ipc";
import { applyPrefs, registerIpc } from "./ipc";
import { whenSignedOut } from "./http";
import { clearToken, loadSession } from "./session";
import { flushRecords } from "./records";
import { flushPrefs, getPrefs } from "./prefs";
import { nextAlert, startReminders, stopReminders, whenNextChanges } from "./reminders";
import { buildMenu } from "./menu";
import { createTray, destroyTray, setTrayNext } from "./tray";
import { registerQuickShortcut, unregisterAll } from "./shortcuts";
import { openedHidden } from "./startup";
import { broadcast, command, createMainWindow, createQuickWindow, mainWindow, openQuick, setQuitting, showMain } from "./windows";

// tests and a second profile run with their own data folder
if (process.env.REDLINE_DATA_DIR) app.setPath("userData", path.resolve(process.env.REDLINE_DATA_DIR));
app.setName("Redline");
if (process.platform === "win32") app.setAppUserModelId("app.redline.desktop") // the same as electron-builder.yml appId, or Windows notifications go unnamed;

// redline://capture?text=…, redline://open/todos
function openLink(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "redline:") return;
    const where = `${u.host}${u.pathname}`.replace(/\/+$/, "");
    if (where === "capture" || where === "quick") {
      const text = u.searchParams.get("text");
      if (text) command({ type: "navigate", to: `/capture?text=${encodeURIComponent(text.slice(0, 2000))}` });
      else openQuick();
    } else if (where.startsWith("open")) {
      const page = where.slice(4) || "/";
      command({ type: "navigate", to: page.startsWith("/") ? page : `/${page}` });
    } else showMain();
  } catch {
    showMain();
  }
}

const single = process.env.REDLINE_E2E ? true : app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const link = argv.find((a) => a.startsWith("redline://"));
    if (link) openLink(link);
    else showMain();
  });
  app.on("open-url", (e, url) => {
    e.preventDefault();
    if (app.isReady()) openLink(url);
    else app.once("ready", () => setTimeout(() => openLink(url), 800));
  });

  app.whenReady().then(() => {
    if (app.isPackaged) app.setAsDefaultProtocolClient("redline");
    // the page makes no network requests of its own and needs no permissions
    electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(permission === "clipboard-sanitized-write" || permission === "notifications"));

    loadSession();
    whenSignedOut((message) => {
      void clearToken();
      broadcast(CH.evCommand, { type: "navigate", to: `/sign-in?notice=${encodeURIComponent(message)}` });
    });
    registerIpc();
    buildMenu();

    const hidden = openedHidden() && getPrefs().startHidden;
    createMainWindow({ show: !hidden });
    createQuickWindow();
    createTray();
    whenNextChanges(setTrayNext);
    setTrayNext(nextAlert());
    startReminders();
    const p = getPrefs();
    applyPrefs(p, { quickShortcut: p.quickShortcut });
    registerQuickShortcut(p.quickShortcut);

    const link = process.argv.find((a) => a.startsWith("redline://"));
    if (link) setTimeout(() => openLink(link), 800);

    app.on("activate", () => {
      if (!mainWindow || BrowserWindow.getAllWindows().length === 0) createMainWindow({ show: true });
      else showMain();
    });
  });

  // Redline keeps running in the tray when its windows are closed
  app.on("window-all-closed", () => {
    if (!getPrefs().closeToTray) {
      setQuitting();
      app.quit();
    }
  });
  app.on("before-quit", () => {
    setQuitting();
    flushRecords();
    flushPrefs();
    stopReminders();
  });
  app.on("will-quit", () => {
    unregisterAll();
    destroyTray();
  });
}
