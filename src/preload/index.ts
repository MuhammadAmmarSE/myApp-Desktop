// The bridge between the page and the main process: window.redline. Only these calls exist; the
// page has no Node, no file system and no network of its own.
import { contextBridge, ipcRenderer } from "electron";
import { CH, type Bridge } from "../shared/ipc";

const listen = (channel: string, cb: (...a: any[]) => void) => {
  const fn = (_e: unknown, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => {
    ipcRenderer.removeListener(channel, fn);
  };
};

const EVENTS: Record<string, string> = { command: CH.evCommand, window: CH.evWindow, "quick-shown": CH.evQuickShown, prefs: CH.evPrefs, "shortcut-key": CH.evShortcutKey };

const bridge: Bridge = {
  app: {
    info: () => ipcRenderer.invoke(CH.appInfo),
    openExternal: (url) => ipcRenderer.invoke(CH.openExternal, url),
    quit: () => ipcRenderer.send(CH.quit),
    platform: process.platform,
  },
  win: {
    minimize: () => ipcRenderer.send(CH.winMinimize),
    toggleMaximize: () => ipcRenderer.send(CH.winToggleMax),
    close: () => ipcRenderer.send(CH.winClose),
    state: () => ipcRenderer.invoke(CH.winState),
    setZoom: (f) => ipcRenderer.send(CH.winZoom, f),
  },
  api: { request: (method, path, body, opts) => ipcRenderer.invoke(CH.api, method, path, body, opts) },
  auth: {
    session: () => ipcRenderer.invoke(CH.session),
    signIn: (input) => ipcRenderer.invoke(CH.signIn, input),
    signOut: () => ipcRenderer.invoke(CH.signOut),
    identity: (reason) => ipcRenderer.invoke(CH.identity, reason),
    confirmPassword: (pw) => ipcRenderer.invoke(CH.confirmPassword, pw),
  },
  db: {
    load: () => ipcRenderer.invoke(CH.dbLoad),
    put: (recs) => ipcRenderer.invoke(CH.dbPut, recs),
    markClean: (list) => ipcRenderer.invoke(CH.dbClean, list),
    setMeta: (k, v) => ipcRenderer.invoke(CH.dbMeta, k, v),
    wipe: () => ipcRenderer.invoke(CH.dbWipe),
  },
  prefs: { get: () => ipcRenderer.invoke(CH.prefsGet), set: (patch) => ipcRenderer.invoke(CH.prefsSet, patch) },
  reminders: { schedule: (a) => ipcRenderer.invoke(CH.remindersSchedule, a), test: () => ipcRenderer.invoke(CH.remindersTest) },
  notify: (n) => ipcRenderer.invoke(CH.notify, n),
  files: {
    saveText: (i) => ipcRenderer.invoke(CH.saveText, i),
    openText: (i) => ipcRenderer.invoke(CH.openText, i),
    pickImages: (max) => ipcRenderer.invoke(CH.pickImages, max),
    pickFiles: (max, room) => ipcRenderer.invoke(CH.pickFiles, max, room),
    saveFile: (i) => ipcRenderer.invoke(CH.saveFile, i),
  },
  clipboard: { write: (t) => ipcRenderer.send(CH.clipboard, t), read: () => ipcRenderer.invoke(CH.clipboardRead) },
  mic: { access: () => ipcRenderer.invoke(CH.micAccess) },
  quick: {
    open: () => ipcRenderer.send(CH.quickOpen),
    close: () => ipcRenderer.send(CH.quickClose),
    context: () => ipcRenderer.invoke(CH.quickContext),
    setContext: (ctx) => ipcRenderer.send(CH.quickSetContext, ctx),
    save: (drafts, say) => ipcRenderer.invoke(CH.quickSave, drafts, say),
    toMain: (cmd) => ipcRenderer.send(CH.quickToMain, cmd),
  },
  badge: (n) => ipcRenderer.send(CH.badge, n),
  shortcuts: { record: (on) => ipcRenderer.send(CH.shortcutsRecord, !!on) },
  on: ((event: string, cb: (p: any) => void) => listen(EVENTS[event], cb)) as Bridge["on"],
};

contextBridge.exposeInMainWorld("redline", bridge);
