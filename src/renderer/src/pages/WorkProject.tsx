// One project: its timer (start it when you start; stopping it opens "Log time" with the minutes),
// what the work is worth and what's been paid, the hours of the last eight weeks, its links and
// domains, and its whole log of time and payments.
import { useMemo } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { ArrowLeft, Banknote, Briefcase, CheckCircle2, Clock, Code2, ExternalLink, Globe, Pencil, Play, RefreshCw, Square, Trash2, Wallet } from "lucide-react";
import { isoDate, minutesInWords, projectOwed, projectStats, daysWord, renewal, type Rec } from "@myapp/core";
import { Button, Card, CardTitle, Empty, IconButton, Stat, Tag, toast, useContextMenu } from "@/components/ui";
import { ColumnChart, Legend } from "@/components/charts";
import { statusWord } from "@/components/forms/WorkEditors";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { elapsed, minutesShort, removeProject, removeWorkLog, startTimer, stopTimer, weeklyHours } from "@/lib/work";
import { usePageKeys } from "@/lib/keys";
import { navigate } from "@/lib/router";
import { bridge } from "@/lib/bridge";
import { useNow } from "@/lib/clock";
import { useWindowActive } from "@/lib/activity";
import { money, shortDate } from "@/lib/format";
import { rise } from "@/theme/motion";

const HOUR_SERIES = [
  { key: "billable", name: "Billable", color: "var(--viz-1)" },
  { key: "other", name: "Not billable", color: "var(--viz-2)" },
];

const link = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

// the running time: ticks each second while the window is in front, each minute behind it
function Elapsed({ from }: { from: number }) {
  const active = useWindowActive();
  const t = useNow(active ? 1000 : 60000);
  return <span className="font-mono tnum">{elapsed(from, Math.max(t, Date.now() - 999))}</span>;
}

