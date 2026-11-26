// Calls to the Redline server, made here in the main process so the token never reaches a web
// page. Answers are always { ok, data } or { ok: false, code, message, status }: nothing throws
// across IPC. A 401 SIGNED_OUT ends the session on this computer.
import { net } from "electron";
import type { ApiResult, HttpMethod } from "@shared/ipc";
import { getServer, getToken } from "./session";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
let onSignedOut: (message: string) => void = () => {};
export const whenSignedOut = (fn: (message: string) => void) => (onSignedOut = fn);

export async function request<T = any>(
  method: HttpMethod,
  pathname: string,
  body?: unknown,
  opts: { timeoutMs?: number; server?: string; token?: string | null } = {},
): Promise<ApiResult<T>> {
  if (!METHODS.includes(method)) return { ok: false, code: "BAD_REQUEST", message: "That isn't a request Redline makes.", status: 0 };
  if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.includes("..") || /^\/\//.test(pathname)) {
    return { ok: false, code: "BAD_REQUEST", message: "That isn't a request Redline makes.", status: 0 };
  }
  const server = (opts.server ?? getServer()).replace(/\/+$/, "");
  if (!server) return { ok: false, code: "NO_SERVER", message: "Add your server's address first.", status: 0 };
  const token = opts.token === undefined ? getToken() : opts.token;
  const ctrl = new AbortController();
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 20000, 1000), 120000);
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await net.fetch(`${server}${pathname}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    const slow = e?.name === "AbortError";
    return { ok: false, code: "NETWORK", message: slow ? "The server took too long to answer." : "Can't reach your server. Check the connection.", status: 0 };
  }
  clearTimeout(timer);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    return { ok: false, code: "BAD_RESPONSE", message: res.ok ? "The server's answer couldn't be read." : `Server error (${res.status}).`, status: res.status };
  }
  if (!json || json.ok !== true) {
    const message = typeof json?.message === "string" ? json.message : "Something went wrong.";
    const code = typeof json?.code === "string" ? json.code : "ERROR";
    if (res.status === 401 && token && code === "SIGNED_OUT") onSignedOut(message);
    return { ok: false, code, message, status: res.status };
  }
  return { ok: true, data: json.data as T };
}
