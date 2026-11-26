// Calls to your Redline server, through the main process (it adds the session; the page never has
// it). Answers are { ok, data } there; here a failure is thrown as an ApiError with a plain message.
import type { HttpMethod } from "@shared/ipc";
import { bridge } from "./bridge";

export class ApiError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function api<T = any>(method: HttpMethod, path: string, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
  const r = await bridge.api.request<T>(method, path, body, opts);
  if (!r.ok) throw new ApiError(r.message, r.code, r.status);
  return r.data;
}