export default function WorkProject({ params }: { params: Record<string, string> }) {
  const project = useRecords((s) => s.byId[params.id] as Rec<"project"> | undefined);
  const clients = useList("client");
  const allLogs = useList("work_log");
  const domains = useList("domain");
  const currency = useSettings((s) => s.currency);
  const today = isoDate();
  const ctx = useContextMenu();
  const logs = useMemo(() => allLogs.filter((l) => l.data.project_id === params.id).sort((a, b) => b.data.date.localeCompare(a.data.date) || b.created_at - a.created_at), [allLogs, params.id]);
  const weeks = useMemo(() => weeklyHours(logs, today), [logs, today]);

  usePageKeys(
    (e) => {
      if (!project || project.deleted) return;
      const k = e.key.toLowerCase();
      if (k === "t") return (edit("work_log", null, { type: "time", project_id: project.id }), true);
      if (k === "p") return (edit("work_log", null, { type: "payment", project_id: project.id }), true);
      if (k === "e") return (edit("project", project), true);
      if (k === "s") return (timer(project), true);
      if (e.key === "Escape") return (navigate("/work"), true);
    },
    [project],
  );

  if (!project || project.deleted) {
    return (
      <div className="grid h-full place-items-center px-8" data-testid="work-project">
        <Empty icon={Briefcase} title="This project isn't here" body="It may have been removed." action={<Button onClick={() => navigate("/work")}>Back to Work</Button>} />
      </div>
    );
  }
  const p = project.data;
  const s = projectStats(logs, project.id, today);
  const owed = projectOwed(p, logs, project.id);
  const client = p.client_id ? clients.find((c) => c.id === p.client_id) : undefined;
  const running = typeof p.timer_from === "number" ? p.timer_from : null;
  const dueIn = p.due && p.status !== "done" ? renewal(p.due, today, 7) : null;
  const mine = domains.filter((d) => d.data.project_id === project.id && !d.data.gone);

  function timer(r: Rec<"project">) {
    if (typeof r.data.timer_from === "number") edit("work_log", null, { type: "time", project_id: r.id, minutes: stopTimer(r) });
    else startTimer(r);
  }
  const setStatus = (status: string) => {
    const was = p.status;
    useRecords.getState().update<"project">(project.id, { status, ...(status === "done" ? { timer_from: null } : {}) });
    toast(status === "done" ? `${p.name} is done` : `${p.name} is ${statusWord(status).toLowerCase()}`, { action: { label: "Undo", run: () => useRecords.getState().update<"project">(project.id, { status: was }) } });
  };
  const remove = () => {
    const undo = removeProject(project);
    navigate("/work");
    toast.undo(`${p.name} removed with its log`, undo);
  };
  const logMenu = (l: Rec<"work_log">) => [
    { label: "Edit", icon: Pencil, onSelect: () => edit("work_log", l) },
    { type: "separator" as const },
    { label: "Remove", icon: Trash2, danger: true, onSelect: () => toast.undo(l.data.type === "payment" ? `Payment removed${l.data.money_id ? " (and from Money)" : ""}` : `${minutesInWords(l.data.minutes || 0)} removed`, removeWorkLog(l)) },
  ];

  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-6" data-testid="work-project">
      <div className="mx-auto max-w-[1180px]">
        <motion.div {...rise(0)} className="mb-2">
          <button type="button" onClick={() => navigate("/work")} className="inline-flex items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-[12.5px] text-text2 hover:bg-hover hover:text-text">
            <ArrowLeft size={14} /> Work
          </button>
        </motion.div>
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto min-w-0">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">{client ? `For ${client.data.name}` : "Your own project"}</div>
            <h1 className="truncate font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">{p.name}</h1>
          </div>
          <Button icon={Banknote} onClick={() => edit("work_log", null, { type: "payment", project_id: project.id })} kbd="P">
            Got paid
          </Button>
          <Button icon={Clock} onClick={() => edit("work_log", null, { type: "time", project_id: project.id })} kbd="T">
            Log time
          </Button>
          <IconButton icon={Pencil} label="Edit the project" onClick={() => edit("project", project)} />
          <IconButton icon={Trash2} label="Remove the project" onClick={remove} />
        </motion.header>

        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          {/* the timer */}
          <motion.div {...rise(1)}>
            <Card className={clsx("flex h-full items-center gap-4", running && "shadow-[inset_0_0_0_1px_var(--c-glow)]")} data-testid="timer">
              <span className={clsx("grid h-12 w-12 shrink-0 place-items-center rounded-[14px]", running ? "accent-grad text-on-accent" : "bg-surface2 text-text2")}>
                <Clock size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[22px] font-semibold leading-none">{running ? <Elapsed from={running} /> : "Timer"}</div>
                <div className="mt-1 text-[12px] text-text3">{running ? "Running, even with Redline closed." : "Start it when you start working."}</div>
              </div>
              <Button variant={running ? "secondary" : "primary"} icon={running ? Square : Play} onClick={() => timer(project)} kbd="S">
                {running ? "Stop" : "Start"}
              </Button>
            </Card>
          </motion.div>
          <motion.div {...rise(2)}>
            <Stat className="h-full" label="This week" icon={Clock} value={s.thisWeek} format={(n) => (n ? minutesShort(n) : "0h")} sub={s.last ? `Last worked ${shortDate(s.last, today)}` : "Nothing logged yet"} />
          </motion.div>
          <motion.div {...rise(3)}>
            <Stat className="h-full" label="In all" icon={Briefcase} value={s.minutes} format={(n) => (n ? minutesShort(n) : "0h")} sub={s.minutes !== s.billable ? `${minutesShort(s.billable)} billable` : s.minutes ? "All billable" : undefined} />
          </motion.div>
          <motion.div {...rise(4)}>
            <Stat
              label={owed ? "Owed" : "Paid"}
              icon={Wallet}
              tone={owed && owed.owed > 0 ? "var(--c-warn)" : "var(--c-success)"}
              value={owed ? owed.owed : s.paid}
              format={(n) => money(Math.round(n * 100) / 100, currency)}
              sub={owed ? `${money(owed.paid, currency)} paid of ${money(owed.worth, currency)}` : p.rate ? undefined : "No rate set"}
            />
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            <motion.div {...rise(5)}>
              <Card>
                <CardTitle title="Hours a week" icon={Clock} sub="The last eight weeks on this project" action={<Legend series={HOUR_SERIES} />} />
                <ColumnChart
                  label={`Hours on ${p.name} each week`}
                  data={weeks}
                  series={HOUR_SERIES}
                  format={(n) => `${n} h`}
                  highlight={weeks[weeks.length - 1]?.key}
                  height={180}
                />
              </Card>
            </motion.div>
            <motion.div {...rise(6)}>
              <Card pad={false} data-testid="project-log">
                <div className="px-4 pt-4">
                  <CardTitle title="Log" icon={Wallet} sub={logs.length ? `${logs.length} entr${logs.length === 1 ? "y" : "ies"}` : undefined} />
                </div>
                {logs.length ? (
                  <div className="flex flex-col pb-2">
                    {logs.map((l) => (
                      <button key={l.id} type="button" data-log={l.id} onClick={() => edit("work_log", l)} onContextMenu={(e) => ctx(e, logMenu(l))} className="mx-2 flex items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-hover">
                        <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-[9px]", l.data.type === "payment" ? "bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)] text-success" : "bg-surface2 text-text2")}>
                          {l.data.type === "payment" ? <Banknote size={15} /> : <Clock size={15} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">{l.data.note || (l.data.type === "payment" ? "Payment" : "Time")}</span>
                          <span className="block truncate text-[11.5px] text-text3">
                            {shortDate(l.data.date, today)}
                            {l.data.type === "time" && l.data.billable === false ? " · not billable" : ""}
                          </span>
                        </span>
                        {l.data.money_id && <Tag tone="success">in Money</Tag>}
                        <span className={clsx("w-[86px] text-right text-[13px] font-semibold tnum", l.data.type === "payment" && "text-success")}>
                          {l.data.type === "payment" ? `+${money(l.data.amount || 0, currency)}` : minutesShort(l.data.minutes || 0)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 pb-4">
                    <Empty compact icon={Clock} title="Nothing logged yet" body="Start the timer, or log time with T." />
                  </div>
                )}
              </Card>
            </motion.div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <motion.div {...rise(5)}>
              <Card>
                <CardTitle title="About it" icon={Briefcase} />
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {(["idea", "active", "paused", "done"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      aria-pressed={p.status === st}
                      onClick={() => p.status !== st && setStatus(st)}
                      className={clsx(
                        "h-7 rounded-full px-3 text-[12.5px] font-medium transition-colors",
                        p.status === st ? "bg-accent-soft text-accent-text shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-accent)_45%,transparent)]" : "bg-surface2 text-text2 hairline hover:text-text",
                      )}
                    >
                      {statusWord(st)}
                    </button>
                  ))}
                </div>
                <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[13px]">
                  <dt className="text-text3">Paid</dt>
                  <dd>{p.rate ? (p.rate_unit === "fixed" ? `${money(p.rate, p.currency || currency)} for the job` : `${money(p.rate, p.currency || currency)} an hour`) : "Not set"}</dd>
                  {p.start && (
                    <>
                      <dt className="text-text3">Started</dt>
                      <dd>{shortDate(p.start, today)}</dd>
                    </>
                  )}
                  {p.due && (
                    <>
                      <dt className="text-text3">Due</dt>
                      <dd className={clsx(dueIn?.state === "past" && "text-danger", dueIn?.state === "soon" && "text-warn")}>
                        {shortDate(p.due, today)}
                        {dueIn && <span className="text-text3"> ({daysWord(dueIn.days!)})</span>}
                      </dd>
                    </>
                  )}
                </dl>
                {(p.repo || p.url) && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {p.url && (
                      <button type="button" onClick={() => void bridge.app.openExternal(link(p.url!))} className="flex items-center gap-2 rounded-[10px] bg-surface2 px-3 py-2 text-left text-[12.5px] hairline hover:text-accent-text">
                        <ExternalLink size={14} className="shrink-0 text-text3" />
                        <span className="min-w-0 flex-1 truncate font-mono">{p.url}</span>
                      </button>
                    )}
                    {p.repo && (
                      <button type="button" onClick={() => void bridge.app.openExternal(link(p.repo!))} className="flex items-center gap-2 rounded-[10px] bg-surface2 px-3 py-2 text-left text-[12.5px] hairline hover:text-accent-text">
                        <Code2 size={14} className="shrink-0 text-text3" />
                        <span className="min-w-0 flex-1 truncate font-mono">{p.repo}</span>
                      </button>
                    )}
                  </div>
                )}
                {p.notes && <p className="mt-3 whitespace-pre-wrap text-[13px] text-text2">{p.notes}</p>}
                {p.status !== "done" ? (
                  <Button className="mt-4" size="sm" icon={CheckCircle2} onClick={() => setStatus("done")}>
                    Mark it done
                  </Button>
                ) : (
                  <Button className="mt-4" size="sm" icon={RefreshCw} onClick={() => setStatus("active")}>
                    Back to active
                  </Button>
                )}
              </Card>
            </motion.div>
            {mine.length > 0 && (
              <motion.div {...rise(6)}>
                <Card>
                  <CardTitle title="Domains" icon={Globe} />
                  <div className="-mx-2 flex flex-col">
                    {mine.map((d) => {
                      const r = renewal(d.data.expires_on, today);
                      return (
                        <button key={d.id} type="button" onClick={() => edit("domain", d)} className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-hover">
                          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{d.data.name}</span>
                          <span className={clsx("text-[11.5px]", r.state === "past" ? "text-danger" : r.state === "soon" ? "text-warn" : "text-text3")}>{d.data.auto_renew ? "Renews itself" : r.days != null ? `Expires ${daysWord(r.days)}` : ""}</span>
                        </button>
                      );
                    })}
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
