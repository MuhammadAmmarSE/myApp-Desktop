import type { Change } from "./assist";

// Turns a conversation's events (and those of the Claude sessions it started) into what the screen
// shows: your messages, its answers, and one card per step with its question, output and result.
export interface OpEvent {
  id: number;
  run_id: number;
  at: number;
  type: string;
  data: Record<string, any>;
}

export type ApprovalState = "pending" | "approved" | "denied" | "expired" | "stopped" | "superseded"; // superseded: Claude moved on before the owner answered
export interface AskItem {
  approvalId: number;
  summary: string;
  detail: Record<string, any>;
  state: ApprovalState;
  note: string;
  at: number;
}
export interface ClaudeLine {
  id: number;
  kind: "say" | "tool" | "error" | "ask";
  text: string;
  tool?: string;
  ask?: AskItem;
}
export interface ClaudeSession {
  runId: number;
  title: string;
  status: "running" | "done" | "failed" | "stopped";
  lines: ClaudeLine[];
  result?: string;
  turns?: number;
  cost?: number;
  minutes?: number;
}
// changes to your records the assistant proposed in one step; you save the ones you keep
export interface ProposalItem {
  id: string; // the step's call id
  changes: Change[];
  dropped: { index: number; reason: string }[];
  // what you did with each change, by its place in the list
  decided: Record<number, { saved: boolean; recordId?: string }>;
  // only new nudges, and the owner lets the assistant save its own reminders: the app saves them
  // without asking (after checking that setting again itself)
  auto?: boolean;
}
export interface Step {
  kind: "step";
  id: number;
  callId: string;
  tool: string;
  args: Record<string, any>;
  status: "running" | "ok" | "failed";
  summary: string;
  output: string;
  exitCode?: number | null;
  change?: string;
  ask?: AskItem;
  claude?: ClaudeSession;
  proposal?: ProposalItem;
  at: number;
}
// a file sent with a message, as the timeline names it (where the server keeps it isn't said)
export type TimelineFile = { id: number; name: string; kind: string; bytes: number; pages: number | null };
const filesOf = (list: unknown): TimelineFile[] =>
  Array.isArray(list)
    ? list
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && Number((f as Record<string, unknown>).id) > 0)
        .map((f) => ({ id: Number(f.id), name: String(f.name || "file"), kind: String(f.kind || "other"), bytes: Number(f.bytes) || 0, pages: Number(f.pages) > 0 ? Number(f.pages) : null }))
    : [];

export type OpItem =
  | { kind: "user"; id: number; text: string; whileWorking: boolean; images: number[]; files: TimelineFile[]; at: number }
  | { kind: "say"; id: number; text: string; at: number }
  // voiced: read aloud line by line as it was written (speech events); the app doesn't read it again
  | { kind: "reply"; id: number; text: string; at: number; voiced?: boolean }
  | { kind: "error"; id: number; text: string; at: number }
  | { kind: "stopped"; id: number; at: number }
  | ClaudeReport
  | Step;

// one of your Claude sessions on claude.ai reported back (what Claude says it did, as it said it)
export type ClaudeReportStatus = "done" | "needs_you" | "working" | "failed";
export interface ClaudeReport {
  kind: "claude_report";
  id: number;
  session: string;
  sessionUrl: string;
  status: ClaudeReportStatus;
  summary: string;
  pullRequest: string | null;
  at: number;
}
const REPORT_STATUSES: ClaudeReportStatus[] = ["done", "needs_you", "working", "failed"];
// what a report's status says, in a word or two
export const reportStatusWords = (s: string): string => (s === "done" ? "Finished" : s === "needs_you" ? "Needs you" : s === "working" ? "Still working" : s === "failed" ? "Couldn't do it" : "Reported");

const MAX_OUTPUT = 20000;

