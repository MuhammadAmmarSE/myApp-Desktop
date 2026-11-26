// Calendar: everything with a day on it, in one place — events, reminders, to-dos with a date,
// birthdays and anniversaries, car papers and services, warranties that end. Month, week, day and
// a running agenda. Drag something to another day (or another time in week and day), double-click
// a day or a time to add an event there. T today, M W D A for the views, ← → to page.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { BellRing, Cake, CalendarDays, CalendarPlus, CarFront, CheckSquare, ChevronLeft, ChevronRight, Clock, Copy, Eye, EyeOff, MapPin, Pencil, Plus, ShieldCheck, Trash2, type LucideIcon } from "lucide-react";
import { addDays, dayWord, isoDate, parseDate, time12, type Rec } from "@myapp/core";
import { Button, Card, Checkbox, Empty, IconButton, Menu, MonthGrid, Popover, Segmented, Tag, toast, useContextMenu, type MenuItem } from "@/components/ui";
import { useRecords, useList } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { toggleTodo } from "@/components/rows";
import { addMonthsTo, byWhen, CAL_COLOR, CAL_WORD, calendarItems, groupByDay, minutesOf, monthMatrix, moveTo, retime, timeOf, weekOf, type CalItem, type CalKind } from "@/lib/calendar";
import { setQuery, useQuery } from "@/lib/router";
import { usePageKeys } from "@/lib/keys";
import { useNow } from "@/lib/clock";
import { bridge } from "@/lib/bridge";
import { MONTHS_LONG, MONTHS_SHORT, WEEKDAYS_LONG, WEEKDAYS_SHORT } from "@/lib/format";
import { ease } from "@/theme/motion";

type View = "month" | "week" | "day" | "agenda";
const VIEWS: View[] = ["month", "week", "day", "agenda"];
const ICON: Record<CalKind, LucideIcon> = { event: CalendarDays, reminder: BellRing, todo: CheckSquare, date: Cake, car: CarFront, thing: ShieldCheck };
const KINDS: CalKind[] = ["event", "reminder", "todo", "date", "car", "thing"];
const HOUR = 52; // px per hour in week and day
const SNAP = 15; // minutes

const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

function apply(m: { kind: string; id: string; change: Record<string, unknown> } | null) {
  if (!m) return;
  const s = useRecords.getState();
  const before = s.byId[m.id];
  s.update(m.id, m.change as never);
  if (before) toast("Moved", { action: { label: "Undo", run: () => useRecords.getState().restore(before) } });
}

function rangeFor(view: View, anchor: string, weekStart: 0 | 1): [string, string] {
  if (view === "month") {
    const days = monthMatrix(anchor.slice(0, 7), weekStart);
    return [days[0], days[41]];
  }
  if (view === "week") {
    const w = weekOf(anchor, weekStart);
    return [w[0], w[6]];
  }
  if (view === "day") return [anchor, anchor];
  return [anchor, addDays(anchor, 59)];
}

function titleFor(view: View, anchor: string, weekStart: 0 | 1) {
  const d = parseDate(anchor);
  if (view === "month") return { main: MONTHS_LONG[d.getMonth()], sub: String(d.getFullYear()) };
  if (view === "week") {
    const w = weekOf(anchor, weekStart);
    const a = parseDate(w[0]);
    const b = parseDate(w[6]);
    const same = a.getMonth() === b.getMonth();
    return { main: same ? `${a.getDate()} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}` : `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`, sub: String(b.getFullYear()) };
  }
  if (view === "day") return { main: `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`, sub: String(d.getFullYear()) };
  return { main: "Agenda", sub: `From ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` };
}

