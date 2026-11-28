// The assistant: an AI on your server that does things for you — runs commands, works in GitHub
// and Firebase, changes DNS, hands coding to Claude Code. Your chats are on the left (favourites,
// archive, search). A chat shows your words, each step as it happens, and its answer; risky steps
// wait for your fingerprint or password. Write more to carry a task on, or while it works to
// steer it; Stop ends it.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Archive, ArchiveRestore, ArrowDown, Bot, CircleAlert, CircleCheck, CircleStop, MessageSquarePlus, MoreHorizontal, Pencil, Search, Server, Settings2, Star, Trash2, Volume2, VolumeX } from "lucide-react";
import { buildTimeline, spokenAnswer, type OpEvent } from "@myapp/core";
import { decide, decisionsOf, useProposals } from "@/lib/proposals";
import { Button, Card, Chip, confirmDialog, Empty, IconButton, Input, Menu, Segmented, Skeleton, SkeletonRows, Tag, toast, useContextMenu, Working } from "@/components/ui";
import { Orb } from "@/components/orb/Orb";
import { StepCard } from "@/components/assistant/Steps";
import { LookedUp, ProposalCard, READ_TOOLS } from "@/components/assistant/Proposal";
import { Reply } from "@/components/assistant/Reply";
import { ClaudeReportCard } from "@/components/assistant/ClaudeReport";
import { Composer } from "@/components/assistant/Composer";
import { SentFiles } from "@/components/assistant/Files";
import { availabilityOf, deleteChat, markChat, renameChat, useOperator, type ChatCounts, type Run } from "@/store/operator";
import { useSettings } from "@/store/settings";
import { api } from "@/lib/api";
import { requestContext, sendSpoken, spokenContext, voiceInOn } from "@/lib/assistant";
import { navigate, useQuery } from "@/lib/router";
import { usePageKeys } from "@/lib/keys";
import { hush, linesDone, speak, speakLine, useSpeaking } from "@/lib/speech";
import type { Photo } from "@/lib/images";
import type { Attachment } from "@/lib/attachments";
import { ago } from "@/lib/format";
import { rise } from "@/theme/motion";

