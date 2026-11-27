// Dialogs (in the middle, for a question or a short form) and drawers (from the right, for editing
// something while the page stays in view). Escape closes the top one; Tab stays inside it; focus
// goes back where it was when it closes.
import { create } from "zustand";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { AlertTriangle, X, type LucideIcon } from "lucide-react";
import { Button } from "./Button";
import { useEscape } from "@/lib/layers";
import { ease } from "@/theme/motion";

const layer = () => document.getElementById("overlay-root") || document.body;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useFocusTrap(open: boolean, box: React.RefObject<HTMLDivElement | null>, initial?: string) {
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = box.current;
      // already in a field of this dialog (an autoFocus, or a quick click): leave it there, unless
      // the dialog asked for something else first
      if (!el || (!initial && el.contains(document.activeElement))) return;
      const first = (initial && el.querySelector<HTMLElement>(initial)) || el.querySelector<HTMLElement>("[data-autofocus]") || el.querySelector<HTMLElement>("input,textarea") || el.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 30);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !box.current) return;
      const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", key);
      before?.focus?.();
    };
  }, [open, box, initial]);
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  children,
  footer,
  width = 480,
  initialFocus,
  className,
  bare,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  initialFocus?: string;
  className?: string;
  bare?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEscape(onClose, open);
  useFocusTrap(open, box, initialFocus);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto px-6 pb-10 pt-[12vh]">
          <motion.div
            className="fixed inset-0 bg-black/45 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2 }}
            onMouseDown={onClose}
          />
          <motion.div
            ref={box}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.985, transition: { duration: 0.14, ease: ease.in } }}
            transition={{ duration: 0.22, ease: ease.out }}
            style={{ width, maxWidth: "100%" }}
            className={clsx("relative rounded-[18px] border border-line bg-surface shadow-[var(--shadow-pop)]", className)}
          >
            {bare ? (
              children
            ) : (
              <>
                {(title || Icon) && (
                  <div className="flex items-start gap-3 px-6 pb-1 pt-5">
                    {Icon && (
                      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent-text">
                        <Icon size={18} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {title && <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text">{title}</h2>}
                      {description && <p className="mt-1 text-[13px] leading-relaxed text-text2">{description}</p>}
                    </div>
                    <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-text3 hover:bg-hover hover:text-text">
                      <X size={17} />
                    </button>
                  </div>
                )}
                {children && <div className="px-6 py-4">{children}</div>}
                {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3.5">{footer}</div>}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    layer(),
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconTone,
  children,
  footer,
  width = 460,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  iconTone?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  actions?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEscape(onClose, open);
  useFocusTrap(open, box);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110]" style={{ top: "var(--titlebar-h)" }}>
          <motion.div className="absolute inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={onClose} />
          <motion.aside
            ref={box}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0, transition: { duration: 0.16, ease: ease.in } }}
            transition={{ duration: 0.26, ease: ease.out }}
            style={{ width, maxWidth: "calc(100% - 24px)" }}
            className="absolute bottom-2 right-2 top-2 flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface shadow-[var(--shadow-pop)]"
          >
            <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
              {Icon && (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: iconTone ? `color-mix(in srgb, ${iconTone} 16%, transparent)` : "var(--c-accentSoft)", color: iconTone || "var(--c-accentText)" }}>
                  <Icon size={18} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
                {subtitle && <p className="truncate text-[12px] text-text3">{subtitle}</p>}
              </div>
              {actions}
              <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-text3 hover:bg-hover hover:text-text">
                <X size={17} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && <footer className="flex items-center gap-2 border-t border-line bg-surface px-5 py-3">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    layer(),
  );
}

// ---- ask() / confirm(): a question as a promise ----
type Ask = { title: string; body?: ReactNode; confirm: string; cancel?: string; danger?: boolean; resolve: (ok: boolean) => void };
const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }));

export function confirmDialog(opts: Omit<Ask, "resolve">): Promise<boolean> {
  return new Promise((resolve) => useAsk.setState({ ask: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const ask = useAsk((s) => s.ask);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(!!ask), [ask]);
  const done = (ok: boolean) => {
    ask?.resolve(ok);
    setOpen(false);
    setTimeout(() => useAsk.setState({ ask: null }), 180);
  };
  return (
    <Dialog
      open={open}
      onClose={() => done(false)}
      width={420}
      icon={ask?.danger ? AlertTriangle : undefined}
      title={ask?.title}
      description={ask?.body}
      footer={
        <>
          <Button variant="ghost" onClick={() => done(false)}>
            {ask?.cancel || "Cancel"}
          </Button>
          <Button variant={ask?.danger ? "danger" : "primary"} data-autofocus onClick={() => done(true)}>
            {ask?.confirm}
          </Button>
        </>
      }
    />
  );
}
