// Search everything (Ctrl/⌘ K): every record, every page and the things you can do, ranked the
// same way as on the phone. Arrows to move, Enter to open; with nothing typed it offers what you
// searched for lately and what you changed last.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { ArrowRight, Bookmark, Bot, Cake, CalendarDays, Car, CheckSquare, Clock, CornerDownLeft, FileText, Package, Search, Settings2, ShoppingCart, Sparkles, UserRound, Wallet, Wrench, Zap, type LucideIcon } from "lucide-react";
import { search, type Kind } from "@myapp/core";
import { commands, GROUP_ORDER, GROUP_WORD, recordEntries, type Entry, type Open } from "@/lib/searchIndex";
import { bridge, modKey } from "@/lib/bridge";
import { navigate } from "@/lib/router";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { useUI, edit } from "@/store/ui";
import { syncNow } from "@/store/sync";
import { toast } from "@/components/ui";
import { useEscape } from "@/lib/layers";
import { ease } from "@/theme/motion";
import { exportAll } from "@/lib/exporter";

const ICON: Record<string, LucideIcon> = {
  page: ArrowRight,
  action: Zap,
  todo: CheckSquare,
  item: ShoppingCart,
  note: FileText,
  clip: Bookmark,
  event: CalendarDays,
  reminder: Clock,
  date: Cake,
  person: UserRound,
  money: Wallet,
  thing: Package,
  car: Car,
  car_log: Wrench,
};

export function runOpen(open: Open, opts: { shift?: boolean } = {}) {
  if ("to" in open) navigate(open.to);
  else if ("edit" in open) edit(open.edit, open.rec, open.preset);
  else if ("copy" in open) {
    if (opts.shift) edit("clip", open.rec);
    else {
      bridge.clipboard.write(open.copy);
      useRecords.getState().update<"clip">(open.rec.id, (d) => ({ ...d, uses: (d.uses || 0) + 1 }));
      toast.success("Copied");
    }
  } else if ("set" in open) {
    useSettings.getState().set(open.set as any);
    toast(open.say);
  } else if ("run" in open) {
    if (open.run === "sync") void syncNow().then((ok) => (ok ? toast.success("Up to date") : toast.error("Couldn't sync right now")));
    if (open.run === "quick") bridge.quick.open();
    if (open.run === "capture") navigate("/capture");
    if (open.run === "shortcuts") useUI.getState().setShortcuts(true);
    if (open.run === "export") void exportAll();
  }
}

