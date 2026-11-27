// One card per step the assistant takes: what it does, its live output, and the question it asks
// when a step is risky. Approving needs your fingerprint (Touch ID) or your password — never just
// a click — and saying no can carry a note the AI reads. Claude Code sessions show their own
// steps as they happen.
import { useState } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { Bot, Check, ChevronDown, ChevronUp, Copy, ExternalLink, FileText, Fingerprint, GitBranch, Globe, KeyRound, Pause, SquareTerminal, X, type LucideIcon } from "lucide-react";
import { claudeLinkIn, describeStep, type AskItem, type ClaudeSession, type Step } from "@myapp/core";
import { Button, Input, Spin, Tag, toast } from "@/components/ui";
import { useOperator } from "@/store/operator";
import { confirmIdentity } from "@/lib/identity";
import { bridge } from "@/lib/bridge";

const ICONS: Record<string, LucideIcon> = { run_command: SquareTerminal, read_file: FileText, write_file: FileText, github: GitBranch, set_repo_secret: KeyRound, dns: Globe, claude_task: Bot, claude_sessions: Bot, claude_save_session: Bot, claude_send: Bot };

export function Code({ text, lines = 8, diff }: { text: string; lines?: number; diff?: boolean }) {
  const [open, setOpen] = useState(false);
  const all = String(text || "")
    .replace(/\s+$/, "")
    .split("\n");
  const long = all.length > lines;
  const shown = open || !long ? all : all.slice(-lines);
  return (
    <div className="group/code relative overflow-hidden rounded-[10px] border border-line bg-bg">
      <div className="flex items-center border-b border-line px-2.5 py-1">
        {long ? (
          <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[11.5px] text-text3 hover:text-text2">
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {open ? "Show less" : `${all.length - lines} earlier lines`}
          </button>
        ) : (
          <span className="text-[11px] text-text3">{diff ? "Change" : "Output"}</span>
        )}
        <button type="button" onClick={() => (bridge.clipboard.write(all.join("\n")), toast("Copied"))} className="ml-auto flex items-center gap-1 rounded px-1 text-[11px] text-text3 opacity-0 hover:text-text group-hover/code:opacity-100">
          <Copy size={11} /> Copy
        </button>
      </div>
      <pre className="selectable max-h-[420px] overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.55]">
        {shown.map((l, i) => (
          <div key={i} className={clsx(!diff ? "text-text2" : l.startsWith("+ ") ? "text-success" : l.startsWith("- ") ? "text-danger" : "text-text3")}>
            {l || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}

const DECIDED: Record<string, { label: string; tone: string }> = {
  approved: { label: "You approved this", tone: "text-success" },
  denied: { label: "You said no", tone: "text-danger" },
  expired: { label: "No answer in time, so it wasn't done", tone: "text-text3" },
  stopped: { label: "Stopped", tone: "text-text3" },
};

export function AskBox({ ask }: { ask: AskItem }) {
  const decide = useOperator((s) => s.decide);
  const [busy, setBusy] = useState<"" | "approve" | "deny">("");
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const d = ask.detail || {};
  const reasons: string[] = Array.isArray(d.reasons) ? d.reasons : [];
  const pending = ask.state === "pending";

  const approve = async () => {
    if (busy) return;
    // it has to be you: fingerprint, or your password checked by the server
    if (!(await confirmIdentity(`Approve: ${ask.summary}`))) return;
    setBusy("approve");
    try {
      await decide(ask.approvalId, "approve");
      toast.success("Approved");
    } catch (e: any) {
      toast.error(e.message || "Couldn't send your answer.");
    } finally {
      setBusy("");
    }
  };
  const deny = async () => {
    setBusy("deny");
    try {
      await decide(ask.approvalId, "deny", note.trim());
    } catch (e: any) {
      toast.error(e.message || "Couldn't send your answer.");
    } finally {
      setBusy("");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={clsx("flex flex-col gap-2.5 rounded-[12px] p-3", pending ? "bg-accent-soft/70 shadow-[inset_0_0_0_1px_var(--c-accent)]" : "bg-surface2 hairline")} data-ask={ask.state}>
      <div className="flex items-center gap-2 text-[12.5px] font-semibold">
        {pending ? <Pause size={15} className="text-accent-text" /> : ask.state === "approved" ? <Check size={15} className="text-success" /> : <X size={15} className="text-text3" />}
        <span className={clsx("flex-1", !pending && DECIDED[ask.state]?.tone)}>
          {pending ? "Needs your yes" : DECIDED[ask.state]?.label || ask.state}
          {!pending && ask.note ? ` · “${ask.note}”` : ""}
        </span>
      </div>
      {pending && (
        <>
          <div className="text-[14px] font-semibold">{ask.summary}</div>
          {reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <Tag key={r} tone="warn">
                  {r}
                </Tag>
              ))}
            </div>
          )}
          {d.why && <p className="text-[13px] text-text2">Why: {d.why}</p>}
          {d.command && <Code text={d.command} lines={10} />}
          {d.change && <Code text={d.change} lines={16} diff />}
          {d.from && <p className="text-[12px] text-text2">Value from {d.from}; it is never shown to the AI.</p>}
          {d.body && <Code text={typeof d.body === "string" ? d.body : JSON.stringify(d.body, null, 2)} lines={8} />}
          {noting && <Input value={note} onChange={setNote} placeholder="Why not? (optional — the AI reads it)" autoFocus onKeyDown={(e) => e.key === "Enter" && deny()} aria-label="Why not" />}
          <div className="flex gap-2">
            <Button icon={X} loading={busy === "deny"} disabled={!!busy} onClick={() => (noting ? deny() : setNoting(true))} className="flex-1">
              {noting ? "Say no" : "No"}
            </Button>
            <Button variant="primary" icon={Fingerprint} loading={busy === "approve"} disabled={!!busy} onClick={approve} className="flex-[1.4]" data-testid="approve">
              Approve
            </Button>
          </div>
        </>
      )}
    </motion.div>
  );
}

function Status({ status }: { status: Step["status"] | ClaudeSession["status"] }) {
  if (status === "running") return <Spin size={15} className="text-accent" />;
  if (status === "ok" || status === "done") return <Check size={16} className="text-success" />;
  return <X size={16} className={status === "stopped" ? "text-text3" : "text-danger"} />;
}

export function StepCard({ step }: { step: Step }) {
  const { title, code, why } = describeStep(step);
  const Icon = ICONS[step.tool] || SquareTerminal;
  const waiting = step.ask?.state === "pending";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={clsx("flex flex-col gap-2.5 rounded-[14px] p-3.5 glass", waiting ? "shadow-[inset_0_0_0_1px_var(--c-accent)]" : "hairline")} data-step={step.tool}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-surface2 text-accent-text hairline">
          <Icon size={16} />
        </span>
        <span className="flex-1 text-[13.5px] font-semibold">{title}</span>
        {waiting ? <Tag tone="accent">Waiting for you</Tag> : <Status status={step.status} />}
      </div>
      {code && (step.tool === "run_command" ? <div className="selectable rounded-[8px] bg-bg px-3 py-2 font-mono text-[12.5px] text-text hairline">$ {code}</div> : <p className="selectable line-clamp-3 text-[13px] text-text2">{code}</p>)}
      {why && !waiting && <p className="text-[12px] text-text3">{why}</p>}
      {step.ask && <AskBox ask={step.ask} />}
      {step.output && <Code text={step.output} />}
      {step.change && step.tool === "write_file" && <Code text={step.change} diff lines={10} />}
      {step.claude && <ClaudeCard s={step.claude} />}
      {step.status === "failed" && step.summary ? (
        <p className="text-[12px] text-danger">{step.summary}</p>
      ) : step.status === "ok" && step.tool === "claude_send" && claudeLinkIn(step.summary) ? (
        <OpenInClaude url={claudeLinkIn(step.summary)!} reports={/will report back/i.test(step.summary || "")} />
      ) : step.status === "ok" && step.tool !== "run_command" && step.tool !== "claude_task" && step.summary ? (
        <p className="text-[12px] text-text3">{step.summary}</p>
      ) : null}
    </motion.div>
  );
}

// a message sent to one of your Claude sessions: its answer, and anything it asks you to approve,
// are in the session on claude.ai or the Claude app (and, when the server can take it, Claude
// reports back into this chat when it finishes or needs you)
function OpenInClaude({ url, reports }: { url: string; reports: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-[12px] text-text3">{reports ? "Delivered. Claude will report back here when it finishes or needs you; the whole conversation is in the session." : "Delivered. Claude's answer, and anything it asks you to approve, are in the session."}</p>
      <Button size="xs" variant="secondary" icon={ExternalLink} onClick={() => void bridge.app.openExternal(url)} aria-label="Open the session in Claude">
        Open in Claude
      </Button>
    </div>
  );
}

export function ClaudeCard({ s }: { s: ClaudeSession }) {
  const [all, setAll] = useState(false);
  const lines = all ? s.lines : s.lines.slice(-8);
  const meta = [s.turns ? `${s.turns} turns` : "", s.minutes != null ? (s.minutes < 1 ? "under a minute" : `${s.minutes} min`) : "", s.cost != null ? `$${s.cost.toFixed(2)}` : ""].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-surface2 p-3 hairline">
      <div className="flex items-center gap-2">
        <Bot size={15} className="text-accent-text" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-text2">{s.title}</span>
        <Status status={s.status} />
      </div>
      {s.lines.length > 8 && (
        <button type="button" onClick={() => setAll(!all)} className="self-start text-[12px] text-accent-text hover:underline">
          {all ? "Show the latest only" : `Show all ${s.lines.length} steps`}
        </button>
      )}
      {lines.map((l) =>
        l.kind === "ask" && l.ask ? (
          <AskBox key={l.id} ask={l.ask} />
        ) : (
          <div key={l.id} className="flex gap-2 text-[12px]">
            <span className={clsx("w-[52px] shrink-0 truncate", l.kind === "error" ? "text-danger" : "text-text3")}>{l.kind === "tool" ? l.tool : l.kind === "error" ? "error" : "says"}</span>
            <span className={clsx("selectable min-w-0 flex-1", l.kind === "say" ? "text-text" : "text-text2", l.kind === "tool" && "font-mono", l.kind === "say" ? "line-clamp-6" : "line-clamp-3")}>{l.text}</span>
          </div>
        ),
      )}
      {s.result && <p className="selectable whitespace-pre-wrap text-[13px]">{s.result}</p>}
      {meta && <div className="text-[11.5px] text-text3">{meta}</div>}
    </div>
  );
}