function itemMenu(i: CalItem, today: string): MenuItem[] {
  const out: MenuItem[] = [{ label: "Open", icon: Pencil, onSelect: () => edit(i.editKind as never, i.rec) }];
  if (i.kind === "todo") out.push({ label: i.done ? "Mark not done" : "Mark done", icon: CheckSquare, onSelect: () => toggleTodo(i.rec as Rec<"todo">) });
  if (i.kind === "reminder") out.push({ label: i.done ? "Not done" : "Done", icon: CheckSquare, onSelect: () => useRecords.getState().update<"reminder">(i.recId, { done: !i.done, done_at: i.done ? null : Date.now() }) });
  if (i.movable)
    out.push({
      type: "sub",
      label: "Move to",
      icon: CalendarDays,
      items: [
        { label: "Today", onSelect: () => apply(moveTo(i, today)) },
        { label: "Tomorrow", onSelect: () => apply(moveTo(i, addDays(today, 1))) },
        { label: "A day later", onSelect: () => apply(moveTo(i, addDays(i.date, 1))) },
        { label: "A week later", onSelect: () => apply(moveTo(i, addDays(i.date, 7))) },
      ],
    });
  out.push({ label: "Copy", icon: Copy, onSelect: () => (bridge.clipboard.write([i.title, `${dayWord(i.date, today)}${i.time ? ` ${time12(i.time)}` : ""}`, i.detail].filter(Boolean).join(" · ")), toast("Copied")) });
  if (i.kind === "event" || i.kind === "todo" || i.kind === "reminder") {
    out.push({ type: "separator" });
    out.push({
      label: "Delete",
      icon: Trash2,
      danger: true,
      onSelect: () => {
        const rec = useRecords.getState().byId[i.recId];
        useRecords.getState().remove(i.recId);
        if (rec) toast.undo("Deleted", () => useRecords.getState().restore(rec));
      },
    });
  }
  return out;
}

