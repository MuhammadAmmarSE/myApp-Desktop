// Money: earning and spending, a month (or a year) at a time. What's left, what came in and went
// out, the pace against last month, where it went by category, monthly bills still to note, and
// every entry in a table you can search, filter and sort. ← → change the month; click a category
// to see only it; Export CSV saves what's shown.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { ArrowDownLeft, ArrowUpRight, CalendarRange, ChevronLeft, ChevronRight, Copy, Download, Filter, Gauge, HandCoins, Pencil, PiggyBank, Plus, Receipt, Repeat, Search, Trash2, TrendingDown, TrendingUp, Wallet, X } from "lucide-react";
import { fundStanding, isoDate, monthJobs, monthTotals, ownMoney, potStanding, POT_503020, POT_STARTERS, type Rec } from "@myapp/core";
import { createPot, potVar, usePots } from "@/lib/pots";
import { JobsBar, PotMark, PotMeter, POT_ICON } from "@/components/forms/PotEditors";
import { useFunds } from "@/lib/funds";
import { Button, Card, CardTitle, Empty, IconButton, Input, Segmented, Stat, Tag, toast, useContextMenu } from "@/components/ui";
import { BarList, ColumnChart, Legend, LineChart } from "@/components/charts";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { billDay, byCategory, daysIn, monthlyBills, monthTitle, perDay, perMonth, projection, running, shiftMonth } from "@/lib/money";
import { exportMoneyCsv } from "@/lib/exporter";
import { usePageKeys } from "@/lib/keys";
import { useListNav } from "@/lib/listNav";
import { navigate, setQuery, useQuery } from "@/lib/router";
import { compact, dayWord, money, MONTHS_SHORT, ordinal } from "@/lib/format";
import { rise } from "@/theme/motion";

type Kind = "all" | "expense" | "income";
const SPENT = { key: "spent", name: "Spent", color: "var(--viz-1)" };
const EARNED = { key: "earned", name: "Earned", color: "var(--viz-2)" };

const notedOn = (w: string) => (/^(today|yesterday|tomorrow)$/i.test(w) ? `Noted ${w.toLowerCase()}` : `Noted on ${w}`);