export function buildTimeline(events: OpEvent[], conversationId: number): OpItem[] {
  const items: OpItem[] = [];
  const steps = new Map<string, Step>(); // call id -> step
  const asks = new Map<number, AskItem>(); // approval id -> question
  const sessions = new Map<number, ClaudeSession>(); // claude run id -> session
  let open: Step | null = null; // the step the conversation is on

  const sessionOf = (runId: number, title = "Claude Code") => {
    let s = sessions.get(runId);
    if (!s) {
      s = { runId, title, status: "running", lines: [] };
      sessions.set(runId, s);
      if (open && open.tool === "claude_task" && !open.claude) open.claude = s;
    }
    return s;
  };

  for (const e of events) {
    const d = e.data || {};
    if (e.run_id !== conversationId) {
      // a Claude session's own events
      const s = sessionOf(e.run_id);
      if (e.type === "claude_say") s.lines.push({ id: e.id, kind: "say", text: String(d.text || "") });
      else if (e.type === "claude_tool") s.lines.push({ id: e.id, kind: "tool", tool: d.tool, text: String(d.detail || "") });
      else if (e.type === "claude_tool_error") s.lines.push({ id: e.id, kind: "error", text: String(d.text || "") });
      else if (e.type === "approval") {
        const ask: AskItem = { approvalId: d.approval_id, summary: d.summary, detail: d.detail || {}, state: "pending", note: "", at: e.at };
        asks.set(d.approval_id, ask);
        s.lines.push({ id: e.id, kind: "ask", text: d.summary, ask });
      } else if (e.type === "approval_decided") {
        const a = asks.get(d.approval_id);
        if (a) Object.assign(a, { state: d.decision, note: d.note || "" });
      } else if (e.type === "claude_done") Object.assign(s, { status: d.ok ? "done" : "failed", result: d.result, turns: d.turns, cost: d.cost_usd, minutes: d.minutes });
      else if (e.type === "claude_timeout") s.lines.push({ id: e.id, kind: "error", text: `Stopped after ${d.minutes} minutes.` });
      continue;
    }
    switch (e.type) {
      case "user":
        items.push({ kind: "user", id: e.id, text: String(d.text || ""), whileWorking: !!d.while_working, images: Array.isArray(d.images) ? d.images.map(Number).filter(Boolean) : [], files: filesOf(d.files), at: e.at });
        break;
      case "say":
        items.push({ kind: "say", id: e.id, text: String(d.text || ""), at: e.at });
        break;
      case "reply":
        open = null;
        items.push(Object.assign({ kind: "reply" as const, id: e.id, text: String(d.text || ""), at: e.at }, d.voiced === true ? { voiced: true } : {}));
        break;
      case "error":
        items.push({ kind: "error", id: e.id, text: String(d.text || ""), at: e.at });
        break;
      case "stopped":
        if (open && open.status === "running") open.status = "failed";
        open = null;
        items.push({ kind: "stopped", id: e.id, at: e.at });
        break;
      case "claude_report":
        items.push({
          kind: "claude_report",
          id: e.id,
          session: String(d.session || "Claude"),
          sessionUrl: /^https:\/\/claude\.ai\//.test(String(d.session_url || "")) ? String(d.session_url) : "",
          status: REPORT_STATUSES.includes(d.status) ? d.status : "working",
          summary: String(d.summary || ""),
          pullRequest: /^https:\/\/github\.com\//.test(String(d.pull_request || "")) ? String(d.pull_request) : null,
          at: e.at,
        });
        break;
      case "tool": {
        const s: Step = { kind: "step", id: e.id, callId: d.call_id, tool: d.tool, args: d.args || {}, status: "running", summary: "", output: "", at: e.at };
        steps.set(d.call_id, s);
        items.push(s);
        open = s;
        break;
      }
      case "approval": {
        const ask: AskItem = { approvalId: d.approval_id, summary: d.summary, detail: d.detail || {}, state: "pending", note: "", at: e.at };
        asks.set(d.approval_id, ask);
        if (open && !open.ask) open.ask = ask;
        break;
      }
      case "approval_decided": {
        const a = asks.get(d.approval_id);
        if (a) Object.assign(a, { state: d.decision, note: d.note || "" });
        break;
      }
      case "output":
        if (open) {
          open.output += String(d.text || "");
          if (open.output.length > MAX_OUTPUT) open.output = "…" + open.output.slice(-MAX_OUTPUT);
        }
        break;
      case "command_done":
        if (open) open.exitCode = d.exit_code;
        break;
      case "wrote":
        if (open) open.change = d.change;
        break;
      case "claude":
        if (d.status === "started") sessionOf(d.run_id, d.title);
        else {
          const s = sessionOf(d.run_id, d.title);
          if (s.status === "running") s.status = d.status;
        }
        break;
      case "proposal": {
        const s = steps.get(d.call_id);
        if (s) s.proposal = { id: String(d.call_id), changes: Array.isArray(d.changes) ? d.changes : [], dropped: Array.isArray(d.dropped) ? d.dropped : [], decided: {}, auto: d.auto === true || undefined };
        break;
      }
      case "proposal_decided": {
        const s = steps.get(d.call_id);
        if (s && s.proposal) for (const r of Array.isArray(d.results) ? d.results : []) if (typeof r.index === "number" && !s.proposal.decided[r.index]) s.proposal.decided[r.index] = { saved: !!r.saved, recordId: r.record_id || undefined };
        break;
      }
      case "tool_result": {
        const s = steps.get(d.call_id);
        if (s) Object.assign(s, { status: d.ok ? "ok" : "failed", summary: String(d.summary || "") });
        break;
      }
      default:
        break;
    }
  }
  return items;
}

