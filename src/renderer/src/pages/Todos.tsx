// To-dos: smart lists on the left (Today, Upcoming, Anytime, Late, High priority, Done, tags),
// the list or a board in the middle. The line at the top reads plain words — "call mum tomorrow
// 6pm #family !" — and shows what it understood before you press Enter. Choose several rows
// (Ctrl/⌘ or Shift click) to tick, move or delete them together; drag between board columns to
// change the day.
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { AlarmClock, AlertCircle, ArrowUpDown, CalendarClock, CalendarDays, CheckCheck, CheckSquare, Columns3, Hash, Inbox, LayoutList, ListTodo, Plus, Repeat, Sun, Trash2, type LucideIcon } from "lucide-react";
import { addDays, dayWord, isoDate, sortTodos, time12, type Rec } from "@myapp/core";
import { Button, Card, confirmDialog, Empty, IconButton, Kbd, Menu, Segmented, Tag, toast, useContextMenu } from "@/components/ui";
import { BulkBar } from "@/components/BulkBar";
import { TodoRow, todoMenu, toggleTodo } from "@/components/rows";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { parseQuick } from "@/lib/quickTodo";
import { useListNav } from "@/lib/listNav";
import { setQuery, useQuery } from "@/lib/router";
import { useNow } from "@/lib/clock";
import { modKey } from "@/lib/bridge";
import { rise } from "@/theme/motion";

type ViewId = "today" | "upcoming" | "anytime" | "late" | "high" | "all" | "done";
type Sort = "smart" | "due" | "created" | "title";
const VIEWS: { id: ViewId; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "today", label: "Today", icon: Sun, hint: "Due today, and anything late" },
  { id: "upcoming", label: "Upcoming", icon: CalendarDays, hint: "Everything with a day after today" },
  { id: "anytime", label: "Anytime", icon: Inbox, hint: "No day set" },
  { id: "late", label: "Late", icon: AlarmClock, hint: "Past their day and not done" },
  { id: "high", label: "High priority", icon: AlertCircle, hint: "Marked high" },
  { id: "all", label: "All open", icon: ListTodo, hint: "Everything not done yet" },
  { id: "done", label: "Done", icon: CheckCheck, hint: "Ticked off" },
];

type Group = { key: string; title: string; tone?: "danger" | "accent"; due: string | null | "keep"; items: Rec<"todo">[] };

function groupsFor(list: Rec<"todo">[], view: ViewId, today: string): Group[] {
  if (view === "done") {
    const g: Record<string, Rec<"todo">[]> = {};
    for (const t of list) {
      const d = t.data.done_at ? isoDate(new Date(t.data.done_at)) : "earlier";
      (g[d] ||= []).push(t);
    }
    return Object.keys(g)
      .sort((a, b) => (a === "earlier" ? 1 : b === "earlier" ? -1 : b.localeCompare(a)))
      .map((d) => ({ key: d, title: d === "earlier" ? "Earlier" : dayWord(d, today), due: "keep", items: g[d] }));
  }
  if (view === "upcoming") {
    const g = new Map<string, Rec<"todo">[]>();
    for (const t of list) g.set(t.data.due!, [...(g.get(t.data.due!) || []), t]);
    return [...g.keys()].sort().map((d) => ({ key: d, title: dayWord(d, today), due: d, items: g.get(d)! }));
  }
  const tomorrow = addDays(today, 1);
  const week = addDays(today, 7);
  const buckets: Group[] = [
    { key: "late", title: "Late", tone: "danger", due: today, items: [] },
    { key: "today", title: "Today", tone: "accent", due: today, items: [] },
    { key: "tomorrow", title: "Tomorrow", due: tomorrow, items: [] },
    { key: "week", title: "This week", due: addDays(today, 2), items: [] },
    { key: "later", title: "Later", due: week, items: [] },
    { key: "none", title: "No day", due: null, items: [] },
  ];
  for (const t of list) {
    const d = t.data.due;
    const b = !d ? 5 : d < today ? 0 : d === today ? 1 : d === tomorrow ? 2 : d < week ? 3 : 4;
    buckets[b].items.push(t);
  }
  return buckets.filter((b) => b.items.length);
}

