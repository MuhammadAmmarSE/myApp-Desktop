// Short messages at the bottom of the window: "Saved", "Deleted · Undo". They stack, pause while
// you point at them, and go by themselves.
import { create } from "zustand";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { ease } from "@/theme/motion";

type Tone = "default" | "success" | "error" | "info";
type T = { id: number; text: string; tone: Tone; action?: { label: string; run: () => void }; ms: number };
const useToasts = create<{ list: T[] }>(() => ({ list: [] }));
let n = 0;

type Opts = { tone?: Tone; action?: { label: string; run: () => void }; ms?: number };
export function toast(text: string, opts: Opts = {}) {
  const t: T = { id: ++n, text, tone: opts.tone || "default", action: opts.action, ms: opts.ms ?? (opts.action ? 6000 : 2800) };
  useToasts.setState((s) => ({ list: [...s.list.slice(-3), t] }));
  return t.id;
}
toast.success = (text: string, o: Omit<Opts, "tone"> = {}) => toast(text, { ...o, tone: "success" });
toast.error = (text: string, o: Omit<Opts, "tone"> = {}) => toast(text, { ...o, tone: "error", ms: o?.ms ?? 4500 });
toast.info = (text: string, o: Omit<Opts, "tone"> = {}) => toast(text, { ...o, tone: "info" });
// "Deleted" with an Undo that puts it back
toast.undo = (text: string, undo: () => void) => toast(text, { action: { label: "Undo", run: undo } });

const dismiss = (id: number) => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) }));

function Item({ t }: { t: T }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    timer.current = setTimeout(() => dismiss(t.id), t.ms);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => {
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertCircle : t.tone === "info" ? Info : null;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14, ease: ease.in } }}
      transition={{ duration: 0.24, ease: ease.out }}
      onMouseEnter={stop}
      onMouseLeave={start}
      role="status"
      className="pointer-events-auto flex min-w-[260px] max-w-[440px] items-center gap-3 rounded-[13px] border border-line bg-surface2/95 py-2.5 pl-3.5 pr-2 text-[13px] text-text shadow-[var(--shadow-pop)] backdrop-blur-xl"
    >
      {Icon && <Icon size={17} className={clsx("shrink-0", t.tone === "success" && "text-success", t.tone === "error" && "text-danger", t.tone === "info" && "text-info")} />}
      <span className="flex-1">{t.text}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            t.action?.run();
            dismiss(t.id);
          }}
          className="rounded-[7px] px-2 py-1 text-[12.5px] font-semibold text-accent-text hover:bg-hover"
        >
          {t.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="grid h-6 w-6 place-items-center rounded-md text-text3 hover:bg-hover hover:text-text">
        <X size={14} />
      </button>
    </motion.div>
  );
}

export function ToastHost() {
  const list = useToasts((s) => s.list);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[300] flex flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <Item key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
