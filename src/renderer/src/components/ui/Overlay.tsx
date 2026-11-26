// Things that float: tooltips, popovers and menus (also the right-click menu). They are drawn in a
// layer above the page, placed next to what opened them, and flip to stay on screen.
import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { ease } from "@/theme/motion";
import { useEscape } from "@/lib/layers";

export type Placement = "bottom-start" | "bottom-end" | "bottom" | "top-start" | "top-end" | "top" | "right-start" | "left-start";

type Point = { left: number; top: number; origin: string };

function place(anchor: DOMRect, size: { w: number; h: number }, placement: Placement, gap = 6): Point {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = 8;
  let [side, align] = placement.split("-") as [string, string | undefined];
  if (side === "bottom" && anchor.bottom + gap + size.h > vh - m && anchor.top - gap - size.h > m) side = "top";
  else if (side === "top" && anchor.top - gap - size.h < m && anchor.bottom + gap + size.h < vh - m) side = "bottom";
  if (side === "right" && anchor.right + gap + size.w > vw - m) side = "left";
  let left = 0;
  let top = 0;
  if (side === "bottom" || side === "top") {
    top = side === "bottom" ? anchor.bottom + gap : anchor.top - gap - size.h;
    left = align === "start" ? anchor.left : align === "end" ? anchor.right - size.w : anchor.left + anchor.width / 2 - size.w / 2;
  } else {
    left = side === "right" ? anchor.right + gap : anchor.left - gap - size.w;
    top = align === "start" ? anchor.top - 4 : anchor.top + anchor.height / 2 - size.h / 2;
  }
  left = Math.max(m, Math.min(left, vw - size.w - m));
  top = Math.max(m, Math.min(top, vh - size.h - m));
  const origin = side === "bottom" ? "top" : side === "top" ? "bottom" : side === "right" ? "left" : "right";
  return { left, top, origin };
}

const layer = () => document.getElementById("overlay-root") || document.body;

// ---------------- Tooltip ----------------
export function Tooltip({ label, kbd, children, placement = "bottom", delay = 450 }: { label: ReactNode; kbd?: string; children: ReactElement; placement?: Placement; delay?: number }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Point | null>(null);
  const show = (el: HTMLElement) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnchor(el.getBoundingClientRect()), delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setAnchor(null);
    setPos(null);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useLayoutEffect(() => {
    if (anchor && tip.current) setPos(place(anchor, { w: tip.current.offsetWidth, h: tip.current.offsetHeight }, placement, 7));
  }, [anchor, placement]);
  if (!isValidElement(children) || !label) return children;
  const p = children.props as any;
  const child = cloneElement(children as ReactElement<any>, {
    onMouseEnter: (e: any) => {
      p.onMouseEnter?.(e);
      show(e.currentTarget);
    },
    onMouseLeave: (e: any) => {
      p.onMouseLeave?.(e);
      hide();
    },
    onMouseDown: (e: any) => {
      p.onMouseDown?.(e);
      hide();
    },
    onFocus: (e: any) => {
      p.onFocus?.(e);
      if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget);
    },
    onBlur: (e: any) => {
      p.onBlur?.(e);
      hide();
    },
  });
  return (
    <>
      {child}
      {anchor &&
        createPortal(
          <div
            ref={tip}
            role="tooltip"
            className="pointer-events-none fixed z-[200] flex items-center gap-2 rounded-[7px] border border-line bg-surface2 px-2 py-1 text-[12px] font-medium text-text shadow-[var(--shadow-pop)]"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, opacity: pos ? 1 : 0, transition: "opacity 120ms" }}
          >
            {label}
            {kbd && <span className="rounded bg-hover px-1 text-[10.5px] text-text2">{kbd}</span>}
          </div>,
          layer(),
        )}
    </>
  );
}

// ---------------- Popover ----------------
export function Popover({
  open,
  onClose,
  anchor,
  placement = "bottom-start",
  children,
  className,
  width,
  modal = false,
}: {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | DOMRect | { x: number; y: number } | null;
  placement?: Placement;
  children: ReactNode;
  className?: string;
  width?: number;
  modal?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Point | null>(null);
  const rectOf = useCallback((): DOMRect | null => {
    if (!anchor) return null;
    if (anchor instanceof HTMLElement) return anchor.getBoundingClientRect();
    if ("x" in anchor && !("width" in anchor)) return new DOMRect(anchor.x, anchor.y, 0, 0);
    return anchor as DOMRect;
  }, [anchor]);

  useEscape(onClose, open);
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const update = () => {
      const r = rectOf();
      if (r && box.current) setPos(place(r, { w: box.current.offsetWidth, h: box.current.offsetHeight }, placement));
    };
    update();
    const ro = new ResizeObserver(update);
    if (box.current) ro.observe(box.current);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [open, rectOf, placement]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t)) return;
      if (anchor instanceof HTMLElement && anchor.contains(t)) return;
      onClose();
    };
    const blur = () => onClose();
    window.addEventListener("mousedown", down, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("blur", blur);
    };
  }, [open, onClose, anchor]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {modal && <div className="fixed inset-0 z-[150]" />}
          <motion.div
            ref={box}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: pos ? 1 : 0, scale: pos ? 1 : 0.96 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1, ease: ease.in } }}
            transition={{ duration: 0.16, ease: ease.out }}
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, transformOrigin: pos?.origin ?? "top", width }}
            className={clsx("fixed z-[160] rounded-[12px] border border-line bg-surface p-1 shadow-[var(--shadow-pop)]", className)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    layer(),
  );
}