const SORTERS: Record<Sort, (a: Rec<"todo">, b: Rec<"todo">) => number> = {
  smart: sortTodos,
  due: (a, b) => (a.data.due || "9999").localeCompare(b.data.due || "9999") || (a.data.time || "99").localeCompare(b.data.time || "99"),
  created: (a, b) => b.created_at - a.created_at,
  title: (a, b) => a.data.title.localeCompare(b.data.title),
};

function snapshot(list: Rec<"todo">[]) {
  const s = useRecords.getState();
  return list.map((t) => s.byId[t.id]).filter(Boolean);
}
const undoAll = (before: Rec[]) => () => before.forEach((r) => useRecords.getState().restore(r));

export default function Todos() {
  const q = useQuery();
  const nowMs = useNow(60000);
  const today = isoDate(new Date(nowMs));
  const all = useList("todo");
  const layout = useSettings((s) => s.todoView);
  const set = useSettings((s) => s.set);
  const view: ViewId = (VIEWS.find((v) => v.id === q.get("view"))?.id as ViewId) || "today";
  const tag = q.get("tag");
  const [sort, setSort] = useState<Sort>("smart");
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const ctx = useContextMenu();

  const counts = useMemo(() => {
    const open = all.filter((t) => !t.data.done);
    return {
      today: open.filter((t) => t.data.due && t.data.due <= today).length,
      upcoming: open.filter((t) => t.data.due && t.data.due > today).length,
      anytime: open.filter((t) => !t.data.due).length,
      late: open.filter((t) => t.data.due && t.data.due < today).length,
      high: open.filter((t) => t.data.priority === "high").length,
      all: open.length,
      done: all.length - open.length,
    } as Record<ViewId, number>;
  }, [all, today]);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of all) if (!t.data.done) for (const g of t.data.tags || []) m.set(g, (m.get(g) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [all]);

  const list = useMemo(() => {
    let l = all.filter((t) => {
      const d = t.data;
      if (tag && !(d.tags || []).includes(tag)) return false;
      switch (view) {
        case "today":
          return !d.done && !!d.due && d.due <= today;
        case "upcoming":
          return !d.done && !!d.due && d.due > today;
        case "anytime":
          return !d.done && !d.due;
        case "late":
          return !d.done && !!d.due && d.due < today;
        case "high":
          return !d.done && d.priority === "high";
        case "done":
          return d.done;
        default:
          return !d.done;
      }
    });
    l = view === "done" ? l.sort((a, b) => (b.data.done_at || 0) - (a.data.done_at || 0)) : l.sort(SORTERS[sort]);
    return l;
  }, [all, view, tag, today, sort]);

  const groups = useMemo(() => groupsFor(list, view, today), [list, view, today]);
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const nav = useListNav(ordered, {
    selector: (id) => `[data-todo="${id}"]`,
    onOpen: (t) => edit("todo", t),
    onToggle: (l) => tickAll(l),
    onDelete: (l) => remove(l),
    onNew: () => input.current?.focus(),
  });

  const tickAll = (l: Rec<"todo">[]) => {
    if (l.length === 1) return toggleTodo(l[0]);
    const before = snapshot(l);
    const allDone = l.every((t) => t.data.done);
    for (const t of l) useRecords.getState().update<"todo">(t.id, { done: !allDone, done_at: allDone ? null : Date.now() });
    nav.clear();
    toast(`${allDone ? "Opened" : "Ticked"} ${l.length}`, { action: { label: "Undo", run: undoAll(before) } });
  };
  const remove = (l: Rec<"todo">[]) => {
    const before = snapshot(l);
    for (const t of l) useRecords.getState().remove(t.id);
    nav.clear();
    toast(l.length === 1 ? "To-do deleted" : `Deleted ${l.length}`, { action: { label: "Undo", run: undoAll(before) } });
  };
  const moveAll = (l: Rec<"todo">[], due: string | null) => {
    const before = snapshot(l);
    for (const t of l) useRecords.getState().update<"todo">(t.id, { due });
    toast(`Moved ${l.length} to ${due ? dayWord(due, today).toLowerCase() : "no day"}`, { action: { label: "Undo", run: undoAll(before) } });
  };
  const prioritise = (l: Rec<"todo">[]) => {
    const before = snapshot(l);
    const high = !l.every((t) => t.data.priority === "high");
    for (const t of l) useRecords.getState().update<"todo">(t.id, { priority: high ? "high" : "normal" });
    toast(high ? "Marked high priority" : "Back to normal priority", { action: { label: "Undo", run: undoAll(before) } });
  };

  const parsed = text.trim() ? parseQuick(text, today) : null;
  const add = (full = false) => {
    if (!parsed || !parsed.title) return;
    const due = parsed.due ?? (view === "today" ? today : view === "upcoming" ? addDays(today, 1) : null);
    const data = { title: parsed.title, due, time: parsed.time, priority: view === "high" ? "high" : parsed.priority, tags: [...new Set([...(parsed.tags || []), ...(tag ? [tag] : [])])], repeat: parsed.repeat, done: false, notes: "" } as const;
    if (full) {
      edit("todo", null, data);
      setText("");
      return;
    }
    const rec = useRecords.getState().create("todo", { ...data, tags: [...data.tags] });
    setText("");
    nav.setActive(rec.id);
    toast.success(`Added${due ? ` for ${dayWord(due, today).toLowerCase()}` : ""}`);
  };

  const clearDone = async () => {
    const done = all.filter((t) => t.data.done);
    if (!done.length) return;
    if (!(await confirmDialog({ title: `Delete ${done.length} done to-do${done.length === 1 ? "" : "s"}?`, body: "They are removed here and on your phone. You can undo straight after.", confirm: "Delete", danger: true }))) return;
    remove(done);
  };

  const v = VIEWS.find((x) => x.id === view)!;
  const sel = nav.selected.size ? ordered.filter((t) => nav.selected.has(t.id)) : [];
  const rowMenu = (t: Rec<"todo">) => (e: React.MouseEvent) => {
    if (nav.selected.size > 1 && nav.selected.has(t.id)) {
      ctx(e, [
        { label: `Tick ${sel.length}`, icon: CheckSquare, onSelect: () => tickAll(sel) },
        { label: "Move to today", icon: Sun, onSelect: () => moveAll(sel, today) },
        { label: "Move to tomorrow", icon: CalendarDays, onSelect: () => moveAll(sel, addDays(today, 1)) },
        { label: "No day", icon: Inbox, onSelect: () => moveAll(sel, null) },
        { label: "High priority", icon: AlertCircle, onSelect: () => prioritise(sel) },
        { type: "separator" },
        { label: `Delete ${sel.length}`, icon: Trash2, danger: true, onSelect: () => remove(sel) },
      ]);
    } else ctx(e, todoMenu(t));
  };

  return (
    <div className="flex h-full" data-testid="todos">
      {/* smart lists and tags */}
      <aside className="hidden w-[232px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line px-3 py-6 lg:flex">
        <div className="mb-2 px-2 font-display text-[20px] font-semibold tracking-[-0.02em]">To-dos</div>
        {VIEWS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setQuery({ view: x.id === "today" ? null : x.id, tag: null })}
            aria-current={view === x.id && !tag ? "page" : undefined}
            className={clsx("group flex items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-left text-[13.5px] transition-colors", view === x.id && !tag ? "bg-accent-soft font-medium text-accent-text" : "text-text2 hover:bg-hover hover:text-text")}
            data-view={x.id}
          >
            <x.icon size={16} className={clsx(x.id === "late" && counts.late ? "text-danger" : "")} />
            <span className="flex-1">{x.label}</span>
            <span className={clsx("text-[11.5px] tnum", x.id === "late" && counts.late ? "font-semibold text-danger" : "text-text3")}>{counts[x.id] || ""}</span>
          </button>
        ))}
        {tags.length > 0 && (
          <>
            <div className="mb-1 mt-4 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text3">Tags</div>
            {tags.map(([g, n]) => (
              <button key={g} type="button" onClick={() => setQuery({ view: "all", tag: g })} className={clsx("flex items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-left text-[13.5px]", tag === g ? "bg-accent-soft font-medium text-accent-text" : "text-text2 hover:bg-hover hover:text-text")}>
                <Hash size={15} />
                <span className="flex-1 truncate">{g}</span>
                <span className="text-[11.5px] text-text3 tnum">{n}</span>
              </button>
            ))}
          </>
        )}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto px-8 pb-24 pt-6">
        <div className="mx-auto max-w-[1100px]">
          <motion.header {...rise(0)} className="mb-4 flex flex-wrap items-end gap-3">
            <div className="mr-auto min-w-0">
              <h1 className="flex items-center gap-2 font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]" data-testid="todos-title">
                {tag ? (
                  <>
                    <Hash size={22} className="text-accent-text" /> {tag}
                  </>
                ) : (
                  v.label
                )}
              </h1>
              <p className="text-[13.5px] text-text2">{tag ? `Open to-dos tagged #${tag}` : v.hint} · {list.length}</p>
            </div>
            <Segmented
              size="sm"
              value={layout}
              onChange={(x) => set({ todoView: x })}
              options={[
                { value: "list", label: "List", icon: LayoutList },
                { value: "board", label: "Board", icon: Columns3 },
              ]}
            />
            {view !== "done" && (
              <Menu
                trigger={(open) => (
                  <Button size="sm" variant="ghost" icon={ArrowUpDown} onClick={open}>
                    {{ smart: "Smart order", due: "By day", created: "Newest", title: "A to Z" }[sort]}
                  </Button>
                )}
                items={[
                  { label: "Smart order", hint: "Late and high first", checked: sort === "smart", onSelect: () => setSort("smart") },
                  { label: "By day", checked: sort === "due", onSelect: () => setSort("due") },
                  { label: "Newest first", checked: sort === "created", onSelect: () => setSort("created") },
                  { label: "A to Z", checked: sort === "title", onSelect: () => setSort("title") },
                ]}
              />
            )}
            {view === "done" && counts.done > 0 && (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={clearDone}>
                Delete all done
              </Button>
            )}
          </motion.header>

          {/* the quick-add line */}
          {view !== "done" && (
            <motion.div {...rise(1)} className="mb-5">
              <div className="group flex items-center gap-2 rounded-[13px] px-3 glass hairline transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--c-accent),0_0_0_3px_color-mix(in_srgb,var(--c-accent)_20%,transparent)]">
                <Plus size={17} className="shrink-0 text-text3 group-focus-within:text-accent-text" />
                <input
                  ref={input}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add(e.ctrlKey || e.metaKey);
                    } else if (e.key === "Escape") {
                      setText("");
                      input.current?.blur();
                    }
                  }}
                  placeholder='Add a to-do — try "call mum tomorrow 6pm #family !"'
                  aria-label="Add a to-do"
                  data-testid="quick-add"
                  className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-text3"
                />
                {!text && <Kbd>N</Kbd>}
              </div>
              <AnimatePresence>
                {parsed && parsed.title && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="flex flex-wrap items-center gap-1.5 px-2 pt-2 text-[12px] text-text2" data-testid="quick-preview">
                      <span className="font-medium text-text">{parsed.title}</span>
                      {(parsed.due || view === "today" || view === "upcoming") && (
                        <Tag tone="accent">
                          <CalendarClock size={11} /> {dayWord(parsed.due ?? (view === "today" ? today : addDays(today, 1)), today)}
                          {parsed.time ? ` · ${time12(parsed.time)}` : ""}
                        </Tag>
                      )}
                      {parsed.priority === "high" && <Tag tone="danger">High</Tag>}
                      {parsed.repeat && (
                        <Tag>
                          <Repeat size={11} /> {parsed.repeat}
                        </Tag>
                      )}
                      {parsed.tags.map((g) => (
                        <Tag key={g}>#{g}</Tag>
                      ))}
                      <span className="ml-auto text-text3">
                        <Kbd>↵</Kbd> add · <Kbd>{modKey()} ↵</Kbd> more options
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {!list.length ? (
            <Card>
              <Empty
                icon={view === "done" ? CheckCheck : view === "late" ? AlarmClock : CheckSquare}
                title={view === "today" ? "Nothing due today" : view === "late" ? "Nothing late" : view === "done" ? "Nothing done yet" : tag ? `Nothing tagged #${tag}` : "Nothing here"}
                body={view === "done" ? "Ticked to-dos collect here." : "Type one in the line above and press Enter."}
              />
            </Card>
          ) : layout === "board" && view !== "done" ? (
            <Board groups={groups} today={today} nav={nav} rowMenu={rowMenu} />
          ) : (
            <div className="flex flex-col gap-4" data-testid="todo-list">
              {groups.map((g, gi) => (
                <motion.section key={g.key} {...rise(gi + 2)}>
                  <div className="mb-1 flex items-center gap-2 px-3">
                    <span className={clsx("text-[12px] font-semibold uppercase tracking-[0.08em]", g.tone === "danger" ? "text-danger" : g.tone === "accent" ? "text-accent-text" : "text-text3")}>{g.title}</span>
                    <span className="text-[11.5px] text-text3 tnum">{g.items.length}</span>
                    {g.key === "late" && (
                      <button type="button" onClick={() => moveAll(g.items, today)} className="ml-auto text-[12px] text-accent-text hover:underline">
                        Move all to today
                      </button>
                    )}
                  </div>
                  <Card pad={false} className="p-1.5">
                    <AnimatePresence initial={false}>
                      {g.items.map((t, i) => (
                        <TodoRow
                          key={t.id}
                          t={t}
                          today={today}
                          index={i}
                          showDate={view !== "upcoming" && g.key !== "today"}
                          active={nav.active === t.id}
                          selected={nav.selected.has(t.id)}
                          onClick={(e) => nav.click(t, e)}
                          onMenu={rowMenu(t)}
                        />
                      ))}
                    </AnimatePresence>
                  </Card>
                </motion.section>
              ))}
            </div>
          )}
        </div>
      </div>

      <BulkBar count={sel.length} onClear={nav.clear}>
        <Button size="sm" variant="ghost" icon={CheckSquare} onClick={() => tickAll(sel)}>
          Tick
        </Button>
        <Menu
          placement="top-start"
          trigger={(open) => (
            <Button size="sm" variant="ghost" icon={CalendarDays} onClick={open}>
              Move to
            </Button>
          )}
          items={[
            { label: "Today", onSelect: () => moveAll(sel, today) },
            { label: "Tomorrow", onSelect: () => moveAll(sel, addDays(today, 1)) },
            { label: "Next week", onSelect: () => moveAll(sel, addDays(today, 7)) },
            { label: "No day", onSelect: () => moveAll(sel, null) },
          ]}
        />
        <Button size="sm" variant="ghost" icon={AlertCircle} onClick={() => prioritise(sel)}>
          Priority
        </Button>
        <Button size="sm" variant="ghost" icon={Trash2} className="text-danger" onClick={() => remove(sel)}>
          Delete
        </Button>
      </BulkBar>
    </div>
  );
}

