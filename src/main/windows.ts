// The two windows: the main one, and Quick capture (a small panel that comes up over whatever you
// are doing, from anywhere, with a shortcut). Both load the same page; Quick capture opens it on
// #/quick. Neither can navigate away from the app or open other windows: links go to the browser.
import path from "path";
import { app, BrowserWindow, screen, shell } from "electron";
import { CH, type Command } from "@shared/ipc";
import { getPrefs, saveWindowState, windowState, type Bounds } from "./prefs";
import { resource } from "./resources";

export let mainWindow: BrowserWindow | null = null;
export let quickWindow: BrowserWindow | null = null;
let quitting = false;
export const setQuitting = () => (quitting = true);
export const isQuitting = () => quitting;

const isMac = process.platform === "darwin";
const preload = path.join(__dirname, "../preload/index.js");
const icon = resource("icon.png");

function load(win: BrowserWindow, hash = "") {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void win.loadURL(`${dev}${hash ? `#${hash}` : ""}`);
  else void win.loadFile(path.join(__dirname, "../renderer/index.html"), hash ? { hash } : undefined);
}

// links open in the browser; nothing else leaves the app
function guard(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    const dev = process.env.ELECTRON_RENDERER_URL;
    const own = url.startsWith("file://") || (dev && url.startsWith(dev));
    if (!own) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
}

// a saved place is used only if it is still on one of the screens
function onScreen(b: Bounds | null): Bounds | null {
  if (!b || b.width < 400 || b.height < 300) return null;
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 80 < a.x + a.width && b.x + b.width - 80 > a.x && b.y + 40 < a.y + a.height && b.y + 20 > a.y - 10;
  });
  return visible ? b : null;
}

const webPreferences = {
  preload,
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  spellcheck: true,
  // Hidden, minimised or in the tray, the page slows down and draws nothing. Reminders fire from
  // the main process (reminders.ts) and the assistant listens over the network, so neither needs
  // the page awake; with throttling off, a hidden window kept drawing every frame.
  backgroundThrottling: true,
};

export function createMainWindow(opts: { show: boolean }) {
  const saved = windowState();
  const bounds = onScreen(saved.bounds);
  const work = screen.getPrimaryDisplay().workAreaSize;
  const width = bounds?.width ?? Math.min(1360, Math.max(1024, Math.round(work.width * 0.78)));
  const height = bounds?.height ?? Math.min(880, Math.max(700, Math.round(work.height * 0.84)));
  mainWindow = new BrowserWindow({
    width,
    height,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 920,
    minHeight: 620,
    show: false,
    title: "Redline",
    icon,
    backgroundColor: "#09090B",
    frame: isMac,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    webPreferences,
  });
  guard(mainWindow);
  load(mainWindow);
  if (saved.maximized) mainWindow.maximize();

  mainWindow.once("ready-to-show", () => {
    mainWindow?.webContents.setZoomFactor(getPrefs().zoom || 1);
    if (opts.show) showMain();
  });

  const remember = () => {
    if (!mainWindow || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
    saveWindowState({ bounds: mainWindow.isMaximized() ? (windowState().bounds ?? null) : mainWindow.getBounds(), maximized: mainWindow.isMaximized() });
  };
  mainWindow.on("resize", remember);
  mainWindow.on("move", remember);
  const tell = () => mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send(CH.evWindow, winState());
  for (const ev of ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "focus", "blur"] as const) mainWindow.on(ev as any, () => {
    remember();
    tell();
  });

  // closing keeps Redline in the tray (reminders still ring) unless you asked it to quit
  mainWindow.on("close", (e) => {
    if (!quitting && getPrefs().closeToTray) {
      e.preventDefault();
      mainWindow?.hide();
      if (isMac) app.dock?.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}

export function winState() {
  return { maximized: !!mainWindow?.isMaximized(), fullscreen: !!mainWindow?.isFullScreen(), focused: !!mainWindow?.isFocused() };
}

export function showMain() {
  if (!mainWindow) createMainWindow({ show: true });
  if (!mainWindow) return;
  if (isMac) void app.dock?.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

export function toggleMain() {
  if (mainWindow?.isVisible() && mainWindow.isFocused()) mainWindow.hide();
  else showMain();
}

// a command for the main window (from the tray, the menu, a notification, the quick window)
export function command(cmd: Command, opts: { show?: boolean } = {}) {
  if (opts.show !== false) showMain();
  const send = () => mainWindow?.webContents.send(CH.evCommand, cmd);
  if (!mainWindow) return;
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once("did-finish-load", () => setTimeout(send, 300));
  else send();
}

const QUICK_W = 680;
const QUICK_H = 470;

export function createQuickWindow() {
  quickWindow = new BrowserWindow({
    width: QUICK_W,
    height: QUICK_H,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: true,
    backgroundColor: "#00000000",
    title: "Quick capture",
    icon,
    webPreferences,
  });
  quickWindow.setAlwaysOnTop(true, "floating");
  if (isMac) quickWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  guard(quickWindow);
  load(quickWindow, "/quick");
  // it goes away when you click elsewhere, like a launcher (not while testing it)
  quickWindow.on("blur", () => {
    if (process.env.REDLINE_E2E) return;
    setTimeout(() => {
      if (quickWindow && !quickWindow.isDestroyed() && !quickWindow.isFocused()) quickWindow.hide();
    }, 120);
  });
  quickWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      quickWindow?.hide();
    }
  });
  quickWindow.on("closed", () => {
    quickWindow = null;
  });
  return quickWindow;
}

// comes up on the screen the pointer is on, a third of the way down
export function openQuick() {
  if (!quickWindow) createQuickWindow();
  if (!quickWindow) return;
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  quickWindow.setBounds({ x: Math.round(d.x + (d.width - QUICK_W) / 2), y: Math.round(d.y + d.height * 0.2), width: QUICK_W, height: QUICK_H });
  quickWindow.show();
  quickWindow.focus();
  quickWindow.webContents.send(CH.evQuickShown);
}

export function hideQuick() {
  quickWindow?.hide();
}

export function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}