// ---------------- Menu ----------------
export type MenuItem =
  | { type?: "item"; label: string; icon?: LucideIcon; onSelect: () => void; kbd?: string; danger?: boolean; disabled?: boolean; checked?: boolean; hint?: string }
  | { type: "separator" }
  | { type: "label"; label: string }
  | { type: "sub"; label: string; icon?: LucideIcon; items: MenuItem[] };

export function MenuList({ items, onDone, autoFocus = true }: { items: MenuItem[]; onDone: () => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ i: number; el: HTMLElement } | null>(null);
  const actionable = items.map((it, i) => (it.type === "separator" || it.type === "label" || (it as any).disabled ? -1 : i)).filter((i) => i >= 0);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const choose = (it: MenuItem) => {
    if (it.type === "sub" || it.type === "separator" || it.type === "label" || it.disabled) return;
    onDone();
    it.onSelect();
  };
  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      className="min-w-[190px] outline-none"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const pos = actionable.indexOf(active);
          const next = e.key === "ArrowDown" ? actionable[(pos + 1) % actionable.length] : actionable[(pos - 1 + actionable.length) % actionable.length];
          setActive(next ?? -1);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const it = items[active];
          if (it?.type === "sub") {
            const el = ref.current?.querySelectorAll<HTMLElement>("[data-mi]")[active];
            if (el) setSub({ i: active, el });
          } else if (it) choose(it);
        } else if (e.key === "ArrowRight" && items[active]?.type === "sub") {
          const el = ref.current?.querySelectorAll<HTMLElement>("[data-mi]")[active];
          if (el) setSub({ i: active, el });
        }
      }}
    >
      {items.map((it, i) => {
        if (it.type === "separator") return <div key={i} data-mi className="mx-1 my-1 h-px bg-line" />;
        if (it.type === "label") return <div key={i} data-mi className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">{it.label}</div>;
        const Icon = it.icon;
        const isSub = it.type === "sub";
        const disabled = !isSub && (it as any).disabled;
        return (
          <div
            key={i}
            data-mi
            role="menuitem"
            aria-disabled={disabled || undefined}
            onMouseEnter={(e) => {
              setActive(i);
              if (isSub) setSub({ i, el: e.currentTarget });
              else setSub(null);
            }}
            onClick={(e) => (isSub ? setSub({ i, el: e.currentTarget }) : choose(it))}
            className={clsx(
              "flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-[13px]",
              disabled ? "opacity-40" : "cursor-default",
              active === i && !disabled && "bg-hover",
              !isSub && (it as any).danger ? "text-danger" : "text-text",
            )}
          >
            {Icon ? <Icon size={15} strokeWidth={2} className={clsx("shrink-0", !isSub && (it as any).danger ? "" : "text-text2")} /> : !isSub && (it as any).checked !== undefined ? <span className="w-[15px]" /> : null}
            <span className="flex-1 truncate">{it.label}</span>
            {!isSub && (it as any).checked && <Check size={14} className="text-accent-text" />}
            {!isSub && (it as any).hint && <span className="text-[11.5px] text-text3">{(it as any).hint}</span>}
            {!isSub && (it as any).kbd && <span className="text-[11px] text-text3">{(it as any).kbd}</span>}
            {isSub && <ChevronRight size={14} className="text-text3" />}
          </div>
        );
      })}
      {sub && items[sub.i]?.type === "sub" && (
        <Popover open anchor={sub.el} placement="right-start" onClose={() => setSub(null)}>
          <MenuList items={(items[sub.i] as any).items} onDone={onDone} autoFocus={false} />
        </Popover>
      )}
    </div>
  );
}

export function Menu({ trigger, items, placement = "bottom-end", width }: { trigger: (open: (e: React.MouseEvent<HTMLElement>) => void, isOpen: boolean) => ReactElement; items: MenuItem[] | (() => MenuItem[]); placement?: Placement; width?: number }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setEl(null), []);
  return (
    <>
      {trigger((e) => {
        e.stopPropagation();
        setEl(el ? null : e.currentTarget);
      }, !!el)}
      <Popover open={!!el} anchor={el} onClose={close} placement={placement} width={width}>
        <MenuList items={typeof items === "function" ? items() : items} onDone={close} />
      </Popover>
    </>
  );
}

// ---------------- Right-click menu ----------------
type CtxState = { x: number; y: number; items: MenuItem[] } | null;
const CtxMenu = createContext<(e: React.MouseEvent, items: MenuItem[]) => void>(() => {});

export function ContextMenuHost({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CtxState>(null);
  const open = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ x: e.clientX, y: e.clientY, items });
  }, []);
  const close = useCallback(() => setState(null), []);
  return (
    <CtxMenu.Provider value={open}>
      {children}
      <Popover open={!!state} anchor={state ? { x: state.x, y: state.y } : null} onClose={close} placement="bottom-start">
        {state && <MenuList items={state.items} onDone={close} />}
      </Popover>
    </CtxMenu.Provider>
  );
}

export const useContextMenu = () => useContext(CtxMenu);