export function CommandPalette() {
  const open = useUI((s) => s.palette);
  const initial = useUI((s) => s.paletteQuery);
  const close = useUI((s) => s.closePalette);
  const lists = useRecords((s) => s.lists);
  const currency = useSettings((s) => s.currency);
  const recent = useSettings((s) => s.searches);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEscape(close, open);

  useEffect(() => {
    if (open) {
      setQ(initial);
      setActive(0);
      setTimeout(() => input.current?.focus(), 20);
    }
  }, [open, initial]);

  const docs = useMemo(() => {
    if (!open) return [];
    const people = new Map(lists.person.map((p) => [p.id, p.data.name]));
    const cars = new Map(lists.car.map((c) => [c.id, c.data.name]));
    return [...commands(modKey()), ...recordEntries(lists, { currency, people, cars })];
  }, [open, lists, currency]);

  const results = useMemo((): Entry[] => {
    const query = q.trim();
    if (!query) {
      // recently changed records, then the common actions
      const byId = useRecords.getState().byId;
      const changed = Object.values(byId)
        .filter((r) => !r.deleted && r.kind in ICON)
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 5)
        .map((r) => docs.find((d) => d.id === r.id))
        .filter(Boolean) as Entry[];
      const quick = ["act:capture", "act:todo", "act:expense", "act:note", "page:calendar", "act:sync"].map((id) => docs.find((d) => d.id === id)).filter(Boolean) as Entry[];
      return [...changed.map((e) => ({ ...e, group: "recent" as any })), ...quick];
    }
    return search(docs, query, 60).map((h) => h.doc);
  }, [q, docs]);

  // grouped for display, flat for the keyboard
  const grouped = useMemo(() => {
    const order: string[] = q.trim() ? (GROUP_ORDER as string[]) : ["recent", "do"];
    const groups: { key: string; items: Entry[] }[] = [];
    for (const g of order) {
      const items = results.filter((r) => r.group === g);
      if (items.length) groups.push({ key: g, items: q.trim() ? items.slice(0, g === "do" ? 6 : 8) : items });
    }
    return groups;
  }, [results, q]);
  const flat = grouped.flatMap((g) => g.items);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (e: Entry, shift = false) => {
    const query = q.trim();
    if (query) {
      const s = useSettings.getState();
      s.set({ searches: [query, ...s.searches.filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, 8) });
    }
    close();
    setTimeout(() => runOpen(e.open, { shift }), 60);
  };
  const fallback = q.trim();

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[140] flex justify-center px-6 pt-[11vh]">
          <motion.div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onMouseDown={close} />
          <motion.div
            role="dialog"
            aria-label="Search everything"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.985, transition: { duration: 0.12, ease: ease.in } }}
            transition={{ duration: 0.2, ease: ease.out }}
            className="relative flex max-h-[min(600px,76vh)] w-[min(680px,100%)] flex-col overflow-hidden rounded-[18px] border border-line bg-surface shadow-[var(--shadow-pop)]"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={18} className="shrink-0 text-accent-text" />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(flat.length - (fallback ? -1 : 1), a + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (flat[active]) choose(flat[active], e.shiftKey);
                    else if (fallback) {
                      close();
                      navigate(`/capture?text=${encodeURIComponent(fallback)}`);
                    }
                  }
                }}
                placeholder="Search to-dos, notes, money, people… or type a page or an action"
                aria-label="Search"
                className="h-14 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-text3"
              />
              <kbd className="rounded-[5px] border border-line bg-surface2 px-1.5 text-[10.5px] text-text3">Esc</kbd>
            </div>
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
              {!q.trim() && recent.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
                  {recent.slice(0, 6).map((r) => (
                    <button key={r} type="button" onClick={() => setQ(r)} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface2 px-2.5 text-[12px] text-text2 hairline hover:text-text">
                      <Clock size={11} /> {r}
                    </button>
                  ))}
                </div>
              )}
              {grouped.map((g) => (
                <div key={g.key} className="mb-1">
                  <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text3">{g.key === "recent" ? "Changed lately" : GROUP_WORD[g.key as keyof typeof GROUP_WORD] || g.key}</div>
                  {g.items.map((e) => {
                    const idx = flat.indexOf(e);
                    const Icon = ICON[e.kind] || (e.kind === "action" ? (e.id.startsWith("act:theme") ? Settings2 : Zap) : ArrowRight);
                    const on = idx === active;
                    return (
                      <div
                        key={`${g.key}-${e.id}`}
                        data-idx={idx}
                        role="option"
                        aria-selected={on}
                        onMouseMove={() => setActive(idx)}
                        onClick={(ev) => choose(e, ev.shiftKey)}
                        className={clsx("flex h-11 items-center gap-3 rounded-[10px] px-2.5", on && "bg-hover")}
                      >
                        <span className={clsx("grid h-7 w-7 shrink-0 place-items-center rounded-[8px]", on ? "bg-accent-soft text-accent-text" : "bg-surface2 text-text2")}>
                          <Icon size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] text-text">{e.title}</div>
                          {e.detail && <div className="truncate text-[11.5px] text-text3">{e.detail}</div>}
                        </div>
                        {e.kbd && <span className="shrink-0 text-[11px] text-text3">{e.kbd}</span>}
                        {on && <CornerDownLeft size={14} className="shrink-0 text-text3" />}
                      </div>
                    );
                  })}
                </div>
              ))}
              {fallback && (
                <div className="mt-1 border-t border-line pt-2">
                  <div
                    data-idx={flat.length}
                    onMouseMove={() => setActive(flat.length)}
                    onClick={() => {
                      close();
                      navigate(`/capture?text=${encodeURIComponent(fallback)}`);
                    }}
                    className={clsx("flex h-11 items-center gap-3 rounded-[10px] px-2.5", active === flat.length && "bg-hover")}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-[8px] accent-grad text-on-accent">
                      <Sparkles size={15} />
                    </span>
                    <div className="min-w-0 flex-1 truncate text-[13.5px]">
                      Capture “<span className="text-accent-text">{fallback}</span>” with AI
                    </div>
                  </div>
                  <div
                    onClick={() => {
                      close();
                      navigate(`/assistant?ask=${encodeURIComponent(fallback)}`);
                    }}
                    className="flex h-11 items-center gap-3 rounded-[10px] px-2.5 hover:bg-hover"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-surface2 text-text2">
                      <Bot size={15} />
                    </span>
                    <div className="min-w-0 flex-1 truncate text-[13.5px] text-text2">Ask the assistant</div>
                  </div>
                </div>
              )}
              {q.trim() && !flat.length && <p className="px-3 py-3 text-[12.5px] text-text3">Nothing matches “{q.trim()}”. Capture it, or ask the assistant.</p>}
            </div>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11.5px] text-text3">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-line px-1">↑</kbd>
                <kbd className="rounded border border-line px-1">↓</kbd> move
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-line px-1">Enter</kbd> open
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-line px-1">Shift Enter</kbd> edit saved text
              </span>
              <span className="flex-1" />
              <span>{docs.length.toLocaleString()} things searched</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.getElementById("overlay-root") || document.body,
  );
}

export type { Kind };