export default function Money() {
  const q = useQuery();
  // your own money: what you spent out of someone else's is on their hisaab
  const everything = useList("money");
  const all = useMemo(() => ownMoney(everything), [everything]);
  const funds = useFunds();
  const [showSettled, setShowSettled] = useState(false);
  // opened to start a hisaab (Search: "Someone gave me money to spend")
  const addFund = q.get("add") === "fund";
  useEffect(() => {
    if (!addFund) return;
    setQuery({ add: null });
    edit("fund");
  }, [addFund]);
  // opened to make a pot (Search: "New pot")
  const addPot = q.get("add") === "pot";
  useEffect(() => {
    if (!addPot) return;
    setQuery({ add: null });
    edit("pot");
  }, [addPot]);
  const pots = usePots();
  const [showAway, setShowAway] = useState(false);
  const potName = (id?: string | null) => (id ? pots.byId.get(id)?.pot.data.name : undefined);
  const currency = useSettings((s) => s.currency);
  const view = useSettings((s) => s.moneyView);
  const set = useSettings((s) => s.set);
  const today = isoDate();
  const thisMonth = today.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(q.get("month") || "") ? q.get("month")! : thisMonth;
  const year = Number(month.slice(0, 4));
  // where the month's money went, by pot (only once there are pots)
  const jobs = useMemo(() => (pots.all.length ? monthJobs(everything, pots.all, month, currency) : null), [pots.all, everything, month, currency]);
  // the starter pots you haven't made yet
  const starters = POT_STARTERS.filter((x) => !pots.all.some((p) => p.data.name.toLowerCase() === x.name.toLowerCase()));
  const starter = (list: { name: string; type: (typeof POT_STARTERS)[number]["type"]; rule?: (typeof POT_STARTERS)[number]["rule"] }[]) => {
    const have = new Set(pots.all.map((p) => p.data.name.toLowerCase()));
    const made = list.filter((x) => !have.has(x.name.toLowerCase())).map((x) => createPot({ name: x.name, type: x.type, rule: x.rule || null }));
    if (made.length) toast.success(made.length === 1 ? `Made the pot ${made[0].data.name}` : `Made ${made.length} pots`);
  };
  const [kind, setKind] = useState<Kind>("all");
  const [cat, setCat] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sort, setSort] = useState<"date" | "amount">("date");
  const ctx = useContextMenu();

  const go = (m: string) => {
    setQuery({ month: m === thisMonth ? null : m });
    setCat(null);
  };
  const step = (n: number) => go(view === "year" ? `${year + n}-${month.slice(5)}` : shiftMonth(month, n));
  usePageKeys(
    (e) => {
      if (e.key === "ArrowLeft") return (step(-1), true);
      if (e.key === "ArrowRight") return (step(1), true);
      if (e.key.toLowerCase() === "t") return (go(thisMonth), true);
    },
    [month, view],
  );

  const inPeriod = (r: Rec<"money">) => (view === "year" ? Number(r.data.date.slice(0, 4)) === year : r.data.date.slice(0, 7) === month);
  const totals = useMemo(() => {
    if (view === "month") return monthTotals(all, month, currency);
    const ms = perMonth(all, year, currency);
    const spent = ms.reduce((n, m) => n + m.spent, 0);
    const earned = ms.reduce((n, m) => n + m.earned, 0);
    return { spent, earned, net: earned - spent, categories: [] as [string, number][] };
  }, [all, month, year, view, currency]);
  const prev = useMemo(
    () =>
      view === "month"
        ? monthTotals(all, shiftMonth(month, -1), currency)
        : (() => {
            const ms = perMonth(all, year - 1, currency);
            const spent = ms.reduce((n, m) => n + m.spent, 0);
            const earned = ms.reduce((n, m) => n + m.earned, 0);
            return { spent, earned, net: earned - spent, categories: [] };
          })(),
    [all, month, year, view, currency],
  );

  // the pace: this month so far against last month by the same day
  const isNow = view === "month" && month === thisMonth;
  const day = Number(today.slice(8, 10));
  const daily = useMemo(() => perDay(all, month, currency), [all, month, currency]);
  const lastDaily = useMemo(() => perDay(all, shiftMonth(month, -1), currency), [all, month, currency]);
  const runNow = running(daily);
  const runLast = running(lastDaily);
  const lastBySameDay = runLast[Math.min(day, runLast.length) - 1] || 0;
  const pace = isNow && lastBySameDay ? (runNow[day - 1] - lastBySameDay) / lastBySameDay : null;
  const heading = isNow ? projection(totals.spent, day, daysIn(month)) : null;

  const cats = useMemo(() => byCategory(all, inPeriod, currency), [all, month, year, view, currency]); // eslint-disable-line react-hooks/exhaustive-deps
  const bills = useMemo(() => (view === "month" ? monthlyBills(all, month) : []), [all, month, view]);
  const billsDue = bills.filter((b) => !b.noted);

  const rows = useMemo(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    return all
      .filter((r) => inPeriod(r) && (kind === "all" || r.data.type === kind) && (!cat || r.data.category === cat) && words.every((w) => `${r.data.note || ""} ${r.data.category} ${r.data.account || ""} ${r.data.amount}`.toLowerCase().includes(w)))
      .sort((a, b) => (sort === "amount" ? b.data.amount - a.data.amount : b.data.date.localeCompare(a.data.date) || b.created_at - a.created_at));
  }, [all, month, year, view, kind, cat, text, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownTotal = rows.reduce((n, r) => n + ((r.data.currency || currency) === currency ? (r.data.type === "income" ? r.data.amount : -r.data.amount) : 0), 0);
  const other = rows.some((r) => (r.data.currency || currency) !== currency);

  const nav = useListNav(rows, {
    selector: (id) => `[data-money="${id}"]`,
    onOpen: (r) => edit("money", r),
    onDelete: (l) => remove(l),
    onNew: () => edit("money", null, { date: isNow ? today : `${month}-01` }),
  });
  const remove = (l: Rec<"money">[]) => {
    const before = l.map((r) => useRecords.getState().byId[r.id]).filter(Boolean);
    for (const r of l) useRecords.getState().remove(r.id);
    nav.clear();
    toast(l.length === 1 ? "Entry deleted" : `Deleted ${l.length}`, { action: { label: "Undo", run: () => before.forEach((b) => useRecords.getState().restore(b)) } });
  };
  const duplicate = (r: Rec<"money">) => edit("money", null, { ...r.data, date: today });
  const noteBill = (b: (typeof bills)[number]) => {
    const d = b.latest.data;
    useRecords.getState().create("money", { ...d, date: billDay(b, month) });
    toast.success(`Noted ${d.note || d.category} for ${monthTitle(month)}`);
  };

  const chartData = useMemo(() => {
    if (view === "year")
      return perMonth(all, year, currency).map((m, i) => ({ key: m.month, label: MONTHS_SHORT[i], values: { spent: m.spent, earned: m.earned } }));
    return daily.map((v, i) => ({ key: `${month}-${String(i + 1).padStart(2, "0")}`, label: String(i + 1), values: { spent: v } }));
  }, [view, all, year, currency, daily, month]);

  const fmt = (n: number) => money(Math.round(n), currency);
  const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);
  const spentChange = change(totals.spent, prev.spent);

  return (
    <div className="h-full overflow-y-auto px-8 pb-24 pt-6" data-testid="money">
      <div className="mx-auto max-w-[1320px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-center gap-3">
          <div className="mr-auto flex items-center gap-3">
            <div>
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">Earning & spending · {currency}</div>
              <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]" data-testid="money-title">
                {view === "year" ? year : monthTitle(month)}
              </h1>
            </div>
            <div className="ml-2 flex">
              <IconButton icon={ChevronLeft} label={view === "year" ? "Previous year" : "Previous month"} kbd="←" onClick={() => step(-1)} />
              <IconButton icon={ChevronRight} label={view === "year" ? "Next year" : "Next month"} kbd="→" onClick={() => step(1)} />
            </div>
            {month !== thisMonth && (
              <Button size="sm" variant="ghost" onClick={() => go(thisMonth)} kbd="T">
                This month
              </Button>
            )}
          </div>
          <Segmented
            size="sm"
            value={view}
            onChange={(v) => set({ moneyView: v })}
            options={[
              { value: "month", label: "Month" },
              { value: "year", label: "Year", icon: CalendarRange },
            ]}
          />
          <Button icon={Download} onClick={() => exportMoneyCsv(rows, view === "year" ? String(year) : month)} disabled={!rows.length}>
            Export CSV
          </Button>
          <Button icon={ArrowDownLeft} onClick={() => edit("money", null, { type: "income", date: isNow ? today : `${month}-01` })}>
            Money in
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => edit("money", null, { type: "expense", date: isNow ? today : `${month}-01` })}>
            Expense
          </Button>
        </motion.header>

        {/* the period in four numbers */}
        <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <motion.div {...rise(1)}>
            <Card strong className="relative h-full overflow-hidden !p-4">
              <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full accent-grad opacity-20 blur-2xl" />
              <div className="relative flex items-center gap-2 text-[12px] font-medium text-text2">
                <PiggyBank size={14} /> {totals.net >= 0 ? "Left over" : "Over by"}
              </div>
              <div className={clsx("relative mt-2 font-display text-[28px] font-semibold leading-none tracking-[-0.02em] tnum", totals.net < 0 && "text-danger")} data-testid="net">
                {fmt(Math.abs(totals.net))}
              </div>
              <div className="relative mt-2 text-[12px] text-text3">{totals.earned ? `${Math.round((Math.max(0, totals.net) / totals.earned) * 100)}% of what came in` : "Nothing came in yet"}</div>
            </Card>
          </motion.div>
          <motion.div {...rise(2)}>
            <Stat
              label="Spent"
              icon={ArrowUpRight}
              tone="var(--viz-1)"
              value={totals.spent}
              format={fmt}
              sub={
                spentChange == null ? (
                  "Nothing to compare with"
                ) : (
                  <span className={spentChange > 0 ? "text-warn" : "text-success"}>
                    {spentChange > 0 ? "▲" : "▼"} {Math.abs(spentChange)}% on {view === "year" ? "last year" : "last month"}
                  </span>
                )
              }
            />
          </motion.div>
          <motion.div {...rise(3)}>
            <Stat label="Came in" icon={ArrowDownLeft} tone="var(--viz-2)" value={totals.earned} format={fmt} sub={prev.earned ? `${fmt(prev.earned)} ${view === "year" ? "last year" : "last month"}` : undefined} />
          </motion.div>
          <motion.div {...rise(4)}>
            {isNow ? (
              <Stat
                label="Pace"
                icon={Gauge}
                tone={pace != null && pace > 0.05 ? "var(--c-warn)" : "var(--c-success)"}
                value={heading || 0}
                format={(n) => `≈ ${fmt(n)}`}
                sub={
                  pace == null ? (
                    "Heading for, at this rate"
                  ) : (
                    <span className={pace > 0.05 ? "text-warn" : "text-success"}>
                      {pace > 0 ? "Ahead of" : "Behind"} last month by {Math.abs(Math.round(pace * 100))}%
                    </span>
                  )
                }
              />
            ) : (
              <Stat label="Entries" icon={Receipt} value={all.filter(inPeriod).length} sub={view === "year" ? `In ${year}` : `In ${monthTitle(month)}`} />
            )}
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
          <div className="flex min-w-0 flex-col gap-5">
            {/* the chart */}
            <motion.div {...rise(5)}>
              <Card>
                <CardTitle
                  title={view === "year" ? "Month by month" : isNow ? "This month against last" : "Day by day"}
                  icon={view === "year" ? CalendarRange : TrendingUp}
                  action={<Legend series={view === "year" ? [SPENT, EARNED] : isNow ? [{ ...SPENT, name: monthTitle(month) }, { ...EARNED, key: "last", name: monthTitle(shiftMonth(month, -1)) }] : []} />}
                />
                {totals.spent || totals.earned ? (
                  view === "month" && isNow ? (
                    <LineChart
                      label="Spending so far this month against last month"
                      points={Array.from({ length: Math.max(daily.length, lastDaily.length) }, (_, i) => ({ x: i + 1, values: { spent: i < day ? (runNow[i] ?? null) : null, last: runLast[i] ?? null } }))}
                      series={[{ ...SPENT, name: monthTitle(month) }, { ...EARNED, key: "last", name: monthTitle(shiftMonth(month, -1)) }]}
                      format={fmt}
                      xLabel={(x) => `${x} ${MONTHS_SHORT[Number(month.slice(5)) - 1]}`}
                      marker={day}
                      height={240}
                    />
                  ) : (
                    <ColumnChart
                      label={view === "year" ? "Spent and earned each month" : "Spent each day"}
                      data={chartData}
                      series={view === "year" ? [SPENT, EARNED] : [SPENT]}
                      format={fmt}
                      height={240}
                      highlight={view === "year" ? thisMonth : undefined}
                      onPick={view === "year" ? (k) => (set({ moneyView: "month" }), go(k)) : undefined}
                    />
                  )
                ) : (
                  <Empty compact icon={Wallet} title="Nothing noted yet" body="Add what you spend and what comes in; the chart fills in as you go." />
                )}
              </Card>
            </motion.div>

            {/* every entry */}
            <motion.div {...rise(6)}>
              <Card pad={false}>
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                  <div className="mr-auto flex items-center gap-2">
                    <Receipt size={16} className="text-accent-text" />
                    <span className="text-[14px] font-semibold">Entries</span>
                    <span className="text-[12px] text-text3 tnum">{rows.length}</span>
                    {cat && (
                      <Tag tone="accent" onRemove={() => setCat(null)}>
                        <Filter size={10} /> {cat}
                      </Tag>
                    )}
                  </div>
                  <div className="w-[200px]">
                    <Input icon={Search} size="sm" value={text} onChange={setText} placeholder="Search entries" aria-label="Search entries" />
                  </div>
                  <Segmented<Kind>
                    size="sm"
                    value={kind}
                    onChange={setKind}
                    options={[
                      { value: "all", label: "All" },
                      { value: "expense", label: "Spent" },
                      { value: "income", label: "In" },
                    ]}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setSort(sort === "date" ? "amount" : "date")}>
                    {sort === "date" ? "Newest" : "Biggest"} first
                  </Button>
                </div>
                {rows.length ? (
                  <div className="max-h-[560px] overflow-y-auto" data-testid="money-rows">
                    <table className="w-full text-[13px]">
                      <thead className="sticky top-0 z-10 bg-surface text-[11px] uppercase tracking-[0.06em] text-text3">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold">Day</th>
                          <th className="px-2 py-2 text-left font-semibold">What</th>
                          <th className="px-2 py-2 text-left font-semibold">Category</th>
                          <th className="px-2 py-2 text-left font-semibold">From</th>
                          <th className="px-4 py-2 text-right font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence initial={false}>
                          {rows.map((r) => {
                            const inc = r.data.type === "income";
                            return (
                              <motion.tr
                                key={r.id}
                                layout="position"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                data-money={r.id}
                                onClick={(e) => nav.click(r, e)}
                                onContextMenu={(e) =>
                                  ctx(e, [
                                    { label: "Edit", icon: Pencil, onSelect: () => edit("money", r) },
                                    { label: "Same again today", icon: Copy, onSelect: () => duplicate(r) },
                                    { label: r.data.recurring === "monthly" ? "Not every month" : "Every month", icon: Repeat, onSelect: () => useRecords.getState().update<"money">(r.id, { recurring: r.data.recurring === "monthly" ? null : "monthly" }) },
                                    { label: `Only ${r.data.category}`, icon: Filter, onSelect: () => setCat(r.data.category) },
                                    { type: "separator" },
                                    { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove([r]) },
                                  ])
                                }
                                className={clsx("border-t border-line/60 transition-colors", nav.selected.has(r.id) ? "bg-accent-soft/50" : nav.active === r.id ? "bg-hover" : "hover:bg-hover")}
                              >
                                <td className="whitespace-nowrap px-4 py-2 text-text2">{view === "year" ? `${Number(r.data.date.slice(8))} ${MONTHS_SHORT[Number(r.data.date.slice(5, 7)) - 1]}` : dayWord(r.data.date, today)}</td>
                                <td className="max-w-[260px] px-2 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate">{r.data.note || r.data.category}</span>
                                    {r.data.recurring === "monthly" && <Repeat size={12} className="shrink-0 text-text3" aria-label="Every month" />}
                                  </div>
                                  {!inc && potName(r.data.pot_id) ? (
                                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-text3" data-pot-of={r.data.pot_id}>
                                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: potVar(pots.byId.get(r.data.pot_id!)?.pot) }} /> from {potName(r.data.pot_id)}
                                    </span>
                                  ) : inc && r.data.split && r.data.split.length ? (
                                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-text3">
                                      {r.data.split.slice(0, 4).map((x) => (
                                        <span key={x.pot_id} className="h-1.5 w-1.5 rounded-full" style={{ background: potVar(pots.byId.get(x.pot_id)?.pot) }} />
                                      ))}{" "}
                                      {r.data.split.length === 1 ? `into ${potName(r.data.split[0].pot_id) || "a pot"}` : `into ${r.data.split.length} pots`}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-2 py-2">
                                  <Tag>{r.data.category}</Tag>
                                </td>
                                <td className="px-2 py-2 capitalize text-text3">{r.data.account || ""}</td>
                                <td className={clsx("whitespace-nowrap px-4 py-2 text-right font-medium tnum", inc ? "text-success" : "text-text")}>
                                  {inc ? "+" : "−"}
                                  {money(r.data.amount, r.data.currency || currency)}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty compact icon={Receipt} title={text || cat || kind !== "all" ? "Nothing matches" : "No entries"} body={text || cat || kind !== "all" ? "Change the search or the filters." : "Press N to add one."} />
                )}
                {rows.length > 0 && (
                  <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px]">
                    <span className="text-text3">{other ? "Other currencies are listed but not added in." : cat || text || kind !== "all" ? "Total of what's shown" : "Total"}</span>
                    <span className={clsx("font-semibold tnum", shownTotal < 0 ? "text-text" : "text-success")}>
                      {shownTotal < 0 ? "−" : "+"}
                      {fmt(Math.abs(shownTotal))}
                    </span>
                  </div>
                )}
              </Card>
            </motion.div>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            {/* pots: your own money given jobs */}
            <motion.div {...rise(6)}>
              <Card data-testid="pots">
                <CardTitle
                  title="Pots"
                  icon={PiggyBank}
                  sub={pots.rows.length ? `${pots.rows.length} in use` : "Give your money jobs"}
                  action={
                    pots.rows.length ? (
                      <Button size="xs" variant="ghost" icon={Plus} onClick={() => edit("pot")}>
                        New pot
                      </Button>
                    ) : undefined
                  }
                />
                {pots.rows.length ? (
                  <div className="-mx-2 flex flex-col">
                    {pots.rows.map((r) => (
                      <PotLine key={r.pot.id} row={r} currency={currency} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-[12.5px] leading-[1.5] text-text2">Split what you earn into pots, like Personal, Bills or a loan, and spend from them. Your totals stay the same; each pot keeps what&apos;s in it from month to month.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {POT_STARTERS.map((x) => (
                        <StarterChip key={x.name} name={x.name} type={x.type} onClick={() => starter([x])} />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" icon={Plus} onClick={() => edit("pot")} className="flex-1">
                        Make my own
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => starter(POT_503020)} className="flex-1" title="Needs 50%, Wants 30%, Savings 20% of each income">
                        50/30/20 split
                      </Button>
                    </div>
                  </div>
                )}
                {pots.rows.length > 0 && pots.rows.length < 6 && starters.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-text3">Add:</span>
                    {starters.map((x) => (
                      <StarterChip key={x.name} name={x.name} type={x.type} onClick={() => starter([x])} />
                    ))}
                  </div>
                )}
                {pots.away.length > 0 && (
                  <>
                    <Button size="xs" variant="ghost" className="mt-2" onClick={() => setShowAway(!showAway)}>
                      {showAway ? "Hide pots put away" : `Pots put away (${pots.away.length})`}
                    </Button>
                    {showAway && (
                      <div className="-mx-2 flex flex-col opacity-75">
                        {pots.away.map((r) => (
                          <PotLine key={r.pot.id} row={r} currency={currency} />
                        ))}
                      </div>
                    )}
                  </>
                )}
                {jobs && jobs.earned > 0 && (
                  <div className="mt-4 border-t border-line pt-3.5">
                    <div className="mb-2.5 text-[12.5px] font-semibold">Where {monthTitle(month)}&apos;s money went</div>
                    <JobsBar jobs={jobs} rows={pots.byId} currency={currency} />
                    {(jobs.notInPot > 0 || jobs.spentNoPot > 0) && (
                      <div className="mt-2 text-[11.5px] leading-[1.45] text-text3">
                        Of the money not in a pot, {money(jobs.spentNoPot, currency)} was spent from no pot: {money(jobs.freeLeft, currency)} left of it.
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </motion.div>

            {/* money someone gave you to spend: never your own, kept apart */}
            <motion.div {...rise(6)}>
              <Card data-testid="held-for-others">
                <CardTitle
                  title="Held for others"
                  icon={HandCoins}
                  sub={funds.open.length ? `${funds.open.length} open` : "Money someone gave you to spend"}
                  action={
                    funds.settled.length ? (
                      <Button size="xs" variant="ghost" onClick={() => setShowSettled(!showSettled)}>
                        {showSettled ? "Hide settled" : `Settled (${funds.settled.length})`}
                      </Button>
                    ) : undefined
                  }
                />
                <div className="-mx-2 flex flex-col">
                  {[...funds.open, ...(showSettled ? funds.settled : [])].map(({ fund: f, summary: s }) => (
                    <button key={f.id} type="button" onClick={() => navigate(`/funds/${f.id}`)} className="flex items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-hover" data-fund={f.id}>
                      <span
                        className={clsx(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-[9px]",
                          f.data.closed ? "bg-surface2 text-text3 hairline" : s.state === "over" ? "bg-[color-mix(in_srgb,var(--c-warn)_15%,transparent)] text-warn" : "bg-accent-soft text-accent-text",
                        )}
                      >
                        <HandCoins size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">
                          {f.data.purpose || "Money"} · from {f.data.from}
                        </span>
                        <span className="block truncate text-[11.5px] text-text3">{[fundStanding(f, s, currency), s.toBuy.length ? `${s.toBuy.length} to buy` : ""].filter(Boolean).join(" · ")}</span>
                      </span>
                      {!f.data.closed && <span className={clsx("text-[13px] font-medium tnum", s.state === "over" && "text-danger")}>{(s.state === "over" ? "−" : "") + money(Math.abs(s.left), f.data.currency || currency)}</span>}
                    </button>
                  ))}
                </div>
                <Button size="sm" variant="ghost" icon={Plus} className="mt-1" onClick={() => edit("fund")}>
                  Someone gave me money to spend
                </Button>
              </Card>
            </motion.div>

            {/* where it went */}
            <motion.div {...rise(6)}>
              <Card>
                <CardTitle title="Where it went" icon={TrendingDown} sub={cats.length ? "Click one to see only it" : undefined} action={cat ? <IconButton icon={X} label="Show every category" size="sm" onClick={() => setCat(null)} /> : undefined} />
                {cats.length ? (
                  <BarList items={cats.map((c) => ({ key: c.key, label: c.label, value: c.value, hint: `${c.count} ${c.count === 1 ? "entry" : "entries"}` }))} format={fmt} onPick={(k) => setCat(cat === k ? null : k)} selected={cat} max={9} />
                ) : (
                  <Empty compact icon={TrendingDown} title="No spending yet" />
                )}
              </Card>
            </motion.div>

            {/* monthly bills */}
            {view === "month" && (
              <motion.div {...rise(7)}>
                <Card>
                  <CardTitle title="Monthly bills" icon={Repeat} sub={bills.length ? (billsDue.length ? `${billsDue.length} to note for ${monthTitle(month)}` : "All noted this month") : undefined} />
                  {bills.length ? (
                    <div className="-mx-2 flex flex-col">
                      {bills.map((b) => (
                        <div key={b.key} className="group flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-hover">
                          <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-[9px]", b.noted ? "bg-[color-mix(in_srgb,var(--c-success)_15%,transparent)] text-success" : "bg-surface2 text-text3 hairline")}>
                            {b.latest.data.type === "income" ? <ArrowDownLeft size={15} /> : <Receipt size={15} />}
                          </span>
                          <button type="button" onClick={() => edit("money", b.noted || b.latest)} className="min-w-0 flex-1 text-left">
                            <div className="truncate text-[13px]">{b.latest.data.note || b.latest.data.category}</div>
                            <div className="text-[11.5px] text-text3">{b.noted ? notedOn(dayWord(b.noted.data.date, today)) : `Usually around the ${ordinal(Number(b.latest.data.date.slice(8)))}`}</div>
                          </button>
                          <span className="text-[13px] font-medium tnum">{money(b.amount, b.latest.data.currency || currency)}</span>
                          {!b.noted && (
                            <Button size="xs" onClick={() => noteBill(b)}>
                              Note it
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty compact icon={Repeat} title="No monthly bills" body="Mark an entry “every month” (right-click it) and it shows here each month, ready to note." />
                  )}
                </Card>
              </motion.div>
            )}

            {view === "year" && (
              <motion.div {...rise(7)}>
                <Card>
                  <CardTitle title="The year" icon={CalendarRange} />
                  <div className="grid grid-cols-2 gap-3 text-[12.5px]">
                    {(() => {
                      const ms = perMonth(all, year, currency).filter((m) => m.spent || m.earned);
                      const top = ms.slice().sort((a, b) => b.spent - a.spent)[0];
                      const avg = ms.length ? totals.spent / ms.length : 0;
                      return [
                        ["Average month", avg ? fmt(avg) : "—"],
                        ["Biggest month", top ? `${monthTitle(top.month)} · ${compact(top.spent)}` : "—"],
                        ["Months with entries", String(ms.length)],
                        ["Kept", totals.earned ? `${Math.round((Math.max(0, totals.net) / totals.earned) * 100)}%` : "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-[10px] bg-surface2 p-3 hairline">
                          <div className="text-text3">{k}</div>
                          <div className="mt-0.5 font-semibold">{v}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// one pot on the Money page: what's in it, how far along, where it stands
function PotLine({ row, currency }: { row: ReturnType<typeof usePots>["rows"][number]; currency: string }) {
  const { pot, summary: s } = row;
  const cur = pot.data.currency || currency;
  return (
    <button type="button" onClick={() => navigate(`/pots/${pot.id}`)} className="flex items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-hover" data-pot={pot.id} aria-label={`${pot.data.name}: ${potStanding(pot, s, currency)}`}>
      <PotMark pot={pot} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px]">{pot.data.name}</span>
          <span className={clsx("shrink-0 text-[13px] font-medium tnum", s.over && "text-danger")}>{(s.over ? "−" : "") + money(Math.abs(s.balance), cur)}</span>
        </span>
        <PotMeter row={row} className="my-1" />
        <span className="block truncate text-[11.5px] text-text3">{potStanding(pot, s, currency)}</span>
      </span>
    </button>
  );
}

function StarterChip({ name, type, onClick }: { name: string; type: keyof typeof POT_ICON; onClick: () => void }) {
  const Icon = POT_ICON[type];
  return (
    <button type="button" onClick={onClick} aria-label={`Make the pot ${name}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface2 px-3 text-[12.5px] text-text2 transition-colors hover:bg-hover hover:text-text">
      <Icon size={13} className="text-accent-text" /> {name}
    </button>
  );
}
