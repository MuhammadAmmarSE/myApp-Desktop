// Rows used on several pages: a to-do (tick it, open it, right-click for more) and a list item.
import { forwardRef } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { AlertCircle, CalendarDays, Copy, ExternalLink, Flag, Pencil, Repeat, ShoppingBag, Trash2 } from "lucide-react";
import { addDays, dayWord, isoDate, nextDue, time12, type Rec } from "@myapp/core";
import { Checkbox, Tag, toast, useContextMenu, type MenuItem } from "@/components/ui";
import { useRecords } from "@/store/records";
import { edit } from "@/store/ui";
import { bridge } from "@/lib/bridge";
import { money } from "@/lib/format";
import { useSettings } from "@/store/settings";

export function toggleTodo(t: Rec<"todo">) {
  const s = useRecords.getState();
  if (!t.data.done && t.data.repeat && t.data.due) {
    const next = nextDue(t.data.due, t.data.repeat);
    s.update<"todo">(t.id, { due: next });
    toast(`Done. Next one ${dayWord(next).toLowerCase()}`, { action: { label: "Undo", run: () => s.update<"todo">(t.id, { due: t.data.due }) } });
    return;
  }
  const done = !t.data.done;
  s.update<"todo">(t.id, { done, done_at: done ? Date.now() : null });
  if (done) toast("Done", { action: { label: "Undo", run: () => useRecords.getState().update<"todo">(t.id, { done: false, done_at: null }) }, ms: 3500 });
}

export function deleteRec(rec: Rec, what = "Deleted") {
  useRecords.getState().remove(rec.id);
  toast.undo(what, () => useRecords.getState().restore(rec));
}

export function todoMenu(t: Rec<"todo">): MenuItem[] {
  const today = isoDate();
  const move = (d: string | null) => useRecords.getState().update<"todo">(t.id, { due: d });
  return [
    { label: t.data.done ? "Mark not done" : "Mark done", icon: Flag, onSelect: () => toggleTodo(t) },
    { label: "Edit", icon: Pencil, kbd: "E", onSelect: () => edit("todo", t) },
    {
      type: "sub",
      label: "Move to",
      icon: CalendarDays,
      items: [
        { label: "Today", onSelect: () => move(today) },
        { label: "Tomorrow", onSelect: () => move(addDays(today, 1)) },
        { label: "In a week", onSelect: () => move(addDays(today, 7)) },
        { label: "No date", onSelect: () => move(null) },
      ],
    },
    { label: t.data.priority === "high" ? "Normal priority" : "High priority", icon: AlertCircle, onSelect: () => useRecords.getState().update<"todo">(t.id, { priority: t.data.priority === "high" ? "normal" : "high" }) },
    { label: "Copy text", icon: Copy, onSelect: () => (bridge.clipboard.write(t.data.title), toast("Copied")) },
    { type: "separator" },
    { label: "Delete", icon: Trash2, danger: true, kbd: "Del", onSelect: () => deleteRec(t, "To-do deleted") },
  ];
}

type TodoRowProps = { t: Rec<"todo">; today: string; active?: boolean; selected?: boolean; showDate?: boolean; onClick?: (e: React.MouseEvent) => void; onMenu?: (e: React.MouseEvent) => void; compact?: boolean; index?: number; draggable?: boolean };

