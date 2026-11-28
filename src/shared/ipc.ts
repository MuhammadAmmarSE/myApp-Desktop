// The contract between the main process (windows, tray, files, the network, the session) and the
// screens. The screens never see the session token: every call to the server goes through
// `api.request`, which the main process signs. Everything here is plain data (IPC copies it).

export type ApiOk<T> = { ok: true; data: T };
export type ApiFail = { ok: false; code: string; message: string; status: number };
export type ApiResult<T = any> = ApiOk<T> | ApiFail;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface Session {
  signedIn: boolean;
  server: string; // the API base, e.g. https://example.com/api
  user: User | null;
  // where the token is kept: the system's encrypted store, or a plain file the user alone can read
  storage: "encrypted" | "file" | "none";
}

// a stored record (core's Rec plus whether it still has to go to the server)
export interface StoredRec {
  id: string;
  kind: string;
  data: any;
  created_at: number;
  updated_at: number;
  deleted: 0 | 1;
  dirty: 0 | 1;
}

// what should ring, worked out by the screens from the records
export interface Alert {
  at: number;
  title: string;
  body: string;
  url: string; // the page to open when it is clicked, e.g. "/todos"
  key?: string; // stable id, so the same alert isn't shown twice
}

// settings the main process acts on (the rest live with the screens)
export interface Prefs {
  closeToTray: boolean; // closing the window keeps Redline in the tray, so reminders still ring
  startAtLogin: boolean;
  startHidden: boolean; // at login, start in the tray without opening the window
  quickShortcut: string; // global shortcut for Quick capture, an Electron accelerator
  talkShortcut: string; // global shortcut that opens the assistant listening ("" = none)
  notifications: boolean;
  quietHours: boolean; // hold reminders between quietFrom and quietTo, ring them after
  quietFrom: string; // HH:mm
  quietTo: string; // HH:mm
  zoom: number; // 0.8 .. 1.4
}

export const DEFAULT_PREFS: Prefs = {
  closeToTray: true,
  startAtLogin: false,
  startHidden: true,
  quickShortcut: "CommandOrControl+Shift+Space",
  talkShortcut: "Alt+Space",
  notifications: true,
  quietHours: false,
  quietFrom: "22:30",
  quietTo: "07:30",
  zoom: 1,
};

export interface AppInfo {
  name: string;
  version: string;
  platform: string; // "darwin", "win32", "linux"
  arch: string;
  electron: string;
  chrome: string;
  node: string;
  packaged: boolean;
  dataDir: string;
  touchId: boolean; // this Mac can ask for Touch ID
  gpu: "hardware" | "software"; // whether Chromium draws with the graphics card (software when its driver is blocked)
}

export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
}

// what Quick capture needs from the main window
export interface QuickContext {
  currency: string;
  themeId: string;
  motion: "full" | "reduced";
  people: { id: string; name: string; relation: string }[];
  // hisaabs still open (money someone gave you to spend)
  funds: { id: string; from: string; purpose: string; left: number }[];
  // your pots (rule: income is split into it by a rule); an older main window sends none
  pots?: { id: string; name: string; type: "spend" | "bills" | "save" | "debt"; balance: number; rule?: boolean }[];
  // your money with someone (kept for you or lent), still open; an older main window sends none
  owed?: { id: string; who: string; type: "keeping" | "loan"; left: number }[];
}

// a record for the main window to make. ref: a stand-in id other drafts in the same batch may point
// at (fund_id, paid_from, pot_id, a split's pots); kind "fund_more" adds money to a hisaab you have:
// data { fund_id, move }; kind "pot_move" moves money between pots: data { pot_id, move }; kind
// "owed_move" is a step on your money with someone: data { owed_id, move }
export type Draft = { kind: string; data: any; ref?: string };

// a command from the tray, the menu, a notification or the quick window, for the main window
export type Command =
  | { type: "navigate"; to: string }
  | { type: "new"; what: "todo" | "item" | "note" | "money" | "income" | "event" | "reminder" | "clip" | "date" | "person" | "thing" | "capture" }
  | { type: "palette" }
  | { type: "sync" }
  | { type: "talk" } // talk to the assistant: start listening (or stop, if it is)
  | { type: "shortcuts" }
  | { type: "create"; drafts: Draft[]; say?: string };

// a file picked to send to the assistant (data: base64)
export interface PickedFile {
  name: string;
  size: number;
  data: string;
}

export interface PickedImage {
  name: string;
  data: string; // data URL as read from disk
}

