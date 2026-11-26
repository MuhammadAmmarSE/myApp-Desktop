// Quick capture: a small window over whatever you're doing (Ctrl/⌘ ⇧ Space). Type what someone
// told you, press Enter, check what the AI found, press Enter again to save it. Esc puts the
// window away. It keeps no records of its own: what you save is made by the main window, so it
// syncs like everything else.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { ArrowRight, Check, CornerDownLeft, ExternalLink, NotebookPen, RotateCcw, Sparkles, X } from "lucide-react";
import { actionToRecords, type Action, type PersonRef, type Relation } from "@myapp/core";
import type { QuickContext } from "@shared/ipc";
import { Button, Kbd, Spin } from "@/components/ui";
import { Orb, type OrbState } from "@/components/orb/Orb";
import { applyTheme } from "@/theme";
import { ACTION_AREA, ACTION_ICON, describe, sortOut } from "@/lib/capture";
import { ApiError } from "@/lib/api";
import { bridge, isMac } from "@/lib/bridge";

type Phase = "input" | "thinking" | "review" | "saved" | "error" | "signed-out";

export default function Quick() {
  const [ctx, setCtx] = useState<QuickContext | null>(null);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [actions, setActions] = useState<Action[]>([]);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [reply, setReply] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  const people: PersonRef[] = useMemo(() => (ctx?.people || []).map((p) => ({ id: p.id, name: p.name, relation: p.relation as Relation })), [ctx]);
  const currency = ctx?.currency || "PKR";

  const reset = () => {
    setText("");
    setPhase("input");
    setActions([]);
    setKeep([]);
    setReply("");
    setSummary("");
    setError("");
  };
  // fresh each time it comes up, with the main window's theme and people
  useEffect(() => {
    const ready = async () => {
      const c = await bridge.quick.context();
      setCtx(c);
      if (c?.themeId) applyTheme(c.themeId, "none", c.motion, "comfortable");
      if (!c) setPhase("signed-out");
      else setPhase((p) => (p === "signed-out" || p === "saved" ? "input" : p));
      requestAnimationFrame(() => box.current?.focus());
    };
    void ready();
    document.documentElement.classList.add("quick");
    return bridge.on("quick-shown", () => {
      setPhase((p) => (p === "saved" ? "input" : p));
      void ready();
    });
  }, []);

  const close = () => {
    bridge.quick.close();
    setTimeout(reset, 200);
  };

  const ask = async () => {
    const t = text.trim();
    if (!t || phase === "thinking") return;
    setPhase("thinking");
    setError("");
    try {
      const r = await sortOut(t, { currency, people });
      setActions(r.actions);
      setKeep(r.actions.map(() => true));
      setReply(r.reply);
      setSummary(r.summary);
      setPhase("review");
    } catch (e) {
      const err = e as ApiError;
      setError(err.message || "Couldn't sort that out.");
      setPhase(err.code === "SIGNED_OUT" ? "signed-out" : "error");
    }
  };

  const save = async () => {
    const drafts = actions.flatMap((a, i) => (keep[i] ? actionToRecords(a, { currency, people }) : []));
    if (!drafts.length) return;
    const ok = await bridge.quick.save(drafts, drafts.length === 1 ? "Saved from Quick capture" : `Saved ${drafts.length} things from Quick capture`);
    if (!ok) return setError("Open Redline first, then try again.");
    setPhase("saved");
    setTimeout(close, 700);
  };
  const asNote = async () => {
    const t = text.trim();
    if (!t) return;
    await bridge.quick.save([{ kind: "note", data: { title: t.split("\n")[0].slice(0, 60), body: t, tags: ["inbox"], pinned: false } }], "Saved as a note, tagged inbox");
    setPhase("saved");
    setTimeout(close, 700);
  };
  const openInApp = () => bridge.quick.toMain({ type: "navigate", to: text.trim() ? `/capture?text=${encodeURIComponent(text.trim())}` : "/capture" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "review" || phase === "error") setPhase("input");
        else close();
      } else if (e.key === "Enter" && !e.shiftKey && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        if (phase === "input" || phase === "error") void ask();
        else if (phase === "review") actions.length ? void save() : setPhase("input");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const orb: OrbState = phase === "thinking" ? "thinking" : phase === "saved" ? "done" : phase === "error" ? "error" : text ? "listening" : "idle";
  const chosen = keep.filter(Boolean).length;

  return (
    <div className="flex h-full items-start justify-center p-3" data-testid="quick">
      <motion.div initial={{ opacity: 0, scale: 0.97, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }} className="flex max-h-full w-full flex-col overflow-hidden rounded-[20px] border border-line bg-surface shadow-[0_24px_70px_-20px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.03)]">
        {/* top: the planet, what this is, Esc */}
        <div className="drag flex items-center gap-3 border-b border-line px-4 py-2.5">
          <Orb size={30} state={orb} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">Quick capture</div>
            <div className="text-[11px] text-text3">Tell Redline anything — it files it where it belongs</div>
          </div>
          <button type="button" onClick={openInApp} className="no-drag flex items-center gap-1 rounded-[8px] px-2 py-1 text-[11.5px] text-text3 hover:bg-hover hover:text-text">
            <ExternalLink size={12} /> Open in Redline
          </button>
          <button type="button" aria-label="Close" onClick={close} className="no-drag grid h-7 w-7 place-items-center rounded-[8px] text-text3 hover:bg-hover hover:text-text">
            <X size={15} />
          </button>
        </div>

        {phase === "signed-out" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Sparkles size={22} className="text-accent-text" />
            <div className="text-[14px] font-semibold">Sign in to Redline first</div>
            <p className="max-w-[360px] text-[12.5px] text-text2">Quick capture saves to your account. Open Redline and sign in, then press the shortcut again.</p>
            <Button variant="primary" onClick={() => bridge.quick.toMain({ type: "navigate", to: "/" })}>
              Open Redline
            </Button>
          </div>
        ) : (
          <>
            <div className="px-4 pt-3">
              <textarea
                ref={box}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (phase === "review" || phase === "error") setPhase("input");
                }}
                placeholder="e.g. Milk and eggs on the way home, and remind me to call the bank at 11"
                aria-label="What to capture"
                rows={3}
                disabled={phase === "thinking" || phase === "saved"}
                data-testid="quick-text"
                className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-text outline-none placeholder:text-text3"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3">
              <AnimatePresence mode="wait" initial={false}>
                {phase === "thinking" && (
                  <motion.div key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-1 pb-3 text-[12.5px] text-text2">
                    <Spin size={14} /> Sorting it out…
                  </motion.div>
                )}
                {phase === "error" && (
                  <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-3 flex items-center gap-2 rounded-[11px] bg-[color-mix(in_srgb,var(--c-danger)_12%,transparent)] px-3 py-2 text-[12.5px] text-danger">
                    <X size={14} /> <span className="flex-1">{error}</span>
                    <Button size="xs" variant="ghost" icon={NotebookPen} onClick={() => void asNote()}>
                      Keep as a note
                    </Button>
                  </motion.div>
                )}
                {(phase === "review" || phase === "saved") && (
                  <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-1.5 pb-3" data-testid="quick-review">
                    {reply && <p className="selectable rounded-[11px] bg-accent-soft/60 px-3 py-2 text-[13px]">{reply}</p>}
                    {summary && actions.length > 0 && <div className="px-1 text-[12px] text-text2">{summary}</div>}
                    {actions.map((a, i) => {
                      const d = describe(a, currency);
                      const Icon = ACTION_ICON[a.type];
                      const on = keep[i];
                      return (
                        <motion.button
                          key={i}
                          type="button"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          onClick={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))}
                          aria-pressed={on}
                          className={clsx("flex items-center gap-3 rounded-[11px] px-2.5 py-2 text-left transition-[background,opacity]", on ? "bg-surface2 hairline" : "opacity-50 hover:bg-hover")}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent-text">
                            <Icon size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{d.title}</span>
                            <span className="block truncate text-[11.5px] text-text3">
                              {ACTION_AREA[a.type]} · {d.detail}
                            </span>
                          </span>
                          <span className={clsx("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-accent bg-accent text-on-accent" : "border-text3")}>{on && <Check size={11} strokeWidth={3} />}</span>
                        </motion.button>
                      );
                    })}
                    {!actions.length && !reply && <div className="px-1 text-[12.5px] text-text2">Nothing to save in that.</div>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
              <span className="text-[11px] text-text3">
                <Kbd>↵</Kbd> {phase === "review" ? "save" : "sort it out"} · <Kbd>⇧ ↵</Kbd> new line · <Kbd>Esc</Kbd> {phase === "review" ? "back" : "close"}
              </span>
              <div className="flex-1" />
              {phase === "review" && (
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setPhase("input")}>
                  Change
                </Button>
              )}
              {phase === "review" && actions.length > 0 ? (
                <Button size="sm" variant="primary" icon={CornerDownLeft} disabled={!chosen} onClick={() => void save()} data-testid="quick-save">
                  Save {chosen === 1 ? "it" : chosen}
                </Button>
              ) : phase === "saved" ? (
                <Button size="sm" variant="primary" icon={Check} disabled>
                  Saved
                </Button>
              ) : (
                <Button size="sm" variant="primary" iconRight={ArrowRight} loading={phase === "thinking"} disabled={!text.trim()} onClick={() => void ask()} data-testid="quick-go">
                  Sort it out
                </Button>
              )}
            </div>
          </>
        )}
      </motion.div>
      <span className="sr-only">{isMac() ? "Command" : "Control"} Shift Space opens this from anywhere.</span>
    </div>
  );
}
