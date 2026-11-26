// Moving through a list with the keyboard, and choosing several rows at once.
//   ↑ ↓ or J K   move           Enter or E  open
//   Space or X   tick           Delete      delete (with Undo)
//   N            add one        Esc         let go of the chosen rows
// Click opens a row; Ctrl/⌘-click adds it to the chosen ones; Shift-click chooses a run of rows.
import { useEffect, useRef, useState } from "react";
import { usePageKeys } from "./keys";
import { isMac } from "./bridge";

type Opts<T> = {
  onOpen?: (t: T) => void;
  onToggle?: (list: T[]) => void;
  onDelete?: (list: T[]) => void;
  onNew?: () => void;
  // where a row is on the page, to keep the moving one in view
  selector?: (id: string) => string;
};

export function useListNav<T extends { id: string }>(items: T[], opts: Opts<T>) {
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const o = useRef(opts);
  o.current = opts;

  // rows that went away are let go
  useEffect(() => {
    const ids = new Set(items.map((i) => i.id));
    if (active && !ids.has(active)) setActive(null);
    setSelected((s) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of s) (ids.has(id) ? next.add(id) : (changed = true));
      return changed ? next : s;
    });
  }, [items, active]);

  useEffect(() => {
    if (!active) return;
    const sel = o.current.selector ? o.current.selector(active) : `[data-nav="${CSS.escape(active)}"]`;
    document.querySelector(sel)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const chosen = (): T[] => {
    if (selected.size) return items.filter((i) => selected.has(i.id));
    const a = items.find((i) => i.id === active);
    return a ? [a] : [];
  };

  const step = (n: number) => {
    if (!items.length) return;
    const i = items.findIndex((x) => x.id === active);
    const next = i < 0 ? (n > 0 ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, i + n));
    setActive(items[next].id);
    anchor.current = items[next].id;
  };

  usePageKeys(
    (e) => {
      const k = e.key.toLowerCase();
      if (e.key === "ArrowDown" || k === "j") return step(1), true;
      if (e.key === "ArrowUp" || k === "k") return step(-1), true;
      if (e.key === "Enter" || k === "e") {
        const a = items.find((i) => i.id === active);
        if (a && o.current.onOpen) return o.current.onOpen(a), true;
        return;
      }
      if (e.key === " " || k === "x") {
        const list = chosen();
        if (list.length && o.current.onToggle) return o.current.onToggle(list), true;
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const list = chosen();
        if (list.length && o.current.onDelete) return o.current.onDelete(list), true;
        return;
      }
      if (k === "n" && o.current.onNew) return o.current.onNew(), true;
      if (e.key === "Escape" && (selected.size || active)) {
        setSelected(new Set());
        setActive(null);
        return true;
      }
    },
    [items, active, selected],
  );

  const click = (t: T, e: React.MouseEvent) => {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (mod) {
      setSelected((s) => {
        const next = new Set(s);
        if (!s.size && active && active !== t.id) next.add(active);
        next.has(t.id) ? next.delete(t.id) : next.add(t.id);
        return next;
      });
      setActive(t.id);
      anchor.current = t.id;
      return;
    }
    if (e.shiftKey && (anchor.current || active)) {
      const from = items.findIndex((i) => i.id === (anchor.current || active));
      const to = items.findIndex((i) => i.id === t.id);
      if (from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from];
        setSelected(new Set(items.slice(a, b + 1).map((i) => i.id)));
        setActive(t.id);
        return;
      }
    }
    setSelected(new Set());
    setActive(t.id);
    anchor.current = t.id;
    o.current.onOpen?.(t);
  };

  const clear = () => setSelected(new Set());
  const selectAll = () => setSelected(new Set(items.map((i) => i.id)));
  return { active, setActive, selected, setSelected, click, clear, selectAll, chosen };
}
