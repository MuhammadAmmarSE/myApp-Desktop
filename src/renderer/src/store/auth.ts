// Who is signed in on this computer, and to which server. The token itself stays in the main
// process; the screens only know whether there is one.
import { create } from "zustand";
import type { Session, User } from "@shared/ipc";
import { bridge } from "@/lib/bridge";
import { useRecords } from "./records";
import { useOperator } from "./operator";

type State = {
  status: "loading" | "signed-out" | "signed-in";
  server: string;
  user: User | null;
  storage: Session["storage"];
  notice: string; // why this computer was signed out, shown on the sign-in screen
  restore: () => Promise<void>;
  signIn: (server: string, email: string, password: string) => Promise<{ ok: boolean; message?: string; code?: string }>;
  signOut: () => Promise<void>;
  endSession: (message: string) => void;
};

export const useAuth = create<State>((set) => ({
  status: "loading",
  server: "",
  user: null,
  storage: "none",
  notice: "",
  restore: async () => {
    const s = await bridge.auth.session();
    set({ server: s.server, user: s.user, storage: s.storage, status: s.signedIn ? "signed-in" : "signed-out" });
  },
  signIn: async (server, email, password) => {
    const r = await bridge.auth.signIn({ server, email, password });
    if (!r.ok) return { ok: false, message: r.message, code: r.code };
    if (r.data.replaced) useRecords.getState().reset();
    const s = await bridge.auth.session();
    set({ server: s.server, user: s.user, storage: s.storage, status: "signed-in", notice: "" });
    return { ok: true };
  },
  signOut: async () => {
    await bridge.auth.signOut();
    useRecords.getState().reset();
    useOperator.getState().reset();
    const s = await bridge.auth.session();
    set({ status: "signed-out", user: null, server: s.server, storage: "none", notice: "" });
  },
  endSession: (message) => {
    useOperator.getState().reset();
    set({ status: "signed-out", notice: message });
  },
}));