export type MicAccess = "granted" | "denied" | "restricted";

export type Identity = { method: "touchid"; ok: boolean; message?: string } | { method: "password" };

export interface Bridge {
  app: {
    info(): Promise<AppInfo>;
    openExternal(url: string): Promise<boolean>;
    quit(): void;
    platform: string;
  };
  win: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    state(): Promise<WindowState>;
    setZoom(factor: number): void;
  };
  api: {
    request<T = any>(method: HttpMethod, path: string, body?: unknown, opts?: { timeoutMs?: number }): Promise<ApiResult<T>>;
  };
  auth: {
    session(): Promise<Session>;
    signIn(input: { server: string; email: string; password: string }): Promise<ApiResult<{ user: User; replaced: boolean }>>;
    signOut(): Promise<void>;
    identity(reason: string): Promise<Identity>;
    confirmPassword(password: string): Promise<ApiResult<{ confirmed: boolean }>>;
  };
  db: {
    load(): Promise<{ records: StoredRec[]; meta: Record<string, string> }>;
    put(recs: StoredRec[]): Promise<void>;
    markClean(list: { id: string; updated_at: number }[]): Promise<void>;
    setMeta(key: string, value: string): Promise<void>;
    wipe(): Promise<void>;
  };
  prefs: {
    get(): Promise<Prefs>;
    set(patch: Partial<Prefs>): Promise<{ prefs: Prefs; error?: string }>;
  };
  reminders: {
    schedule(alerts: Alert[]): Promise<number>;
    test(): Promise<boolean>;
  };
  notify(n: { title: string; body: string; url: string }): Promise<void>;
  files: {
    saveText(input: { name: string; text: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
    openText(input: { filters?: { name: string; extensions: string[] }[] }): Promise<{ name: string; text: string } | null>;
    pickImages(max: number): Promise<PickedImage[]>;
    // files for the assistant: up to `max`, within `room` bytes; too-big ones named in skipped
    pickFiles(max: number, room: number): Promise<{ files: PickedFile[]; skipped: string[] }>;
    // a file the assistant has, saved where you choose (data: base64); the path, or null
    saveFile(input: { name: string; data: string }): Promise<string | null>;
  };
  clipboard: { write(text: string): void; read(): Promise<string> };
  // whether this computer lets Redline use the microphone (a Mac asks you the first time)
  mic: { access(): Promise<MicAccess> };
  quick: {
    open(): void;
    close(): void;
    context(): Promise<QuickContext | null>;
    setContext(ctx: QuickContext): void;
    save(drafts: Draft[], say: string): Promise<boolean>;
    toMain(cmd: Command): void;
  };
  badge(count: number): void;
  on(event: "command", cb: (cmd: Command) => void): () => void;
  on(event: "window", cb: (s: WindowState) => void): () => void;
  on(event: "quick-shown", cb: () => void): () => void;
  on(event: "prefs", cb: (p: Prefs) => void): () => void;
}

// IPC channel names, one list for both sides
export const CH = {
  appInfo: "app:info",
  openExternal: "app:open-external",
  quit: "app:quit",
  winMinimize: "win:minimize",
  winToggleMax: "win:toggle-max",
  winClose: "win:close",
  winState: "win:state",
  winZoom: "win:zoom",
  api: "api:request",
  session: "auth:session",
  signIn: "auth:sign-in",
  signOut: "auth:sign-out",
  identity: "auth:identity",
  confirmPassword: "auth:confirm-password",
  dbLoad: "db:load",
  dbPut: "db:put",
  dbClean: "db:clean",
  dbMeta: "db:meta",
  dbWipe: "db:wipe",
  prefsGet: "prefs:get",
  prefsSet: "prefs:set",
  remindersSchedule: "reminders:schedule",
  remindersTest: "reminders:test",
  notify: "notify",
  saveText: "files:save-text",
  openText: "files:open-text",
  pickImages: "files:pick-images",
  pickFiles: "files:pick-files",
  saveFile: "files:save-file",
  clipboard: "clipboard:write",
  clipboardRead: "clipboard:read",
  micAccess: "mic:access",
  quickOpen: "quick:open",
  quickClose: "quick:close",
  quickContext: "quick:context",
  quickSetContext: "quick:set-context",
  quickSave: "quick:save",
  quickToMain: "quick:to-main",
  badge: "badge",
  // main -> renderer
  evCommand: "ev:command",
  evWindow: "ev:window",
  evQuickShown: "ev:quick-shown",
  evPrefs: "ev:prefs",
} as const;