// ---------------- board: a column per when, drag between them ----------------
function Board({ groups, today, nav, rowMenu }: { groups: Group[]; today: string; nav: ReturnType<typeof useListNav<Rec<"todo">>>; rowMenu: (t: Rec<"todo">) => (e: React.MouseEvent) => void }) {
  const [over, setOver] = useState<string | null>(null);
  // every column is there to drop on, even when empty
  const columns: Group[] = ["late", "today", "tomorrow", "week", "later", "none"].map((k) => {
    const g = groups.find((x) => x.key === k);
    const base: Record<string, Omit<Group, "items">> = {
      late: { key: "late", title: "Late", tone: "danger", due: today },
      today: { key: "today", title: "Today", tone: "accent", due: today },
      tomorrow: { key: "tomorrow", title: "Tomorrow", due: addDays(today, 1) },
      week: { key: "week", title: "This week", due: addDays(today, 2) },
      later: { key: "later", title: "Later", due: addDays(today, 7) },
      none: { key: "none", title: "No day", due: null },
    };
    return g || { ...base[k], items: [] };
  });
  const visible = columns.filter((c) => c.key !== "late" || c.items.length);
  const drop = (col: Group, id: string) => {
    const t = useRecords.getState().byId[id] as Rec<"todo"> | undefined;
    if (!t || col.due === "keep") return;
    const due = col.due;
    // dropping in "This week" or "Later" keeps a day already in that stretch
    if (col.key === "week" && t.data.due && t.data.due > addDays(today, 1) && t.data.due < addDays(today, 7)) return;
    if (col.key === "later" && t.data.due && t.data.due >= addDays(today, 7)) return;
    if (t.data.due === due) return;
    const before = useRecords.getState().byId[id];
    useRecords.getState().update<"todo">(id, { due });
    toast(`Moved to ${col.title.toLowerCase()}`, { action: { label: "Undo", run: () => before && useRecords.getState().restore(before) } });
  };
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(200px, 1fr))` }} data-testid="todo-board">
      {visible.map((c, ci) => (
        <motion.div
          key={c.key}
          {...rise(ci + 2)}
          data-column={c.key}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("text/redline-todo")) {
              e.preventDefault();
              setOver(c.key);
            }
          }}
          onDragLeave={() => setOver((o) => (o === c.key ? null : o))}
          onDrop={(e) => {
            setOver(null);
            drop(c, e.dataTransfer.getData("text/redline-todo"));
          }}
          className={clsx("flex min-h-[220px] flex-col rounded-[14px] p-2 glass hairline transition-shadow", over === c.key && "shadow-[inset_0_0_0_2px_var(--c-accent)]")}
        >
          <div className="mb-1 flex items-center gap-2 px-2 py-1">
            <span className={clsx("text-[12px] font-semibold uppercase tracking-[0.08em]", c.tone === "danger" ? "text-danger" : c.tone === "accent" ? "text-accent-text" : "text-text3")}>{c.title}</span>
            <span className="text-[11.5px] text-text3 tnum">{c.items.length || ""}</span>
            {c.key !== "late" && (
              <IconButton icon={Plus} label={`Add to ${c.title.toLowerCase()}`} size="xs" className="ml-auto" onClick={() => edit("todo", null, { due: c.due === "keep" ? null : c.due })} />
            )}
          </div>
          <div className="flex flex-col">
            <AnimatePresence initial={false}>
              {c.items.map((t, i) => (
                <TodoRow key={t.id} t={t} today={today} index={i} compact draggable showDate={c.key !== "today"} active={nav.active === t.id} selected={nav.selected.has(t.id)} onClick={(e) => nav.click(t, e)} onMenu={rowMenu(t)} />
              ))}
            </AnimatePresence>
            {!c.items.length && <div className="mx-2 my-3 rounded-[10px] border border-dashed border-line py-6 text-center text-[12px] text-text3">Drop here</div>}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