export const TodoRow = forwardRef<HTMLDivElement, TodoRowProps>(function TodoRow({ t, today, active, selected, showDate = true, onClick, onMenu, compact, index = 0, draggable }, ref) {
  const ctx = useContextMenu();
  const d = t.data;
  const late = !d.done && d.due && d.due < today;
  const when = d.due ? (d.due === today ? (d.time ? time12(d.time) : "") : dayWord(d.due, today)) + (d.due !== today && d.time ? ` · ${time12(d.time)}` : "") : "";
  return (
    <motion.div
      ref={ref}
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.14 } }}
      transition={{ duration: 0.26, ease: [0, 0, 0.2, 1], delay: Math.min(index, 10) * 0.02 }}
      draggable={draggable}
      onDragStart={(e: any) => {
        e.dataTransfer.setData("text/redline-todo", t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      data-todo={t.id}
      data-active={active || undefined}
      data-selected={selected || undefined}
      onClick={onClick || (() => edit("todo", t))}
      onContextMenu={onMenu || ((e) => ctx(e, todoMenu(t)))}
      className={clsx(
        "group relative flex items-start gap-3 rounded-[11px] px-3 transition-colors",
        compact ? "py-2" : "py-2.5",
        selected ? "bg-accent-soft/60 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-accent)_45%,transparent)]" : active ? "bg-hover shadow-[inset_0_0_0_1px_var(--c-line)]" : "hover:bg-hover",
      )}
    >
      <Checkbox checked={!!d.done} onChange={() => toggleTodo(t)} label={d.done ? "Mark not done" : "Mark done"} round className="mt-[1px]" />
      <div className="min-w-0 flex-1">
        <div className={clsx("text-[13.5px] leading-snug transition-colors", d.done ? "text-text3 line-through decoration-text3/60" : "text-text")}>{d.title}</div>
        {(!compact || when || d.priority === "high") && (showDate || d.time || d.priority === "high" || d.repeat || d.tags?.length) ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-text3">
            {showDate && when && <span className={clsx("inline-flex items-center gap-1", late ? "font-medium text-danger" : d.due === today ? "text-accent-text" : "")}>{late ? `Late · ${when}` : when}</span>}
            {!showDate && d.time && <span className={clsx("tnum", d.due === today && !d.done ? "text-accent-text" : "")}>{time12(d.time)}</span>}
            {d.priority === "high" && !d.done && <Tag tone="danger">High</Tag>}
            {d.repeat && (
              <span className="inline-flex items-center gap-0.5">
                <Repeat size={11} /> {d.repeat}
              </span>
            )}
            {d.tags?.slice(0, 3).map((g) => (
              <Tag key={g}>#{g}</Tag>
            ))}
            {d.notes && <span className="max-w-[240px] truncate">· {d.notes}</span>}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
});

export function ItemRow({ i, onToggle, active, selected, index = 0, onClick, draggable }: { i: Rec<"item">; onToggle: () => void; active?: boolean; selected?: boolean; index?: number; onClick?: (e: React.MouseEvent) => void; draggable?: boolean }) {
  const ctx = useContextMenu();
  const currency = useSettings((s) => s.currency);
  const d = i.data;
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.14 } }}
      transition={{ duration: 0.24, delay: Math.min(index, 10) * 0.02 }}
      data-item={i.id}
      data-active={active || undefined}
      data-selected={selected || undefined}
      draggable={draggable}
      onDragStart={(e: any) => {
        e.dataTransfer.setData("text/redline-item", i.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick || (() => edit("item", i))}
      onContextMenu={(e) =>
        ctx(e, [
          { label: d.done ? "Not bought" : "Bought", onSelect: onToggle },
          { label: "Edit", icon: Pencil, onSelect: () => edit("item", i) },
          ...(d.link ? [{ label: "Open the link", icon: ExternalLink, onSelect: () => void bridge.app.openExternal(d.link!) }] : []),
          { label: d.regular ? "Not a regular" : "Make it a regular", icon: ShoppingBag, onSelect: () => useRecords.getState().update<"item">(i.id, { regular: !d.regular }) },
          { type: "separator" },
          { label: "Delete", icon: Trash2, danger: true, onSelect: () => deleteRec(i, "Removed from the list") },
        ])
      }
      className={clsx("group flex items-center gap-3 rounded-[11px] px-3 py-2.5 transition-colors", selected ? "bg-accent-soft/60 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-accent)_45%,transparent)]" : active ? "bg-hover shadow-[inset_0_0_0_1px_var(--c-line)]" : "hover:bg-hover")}
    >
      <Checkbox checked={d.done} onChange={onToggle} label={d.done ? "Not bought" : "Bought"} />
      <div className="min-w-0 flex-1">
        <div className={clsx("truncate text-[13.5px]", d.done ? "text-text3 line-through" : "text-text")}>
          {d.name}
          {d.qty && <span className="ml-1.5 text-text3">× {d.qty}</span>}
        </div>
        {(d.note || d.price) && <div className="truncate text-[11.5px] text-text3">{[d.note, d.price ? money(d.price, currency) : ""].filter(Boolean).join(" · ")}</div>}
      </div>
      {d.link && (
        <button type="button" onClick={(e) => (e.stopPropagation(), void bridge.app.openExternal(d.link!))} aria-label="Open the link" className="grid h-7 w-7 place-items-center rounded-md text-text3 opacity-0 hover:bg-hover hover:text-text group-hover:opacity-100">
          <ExternalLink size={14} />
        </button>
      )}
      {d.regular && <Tag>Regular</Tag>}
    </motion.div>
  );
}