const STATUS: Record<Run["status"], { label: string; tone: "accent" | "success" | "warn" | "danger" | "default" }> = {
  running: { label: "Working", tone: "accent" },
  waiting: { label: "Needs you", tone: "warn" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Didn't finish", tone: "danger" },
  stopped: { label: "Stopped", tone: "default" },
  interrupted: { label: "Interrupted", tone: "default" },
};
const live = (s?: Run["status"]) => s === "running" || s === "waiting";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const IDEAS = ["What's on today?", "How much did I spend this month?", "What's running in pm2?", "How much disk space is left?"];
const CONNECTIONS = [
  ["server", "Server"],
  ["github", "GitHub"],
  ["claude", "Claude"],
  ["firebase", "Firebase"],
  ["godaddy", "DNS"],
] as const;
type Filter = "all" | "starred" | "archived";
const PAGE = 30;

const imagesOf = (photos: Photo[]) => (photos.length ? photos.map((p) => ({ data: p.data, width: p.width, height: p.height })) : undefined);
const filesOf = (files: Attachment[]) => (files.length ? files.map((f) => ({ name: f.name, data: f.data })) : undefined);
const timeoutFor = (photos: Photo[], files: Attachment[]) => (files.length ? 180000 : photos.length ? 60000 : 20000);

export default function Assistant({ params }: { params: Record<string, string> }) {
  const runId = params.id ? parseInt(params.id, 10) : null;
  const op = useOperator();
  usePageKeys((e) => {
    if (e.key.toLowerCase() === "n") return navigate("/assistant"), true;
  });
  useEffect(() => {
    void op.loadStatus();
    void op.loadRuns();
    const t = setInterval(() => useOperator.getState().loadRuns(), 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full" data-testid="assistant">
      <ChatList current={runId} />
      <main className="min-w-0 flex-1">{op.availability === "unknown" ? <Loading /> : op.availability !== "ready" ? <Blocked /> : runId ? <Conversation key={runId} runId={runId} /> : <Home />}</main>
    </div>
  );
}

function Loading() {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-8 pt-16">
      <Skeleton className="h-[220px] rounded-[18px]" />
      <SkeletonRows rows={3} />
    </div>
  );
}

// ---------------- the list of chats ----------------
function ChatList({ current }: { current: number | null }) {
  const availability = useOperator((s) => s.availability);
  const upToDate = useOperator((s) => s.upToDate !== false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [counts, setCounts] = useState<ChatCounts | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const ticket = useRef(0);
  const ctx = useContextMenu();

  const load = async (offset = 0) => {
    const t = ++ticket.current;
    try {
      const r = await api<{ runs: Run[]; more?: boolean; counts?: ChatCounts }>("GET", `/operator/runs?filter=${filter}&limit=${PAGE}&offset=${offset}&q=${encodeURIComponent(q.trim())}`);
      if (t !== ticket.current) return;
      // the check every 10 s mostly brings back the same list: keep the one shown then
      setRuns((prev) => (offset ? [...prev, ...r.runs] : JSON.stringify(prev) === JSON.stringify(r.runs) ? prev : r.runs));
      setMore(!!r.more);
      if (r.counts) setCounts((prev) => (JSON.stringify(prev) === JSON.stringify(r.counts) ? prev : r.counts || null));
    } catch (e) {
      if (t === ticket.current) useOperator.setState(availabilityOf(e));
    } finally {
      if (t === ticket.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (availability !== "ready") return;
    const d = setTimeout(() => void load(0), q ? 250 : 0);
    const t = setInterval(() => void load(0), 10000);
    return () => {
      clearTimeout(d);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, q, availability]);
  // a chat just started (or opened from a link) shows in the list at once, not at the next check
  useEffect(() => {
    if (availability === "ready" && current != null && !loading && !runs.some((r) => r.id === current)) void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const menu = (r: Run) => [
    { label: "Open", onSelect: () => navigate(`/assistant/${r.id}`) },
    ...(upToDate
      ? [
          { label: r.starred ? "Remove from favourites" : "Add to favourites", icon: Star, onSelect: () => void mark(r, { starred: !r.starred }) },
          { label: r.archived ? "Take out of the archive" : "Archive", icon: r.archived ? ArchiveRestore : Archive, onSelect: () => void mark(r, { archived: !r.archived }) },
          { type: "separator" as const },
          { label: "Delete", icon: Trash2, danger: true, onSelect: () => void remove(r) },
        ]
      : []),
  ];
  const mark = async (r: Run, patch: { starred?: boolean; archived?: boolean }) => {
    try {
      await markChat(r.id, patch);
      void load(0);
    } catch (e: any) {
      toast.error(e.message || "Couldn't change that.");
    }
  };
  const remove = async (r: Run) => {
    if (!(await confirmDialog({ title: "Delete this chat?", body: `“${r.title}” and everything in it is deleted from your server. This can't be undone.`, confirm: "Delete", danger: true }))) return;
    try {
      await deleteChat(r.id);
      if (current === r.id) navigate("/assistant", { replace: true });
      void load(0);
      toast("Chat deleted");
    } catch (e: any) {
      toast.error(e.message || "Couldn't delete it.");
    }
  };

  return (
    <aside className="flex w-[296px] shrink-0 flex-col border-r border-line" data-testid="chat-list">
      <div className="px-3 pb-2 pt-6">
        <div className="mb-3 flex items-center gap-2 px-1">
          <h1 className="mr-auto font-display text-[20px] font-semibold tracking-[-0.02em]">Assistant</h1>
          <IconButton icon={Settings2} label="Assistant settings" size="sm" onClick={() => navigate("/settings?section=assistant")} />
        </div>
        <Button variant="primary" icon={MessageSquarePlus} block onClick={() => navigate("/assistant")} kbd="N">
          New chat
        </Button>
        <div className="mt-3">
          <Input icon={Search} value={q} onChange={setQ} placeholder="Search chats" size="sm" aria-label="Search chats" />
        </div>
        {upToDate && (
          <div className="mt-2">
            <Segmented<Filter>
              size="sm"
              block
              value={filter}
              onChange={(f) => {
                setLoading(true);
                setFilter(f);
              }}
              options={[
                { value: "all", label: "All", count: counts?.all },
                { value: "starred", label: "Starred", count: counts?.starred },
                { value: "archived", label: "Archive", count: counts?.archived },
              ]}
            />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {loading && !runs.length ? (
          <SkeletonRows rows={6} className="px-1" />
        ) : runs.length ? (
          <>
            {runs.map((r) => {
              const st = STATUS[r.status];
              return (
                <button
                  key={r.id}
                  type="button"
                  data-chat={r.id}
                  onClick={() => navigate(`/assistant/${r.id}`)}
                  onContextMenu={(e) => ctx(e, menu(r))}
                  className={clsx("mb-0.5 block w-full rounded-[11px] px-2.5 py-2 text-left transition-colors", current === r.id ? "bg-accent-soft" : "hover:bg-hover")}
                >
                  <div className="flex items-center gap-1.5">
                    {r.starred && <Star size={12} className="shrink-0 fill-warn text-warn" />}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.title}</span>
                    {live(r.status) && <span className={clsx("h-2 w-2 shrink-0 rounded-full", r.status === "waiting" ? "bg-warn" : "animate-pulse bg-accent")} />}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text3">
                    <span className="min-w-0 flex-1 truncate">{r.preview ? `${r.preview.from === "you" ? "You: " : r.preview.from === "claude" ? "Claude · " : ""}${r.preview.text || (r.preview.files?.length ? r.preview.files.join(", ") : r.preview.photos ? "Photo" : "")}` : st.label}</span>
                    <span className="shrink-0">{ago(r.updated_at)}</span>
                  </div>
                </button>
              );
            })}
            {more && (
              <Button size="sm" variant="ghost" block onClick={() => void load(runs.length)}>
                Show older chats
              </Button>
            )}
          </>
        ) : (
          <Empty compact icon={Bot} title={q ? "No chats match" : filter === "starred" ? "No favourites yet" : filter === "archived" ? "Nothing archived" : "No chats yet"} body={q ? "Try other words." : filter === "all" ? "Ask it something to start one." : undefined} />
        )}
      </div>
    </aside>
  );
}

// ---------------- home: start something ----------------
function Home() {
  const q = useQuery();
  const op = useOperator();
  const [sending, setSending] = useState(false);
  const ask = q.get("ask") || undefined;
  // opened by the talk shortcut: the box listens straight away
  const listen = q.get("voice") === "1";
  const start = async (text: string, photos: Photo[], files: Attachment[], byVoice = false) => {
    setSending(true);
    try {
      const context = byVoice ? spokenContext(useSettings.getState().speakReplies || useSettings.getState().readAloud) : { ...requestContext(), spoken: false };
      const r = await api<{ run: Run }>("POST", "/operator/runs", { text, images: imagesOf(photos), files: filesOf(files), context }, { timeoutMs: timeoutFor(photos, files) });
      useOperator.getState().loadRuns();
      // said, not typed: its answer is read aloud there, and then it listens for your reply
      navigate(`/assistant/${r.run.id}${byVoice ? "?spoken=1" : ""}`);
      return true;
    } catch (e: any) {
      toast.error(e.message || "Couldn't start that.");
      return false;
    } finally {
      setSending(false);
    }
  };
  // what you said, straight to the assistant: your server writes it down and starts at once
  const startByVoice = async (audio: { base64: string; type: string }) => {
    if (!voiceInOn()) return false;
    setSending(true);
    const r = await sendSpoken<{ run: Run }>("/operator/runs/voice", audio, useSettings.getState().speakReplies || useSettings.getState().readAloud);
    setSending(false);
    if ("fallback" in r) return false;
    if ("error" in r) toast.error(r.error);
    else {
      useOperator.getState().loadRuns();
      navigate(`/assistant/${r.data.run.id}?spoken=1`);
    }
    return true;
  };
  const conns = op.status?.connections;
  const recent = [...op.favourites, ...op.runs.filter((r) => !r.starred)].slice(0, 6);
  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-10">
      <div className="mx-auto max-w-[780px]">
        <motion.div {...rise(0)} className="mb-2 flex justify-center">
          <Orb size={150} state={sending ? "thinking" : "idle"} />
        </motion.div>
        <motion.h2 {...rise(1)} className="text-center font-display text-[28px] font-semibold tracking-[-0.025em]">
          What should I do?
        </motion.h2>
        <motion.p {...rise(2)} className="mb-6 text-center text-[13.5px] text-text2">
          It knows what you keep here. Changes wait for your click, risky steps for your fingerprint or password.
        </motion.p>
        <motion.div {...rise(3)}>
          <Composer big placeholder="e.g. Add my sister's birthday, or check why the API is slow" onSend={start} busy={sending} initial={ask} autoFocus={!listen} autoListen={listen} onVoice={startByVoice} />
        </motion.div>
        <motion.div {...rise(4)} className="mt-3 flex flex-wrap justify-center gap-1.5">
          {IDEAS.map((i) => (
            <Chip key={i} onClick={() => void start(i, [], [], false)}>
              {i}
            </Chip>
          ))}
        </motion.div>

        {conns && (
          <motion.div {...rise(5)} className="mt-6 flex flex-wrap justify-center gap-1.5">
            {CONNECTIONS.map(([k, label]) => {
              const ok = !!conns[k]?.ok;
              return (
                <button key={k} type="button" onClick={() => navigate("/settings?section=assistant")} title={conns[k]?.message || (ok ? "Connected" : "Not connected")} className="flex h-7 items-center gap-1.5 rounded-full bg-surface2 px-3 text-[12px] hairline hover:bg-hover">
                  {ok ? <CircleCheck size={13} className="text-success" /> : <CircleAlert size={13} className="text-warn" />}
                  <span className={ok ? "text-text2" : "text-warn"}>{label}</span>
                </button>
              );
            })}
          </motion.div>
        )}

        {op.approvals.length > 0 && (
          <motion.section {...rise(6)} className="mt-8">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-warn">Waiting for you · {op.approvals.length}</div>
            <div className="flex flex-col gap-2">
              {op.approvals.map((a) => (
                <button key={a.id} type="button" onClick={() => navigate(`/assistant/${a.conversation_id}`)} className="flex items-center gap-3 rounded-[12px] p-3 text-left glass shadow-[inset_0_0_0_1px_var(--c-warn)] hover:-translate-y-0.5 transition-transform">
                  <CircleAlert size={18} className="text-warn" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{a.summary}</span>
                  <span className="text-[12px] text-text3">{ago(a.created_at)}</span>
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {recent.length > 0 && (
          <motion.section {...rise(7)} className="mt-8">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-text3">Recent</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {recent.map((r) => (
                <button key={r.id} type="button" onClick={() => navigate(`/assistant/${r.id}`)} className="rounded-[12px] p-3 text-left glass hairline transition-transform hover:-translate-y-0.5">
                  <div className="flex items-center gap-1.5">
                    {r.starred && <Star size={12} className="fill-warn text-warn" />}
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{r.title}</span>
                    <Tag tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Tag>
                  </div>
                  <div className="mt-1 truncate text-[12px] text-text3">{r.preview?.text || ago(r.updated_at)}</div>
                </button>
              ))}
            </div>
          </motion.section>
        )}
      </div>
    </div>
  );
}

// ---------------- when it can't be used ----------------
function Blocked() {
  const op = useOperator();
  const [busy, setBusy] = useState(false);
  const words: Record<string, { title: string; body: string }> = {
    off: { title: "Not switched on on your server", body: "The assistant works on your server, so it starts switched off. Set REDLINE_OPERATOR=on in the server's .env and restart it. The steps are in docs/OPERATOR.md of myapp-backend." },
    not_owner: { title: "Only the server's owner can use it", body: "This account isn't the owner of the server (REDLINE_OPERATOR_OWNERS)." },
    paused: { title: "You switched it off", body: "Nothing runs while it's off. Turn it on to give it tasks again." },
    missing: { title: "Your server needs an update", body: "This server doesn't have the assistant yet. Update it to the latest myapp-backend." },
    error: { title: "Can't reach the assistant", body: op.message || "Check your connection and try again." },
  };
  const w = words[op.availability] || words.error;
  return (
    <div className="grid h-full place-items-center px-8">
      <Card className="max-w-[520px]">
        <div className="mb-2 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-accent-soft text-accent-text">
            <Server size={19} />
          </span>
          <h2 className="font-display text-[19px] font-semibold">{w.title}</h2>
        </div>
        <p className="text-[13.5px] text-text2">{w.body}</p>
        <div className="mt-4 flex gap-2">
          {op.availability === "paused" ? (
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await op.setEnabled(true);
                  await op.loadRuns();
                } catch (e: any) {
                  toast.error(e.message || "Couldn't turn it on.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Turn it on
            </Button>
          ) : (
            <Button onClick={() => (op.loadStatus(true), op.loadRuns())}>Try again</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------- one conversation ----------------
function Conversation({ runId }: { runId: number }) {
  const q = useQuery();
  const readAloud = useSettings((s) => s.readAloud);
  const speakReplies = useSettings((s) => s.speakReplies);
  const followUp = useSettings((s) => s.voiceFollowUp);
  const upToDate = useOperator((s) => s.upToDate !== false);
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<OpEvent[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  // the last thing you sent here was said, not typed (from the home page: ?spoken=1)
  const [voiced, setVoiced] = useState(q.get("spoken") === "1");
  // read aloud: what Settings says (every answer, or answers to what you said) until the speaker
  // button here says otherwise
  const [aloud, setAloud] = useState<boolean | null>(null);
  const reading = aloud ?? (readAloud || (voiced && speakReplies));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [atEnd, setAtEnd] = useState(true);
  const since = useRef(q.get("spoken") === "1" ? 0 : -1); // read answers that come after you wrote, not old ones
  const spoken = useRef(new Set<number>());
  const scroller = useRef<HTMLDivElement>(null);

  // the timeline, held open on the server until something happens
  useEffect(() => {
    let alive = true;
    (async () => {
      let after = 0;
      let known = ""; // the status it last saw: the server answers at once when it has moved on
      while (alive) {
        try {
          const r = await api<{ run: Run; events: OpEvent[]; last: number }>("GET", `/operator/runs/${runId}/events?after=${after}&wait=20&include_children=1&known=${known}`, undefined, { timeoutMs: 30000 });
          if (!alive) break;
          // its status moved (it finished, or a report woke it): the chat list follows
          if (known && known !== r.run.status) void useOperator.getState().loadRuns();
          known = r.run.status;
          setRun(r.run);
          setError("");
          if (r.events.length) {
            setEvents((prev) => prev.concat(r.events));
            after = r.last;
          }
          if (!live(r.run.status) && !r.events.length) await sleep(4000);
        } catch (e) {
          if (!alive) break;
          setError(availabilityOf(e).message);
          await sleep(4000);
        }
      }
    })();
    return () => {
      alive = false;
      hush();
    };
  }, [runId]);

  const items = useMemo(() => buildTimeline(events, runId), [events, runId]);

  // keep the newest in view while you're at the bottom
  useEffect(() => {
    const el = scroller.current;
    if (el && atEnd) el.scrollTo({ top: el.scrollHeight, behavior: events.length > 1 ? "smooth" : "auto" });
  }, [items, atEnd, events.length]);
  const onScroll = () => {
    const el = scroller.current;
    if (el) setAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  // read new answers aloud: line by line as the server reads them while they're written ("speech"
  // events), or the whole reply once it's in
  const readHere = useRef(false); // an answer of this chat is being read (not one elsewhere)
  useEffect(() => {
    if (!reading || since.current < 0) return;
    for (const e of events) {
      if (e.id <= since.current || spoken.current.has(e.id) || (e.type !== "speech" && e.type !== "reply")) continue;
      spoken.current.add(e.id);
      const d = (e.data || {}) as { n?: number; clip?: string; text?: string; voiced?: boolean };
      if (e.type === "speech" && d.clip) {
        speakLine({ n: Number(d.n) || 0, clip: String(d.clip), text: String(d.text || "") });
        readHere.current = true;
      } else if (e.type === "reply") {
        if (d.voiced && linesDone()) readHere.current = true;
        else if (!d.voiced && speak(String(d.text || ""))) readHere.current = true;
      }
    }
  }, [events, reading]);

  // a conversation by voice: once its answer has been read to its end, it listens for your reply
  // (not while it's still working, or waiting for your yes)
  const [listenNow, setListenNow] = useState(0);
  const turn = useRef({ followUp, voiced, reading, status: run?.status });
  useEffect(() => {
    turn.current = { followUp, voiced, reading, status: run?.status };
  }, [followUp, voiced, reading, run?.status]);
  useEffect(
    () =>
      useSpeaking.subscribe((s, prev) => {
        if (s.finished === prev.finished || !readHere.current) return;
        readHere.current = false;
        const t = turn.current;
        if (t.followUp && t.voiced && t.reading && t.status && !live(t.status)) setListenNow(s.finished);
      }),
    [],
  );

  // changes it proposed since your last message that you haven't saved or skipped
  const openProposal = () => {
    const pending = useProposals.getState().pending;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === "user") break;
      if (it.kind === "step" && it.proposal) {
        const d = decisionsOf(runId, it.proposal, pending);
        const open = it.proposal.changes.map((_, j) => j).filter((j) => !d[j]);
        if (open.length) return { p: it.proposal, open };
      }
    }
    return null;
  };

  const send = async (text: string, photos: Photo[], files: Attachment[], byVoice = false) => {
    // a spoken yes or no to "shall I save it?": saves or skips the card, as clicking would (a
    // deletion still needs a click). Anything more goes to the assistant as usual.
    const card = byVoice && !photos.length && !files.length ? openProposal() : null;
    const answer = card ? spokenAnswer(text) : null;
    if (card && answer) {
      if (answer === "yes") {
        const removals = card.open.filter((j) => card.p.changes[j].op === "remove");
        const r = decide(runId, card.p, card.open.filter((j) => card.p.changes[j].op !== "remove"), []);
        if (r.saved) toast.success(r.saved === 1 ? "Saved" : `Saved ${r.saved} changes`, { action: { label: "Undo", run: r.undo } });
        if (reading) speak(removals.length ? (r.saved ? "Saved. Deleting needs a click on the card." : "Deleting needs a click on the card.") : r.failed.length ? "Some of it couldn't be saved: have a look at the card." : "Saved.");
      } else {
        decide(runId, card.p, [], card.open);
        toast("Left as it was");
        if (reading) speak("Okay, I left it.");
      }
      return true;
    }
    setSending(true);
    try {
      const context = byVoice ? spokenContext(aloud ?? (readAloud || speakReplies)) : { ...requestContext(), spoken: false };
      const r = await api<{ steering: boolean }>("POST", `/operator/runs/${runId}/messages`, { text, images: imagesOf(photos), files: filesOf(files), context }, { timeoutMs: timeoutFor(photos, files) });
      since.current = events.length ? events[events.length - 1].id : 0;
      setVoiced(byVoice);
      setAtEnd(true);
      if (r.steering) toast("Added. It reads it after the current step.");
      return true;
    } catch (e: any) {
      toast.error(e.message || "Couldn't send that.");
      return false;
    } finally {
      setSending(false);
    }
  };
  // what you said, straight to the assistant: your server writes it down and it starts at once
  // (not when a card is waiting for your spoken yes or no: that's decided here, from the words)
  const sendRecording = async (audio: { base64: string; type: string }) => {
    if (!voiceInOn() || openProposal()) return false;
    setSending(true);
    const at = events.length ? events[events.length - 1].id : 0;
    const r = await sendSpoken<{ steering: boolean }>(`/operator/runs/${runId}/voice`, audio, aloud ?? (readAloud || speakReplies));
    setSending(false);
    if ("fallback" in r) return false;
    if ("error" in r) toast.error(r.error);
    else {
      since.current = at;
      setVoiced(true);
      setAtEnd(true);
      if (r.data.steering) toast("Added. It reads it after the current step.");
    }
    return true;
  };
  const stop = async () => {
    try {
      await api("POST", `/operator/runs/${runId}/stop`, {});
      toast("Stopping");
    } catch (e: any) {
      toast.error(e.message || "Couldn't stop it.");
    }
  };
  const mark = async (patch: { starred?: boolean; archived?: boolean }) => {
    try {
      const r = await markChat(runId, patch);
      setRun((x) => (x ? { ...x, starred: r.starred, archived: r.archived } : x));
      toast(patch.starred != null ? (r.starred ? "Added to favourites" : "Removed from favourites") : r.archived ? "Archived" : "Back from the archive");
    } catch (e: any) {
      toast.error(e.message || "Couldn't change that.");
    }
  };
  const saveName = async () => {
    setRenaming(false);
    const t = name.trim();
    if (!t || !run || t === run.title) return;
    try {
      const r = await renameChat(runId, t);
      setRun((x) => (x ? { ...x, title: r.title } : x));
    } catch (e: any) {
      toast.error(e.message || "Couldn't rename it.");
    }
  };
  const remove = async () => {
    if (!run || !(await confirmDialog({ title: "Delete this chat?", body: `“${run.title}” and everything in it is deleted from your server. This can't be undone.`, confirm: "Delete", danger: true }))) return;
    try {
      await deleteChat(runId);
      navigate("/assistant", { replace: true });
      toast("Chat deleted");
    } catch (e: any) {
      toast.error(e.message || "Couldn't delete it.");
    }
  };

  const st = run ? STATUS[run.status] : null;
  const pendingHere = items.some((x) => x.kind === "step" && (x.ask?.state === "pending" || x.claude?.lines.some((l) => l.ask?.state === "pending")));
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-8 py-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => (e.key === "Enter" ? saveName() : e.key === "Escape" ? setRenaming(false) : null)}
              autoFocus
              aria-label="Chat name"
              className="w-full rounded-[8px] bg-surface2 px-2 py-1 font-display text-[18px] font-semibold outline-none shadow-[inset_0_0_0_1px_var(--c-accent)]"
            />
          ) : (
            <button type="button" disabled={!run || !upToDate} onClick={() => (setName(run?.title || ""), setRenaming(true))} className="block max-w-full truncate text-left font-display text-[18px] font-semibold" title={upToDate ? "Rename" : undefined} data-testid="chat-title">
              {run?.title || <Skeleton className="h-5 w-48" />}
            </button>
          )}
          <div className="text-[12px] text-text3">{run ? `Started ${ago(run.created_at)}${run.cwd ? ` · in ${run.cwd}` : ""}` : " "}</div>
        </div>
        {st && <Tag tone={st.tone}>{st.label}</Tag>}
        <IconButton icon={reading ? Volume2 : VolumeX} label={reading ? "Stop reading answers aloud" : "Read answers aloud"} active={reading} onClick={() => (reading ? (hush(), setAloud(false)) : setAloud(true))} data-testid="read-aloud" />
        {run && upToDate && (
          <>
            <IconButton icon={Star} label={run.starred ? "Remove from favourites" : "Add to favourites"} active={!!run.starred} onClick={() => void mark({ starred: !run.starred })} className={run.starred ? "[&_svg]:fill-warn [&_svg]:text-warn" : ""} />
            <Menu
              trigger={(open) => <IconButton icon={MoreHorizontal} label="More" onClick={open} />}
              items={[
                { label: "Rename", icon: Pencil, onSelect: () => (setName(run.title), setRenaming(true)) },
                { label: run.archived ? "Take out of the archive" : "Archive", icon: run.archived ? ArchiveRestore : Archive, onSelect: () => void mark({ archived: !run.archived }) },
                { type: "separator" },
                { label: "Delete", icon: Trash2, danger: true, onSelect: () => void remove() },
              ]}
            />
          </>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-8 py-6" data-testid="timeline">
          <div className="mx-auto flex max-w-[860px] flex-col gap-3">
            {!run && !error && (
              <>
                <Skeleton className="ml-auto h-11 w-[55%] rounded-[16px]" />
                <Skeleton className="h-24 rounded-[14px]" />
                <Skeleton className="h-16 w-[70%] rounded-[14px]" />
              </>
            )}
            {items.map((it) => {
              if (it.kind === "user")
                return (
                  <motion.div key={it.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex max-w-[80%] flex-col items-end gap-1.5 self-end" data-user-message>
                    {it.images.length > 0 && <SentPhotos runId={runId} ids={it.images} />}
                    {it.files?.length > 0 && <SentFiles runId={runId} files={it.files} />}
                    {(it.text || it.whileWorking) && (
                      <div className="selectable rounded-[16px] rounded-br-[6px] accent-grad px-4 py-2.5 text-[14px] text-on-accent shadow-[var(--shadow-glow)]">
                        {it.text && <div className="whitespace-pre-wrap">{it.text}</div>}
                        {it.whileWorking && <div className="mt-1 text-[11.5px] opacity-75">Sent while it was working</div>}
                      </div>
                    )}
                  </motion.div>
                );
              if (it.kind === "say") return <p key={it.id} className="selectable px-1 text-[13.5px] text-text2">{it.text}</p>;
              if (it.kind === "reply") return <Reply key={it.id} text={it.text} />;
              if (it.kind === "error") return <p key={it.id} className="px-1 text-[13.5px] text-danger">{it.text}</p>;
              if (it.kind === "stopped") return <p key={it.id} className="self-center text-[12px] text-text3">Stopped</p>;
              if (it.kind === "claude_report") return <ClaudeReportCard key={it.id} report={it} />;
              if (READ_TOOLS.includes(it.tool)) return <LookedUp key={it.id} step={it} />;
              if (it.tool === "propose_changes" && it.proposal) return <ProposalCard key={it.id} runId={runId} step={it} />;
              return <StepCard key={it.id} step={it} />;
            })}
            {run && live(run.status) && !pendingHere && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 px-1">
                <Orb size={34} state="thinking" />
                <Working label="Working on it" />
              </motion.div>
            )}
            {error && <p className="self-center text-[12px] text-warn">{error}</p>}
          </div>
        </div>
        <AnimatePresence>
          {!atEnd && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              type="button"
              onClick={() => (setAtEnd(true), scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }))}
              className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] shadow-[var(--shadow-pop)]"
            >
              <ArrowDown size={13} /> Latest
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="border-t border-line px-8 pb-5 pt-3">
        <div className="mx-auto max-w-[860px]">
          {run && live(run.status) && (
            <div className="mb-2 flex justify-center">
              <Button size="sm" variant="ghost" icon={CircleStop} onClick={stop}>
                Stop everything it's doing
              </Button>
            </div>
          )}
          <Composer placeholder={run && live(run.status) ? "Add something while it works…" : "Reply, or ask for more…"} onSend={send} busy={sending} autoFocus listenNow={listenNow} onVoice={sendRecording} />
        </div>
      </div>
    </div>
  );
}

// photos you sent, loaded from the server once and kept
const photoCache = new Map<string, Promise<string>>();
function loadPhoto(runId: number, id: number) {
  const key = `${runId}:${id}`;
  if (!photoCache.has(key)) {
    const p = api<{ image: { data: string } }>("GET", `/operator/runs/${runId}/images/${id}`, undefined, { timeoutMs: 30000 }).then((r) => r.image.data);
    p.catch(() => photoCache.delete(key));
    photoCache.set(key, p);
  }
  return photoCache.get(key)!;
}
function SentPhotos({ runId, ids }: { runId: number; ids: number[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="flex flex-wrap justify-end gap-1.5">
        {ids.map((id) => (
          <SentPhoto key={id} runId={runId} id={id} big={ids.length === 1} onOpen={setOpen} />
        ))}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)} className="fixed inset-0 z-[130] grid place-items-center bg-black/70 p-10 backdrop-blur-sm">
            <motion.img initial={{ scale: 0.96 }} animate={{ scale: 1 }} src={open} alt="The photo you sent" className="max-h-full max-w-full rounded-[14px] shadow-[var(--shadow-pop)]" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
function SentPhoto({ runId, id, big, onOpen }: { runId: number; id: number; big: boolean; onOpen: (src: string) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadPhoto(runId, id).then(
      (u) => alive && setSrc(u),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [runId, id]);
  const size = big ? "h-44 w-44" : "h-24 w-24";
  if (failed) return <div className={clsx(size, "grid place-items-center rounded-[12px] bg-surface2 text-[11px] text-text3 hairline")}>Couldn't load</div>;
  if (!src) return <Skeleton className={clsx(size, "rounded-[12px]")} />;
  return (
    <button type="button" onClick={() => onOpen(src)} aria-label="Open the photo">
      <motion.img initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={src} alt="" className={clsx(size, "rounded-[12px] object-cover hairline")} />
    </button>
  );
}
