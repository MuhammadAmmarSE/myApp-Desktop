// Capture: write what someone told you, in any language, the way you'd say it. The AI proposes
// what to save — to-dos, list items, events, reminders, money, notes, dates — and you keep what's
// right before anything is saved. Questions get an answer; server and code work goes to the
// Assistant. What you sent recently can be run again.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { ArrowRight, Bot, Check, CornerDownLeft, History, NotebookPen, PencilLine, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { actionToRecords, saveActions, type Action, type PersonRef } from "@myapp/core";
import { Button, Card, CardTitle, Chip, Empty, IconButton, Kbd, Page, Textarea, toast } from "@/components/ui";
import { Orb, type OrbState } from "@/components/orb/Orb";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit, useUI, type EditKind } from "@/store/ui";
import { ACTION_AREA, ACTION_ICON, describe, EXAMPLES, remember, sortOut, whoseOf, type OpenFund } from "@/lib/capture";
import { addMove, useFunds } from "@/lib/funds";
import { navigate, useQuery } from "@/lib/router";
import { doneWithNotes } from "@/lib/inbox";
import { isMac, modKey } from "@/lib/bridge";
import { ApiError } from "@/lib/api";
import { typing } from "@/lib/keys";
import { layerOpen } from "@/lib/layers";
import { ago } from "@/lib/format";
import { ease, rise } from "@/theme/motion";

type Phase = "input" | "thinking" | "review" | "saved" | "error";
type Past = { text: string; at: number };
const EDITABLE: EditKind[] = ["todo", "item", "event", "reminder", "money", "clip", "date"];
const HISTORY_KEY = "captures";