export default function Calendar() {
  const q = useQuery();
  const nowMs = useNow(60000);
  const today = isoDate(new Date(nowMs));
  const weekStart = useSettings((s) => s.weekStart);
  const view: View = VIEWS.includes(q.get("view") as View) ? (q.get("view") as View) : "month";
  const anchor = isDate(q.get("date")) ? q.get("date")! : today;
  const [selected, setSelected] = useState<string>(anchor);
  const [hidden, setHidden] = useState<CalKind[]>([]);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => setSelected(anchor), [anchor]);

  const lists = {
    event: useList("event"),
    reminder: useList("reminder"),
    todo: useList("todo"),
    date: useList("date"),
    person: useList("person"),
    car: useList("car"),
    car_log: useList("car_log"),
    thing: useList("thing"),
  };
  const [from, to] = rangeFor(view, anchor, weekStart);
  // the side panel's month shows marks for its own six weeks
  const miniMonth = selected.slice(0, 7);
  const [mFrom, mTo] = rangeFor("month", `${miniMonth}-01`, weekStart);
  const lo = from < mFrom ? from : mFrom;
  const hi = to > mTo ? to : mTo;
  const all = useMemo(() => calendarItems(lists, lo, hi, { showDone }), [lists.event, lists.reminder, lists.todo, lists.date, lists.person, lists.car, lists.car_log, lists.thing, lo, hi, showDone]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => all.filter((i) => !hidden.includes(i.kind)), [all, hidden]);
  const byDay = useMemo(() => groupByDay(items), [items]);
  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [d, list] of byDay) m[d] = list.length;
    return m;
  }, [byDay]);

  const go = (patch: { view?: View; date?: string }) => setQuery({ view: patch.view ?? view, date: patch.date ?? anchor });
  const step = (n: number) => {
    if (view === "month") go({ date: `${addMonthsTo(anchor.slice(0, 7), n)}-01` });
    else if (view === "week") go({ date: addDays(anchor, 7 * n) });
    else if (view === "day") go({ date: addDays(anchor, n) });
    else go({ date: addDays(anchor, 30 * n) });
  };
  const newEvent = (date: string, time?: string | null) => edit("event", null, { date, time: time ?? null });

  usePageKeys(
    (e) => {
      const k = e.key.toLowerCase();
      if (k === "t") return go({ date: today }), true;
      if (k === "m") return go({ view: "month" }), true;
      if (k === "w") return go({ view: "week" }), true;
      if (k === "d") return go({ view: "day", date: selected }), true;
      if (k === "a") return go({ view: "agenda" }), true;
      if (e.key === "ArrowLeft") return step(-1), true;
      if (e.key === "ArrowRight") return step(1), true;
      if (k === "n") return newEvent(selected), true;
    },
    [view, anchor, selected, today],
  );

  const title = titleFor(view, anchor, weekStart);
  const dayItems = byDay.get(selected) || [];

  return (
    <div className="flex h-full flex-col px-8 pb-6 pt-6" data-testid="calendar" data-view={view}>
      {/* header */}
      <motion.header initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: ease.out }} className="mb-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto flex min-w-0 items-baseline gap-2">
          <h1 className="truncate font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]" data-testid="cal-title">
            {title.main}
          </h1>
          <span className="font-display text-[20px] font-medium text-text3">{title.sub}</span>
        </div>
        <Button onClick={() => go({ date: today })} kbd="T">
          Today
        </Button>
        <div className="flex">
          <IconButton icon={ChevronLeft} label="Previous" kbd="←" onClick={() => step(-1)} />
          <IconButton icon={ChevronRight} label="Next" kbd="→" onClick={() => step(1)} />
        </div>
        <Segmented<View>
          value={view}
          onChange={(v) => go({ view: v, date: v === "day" || v === "week" ? selected : anchor })}
          options={[
            { value: "month", label: "Month" },
            { value: "week", label: "Week" },
            { value: "day", label: "Day" },
            { value: "agenda", label: "Agenda" },
          ]}
        />
        <Menu
          trigger={(open) => (
            <Button variant="primary" icon={Plus} onClick={open}>
              New
            </Button>
          )}
          items={[
            { label: "Event", icon: CalendarDays, kbd: "N", onSelect: () => newEvent(selected) },
            { label: "To-do on this day", icon: CheckSquare, onSelect: () => edit("todo", null, { due: selected }) },
            { label: "Reminder", icon: BellRing, onSelect: () => edit("reminder", null, { at: parseDate(selected).setHours(9, 0, 0, 0) }) },
            { label: "Birthday or anniversary", icon: Cake, onSelect: () => edit("date", null, { month: Number(selected.slice(5, 7)), day: Number(selected.slice(8, 10)) }) },
          ]}
        />
      </motion.header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_296px]">
        <Card pad={false} className="relative min-h-0 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${view}-${view === "month" ? anchor.slice(0, 7) : from}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: ease.out }} className="h-full">
              {view === "month" ? (
                <MonthView month={anchor.slice(0, 7)} weekStart={weekStart} today={today} byDay={byDay} selected={selected} onSelect={setSelected} onNew={newEvent} />
              ) : view === "agenda" ? (
                <AgendaView from={from} to={to} byDay={byDay} today={today} onSelect={setSelected} />
              ) : (
                <TimeView days={view === "week" ? weekOf(anchor, weekStart) : [anchor]} byDay={byDay} today={today} nowMs={nowMs} selected={selected} onSelect={setSelected} onNew={newEvent} />
              )}
            </motion.div>
          </AnimatePresence>
        </Card>

        {/* side: a small month, the chosen day, and what to show */}
        <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto lg:flex">
          <Card className="!p-3">
            <MonthGrid
              value={selected}
              weekStart={weekStart}
              month={miniMonth}
              marks={marks}
              onMonth={(m) => setSelected(`${m}-01`)}
              onPick={(d) => {
                setSelected(d);
                if (view !== "month" || d.slice(0, 7) !== anchor.slice(0, 7)) go({ date: d });
              }}
            />
          </Card>
          <Card className="!p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">{dayWord(selected, today)}</div>
                <div className="font-display text-[16px] font-semibold">
                  {WEEKDAYS_LONG[parseDate(selected).getDay()]}, {Number(selected.slice(8))} {MONTHS_LONG[Number(selected.slice(5, 7)) - 1]}
                </div>
              </div>
              <IconButton icon={CalendarPlus} label="Add an event on this day" size="sm" onClick={() => newEvent(selected)} />
            </div>
            {dayItems.length ? (
              <div className="-mx-2 flex flex-col">
                {dayItems.map((i) => (
                  <AgendaRow key={i.id} i={i} today={today} />
                ))}
              </div>
            ) : (
              <Empty compact icon={CalendarDays} title="Nothing on this day" body="Double-click a day in the calendar to add an event." />
            )}
          </Card>
          <Card className="!p-4">
            <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text3">Show</div>
            <div className="flex flex-col gap-0.5">
              {KINDS.map((k) => {
                const Icon = ICON[k];
                const on = !hidden.includes(k);
                const n = all.filter((i) => i.kind === k && i.date >= from && i.date <= to).length;
                return (
                  <button key={k} type="button" onClick={() => setHidden((h) => (on ? [...h, k] : h.filter((x) => x !== k)))} aria-pressed={on} className={clsx("flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-[13px] hover:bg-hover", !on && "text-text3")}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? CAL_COLOR[k] : "transparent", boxShadow: `inset 0 0 0 1.5px ${CAL_COLOR[k]}` }} />
                    <Icon size={14} className="text-text3" />
                    <span className="flex-1">{k === "thing" ? "Warranties" : k === "car" ? "Car" : `${CAL_WORD[k]}s`}</span>
                    <span className="text-[11.5px] text-text3 tnum">{n || ""}</span>
                  </button>
                );
              })}
              <button type="button" onClick={() => setShowDone((v) => !v)} className="mt-1 flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-text2 hover:bg-hover">
                {showDone ? <Eye size={14} /> : <EyeOff size={14} />} {showDone ? "Showing done to-dos" : "Done to-dos hidden"}
              </button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ---------------- month ----------------