// the conversation's question that is waiting for you right now, if any
export const pendingAsks = (items: OpItem[]): AskItem[] => {
  const out: AskItem[] = [];
  for (const it of items) {
    if (it.kind !== "step") continue;
    if (it.ask && it.ask.state === "pending") out.push(it.ask);
    for (const l of it.claude?.lines || []) if (l.ask && l.ask.state === "pending") out.push(l.ask);
  }
  return out;
};

const TITLES: Record<string, string> = {
  run_command: "Command",
  read_file: "Read a file",
  write_file: "Wrote a file",
  github: "GitHub",
  set_repo_secret: "Repository secret",
  dns: "DNS",
  claude_task: "Claude Code",
  claude_sessions: "Looked at your Claude sessions",
  claude_save_session: "Saved a Claude session",
  claude_send: "Sent to a Claude session",
  find_records: "Looked through your records",
  get_records: "Read your records",
  money_totals: "Added up your money",
  my_overview: "Looked at your day",
  propose_changes: "Changes for you to save",
  app_guide: "Looked up how the app works",
};

// what a step card says in one line, and what it shows in code type underneath
export function describeStep(s: Step): { title: string; code: string; why: string } {
  const a = s.args || {};
  const title = TITLES[s.tool] || s.tool;
  if (s.tool === "run_command") return { title, code: a.command || "", why: a.why || "" };
  if (s.tool === "read_file") return { title, code: a.path || "", why: "" };
  if (s.tool === "write_file") return { title: a.append ? "Added to a file" : title, code: a.path || "", why: a.why || "" };
  if (s.tool === "github") return { title, code: `${a.method || "GET"} ${a.path || ""}`, why: a.why || "" };
  if (s.tool === "set_repo_secret") return { title, code: `${a.name} → ${a.repo}`, why: a.why || "" };
  if (s.tool === "dns") return { title, code: `${a.action} ${a.type || ""} ${a.name ? `${a.name}.` : ""}${a.domain || ""}${a.data ? ` → ${a.data}` : ""}`.replace(/\s+/g, " "), why: a.why || "" };
  if (s.tool === "find_records") return { title, code: [a.query ? `"${a.query}"` : "", (a.kinds || []).join(", ")].filter(Boolean).join(" in ") || "everything", why: "" };
  if (s.tool === "money_totals") return { title, code: [a.from, a.to].filter(Boolean).join(" to ") || "this month", why: "" };
  if (s.tool === "get_records" || s.tool === "my_overview") return { title, code: "", why: "" };
  if (s.tool === "app_guide") return { title, code: a.topic ? `"${a.topic}"` : "", why: "" };
  if (s.tool === "propose_changes") return { title, code: "", why: a.why || "" };
  // a Claude session on the server (older conversations) says its own title
  if (s.tool === "claude_task") return { title, code: s.claude ? "" : a.title || "", why: "" };
  if (s.tool === "claude_send") {
    // an answer to something Claude asked waits for the owner's yes first
    if (s.ask && a.session) {
      const st = s.ask.state;
      const t = st === "pending" ? `Answer for “${a.session}”` : st === "approved" ? `Answered “${a.session}” on Claude` : `Answer for “${a.session}”, not sent`;
      return { title: t, code: a.message || "", why: "" };
    }
    return { title: a.session ? `Sent to “${a.session}” on Claude` : title, code: a.message || "", why: "" };
  }
  if (s.tool === "claude_save_session") return { title, code: [a.name, a.note].filter(Boolean).join(" · "), why: "" };
  return { title, code: "", why: "" };
}

// Your Claude Code sessions on claude.ai: the session's ID from what you paste (its ID, or its
// claude.ai/code link, with or without anything after it), or null. The server checks the same.
const CLAUDE_ID = /^(?:session|cse)_[A-Za-z0-9_-]{4,90}$/;
export function parseClaudeSession(input: string): string | null {
  const s = String(input || "").trim();
  if (!s) return null;
  if (CLAUDE_ID.test(s)) return s;
  const m = /^(?:https?:\/\/)?(?:www\.)?claude\.ai\/code\/((?:session|cse)_[A-Za-z0-9_-]{4,90})(?:[/?#].*)?$/i.exec(s);
  return m ? m[1] : null;
}
// the link in a step's result ("Sent to “website”. Its answer shows in the session: https://claude.ai/…")
export const claudeLinkIn = (text: string | undefined): string | null => {
  const m = /https:\/\/claude\.ai\/[^\s)]+/.exec(String(text || ""));
  return m ? m[0] : null;
};