const readHistory = (raw: string | undefined): Past[] => {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((p) => p && typeof p.text === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
};

export default function Capture() {
  const query = useQuery();
  const currency = useSettings((s) => s.currency);
  const peopleRecs = useList("person");
  const people: PersonRef[] = useMemo(() => peopleRecs.map((p) => ({ id: p.id, name: p.data.name, relation: p.data.relation })), [peopleRecs]);
  const history = readHistory(useRecords((s) => s.meta[HISTORY_KEY]));
  // hisaabs still open: what you buy may go on one of them
  const fundRows = useFunds().open;
  const funds: OpenFund[] = useMemo(() => fundRows.map((r) => ({ id: r.fund.id, from: r.fund.data.from, purpose: r.fund.data.purpose, left: r.summary.left })), [fundRows]);
  const [text, setText] = useState(query.get("text") || "");
  // sent from notes (ones saved while the server was offline): once saved, those notes are done
  const [fromNotes] = useState(() => (query.get("notes") || "").split(",").filter(Boolean));
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState<Phase>("input");
  const [result, setResult] = useState<{ summary: string; reply: string; assistant: boolean }>({ summary: "", reply: "", assistant: false });
  const [actions, setActions] = useState<Action[]>([]);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [moved, setMoved] = useState<boolean[]>([]); // opened in the full editor instead
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const asked = useRef("");

  // the orb breathes while you type (and a moment after), then sits still: the box has the focus
  // the whole time you're on this page, and an orb that moves the whole time keeps the window busy
  const [writing, setWriting] = useState(false);
  const typed = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onType = (v: string) => {
    setText(v);
    setWriting(true);
    if (typed.current) clearTimeout(typed.current);
    typed.current = setTimeout(() => setWriting(false), 2500);
  };
  useEffect(() => () => void (typed.current && clearTimeout(typed.current)), []);
  const orb: OrbState = phase === "thinking" ? "thinking" : phase === "saved" ? "done" : phase === "error" ? "error" : writing ? "listening" : "idle";
  const chosen = keep.filter((k, i) => k && !moved[i]).length;
  const cards = useMemo(() => {
    const whose = whoseOf(actions, keep, funds);
    return actions.map((a) => describe(a, currency, whose));
  }, [actions, keep, funds, currency]);
  const reviewing = phase === "review" || phase === "saved";

  const ask = async (input = text.trim()) => {
    if (!input || phase === "thinking") return;
    asked.current = input;
    setPhase("thinking");
    setError(null);
    useRecords.getState().setMeta(HISTORY_KEY, JSON.stringify(remember(history.map((h) => h.text), input).map((t) => ({ text: t, at: t === input ? Date.now() : history.find((h) => h.text === t)?.at || Date.now() }))));
    try {
      const r = await sortOut(input, { currency, people, funds });
      setActions(r.actions);
      setKeep(r.actions.map(() => true));
      setMoved(r.actions.map(() => false));
      setResult({ summary: r.summary, reply: r.reply, assistant: r.assistant });
      setPhase("review");
    } catch (e) {
      const err = e as ApiError;
      setError({ message: err.message || "Couldn't sort that out.", code: err.code });
      setPhase("error");
    }
  };

  // opened with words already (Today's box, Search, a redline:// link): go straight away
  useEffect(() => {
    if (query.get("go") === "1" && text.trim()) void ask(text.trim());
    else box.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = (keepText = true) => {
    setPhase("input");
    setActions([]);
    setKeep([]);
    setMoved([]);
    setResult({ summary: "", reply: "", assistant: false });
    if (!keepText) setText("");
    requestAnimationFrame(() => box.current?.focus());
  };

  const editAction = (i: number, field: string, value: string) => setActions((list) => list.map((a, j) => (j === i ? ({ ...a, [field]: value } as Action) : a)));

  const saveAll = () => {
    if (!chosen || phase !== "review") return;
    const s = useRecords.getState();
    // the money given first, then what's bought with it (core's saveActions keeps that order)
    const created = saveActions(
      actions.filter((_, i) => keep[i] && !moved[i]),
      { currency, people, create: (kind, data) => s.create(kind, data as never).id, addMore: (id, m) => void addMove(id, "more", m.amount, m.note, m.date) },
    );
    const n = created.length || actions.filter((a, i) => keep[i] && !moved[i] && a.type === "fund").length;
    setPhase("saved");
    const done = n && fromNotes.length ? doneWithNotes(fromNotes, created) : null;
    if (done?.removed) toast(`${n === 1 ? "Saved" : `Saved ${n} things`}, and the note${done.removed === 1 ? " is" : "s are"} done`, { action: { label: "Undo", run: done.undo } });
    else toast.success(n === 1 ? "Saved" : `Saved ${n} things`);
    setTimeout(() => {
      setText("");
      reset(false);
    }, 1300);
  };

  const saveAsNote = () => {
    const input = (asked.current || text).trim();
    if (!input) return;
    // it came from notes: they're still there, nothing to add
    if (fromNotes.length) {
      toast("Kept as it was, in Notes", { action: { label: "Open", run: () => navigate(`/notes/${fromNotes[0]}`) } });
      setText("");
      reset(false);
      return;
    }
    const rec = useRecords.getState().create("note", { title: input.split("\n")[0].slice(0, 60), body: input, tags: ["inbox"], pinned: false });
    toast("Saved as a note, tagged inbox", { action: { label: "Open", run: () => navigate(`/notes/${rec.id}`) } });
    setText("");
    reset(false);
  };

  // in the full editor: everything about it can be changed there, and Save there keeps it
  const openInEditor = (i: number) => {
    const d = actionToRecords(actions[i], { currency, people })[0];
    if (!d) return;
    if (d.kind === "note") {
      const rec = useRecords.getState().create("note", d.data);
      setMoved((m) => m.map((v, j) => (j === i ? true : v)));
      navigate(`/notes/${rec.id}`);
      return;
    }
    if (!EDITABLE.includes(d.kind as EditKind)) return;
    setMoved((m) => m.map((v, j) => (j === i ? true : v)));
    edit(d.kind as EditKind, null, d.data as Record<string, unknown>);
  };

  const toAssistant = () => navigate(`/assistant?ask=${encodeURIComponent((asked.current || text).trim())}`);

  // Ctrl/⌘ Enter sorts it out (or saves what you kept); Esc goes back to the text. Works while
  // typing in the box, not while something is open on top.
  const keys = useRef({ ask, saveAll, reset, phase, reviewing });
  keys.current = { ask, saveAll, reset, phase, reviewing };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (layerOpen() || useUI.getState().palette || useUI.getState().editing) return;
      const k = keys.current;
      if (e.key === "Enter" && (isMac() ? e.metaKey : e.ctrlKey)) {
        e.preventDefault();
        if (k.phase === "input" || k.phase === "error") void k.ask();
        else if (k.phase === "review") k.saveAll();
      } else if (e.key === "Escape" && k.reviewing && !typing(e.target)) {
        e.preventDefault();
        k.reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Page width="wide">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* left: the planet and what you type */}
        <div className="flex min-w-0 flex-col xl:sticky xl:top-0 xl:self-start">
          <motion.div {...rise(0)} className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">
            Quick capture
          </motion.div>
          <motion.h1 {...rise(1)} className="mt-1 font-display text-[30px] font-semibold leading-tight tracking-[-0.025em]">
            What did someone tell you?
          </motion.h1>
          <motion.p {...rise(2)} className="mt-1 max-w-[520px] text-[14px] text-text2">
            Write it the way you'd say it, in any language. Redline sorts it into to-dos, lists, events, reminders, money and notes — you check it before anything is saved.
          </motion.p>

          <motion.div {...rise(2)} className="my-4 flex justify-center">
            <motion.div animate={{ scale: reviewing ? 0.72 : 1, height: reviewing ? 170 : 240 }} transition={{ duration: 0.45, ease: ease.standard }} className="grid place-items-center">
              <Orb size={230} state={orb} />
            </motion.div>
          </motion.div>

          <motion.div {...rise(3)}>
            <Card strong className={clsx("!p-0 transition-shadow", focused && "shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-accent)_22%,transparent),0_18px_50px_-24px_var(--c-glow)]")}>
              <Textarea
                ref={box}
                value={text}
                onChange={onType}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="e.g. Pay the electricity bill by Friday, and remind me to call the plumber tomorrow at 10"
                aria-label="What to capture"
                minRows={4}
                maxRows={12}
                disabled={phase === "thinking"}
                boxClassName="!bg-transparent !shadow-none"
                className="!px-5 !pt-4 !text-[15px] leading-relaxed"
              />
              <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
                <span className="text-[11.5px] text-text3">{text.trim() ? `${text.trim().length} characters` : "Plain words are fine"}</span>
                <div className="flex-1" />
                {text && phase !== "thinking" && (
                  <Button size="sm" variant="ghost" onClick={() => (setText(""), reset(false))}>
                    Clear
                  </Button>
                )}
                {reviewing ? (
                  <Button size="sm" icon={RotateCcw} onClick={() => reset()}>
                    Change text
                  </Button>
                ) : (
                  <Button variant="primary" iconRight={ArrowRight} loading={phase === "thinking"} disabled={!text.trim()} onClick={() => void ask()} kbd={`${modKey()}↵`} data-testid="sort-out">
                    {phase === "thinking" ? "Sorting it out" : "Sort it out"}
                  </Button>
                )}
              </div>
            </Card>
          </motion.div>

          {phase === "input" && !text && (
            <motion.div {...rise(4)} className="mt-4">
              <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text3">Try</div>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((e) => (
                  <Chip key={e} onClick={() => (setText(e), box.current?.focus())}>
                    {e}
                  </Chip>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* right: what it proposes, or how it works */}
        <div className="min-w-0 xl:pt-[92px]">
          <AnimatePresence mode="wait" initial={false}>
            {phase === "thinking" ? (
              <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3" aria-live="polite">
                <div className="text-[13px] text-text2">Reading it and working out what goes where…</div>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 rounded-[14px] p-4 glass hairline">
                    <div className="skeleton h-10 w-10 rounded-[12px]" />
                    <div className="flex-1">
                      <div className="skeleton mb-2 h-3 w-20 rounded" />
                      <div className="skeleton mb-1.5 h-4 w-3/4 rounded" />
                      <div className="skeleton h-3 w-1/2 rounded" />
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : phase === "error" && error ? (
              <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="border-[color-mix(in_srgb,var(--c-danger)_40%,var(--c-line))]">
                  <div className="flex gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[color-mix(in_srgb,var(--c-danger)_15%,transparent)] text-danger">
                      <X size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">That didn't work</div>
                      <p className="mt-0.5 text-[13.5px] text-text2" data-testid="capture-error">
                        {error.message}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="primary" icon={RotateCcw} onClick={() => void ask()}>
                          Try again
                        </Button>
                        <Button icon={NotebookPen} onClick={saveAsNote}>
                          {fromNotes.length ? "Keep the note" : "Save it as a note"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ) : reviewing ? (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3" data-testid="review">
                {result.reply && (
                  <motion.div {...rise(0)} className="flex gap-3 rounded-[16px] rounded-tl-[6px] p-4 glass shadow-[inset_0_0_0_1px_var(--c-glow)]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent-text">
                      <Sparkles size={17} />
                    </span>
                    <p className="selectable min-w-0 flex-1 whitespace-pre-wrap text-[14px] leading-relaxed" data-testid="reply">
                      {result.reply}
                    </p>
                  </motion.div>
                )}
                {(actions.length > 0 || !result.reply) && (
                  <motion.div {...rise(1)} className={result.reply ? "mt-2" : ""}>
                    <div className="font-display text-[19px] font-semibold">{actions.length ? "Here's what I'll do" : "Nothing to save"}</div>
                    {result.summary && <p className="mt-0.5 text-[13.5px] text-text2">{result.summary}</p>}
                  </motion.div>
                )}
                {actions.map((a, i) => {
                  const d = cards[i];
                  const Icon = ACTION_ICON[a.type];
                  const on = keep[i] && !moved[i];
                  return (
                    <motion.div key={i} {...rise(i + 2)} data-action={a.type} className={clsx("group flex items-start gap-3 rounded-[14px] p-3.5 glass transition-[opacity,box-shadow]", on ? "shadow-[inset_0_0_0_1px_var(--c-glow)]" : "opacity-55 hairline")}>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent-text">
                        <Icon size={19} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-text">{ACTION_AREA[a.type]}</div>
                        {moved[i] ? (
                          <div className="text-[14px] font-semibold">{d.title}</div>
                        ) : (
                          <input
                            value={d.title}
                            onChange={(e) => editAction(i, d.edit, e.target.value)}
                            aria-label={`${ACTION_AREA[a.type]} wording`}
                            className="w-full rounded-[7px] bg-transparent px-1 py-0.5 -mx-1 text-[14.5px] font-semibold text-text outline-none hover:bg-hover focus:bg-surface2 focus:shadow-[inset_0_0_0_1px_var(--c-accent)]"
                          />
                        )}
                        <div className="mt-0.5 text-[12.5px] text-text2">{moved[i] ? "Opened in the editor — save it there to keep it." : d.detail}</div>
                      </div>
                      {moved[i] ? (
                        <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setMoved((m) => m.map((v, j) => (j === i ? false : v)))}>
                          Put back
                        </Button>
                      ) : (
                        <>
                          {(EDITABLE.includes(a.type as EditKind) || a.type === "note") && phase === "review" && (
                            <IconButton icon={PencilLine} label="Change everything about it" size="sm" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => openInEditor(i)} />
                          )}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={on ? "Keep" : "Skip"}
                            disabled={phase === "saved"}
                            onClick={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))}
                            className={clsx("grid h-7 w-7 shrink-0 place-items-center self-center rounded-full border-2 transition-colors", on ? "border-accent bg-accent text-on-accent" : "border-text3 text-transparent hover:border-text2")}
                          >
                            <Check size={14} strokeWidth={3} />
                          </button>
                        </>
                      )}
                    </motion.div>
                  );
                })}
                <motion.div {...rise(actions.length + 2)} className="mt-1 flex flex-wrap items-center gap-2">
                  {actions.length > 0 ? (
                    <Button variant="primary" size="lg" icon={phase === "saved" ? Check : CornerDownLeft} onClick={saveAll} disabled={!chosen || phase === "saved"} kbd={phase === "saved" ? undefined : `${modKey()}↵`} data-testid="save-all">
                      {phase === "saved" ? "Saved" : chosen === actions.length ? `Save ${chosen === 1 ? "it" : `all ${chosen}`}` : `Save ${chosen}`}
                    </Button>
                  ) : result.assistant ? (
                    <Button variant="primary" size="lg" icon={Bot} onClick={toAssistant}>
                      Ask the assistant
                    </Button>
                  ) : !result.reply ? (
                    <Button variant="primary" size="lg" icon={NotebookPen} onClick={saveAsNote}>
                      {fromNotes.length ? "Keep the note" : "Save it as a note"}
                    </Button>
                  ) : null}
                  {result.assistant && actions.length > 0 && (
                    <Button variant="ghost" icon={Bot} onClick={toAssistant}>
                      Ask the assistant instead
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => reset()}>
                    {result.reply && !actions.length ? "Ask something else" : "Back"}
                    <Kbd>Esc</Kbd>
                  </Button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div key="how" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
                <Card>
                  <CardTitle title="How it works" icon={Sparkles} />
                  <ol className="flex flex-col gap-3">
                    {[
                      ["Write it down", "Several things at once is fine: “milk and eggs, and pay the bill by Friday”."],
                      ["Check what it found", "Each thing gets a card. Fix the wording, untick what's wrong, or open it in the full editor."],
                      ["Save", "Only what you keep is saved, and it reaches your phone on the next sync."],
                    ].map(([t, b], i) => (
                      <li key={t} className="flex gap-3">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-text tnum">{i + 1}</span>
                        <div>
                          <div className="text-[13.5px] font-medium">{t}</div>
                          <div className="text-[12.5px] text-text2">{b}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Card>
                <Card>
                  <CardTitle title="Recent" icon={History} sub={history.length ? "Run one again, or put it back in the box" : undefined} />
                  {history.length ? (
                    <div className="-mx-2 flex flex-col">
                      {history.map((h) => (
                        <div key={h.text} className="group flex items-center gap-2 rounded-[10px] px-2 py-1.5 hover:bg-hover">
                          <button type="button" onClick={() => (setText(h.text), box.current?.focus())} className="min-w-0 flex-1 truncate text-left text-[13px]" title={h.text}>
                            {h.text}
                          </button>
                          <span className="shrink-0 text-[11px] text-text3">{ago(h.at)}</span>
                          <IconButton icon={ArrowRight} label="Run it again" size="xs" className="opacity-0 group-hover:opacity-100" onClick={() => (setText(h.text), void ask(h.text))} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty compact icon={History} title="Nothing yet" body={`What you send shows here. ${modKey()} ⇧ Space opens Quick capture from any app.`} />
                  )}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Page>
  );
}