function MonthView({ month, weekStart, today, byDay, selected, onSelect, onNew }: { month: string; weekStart: 0 | 1; today: string; byDay: Map<string, CalItem[]>; selected: string; onSelect: (d: string) => void; onNew: (d: string) => void }) {
  const days = monthMatrix(month, weekStart);
  const names = weekStart === 1 ? [...WEEKDAYS_SHORT.slice(1), WEEKDAYS_SHORT[0]] : WEEKDAYS_SHORT;
  const [over, setOver] = useState<string | null>(null);
  const [more, setMore] = useState<{ day: string; el: HTMLElement } | null>(null);
  const ctx = useContextMenu();
  const find = (id: string) => [...byDay.values()].flat().find((i) => i.id === id);
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b border-line">
        {names.map((n) => (
          <div key={n} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text3">
            {n}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((d, idx) => {
          const list = byDay.get(d) || [];
          const out = d.slice(0, 7) !== month;
          const isToday = d === today;
          const sel = d === selected;
          const weekend = [0, 6].includes(parseDate(d).getDay());
          const shown = list.slice(0, 3);
          return (
            <div
              key={d}
              data-day={d}
              onClick={() => onSelect(d)}
              onDoubleClick={() => onNew(d)}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("text/redline-cal")) {
                  e.preventDefault();
                  setOver(d);
                }
              }}
              onDragLeave={() => setOver((o) => (o === d ? null : o))}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/redline-cal");
                setOver(null);
                const it = id ? find(id) : null;
                if (it && it.date !== d) apply(moveTo(it, d));
              }}
              className={clsx(
                "group relative flex min-h-0 flex-col gap-0.5 overflow-hidden border-line p-1.5 transition-colors",
                idx % 7 !== 6 && "border-r",
                idx < 35 && "border-b",
                weekend && !out && "bg-[color-mix(in_srgb,var(--c-text)_1.5%,transparent)]",
                sel ? "bg-accent-soft/40" : "hover:bg-hover",
                over === d && "!bg-accent-soft shadow-[inset_0_0_0_2px_var(--c-accent)]",
              )}
            >
              <div className="flex items-center justify-between px-0.5">
                <span className={clsx("grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12px] tnum", isToday ? "accent-grad font-semibold text-on-accent" : out ? "text-text3/60" : sel ? "font-semibold text-accent-text" : "text-text2")}>
                  {Number(d.slice(8)) === 1 ? `${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]} 1` : Number(d.slice(8))}
                </span>
                <button type="button" aria-label={`Add an event on ${d}`} onClick={(e) => (e.stopPropagation(), onNew(d))} className="grid h-5 w-5 place-items-center rounded text-text3 opacity-0 hover:bg-hover hover:text-text group-hover:opacity-100">
                  <Plus size={12} />
                </button>
              </div>
              {shown.map((i) => (
                <Chip key={i.id} i={i} faded={out} onContext={(e) => ctx(e, itemMenu(i, today))} />
              ))}
              {list.length > 3 && (
                <button type="button" onClick={(e) => (e.stopPropagation(), setMore({ day: d, el: e.currentTarget }))} className="mt-auto self-start rounded px-1 text-[11px] font-medium text-text2 hover:bg-hover hover:text-text">
                  {list.length - 3} more
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Popover open={!!more} onClose={() => setMore(null)} anchor={more?.el || null} width={280} className="!p-3">
        {more && (
          <>
            <div className="mb-1 px-1 font-display text-[14px] font-semibold">{dayWord(more.day, today)}</div>
            <div className="-mx-1 flex flex-col">
              {(byDay.get(more.day) || []).map((i) => (
                <AgendaRow key={i.id} i={i} today={today} />
              ))}
            </div>
          </>
        )}
      </Popover>
    </div>
  );
}

function Chip({ i, faded, onContext }: { i: CalItem; faded?: boolean; onContext: (e: React.MouseEvent) => void }) {
  const Icon = ICON[i.kind];
  return (
    <div
      draggable={i.movable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/redline-cal", i.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        edit(i.editKind as never, i.rec);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={onContext}
      title={[i.time ? time12(i.time) : "", i.title, i.detail].filter(Boolean).join(" · ")}
      data-item={i.kind}
      className={clsx("flex min-w-0 items-center gap-1.5 rounded-[6px] px-1.5 py-[2px] text-[11.5px] leading-tight transition-colors hover:brightness-110", faded && "opacity-60", i.done && "line-through opacity-60", i.movable ? "cursor-grab active:cursor-grabbing" : "")}
      style={{ background: `color-mix(in srgb, ${CAL_COLOR[i.kind]} 16%, transparent)`, color: "var(--c-text)" }}
    >
      {i.time ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CAL_COLOR[i.kind] }} /> : <Icon size={11} className="shrink-0" style={{ color: CAL_COLOR[i.kind] }} />}
      {i.time && <span className="shrink-0 text-text3 tnum">{time12(i.time).replace(/\s?(am|pm)/i, (m) => m.trim()[0].toLowerCase())}</span>}
      <span className="truncate">{i.title}</span>
    </div>
  );
}

// ---------------- agenda ----------------
function AgendaRow({ i, today }: { i: CalItem; today: string }) {
  const Icon = ICON[i.kind];
  const ctx = useContextMenu();
  const tickable = i.kind === "todo" || i.kind === "reminder";
  return (
    <div onContextMenu={(e) => ctx(e, itemMenu(i, today))} className="group flex items-start gap-2.5 rounded-[9px] px-2 py-1.5 hover:bg-hover">
      {tickable ? (
        <Checkbox
          checked={!!i.done}
          round
          size={16}
          className="mt-0.5"
          label={i.done ? "Not done" : "Done"}
          onChange={() => (i.kind === "todo" ? toggleTodo(i.rec as Rec<"todo">) : useRecords.getState().update<"reminder">(i.recId, { done: !i.done, done_at: i.done ? null : Date.now() }))}
        />
      ) : (
        <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center" style={{ color: CAL_COLOR[i.kind] }}>
          <Icon size={14} />
        </span>
      )}
      <button type="button" onClick={() => edit(i.editKind as never, i.rec)} className="min-w-0 flex-1 text-left">
        <div className={clsx("truncate text-[13px]", i.done && "text-text3 line-through")}>{i.title}</div>
        <div className="truncate text-[11.5px] text-text3">{[i.time ? time12(i.time) : "All day", i.detail, CAL_WORD[i.kind]].filter(Boolean).join(" · ")}</div>
      </button>
    </div>
  );
}

function AgendaView({ from, to, byDay, today, onSelect }: { from: string; to: string; byDay: Map<string, CalItem[]>; today: string; onSelect: (d: string) => void }) {
  const days = [...byDay.keys()].filter((d) => d >= from && d <= to).sort();
  if (!days.length) return <Empty icon={CalendarDays} title="Nothing coming up" body="The next 60 days are clear. Add an event with N." className="h-full" />;
  return (
    <div className="h-full overflow-y-auto px-5 py-4" data-testid="agenda">
      {days.map((d, n) => {
        const dt = parseDate(d);
        return (
          <motion.section key={d} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(n, 10) * 0.025 }} className="flex gap-5 border-b border-line py-3 last:border-0">
            <button type="button" onClick={() => onSelect(d)} className="w-16 shrink-0 text-left">
              <div className={clsx("text-[11px] font-semibold uppercase tracking-[0.08em]", d === today ? "text-accent-text" : "text-text3")}>{WEEKDAYS_SHORT[dt.getDay()]}</div>
              <div className={clsx("font-display text-[24px] font-semibold leading-none tnum", d === today && "text-accent-text")}>{dt.getDate()}</div>
              <div className="text-[11px] text-text3">{MONTHS_SHORT[dt.getMonth()]}</div>
            </button>
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[11.5px] text-text3">{dayWord(d, today)}</div>
              {(byDay.get(d) || []).sort(byWhen).map((i) => (
                <AgendaRow key={i.id} i={i} today={today} />
              ))}
            </div>
          </motion.section>
        );
      })}
    </div>
  );
}

