// The operator on your server (the AI that carries out tasks: commands, GitHub, Firebase, DNS,
// Claude Code): whether it can be used, what it's connected to, and the questions waiting for you.
import { create } from "zustand";

import { api, ApiError } from "@/lib/api";

export type Availability = "unknown" | "ready" | "off" | "not_owner" | "paused" | "missing" | "error";

export interface Connection {
  ok: boolean;
  message?: string;
  [k: string]: any;
}
export interface OperatorStatus {
  enabled: boolean;
  pending_approvals: number;
  approval_minutes: number;
  connections: { server: Connection; deepseek: Connection; github: Connection; godaddy: Connection; claude: Connection; firebase: Connection };
}
export interface Approval {
  id: number;
  run_id: number;
  conversation_id: number;
  from: "operator" | "claude";
  summary: string;
  detail: Record<string, any>;
  created_at: number;
}
export interface Run {
  id: number;
  kind: "operator" | "claude";
  parent_id: number | null;
  title: string;
  status: "running" | "waiting" | "done" | "failed" | "stopped" | "interrupted";
  cwd: string | null;
  claude_session_id: string | null;
  created_at: number;
  updated_at: number;
  starred?: boolean;
  archived?: boolean;
  preview?: { from: "you" | "assistant"; text: string; photos: number } | null;
}
export type ChatCounts = { all: number; starred: number; archived: number };

type State = {
  availability: Availability;
  message: string;
  status: OperatorStatus | null;
  approvals: Approval[];
  runs: Run[]; // the newest conversations (not archived), for the assistant's first screen
  favourites: Run[]; // starred conversations (up to 6), shown first
  counts: ChatCounts | null;
  // the server knows favourites, archive, delete and photos (it sends chat counts); false: an older
  // server, so the app doesn't offer them; null: not known yet
  upToDate: boolean | null;
  runsLoaded: boolean; // the list has come back at least once (an empty list then means none)
  loadStatus: (refresh?: boolean) => Promise<void>;
  loadRuns: () => Promise<void>;
  setEnabled: (on: boolean) => Promise<void>;
  decide: (id: number, decision: "approve" | "deny", note?: string) => Promise<void>;
  reset: () => void;
};

// what an error from /operator means for the screens
export const availabilityOf = (e: unknown): { availability: Availability; message: string } => {
  const err = e as ApiError;
  if (err?.code === "OPERATOR_OFF") return { availability: "off", message: err.message };
  if (err?.code === "NOT_OWNER") return { availability: "not_owner", message: err.message };
  if (err?.code === "PAUSED") return { availability: "paused", message: err.message };
  if (err?.code === "NOT_FOUND" && err?.status === 404) return { availability: "missing", message: "Your server doesn't have the operator yet. Update it (myapp-backend) to use the assistant." };
  return { availability: "error", message: err?.message || "Something went wrong." };
};

export const useOperator = create<State>((set, get) => ({
  availability: "unknown",
  message: "",
  status: null,
  approvals: [],
  runs: [],
  favourites: [],
  counts: null,
  upToDate: null,
  runsLoaded: false,
  loadStatus: async (refresh) => {
    try {
      const s = await api<OperatorStatus>("GET", `/operator/status${refresh ? "?refresh=1" : ""}`, undefined, { timeoutMs: 45000 });
      setIfChanged({ status: s, availability: s.enabled ? "ready" : "paused", message: s.enabled ? "" : "You switched the assistant off." });
    } catch (e) {
      set(availabilityOf(e));
    }
  },
  loadRuns: async () => {
    try {
      const r = await api<{ runs: Run[]; counts?: ChatCounts }>("GET", "/operator/runs?limit=12");
      // an older server ignores the filter and would list every chat as a favourite
      const f = r.counts ? await api<{ runs: Run[] }>("GET", "/operator/runs?filter=starred&limit=6") : { runs: [] };
      setIfChanged({ runs: r.runs, favourites: f.runs, counts: r.counts || null, upToDate: !!r.counts, runsLoaded: true, availability: "ready" });
    } catch (e) {
      set(availabilityOf(e));
    }
  },
  setEnabled: async (on) => {
    await api("PUT", "/operator/enabled", { on });
    await get().loadStatus();
  },
  decide: async (id, decision, note) => {
    await api("POST", `/operator/approvals/${id}`, { decision, note: note || undefined });
    set({ approvals: get().approvals.filter((a) => a.id !== id) });
  },
  reset: () => set({ availability: "unknown", message: "", status: null, approvals: [], runs: [], favourites: [], counts: null, upToDate: null, runsLoaded: false }),
}));

