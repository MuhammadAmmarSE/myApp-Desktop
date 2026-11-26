// Before approving an assistant step: it has to be you. On a Mac with Touch ID, your fingerprint;
// otherwise your account password, which the server checks. There is no way round it.
import { create } from "zustand";
import { bridge } from "./bridge";

type Ask = { reason: string; resolve: (ok: boolean) => void };
export const useIdentityAsk = create<{ ask: Ask | null }>(() => ({ ask: null }));

export async function confirmIdentity(reason: string): Promise<boolean> {
  const r = await bridge.auth.identity(reason);
  if (r.method === "touchid") return r.ok;
  return new Promise((resolve) => useIdentityAsk.setState({ ask: { reason, resolve } }));
}
