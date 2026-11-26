// Who is signed in, to which server. The session token is kept encrypted with the system's own
// store (Keychain on a Mac, DPAPI on Windows, the keyring on Linux). Where none is available the
// token goes in a file only this user can read, and Settings says so.
import fs from "fs";
import path from "path";
import { app, safeStorage } from "electron";
import type { Session, User } from "@shared/ipc";
import { JsonFile } from "./jsonfile";

// the server built into this copy: the same one the phone uses; REDLINE_API_URL points a copy
// at another one (a local server while developing and testing)
export const normaliseServer = (s: string) => {
  let v = String(s || "").trim().replace(/\/+$/, "");
  if (v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
  if (v && !/\/api$/.test(v)) v = `${v}/api`;
  return v;
};
export const BUILT_IN_SERVER = normaliseServer(process.env.REDLINE_API_URL || "https://myapp-api.byldiq.com/api");

type Saved = { server: string; user: User | null; token: string; storage: Session["storage"] };

let file: JsonFile<Saved>;
let token: string | null = null;

const canEncrypt = () => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // Linux without a keyring falls back to a fixed key: that is no better than a plain file
    if (process.platform === "linux" && typeof (safeStorage as any).getSelectedStorageBackend === "function") {
      return (safeStorage as any).getSelectedStorageBackend() !== "basic_text";
    }
    return true;
  } catch {
    return false;
  }
};

export function loadSession() {
  file = new JsonFile<Saved>(path.join(app.getPath("userData"), "session.json"), { server: "", user: null, token: "", storage: "none" }, 0);
  const s = file.get();
  token = null;
  if (s.token) {
    try {
      token = s.storage === "encrypted" ? safeStorage.decryptString(Buffer.from(s.token, "base64")) : s.token;
    } catch {
      token = null; // the system key changed: sign in again
    }
  }
}

export const getToken = () => token;
export const getServer = () => file.get().server || BUILT_IN_SERVER;

export function session(): Session {
  const s = file.get();
  return { signedIn: !!token, server: getServer(), user: token ? s.user : null, storage: token ? s.storage : "none" };
}

export function previousUser(): User | null {
  return file.get().user;
}

export function saveSession(server: string, user: User, newToken: string) {
  token = newToken;
  const encrypted = canEncrypt();
  const stored = encrypted ? safeStorage.encryptString(newToken).toString("base64") : newToken;
  file.set({ server, user, token: stored, storage: encrypted ? "encrypted" : "file" });
  return file.flush();
}

// the token goes; the server and who it was stay, so sign-in can offer them again
export function clearToken() {
  token = null;
  file.update((s) => ({ ...s, token: "", storage: "none" }));
  return file.flush();
}

export function setServerOnly(server: string) {
  file.update((s) => ({ ...s, server }));
}

export const sessionFileExists = () => fs.existsSync(path.join(app.getPath("userData"), "session.json"));