// ---------------- week and day: a timeline you can drag on ----------------
type Placed = { i: CalItem; start: number; end: number; lane: number; lanes: number };

function lay(list: CalItem[]): Placed[] {
  const timed = list
    .filter((i) => i.time)
    .map((i) => {
      const start = minutesOf(i.time!);
      const len = i.kind === "event" ? 60 : 30;
      return { i, start, end: Math.min(24 * 60, start + len), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  // overlapping ones share the width, each in its own lane
  let cluster: Placed[] = [];
  let ends: number[] = [];
  let clusterEnd = -1;
  const close = () => {
    for (const p of cluster) p.lanes = ends.length;
    cluster = [];
    ends = [];
  };
  for (const p of timed) {
    if (p.start >= clusterEnd) close();
    let lane = ends.findIndex((e) => e <= p.start);
    if (lane === -1) {
      lane = ends.length;
      ends.push(p.end);
    } else ends[lane] = p.end;
    p.lane = lane;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.end);
  }
  close();
  return timed;
}

function TimeView({ days, byDay, today, nowMs, selected, onSelect, onNew }: { days: string[]; byDay: Map<string, CalItem[]>; today: string; nowMs: number; selected: string; onSelect: (d: string) => void; onNew: (d: string, t?: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const ctx = useContextMenu();
  const [drag, setDrag] = useState<{ p: Placed; day: number; min: number; dx: number; dy: number; moved: boolean } | null>(null);
  const now = new Date(nowMs);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const placed = useMemo(() => days.map((d) => lay(byDay.get(d) || [])), [days, byDay]);

  // open at the start of the working day, or just above now
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = Math.min(...placed.flat().map((p) => p.start), days.includes(today) ? nowMin - 90 : 7 * 60);
    el.scrollTop = Math.max(0, (Math.min(first, 7 * 60) / 60) * HOUR - 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  const at = (clientX: number, clientY: number) => {
    const r = grid.current!.getBoundingClientRect();
    const day = Math.max(0, Math.min(days.length - 1, Math.floor(((clientX - r.left) / r.width) * days.length)));
    const min = Math.max(0, Math.min(24 * 60 - SNAP, Math.round((((clientY - r.top) / HOUR) * 60) / SNAP) * SNAP));
    return { day, min };
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const { day, min } = at(e.clientX, e.clientY - drag.dy);
      setDrag((d) => (d ? { ...d, day, min, moved: d.moved || Math.abs(min - d.p.start) >= SNAP || day !== days.indexOf(d.p.i.date) } : d));
    };
    const up = () => {
      setDrag((d) => {
        if (!d) return null;
        if (!d.moved) edit(d.p.i.editKind as never, d.p.i.rec);
        else apply(retime(d.p.i, days[d.day], timeOf(d.min)));
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.p.i.id]);

  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;
  return (
    <div className="flex h-full flex-col" data-testid="timegrid">
      {/* day heads and the whole-day row */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const dt = parseDate(d);
          const allDay = (byDay.get(d) || []).filter((i) => !i.time);
          return (
            <div key={d} className={clsx("min-w-0 border-l border-line px-2 py-2", d === selected && "bg-accent-soft/30")} onClick={() => onSelect(d)}>
              <div className="flex items-baseline gap-1.5">
                <span className={clsx("text-[11px] font-semibold uppercase tracking-[0.08em]", d === today ? "text-accent-text" : "text-text3")}>{WEEKDAYS_SHORT[dt.getDay()]}</span>
                <span className={clsx("grid h-7 min-w-7 place-items-center rounded-full px-1 font-display text-[16px] font-semibold tnum", d === today && "accent-grad text-on-accent")}>{dt.getDate()}</span>
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                {allDay.slice(0, 3).map((i) => (
                  <Chip key={i.id} i={i} onContext={(e) => ctx(e, itemMenu(i, today))} />
                ))}
                {allDay.length > 3 && <span className="px-1 text-[11px] text-text3">{allDay.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR }}>
          {/* hours */}
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] text-text3 tnum" style={{ top: h * HOUR }}>
                {h === 0 ? "" : time12(`${h}:00`).replace(":00", "")}
              </div>
            ))}
          </div>
          <div ref={grid} className="relative col-span-full col-start-2 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d, di) => (
              <div
                key={d}
                className={clsx("relative border-l border-line", d === today && "bg-[color-mix(in_srgb,var(--c-accent)_3%,transparent)]")}
                onDoubleClick={(e) => {
                  const { min } = at(e.clientX, e.clientY);
                  onNew(d, timeOf(Math.floor(min / 30) * 30));
                }}
                data-col={d}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: h * HOUR }}>
                    <div className="absolute inset-x-0 border-t border-dashed border-line/40" style={{ top: HOUR / 2 }} />
                  </div>
                ))}
                {d === today && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (nowMin / 60) * HOUR }}>
                    <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-danger shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-danger)_25%,transparent)]" />
                    <span className="h-[2px] flex-1 bg-danger" />
                  </div>
                )}
                {placed[di].map((p) => {
                  const dragging = drag?.p.i.id === p.i.id && drag.moved;
                  const Icon = ICON[p.i.kind];
                  return (
                    <div
                      key={p.i.id}
                      data-block={p.i.kind}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        if (!p.i.movable) return edit(p.i.editKind as never, p.i.rec);
                        setDrag({ p, day: di, min: p.start, dx: 0, dy: e.clientY - r.top, moved: false });
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onContextMenu={(e) => ctx(e, itemMenu(p.i, today))}
                      className={clsx("absolute z-10 overflow-hidden rounded-[8px] px-2 py-1 text-[11.5px] leading-tight shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-opacity", p.i.movable ? "cursor-grab" : "cursor-pointer", dragging && "opacity-35", p.i.done && "opacity-55")}
                      style={{
                        top: (p.start / 60) * HOUR + 1,
                        height: Math.max(22, ((p.end - p.start) / 60) * HOUR - 2),
                        left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / p.lanes}% - 4px)`,
                        background: `color-mix(in srgb, ${CAL_COLOR[p.i.kind]} 22%, var(--c-surface))`,
                        borderLeft: `3px solid ${CAL_COLOR[p.i.kind]}`,
                      }}
                      title={[time12(p.i.time!), p.i.title, p.i.detail].filter(Boolean).join(" · ")}
                    >
                      <div className={clsx("flex items-center gap-1 font-medium", p.i.done && "line-through")}>
                        <Icon size={11} className="shrink-0" style={{ color: CAL_COLOR[p.i.kind] }} />
                        <span className="truncate">{p.i.title}</span>
                      </div>
                      {p.end - p.start >= 45 && (
                        <div className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-text2">
                          <Clock size={10} /> {time12(p.i.time!)}
                          {p.i.detail && (
                            <>
                              <MapPin size={10} className="ml-1" /> <span className="truncate">{p.i.detail}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* where it will land */}
                {drag?.moved && drag.day === di && (
                  <div className="pointer-events-none absolute inset-x-1 z-30 rounded-[8px] border-2 border-dashed px-2 py-1 text-[11px] font-medium" style={{ top: (drag.min / 60) * HOUR + 1, height: Math.max(22, ((drag.p.end - drag.p.start) / 60) * HOUR - 2), borderColor: CAL_COLOR[drag.p.i.kind], background: `color-mix(in srgb, ${CAL_COLOR[drag.p.i.kind]} 14%, transparent)` }}>
                    {time12(timeOf(drag.min))} · {drag.p.i.title}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {!placed.flat().length && !days.some((d) => (byDay.get(d) || []).length) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <Tag>Double-click a time to add an event</Tag>
        </div>
      )}
    </div>
  );
}