// The checks every few seconds mostly bring back what's already here: only store what differs, so
// the screens that show it don't redraw for nothing.
function setIfChanged(next: Partial<State>) {
  const cur = useOperator.getState() as unknown as Record<string, unknown>;
  const diff: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) if (JSON.stringify(cur[k]) !== JSON.stringify(v)) diff[k] = v;
  if (Object.keys(diff).length) useOperator.setState(diff as Partial<State>);
}

export const SERVER_UPDATE = "Your server needs an update for this: update myapp-backend on it and restart it.";
// a route an older server doesn't have answers its catch-all 404; say what that means
const orUpdate = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p;
  } catch (e) {
    const err = e as ApiError;
    if (err?.status === 404 && err?.code === "NOT_FOUND" && /nothing at that address/i.test(err.message)) {
      useOperator.setState({ upToDate: false });
      throw new ApiError(SERVER_UPDATE, "SERVER_UPDATE", 404);
    }
    throw e;
  }
};

// favourite / archive a conversation, or delete it; the first screen's list follows
export async function markChat(id: number, patch: { starred?: boolean; archived?: boolean }): Promise<Run> {
  const r = await orUpdate(api<{ run: Run }>("PATCH", `/operator/runs/${id}`, patch));
  useOperator.getState().loadRuns();
  return r.run;
}
// a conversation's new name (an older server answers "say starred or archived": it can't rename)
export async function renameChat(id: number, title: string): Promise<Run> {
  try {
    const r = await orUpdate(api<{ run: Run }>("PATCH", `/operator/runs/${id}`, { title }));
    useOperator.getState().loadRuns();
    return r.run;
  } catch (e) {
    const err = e as ApiError;
    if (err?.code === "NOTHING") throw new ApiError(SERVER_UPDATE, "SERVER_UPDATE", 400);
    throw e;
  }
}
export async function deleteChat(id: number): Promise<void> {
  await orUpdate(api("DELETE", `/operator/runs/${id}`));
  useOperator.setState((s) => ({ runs: s.runs.filter((r) => r.id !== id), favourites: s.favourites.filter((r) => r.id !== id) }));
  useOperator.getState().loadRuns();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const whenActive = (): Promise<void> => Promise.resolve();
// Keeps the list of waiting questions current while Redline runs (even with the window in the tray,
// so a question can be announced): one request held open on the server until a question comes or
// goes. Returns a function that stops it.
export function watchApprovals(): () => void {
  let alive = true;
  (async () => {
    while (alive) {
      await whenActive();
      if (!alive) break;
      const known = useOperator
        .getState()
        .approvals.map((a) => a.id)
        .join(",");
      try {
        const r = await api<{ approvals: Approval[] }>("GET", `/operator/approvals?wait=25&known=${known}`, undefined, { timeoutMs: 35000 });
        if (!alive) break;
        setIfChanged({ approvals: r.approvals, availability: "ready" });
      } catch (e) {
        if (!alive) break;
        const a = availabilityOf(e);
        useOperator.setState({ approvals: [], ...(a.availability === "error" ? {} : a) });
        // not usable right now: look again later; a network hiccup: a little sooner
        await sleep(a.availability === "error" ? 8000 : a.availability === "missing" ? 300000 : 60000);
      }
    }
  })();
  return () => {
    alive = false;
  };
}
