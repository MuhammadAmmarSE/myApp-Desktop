// Today: the whole day on one screen. A greeting and a one-line brief, a capture box, the four
// numbers that matter (to-dos, what's next, money, what's coming), the day's timeline, what to do
// and buy today, heads-ups, and what's coming in the next month.
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import {
  AlarmClock,
  ArrowRight,
  BellRing,
  Cake,
  CalendarDays,
  CalendarHeart,
  CarFront,
  CheckSquare,
  Clock,
  Copy,
  Globe,
  HandCoins,
  Languages,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { addDays, briefLine, dueWords, countdown, dayProgress, dayTimeline, dueBy, greeting, isOpenTodo, isoDate, moneyPace, monthTotals, nextUp, partOfDay, sortTodos, todoProgress, upcoming, WEEKDAYS_LONG, type TimelineItem } from "@myapp/core";
import { Button, Card, CardTitle, Empty, IconButton, Page, ProgressRing, CountUp, Pulse, Tag, toast } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import { ItemRow, TodoRow, toggleTodo } from "@/components/rows";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { edit } from "@/store/ui";
import { carHeadsUp } from "@/lib/car";
import { warrantyHeadsUp } from "@/lib/things";
import { workHeadsUp } from "@/lib/work";
import { useFunds } from "@/lib/funds";
import { isInbox } from "@/lib/inbox";
import { useNow } from "@/lib/clock";
import { navigate } from "@/lib/router";
import { bridge, modKey } from "@/lib/bridge";
import { compact, money, MONTHS_LONG, time12 } from "@/lib/format";
import { rise } from "@/theme/motion";

type Heads = { key: string; icon: LucideIcon; text: string; tone: "danger" | "warn" | "accent" | "success"; to: string };
const TONE: Record<Heads["tone"], string> = { danger: "var(--c-danger)", warn: "var(--c-warn)", accent: "var(--c-accent)", success: "var(--c-success)" };
const UP_ICON: Record<string, LucideIcon> = { date: Cake, event: CalendarDays, reminder: BellRing };

export default function Today() {
  const nowMs = useNow(30000);
  const now = new Date(nowMs);
  const today = isoDate(now);
  const todos = useList("todo");
  const items = useList("item");
  const money_ = useList("money");
  const dates = useList("date");
  const events = useList("event");
  const reminders = useList("reminder");
  const people = useList("person");
  const clips = useList("clip");
  const cars = useList("car");
  const carLogs = useList("car_log");
  const things = useList("thing");
  const domains = useList("domain");
  const servers = useList("server");
  const words = useList("word");
  const notes = useList("note");
  const currency = useSettings((s) => s.currency);
  const name = useSettings((s) => s.name) || useAuth((s) => s.user?.name) || "";
  const [text, setText] = useState("");

  const timeline = useMemo(() => dayTimeline({ event: events, reminder: reminders, todo: todos }, today), [events, reminders, todos, today]);
  const next = nextUp(timeline, nowMs);
  const progress = useMemo(() => todoProgress(todos, today), [todos, today]);
  const pace = useMemo(() => moneyPace(money_, today, currency), [money_, today, currency]);
  const totals = useMemo(() => monthTotals(money_, today.slice(0, 7), currency), [money_, today, currency]);
  const coming = useMemo(() => upcoming({ date: dates, event: events, reminder: reminders, person: people }, 30, today), [dates, events, reminders, people, today]);
  const dueToday = useMemo(() => todos.filter((t) => isOpenTodo(t) && (dueBy(t, today) || (!t.data.due && t.data.priority === "high"))).sort(sortTodos), [todos, today]);
  const doneToday = useMemo(() => todos.filter((t) => t.data.done && t.data.done_at && isoDate(new Date(t.data.done_at)) === today), [todos, today]);
  const buyToday = useMemo(() => items.filter((i) => !i.data.done && i.data.mode === "store" && i.data.today), [items]);
  const pinned = useMemo(() => clips.filter((c) => c.data.pinned).slice(0, 4), [clips]);
  // spending day by day this month, for the little line
  const spark = useMemo(() => {
    const days = Number(today.slice(8, 10));
    const per = new Array(days).fill(0);
    for (const m of money_) if (m.data.type === "expense" && m.data.date.slice(0, 7) === today.slice(0, 7) && (m.data.currency || currency) === currency) per[Number(m.data.date.slice(8, 10)) - 1] += m.data.amount;
    let run = 0;
    return per.map((v) => (run += v));
  }, [money_, today, currency]);

  const funds = useFunds();
  const heads = useMemo(() => {
    const out: Heads[] = [];
    const late = todos.filter((t) => !t.data.done && t.data.due && t.data.due < today).length;
    if (late) out.push({ key: "late", icon: AlarmClock, text: `${late} to-do${late === 1 ? "" : "s"} overdue`, tone: "danger", to: "/todos?view=late" });
    for (const h of carHeadsUp(cars, carLogs, today).slice(0, 2)) out.push({ key: `car-${h.what}-${h.car}`, icon: CarFront, text: `${h.car}: ${h.words}`, tone: h.days != null && h.days < 0 ? "danger" : "warn", to: "/car" });
    const w = warrantyHeadsUp(things, today);
    if (w) out.push({ key: "warranty", icon: ShieldCheck, text: `${w.name} warranty ${w.days === 0 ? "ends today" : `ends in ${w.days} days`}`, tone: "warn", to: "/things" });
    const renew = workHeadsUp(domains, servers, today);
    if (renew) out.push({ key: "renew", icon: Globe, text: renew, tone: /expired|was due/.test(renew) ? "danger" : "warn", to: "/work" });
    const toGo = dueWords(words, today).length;
    if (toGo >= 5) out.push({ key: "words", icon: Languages, text: `${toGo} words to go over`, tone: "accent", to: "/interests?tab=words" });
    const waiting = notes.filter(isInbox);
    if (waiting.length) out.push({ key: "inbox", icon: Sparkles, text: waiting.length === 1 ? "A note saved offline is waiting for the AI" : `${waiting.length} notes saved offline are waiting for the AI`, tone: "accent", to: "/notes" });
    const soon = coming.find((u) => u.kind === "date" && u.days <= 3);
    if (soon) out.push({ key: "date", icon: CalendarHeart, text: `${soon.title} ${soon.days === 0 ? "today" : soon.days === 1 ? "tomorrow" : `in ${soon.days} days`}`, tone: "accent", to: "/people" });
    // someone's money, everything bought: give back what's left, or settle what you spent over
    for (const f of funds.open.filter((r) => !r.summary.toBuy.length && r.summary.left !== 0 && r.summary.spends.length).slice(0, 2)) {
      const amount = money(Math.abs(f.summary.left), f.fund.data.currency || currency);
      out.push({ key: `fund-${f.fund.id}`, icon: HandCoins, text: f.summary.left > 0 ? `${amount} of ${f.fund.data.from}'s money left with you` : `You spent ${amount} over ${f.fund.data.from}'s money`, tone: "accent", to: `/funds/${f.fund.id}` });
    }
    if (pace.change != null && pace.now > 0 && Math.abs(pace.change) >= 0.15) {
      const pct = Math.round(Math.abs(pace.change) * 100);
      out.push({ key: "pace", icon: pace.change > 0 ? TrendingUp : TrendingDown, text: `Spending ${pace.change > 0 ? "up" : "down"} ${pct}% on last month so far`, tone: pace.change > 0 ? "warn" : "success", to: "/money" });
    }
    return out;
  }, [todos, cars, carLogs, things, domains, servers, words, notes, coming, pace, funds, currency, today]);

  const brief = briefLine({ next: next ? { title: next.item.title, when: countdown(next.inMs) } : null, open: progress.open, done: progress.done, heads: heads.length });
  const part = partOfDay(nowMs);
  const empty = !todos.length && !items.length && !dates.length && !money_.length && !events.length;

  const capture = () => {
    const t = text.trim();
    if (!t) return navigate("/capture");
    setText("");
    navigate(`/capture?text=${encodeURIComponent(t)}&go=1`);
  };

  const openTimeline = (i: TimelineItem) => {
    const s = useRecords.getState().byId[i.id];
    if (!s) return;
    edit(i.kind as any, s);
  };
  const doneTimeline = (i: TimelineItem) => {
    const r = useRecords.getState().byId[i.id];
    if (!r) return;
    if (i.kind === "todo") toggleTodo(r as any);
    else if (i.kind === "reminder") useRecords.getState().update<"reminder">(i.id, { done: !i.done, done_at: i.done ? null : Date.now() });
  };

  return (
    <Page width="wide">
      {/* greeting */}
      <motion.section {...rise(0)} className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">
            {WEEKDAYS_LONG[now.getDay()]}, {now.getDate()} {MONTHS_LONG[now.getMonth()]}
          </div>
          <h1 className="mt-1.5 font-display text-[34px] font-semibold leading-tight tracking-[-0.025em]" data-testid="greeting">
            {greeting(now.getHours())}
            {name ? `, ${name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-[14px] text-text2" data-testid="brief">
            {brief}
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em] tnum">{time12(`${now.getHours()}:${now.getMinutes()}`)}</div>
          <div className="mt-2 flex items-center justify-end gap-2 text-[12px] text-text3">
            <span>{Math.round(dayProgress(today, nowMs) * 100)}% of the day gone</span>
            <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-[var(--viz-grid)]">
              <span className="absolute inset-y-0 left-0 rounded-full accent-grad" style={{ width: `${dayProgress(today, nowMs) * 100}%` }} />
            </span>
          </div>
        </div>
      </motion.section>

      {/* capture */}
      <motion.div {...rise(1)}>
        <div className="group relative mb-6 overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--c-accent)_35%,var(--c-line))] glass-strong shadow-[0_16px_44px_-24px_var(--c-glow)] transition-shadow focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-accent)_22%,transparent),0_16px_44px_-20px_var(--c-glow)]">
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent opacity-20 blur-3xl" />
          <div className="relative flex items-center gap-3 px-4 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] accent-grad text-on-accent shadow-[0_6px_18px_-6px_var(--c-glow)]">
              <Sparkles size={19} />
            </span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && capture()}
              placeholder="Tell Redline anything — “milk and eggs on the way home, pay the bill by Friday”"
              aria-label="Capture"
              className="h-10 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-text3"
            />
            <Button variant="primary" iconRight={ArrowRight} onClick={capture}>
              Capture
            </Button>
          </div>
          <div className="relative flex items-center gap-4 border-t border-line px-4 py-2 text-[11.5px] text-text3">
            <span>AI files it as to-dos, lists, reminders, money or notes — you confirm first.</span>
            <span className="flex-1" />
            <button type="button" onClick={() => bridge.quick.open()} className="hover:text-text2">
              From any app: {modKey()} ⇧ Space
            </button>
          </div>
        </div>
      </motion.div>

      {empty ? (
        <Card>
          <Empty
            icon={Sparkles}
            title="A clear day"
            body="Add a to-do, a birthday or what you spent, or capture something in plain words above. What you add on your phone shows up here too."
            action={
              <div className="flex gap-2">
                <Button variant="primary" icon={Plus} onClick={() => edit("todo")}>
                  New to-do
                </Button>
                <Button icon={Cake} onClick={() => edit("date")}>
                  Add a date
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          {/* the four numbers */}
          <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <motion.div {...rise(2)}>
              <Card interactive className="flex h-full items-center gap-4 !p-4" onClick={() => navigate("/todos")}>
                <ProgressRing value={progress.progress} size={60} stroke={6}>
                  <span className="text-[13px] font-semibold tnum">{Math.round(progress.progress * 100)}%</span>
                </ProgressRing>
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-text2">To-dos today</div>
                  <div className="font-display text-[22px] font-semibold leading-tight tnum">
                    <CountUp value={progress.done} />
                    <span className="text-text3">/{progress.total}</span>
                  </div>
                  <div className="text-[12px] text-text3">{progress.open ? `${progress.open} left` : progress.done ? "All done" : "None due"}</div>
                </div>
              </Card>
            </motion.div>
            <motion.div {...rise(3)}>
              <Card interactive className="flex h-full flex-col justify-between gap-2 !p-4" onClick={() => next && openTimeline(next.item)}>
                <div className="flex items-center gap-2 text-[12px] font-medium text-text2">
                  {next ? <Pulse /> : <Clock size={14} />} Next up
                </div>
                {next ? (
                  <>
                    <div className="truncate text-[15px] font-semibold" data-testid="next-up">
                      {next.item.title}
                    </div>
                    <div className="text-[12px] text-text3">
                      {time12(`${new Date(next.item.at).getHours()}:${new Date(next.item.at).getMinutes()}`)} · <span className="font-medium text-accent-text">{countdown(next.inMs)}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-[13px] text-text3">Nothing else timed today.</div>
                )}
              </Card>
            </motion.div>
            <motion.div {...rise(4)}>
              <Card interactive className="flex h-full flex-col gap-1 !p-4" onClick={() => navigate("/money")}>
                <div className="flex items-center gap-2 text-[12px] font-medium text-text2">
                  <Wallet size={14} /> Spent in {MONTHS_LONG[now.getMonth()]}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="font-display text-[22px] font-semibold leading-tight">
                    <CountUp value={totals.spent} format={(n) => money(Math.round(n), currency)} />
                  </div>
                  <Sparkline values={spark} width={84} height={30} />
                </div>
                <div className={clsx("text-[12px]", pace.change == null ? "text-text3" : pace.change > 0.05 ? "text-warn" : "text-success")}>
                  {pace.change == null ? `${compact(totals.earned)} earned` : `${pace.change > 0 ? "▲" : "▼"} ${Math.abs(Math.round(pace.change * 100))}% vs last month so far`}
                </div>
              </Card>
            </motion.div>
            <motion.div {...rise(5)}>
              <Card interactive className="flex h-full flex-col gap-1 !p-4" onClick={() => navigate("/people")}>
                <div className="flex items-center gap-2 text-[12px] font-medium text-text2">
                  <CalendarHeart size={14} /> Coming up
                </div>
                <div className="font-display text-[22px] font-semibold leading-tight tnum">
                  <CountUp value={coming.filter((c) => c.days <= 7).length} />
                  <span className="ml-1 text-[13px] font-normal text-text3">this week</span>
                </div>
                <div className="truncate text-[12px] text-text3">{coming[0] ? `${coming[0].title} · ${coming[0].days === 0 ? "today" : coming[0].days === 1 ? "tomorrow" : `in ${coming[0].days} days`}` : "Nothing in the next month"}</div>
              </Card>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr_1fr]">
            <div className="flex min-w-0 flex-col gap-5">
              {/* the day */}
              <motion.div {...rise(6)}>
                <Card>
                  <CardTitle title="Your day" icon={Clock} sub={timeline.length ? `${timeline.length} timed thing${timeline.length === 1 ? "" : "s"}` : "Nothing timed"} action={<Button size="sm" variant="ghost" icon={CalendarDays} onClick={() => navigate("/calendar?view=day")}>Calendar</Button>} />
                  {timeline.length ? (
                    <ol className="relative ml-[52px] border-l border-line" data-testid="timeline">
                      {timeline.map((it, i) => {
                        const past = it.at < nowMs;
                        const isNext = next?.item.id === it.id;
                        const showNow = !past && (i === 0 || timeline[i - 1].at < nowMs);
                        const Icon = it.kind === "event" ? CalendarDays : it.kind === "reminder" ? BellRing : CheckSquare;
                        return (
                          <li key={it.id} className="relative">
                            {showNow && (
                              <div className="absolute -left-[56px] -top-[1px] z-10 flex w-[calc(100%+56px)] items-center gap-2">
                                <span className="w-[44px] text-right text-[10.5px] font-semibold text-accent-text">now</span>
                                <span className="h-px flex-1 bg-accent" />
                              </div>
                            )}
                            <div className={clsx("group flex items-center gap-3 py-2 pl-5", past && !isNext && "opacity-55")}>
                              <span className="absolute -left-[56px] w-[44px] text-right text-[11.5px] text-text3 tnum">{time12(`${new Date(it.at).getHours()}:${new Date(it.at).getMinutes()}`)}</span>
                              <span className={clsx("absolute -left-[5px] h-[9px] w-[9px] rounded-full ring-4 ring-[var(--c-surface)]", isNext ? "bg-accent" : past ? "bg-text3" : "bg-surface2 shadow-[inset_0_0_0_1.5px_var(--c-text3)]")} />
                              <button type="button" onClick={() => openTimeline(it)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2 py-1 text-left hover:bg-hover">
                                <Icon size={14} className={clsx("shrink-0", it.kind === "event" ? "text-info" : it.kind === "reminder" ? "text-warn" : "text-text3")} />
                                <span className={clsx("truncate text-[13.5px]", it.done && "text-text3 line-through")}>{it.title}</span>
                                {it.detail && <span className="truncate text-[12px] text-text3">· {it.detail}</span>}
                                {isNext && <Tag tone="accent">{countdown(next!.inMs)}</Tag>}
                              </button>
                              {it.kind !== "event" && (
                                <Button size="xs" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => doneTimeline(it)}>
                                  {it.done ? "Undo" : "Done"}
                                </Button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <Empty compact icon={Clock} title="Nothing timed today" body="Events, reminders and to-dos with a time show here in order." action={<Button size="sm" icon={Plus} onClick={() => edit("event", null, { date: today })}>Add an event</Button>} />
                  )}
                </Card>
              </motion.div>

              {/* to do today */}
              <motion.div {...rise(7)}>
                <Card>
                  <CardTitle
                    title="To do today"
                    icon={CheckSquare}
                    sub={dueToday.length ? `${dueToday.length} open${doneToday.length ? ` · ${doneToday.length} done today` : ""}` : doneToday.length ? `${doneToday.length} done today` : undefined}
                    action={
                      <IconButton icon={Plus} label="New to-do for today" kbd={`${modKey()} N`} size="sm" onClick={() => edit("todo", null, { due: today })} />
                    }
                  />
                  {dueToday.length ? (
                    <div className="-mx-2 flex flex-col">
                      {dueToday.slice(0, 8).map((t, i) => (
                        <TodoRow key={t.id} t={t} today={today} index={i} />
                      ))}
                      {dueToday.length > 8 && (
                        <button type="button" onClick={() => navigate("/todos")} className="mx-3 mt-1 self-start text-[12.5px] text-accent-text hover:underline">
                          {dueToday.length - 8} more in To-dos
                        </button>
                      )}
                    </div>
                  ) : (
                    <Empty compact icon={CheckSquare} title={doneToday.length ? "All done for today" : "Nothing due today"} body={doneToday.length ? `You ticked off ${doneToday.length}. Nice.` : "Add one, or enjoy the space."} />
                  )}
                </Card>
              </motion.div>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              {heads.length > 0 && (
                <motion.div {...rise(6)}>
                  <Card>
                    <CardTitle title="Heads-up" icon={AlarmClock} />
                    <div className="-mx-1 flex flex-col gap-1">
                      {heads.map((h) => (
                        <button key={h.key} type="button" onClick={() => navigate(h.to)} className="flex items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-hover">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]" style={{ background: `color-mix(in srgb, ${TONE[h.tone]} 15%, transparent)`, color: TONE[h.tone] }}>
                            <h.icon size={15} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px]">{h.text}</span>
                          <ArrowRight size={14} className="shrink-0 text-text3" />
                        </button>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              )}

              <motion.div {...rise(7)}>
                <Card>
                  <CardTitle title="Coming up" icon={CalendarHeart} sub="The next 30 days" action={<IconButton icon={Plus} label="Add a date" size="sm" onClick={() => edit("date")} />} />
                  {coming.length ? (
                    <div className="-mx-1 flex flex-col">
                      {coming.slice(0, 7).map((u) => {
                        const Icon = UP_ICON[u.kind];
                        return (
                          <button key={u.key} type="button" onClick={() => edit(u.kind as any, u.rec)} className="flex items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-hover">
                            <div className="flex w-10 shrink-0 flex-col items-center rounded-[9px] bg-surface2 py-1 hairline">
                              <span className="text-[9.5px] font-semibold uppercase text-accent-text">{MONTHS_LONG[Number(u.date.slice(5, 7)) - 1].slice(0, 3)}</span>
                              <span className="font-display text-[15px] font-semibold leading-none tnum">{Number(u.date.slice(8, 10))}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 truncate text-[13px]">
                                <Icon size={13} className="shrink-0 text-text3" />
                                {u.title}
                              </div>
                              <div className="truncate text-[11.5px] text-text3">{[u.days === 0 ? "Today" : u.days === 1 ? "Tomorrow" : `In ${u.days} days`, u.time ? time12(u.time) : "", u.detail].filter(Boolean).join(" · ")}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Empty compact icon={CalendarHeart} title="Nothing in the next month" body="Birthdays, anniversaries and events show here." />
                  )}
                </Card>
              </motion.div>

              <motion.div {...rise(8)}>
                <Card>
                  <CardTitle title="Buy today" icon={ShoppingCart} sub={buyToday.length ? `${buyToday.length} on the list` : undefined} action={<IconButton icon={Plus} label="Add to the list" size="sm" onClick={() => edit("item", null, { today: true, mode: "store" })} />} />
                  {buyToday.length ? (
                    <div className="-mx-2 flex flex-col">
                      {buyToday.slice(0, 6).map((i, n) => (
                        <ItemRow key={i.id} i={i} index={n} onToggle={() => useRecords.getState().update<"item">(i.id, { done: !i.data.done, done_at: i.data.done ? null : Date.now() })} />
                      ))}
                    </div>
                  ) : (
                    <Empty compact icon={ShoppingCart} title="Nothing to buy today" />
                  )}
                </Card>
              </motion.div>

              {pinned.length > 0 && (
                <motion.div {...rise(9)}>
                  <Card>
                    <CardTitle title="Pinned" icon={Copy} sub="Click to copy" />
                    <div className="grid grid-cols-2 gap-2">
                      {pinned.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            bridge.clipboard.write(c.data.text);
                            useRecords.getState().update<"clip">(c.id, (d) => ({ ...d, uses: (d.uses || 0) + 1 }));
                            toast.success("Copied");
                          }}
                          className="min-w-0 rounded-[10px] bg-surface2 px-3 py-2 text-left hairline transition-colors hover:bg-hover"
                        >
                          <div className="truncate text-[12.5px] font-medium">{c.data.title || c.data.text}</div>
                          <div className="truncate font-mono text-[11px] text-text3">{c.data.title ? c.data.text : "Saved text"}</div>
                        </button>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              )}
            </div>
          </div>
          <p className="mt-6 text-center text-[11.5px] text-text3">Good {part}. Tomorrow: {todos.filter((t) => !t.data.done && t.data.due === addDays(today, 1)).length} to-dos, {events.filter((e) => e.data.date === addDays(today, 1)).length} events.</p>
        </>
      )}
    </Page>
  );
}
