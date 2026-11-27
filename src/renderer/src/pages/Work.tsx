// Work: projects (for clients or your own) with the time spent and what's been paid, the clients,
// and the servers and domains everything runs on. Renewals coming up sit on top with a one-click
// "Renewed"; the hours of the last eight weeks are a chart beside the projects. A project opens on
// its own page (/work/:id) with its timer and its log.
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  Archive,
  ArchiveRestore,
  Banknote,
  Briefcase,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Mail,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Square,
  Terminal,
  Trash2,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { addMonths, isoDate, minutesInWords, projectOwed, projectStats, renewal, renewalsDue, workSummary, daysWord, type Rec } from "@myapp/core";
import { Button, Card, CardTitle, Chip, Empty, Input, Menu, Segmented, Stat, Tag, toast, useContextMenu } from "@/components/ui";
import { ColumnChart, Legend } from "@/components/charts";
import { BulkBar } from "@/components/BulkBar";
import { statusWord } from "@/components/forms/WorkEditors";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { removeProject, renewedUntil, startTimer, stopTimer, weeklyHours, minutesShort } from "@/lib/work";
import { useListNav } from "@/lib/listNav";
import { usePageKeys } from "@/lib/keys";
import { navigate, setQuery, useQuery } from "@/lib/router";
import { bridge } from "@/lib/bridge";
import { money, shortDate } from "@/lib/format";
import { rise } from "@/theme/motion";

const HOUR_SERIES = [
  { key: "billable", name: "Billable", color: "var(--viz-1)" },
  { key: "other", name: "Not billable", color: "var(--viz-2)" },
];

type Tab = "projects" | "clients" | "servers" | "domains";
const TABS: Tab[] = ["projects", "clients", "servers", "domains"];
const STATUS_TONE: Record<string, "accent" | "default" | "warn" | "success"> = { active: "accent", idea: "default", paused: "warn", done: "success" };

// active first (pinned on top), then paused and ideas, newest first within each
const rank = (p: Rec<"project">) => (p.data.status === "active" ? 0 : p.data.status === "paused" ? 1 : p.data.status === "idea" ? 2 : 3);
const byStatus = (a: Rec<"project">, b: Rec<"project">) =>
  Number(typeof b.data.timer_from === "number") - Number(typeof a.data.timer_from === "number") || rank(a) - rank(b) || Number(!!b.data.pinned) - Number(!!a.data.pinned) || b.updated_at - a.updated_at;
const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
const has = (text: string, w: string[]) => w.every((x) => text.toLowerCase().includes(x));
const link = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export default function Work() {
  const q = useQuery();
  const tab: Tab = TABS.includes(q.get("tab") as Tab) ? (q.get("tab") as Tab) : "projects";
  const projects = useList("project");
  const clients = useList("client");
  const logs = useList("work_log");
  const servers = useList("server");
  const domains = useList("domain");
  const currency = useSettings((s) => s.currency);
  const today = isoDate();
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const ctx = useContextMenu();
  const w = words(text);

  const sum = useMemo(() => workSummary({ project: projects, work_log: logs, server: servers }, today), [projects, logs, servers, today]);
  const due = useMemo(() => renewalsDue({ domain: domains, server: servers }, today), [domains, servers, today]);
  const weeks = useMemo(() => weeklyHours(logs, today), [logs, today]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.data.name])), [clients]);
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.data.name])), [projects]);
  const serverName = useMemo(() => new Map(servers.map((s) => [s.id, s.data.name])), [servers]);
  const recent = useMemo(() => [...logs].sort((a, b) => b.data.date.localeCompare(a.data.date) || b.created_at - a.created_at).slice(0, 6), [logs]);

  const shownProjects = useMemo(
    () =>
      [...projects]
        .filter((p) => (showDone ? p.data.status === "done" : p.data.status !== "done") && has(`${p.data.name} ${p.data.client_id ? clientName.get(p.data.client_id) || "" : ""} ${p.data.notes || ""} ${p.data.repo || ""} ${p.data.url || ""}`, w))
        .sort(byStatus),
    [projects, showDone, clientName, w],
  );
  const shownClients = useMemo(
    () => clients.filter((c) => !!c.data.past === showPast && has(`${c.data.name} ${c.data.company || ""} ${c.data.email || ""} ${c.data.phone || ""} ${c.data.notes || ""}`, w)).sort((a, b) => a.data.name.localeCompare(b.data.name)),
    [clients, showPast, w],
  );
  const shownServers = useMemo(
    () => servers.filter((s) => !!s.data.gone === showPast && has(`${s.data.name} ${s.data.provider || ""} ${s.data.host || ""} ${s.data.os || ""} ${s.data.notes || ""}`, w)).sort((a, b) => a.data.name.localeCompare(b.data.name)),
    [servers, showPast, w],
  );
  const shownDomains = useMemo(
    () =>
      domains
        .filter((d) => !!d.data.gone === showPast && has(`${d.data.name} ${d.data.registrar || ""} ${d.data.notes || ""}`, w))
        .sort((a, b) => (a.data.expires_on || "9999").localeCompare(b.data.expires_on || "9999") || a.data.name.localeCompare(b.data.name)),
    [domains, showPast, w],
  );
  const doneCount = projects.filter((p) => p.data.status === "done").length;
  const pastCount = tab === "clients" ? clients.filter((c) => c.data.past).length : tab === "servers" ? servers.filter((s) => s.data.gone).length : tab === "domains" ? domains.filter((d) => d.data.gone).length : 0;

  // ----- actions -----
  const update = <K extends "project" | "client" | "server" | "domain">(r: Rec<K>, patch: Partial<Rec<K>["data"]>, said: string) => {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (r.data as Record<string, unknown>)[k] ?? null])) as Partial<Rec<K>["data"]>;
    useRecords.getState().update<K>(r.id, patch);
    toast(said, { action: { label: "Undo", run: () => useRecords.getState().update<K>(r.id, before) } });
  };
  const removeOne = (r: Rec, name: string) => {
    useRecords.getState().remove(r.id);
    toast.undo(`${name} removed`, () => useRecords.getState().restore(r));
  };
  const removeProjects = (list: Rec<"project">[]) => {
    const undos = list.map((p) => removeProject(p));
    toast.undo(list.length === 1 ? `${list[0].data.name} removed with its log` : `${list.length} projects removed with their logs`, () => undos.forEach((u) => u()));
  };
  const copy = (label: string, value: string) => {
    bridge.clipboard.write(value);
    toast(`${label} copied`);
  };
  const timer = (p: Rec<"project">) => {
    if (typeof p.data.timer_from === "number") edit("work_log", null, { type: "time", project_id: p.id, minutes: stopTimer(p) });
    else {
      startTimer(p);
      toast(`Timer started on ${p.data.name}`);
    }
  };
  const renewed = (r: { id: string; kind: "domain" | "server" }) => {
    const rec = useRecords.getState().byId[r.id];
    if (!rec || rec.deleted) return;
    if (r.kind === "domain") {
      const d = rec as Rec<"domain">;
      const next = renewedUntil(d.data.expires_on, today);
      update(d, { expires_on: next }, `${d.data.name} renewed until ${shortDate(next, today)}`);
    } else {
      const s = rec as Rec<"server">;
      const next = addMonths(s.data.renews_on && s.data.renews_on > today ? s.data.renews_on : today, 1);
      update(s, { renews_on: next }, `${s.data.name}'s next bill is ${shortDate(next, today)}`);
    }
  };

  const projectMenu = (p: Rec<"project">) => [
    { label: "Open", icon: Briefcase, onSelect: () => navigate(`/work/${p.id}`) },
    { label: "Edit", icon: Pencil, onSelect: () => edit("project", p) },
    { type: "separator" as const },
    { label: typeof p.data.timer_from === "number" ? "Stop the timer" : "Start the timer", icon: typeof p.data.timer_from === "number" ? Square : Play, onSelect: () => timer(p) },
    { label: "Log time", icon: Clock, onSelect: () => edit("work_log", null, { type: "time", project_id: p.id }) },
    { label: "Got paid", icon: Banknote, onSelect: () => edit("work_log", null, { type: "payment", project_id: p.id }) },
    { label: p.data.pinned ? "Unpin" : "Pin to the top", icon: p.data.pinned ? PinOff : Pin, onSelect: () => update(p, { pinned: !p.data.pinned }, p.data.pinned ? "Unpinned" : "Pinned") },
    p.data.status === "done"
      ? { label: "Back to active", icon: RefreshCw, onSelect: () => update(p, { status: "active" }, `${p.data.name} is active again`) }
      : { label: "Mark done", icon: CheckCircle2, onSelect: () => update(p, { status: "done", timer_from: null }, `${p.data.name} is done`) },
    ...(p.data.url ? [{ label: "Open the live site", icon: ExternalLink, onSelect: () => void bridge.app.openExternal(link(p.data.url!)) }] : []),
    ...(p.data.repo ? [{ label: "Open the code", icon: ExternalLink, onSelect: () => void bridge.app.openExternal(link(p.data.repo!)) }] : []),
    { type: "separator" as const },
    { label: "Remove", icon: Trash2, danger: true, onSelect: () => removeProjects([p]) },
  ];
  const clientMenu = (c: Rec<"client">) => [
    { label: "Edit", icon: Pencil, onSelect: () => edit("client", c) },
    { label: "New project for them", icon: Briefcase, onSelect: () => edit("project", null, { client_id: c.id, ...(c.data.rate ? { rate: c.data.rate, rate_unit: "hour" } : {}) }) },
    ...(c.data.email ? [{ label: "Email them", icon: Mail, onSelect: () => void bridge.app.openExternal(`mailto:${c.data.email}`) }] : []),
    ...(c.data.phone ? [{ label: "Copy the phone number", icon: Copy, onSelect: () => copy("Phone number", c.data.phone!) }] : []),
    { label: c.data.past ? "Working together again" : "A past client", icon: c.data.past ? ArchiveRestore : Archive, onSelect: () => update(c, { past: !c.data.past || undefined }, c.data.past ? `${c.data.name} is back` : `${c.data.name} put away`) },
    { type: "separator" as const },
    { label: "Remove", icon: Trash2, danger: true, onSelect: () => removeOne(c, c.data.name) },
  ];
  const sshOf = (s: Rec<"server">) => (s.data.host ? `ssh ${s.data.user ? `${s.data.user}@` : ""}${s.data.host}` : "");
  const serverMenu = (s: Rec<"server">) => [
    { label: "Edit", icon: Pencil, onSelect: () => edit("server", s) },
    ...(s.data.host ? [{ label: "Copy the ssh command", icon: Terminal, onSelect: () => copy("ssh command", sshOf(s)) }] : []),
    ...(s.data.host ? [{ label: "Copy the address", icon: Copy, onSelect: () => copy("Address", s.data.host!) }] : []),
    ...(s.data.renews_on ? [{ label: "Paid: move the bill a month on", icon: RefreshCw, onSelect: () => renewed({ id: s.id, kind: "server" }) }] : []),
    { label: s.data.gone ? "Still running" : "Shut down", icon: s.data.gone ? ArchiveRestore : Archive, onSelect: () => update(s, { gone: !s.data.gone || undefined }, s.data.gone ? `${s.data.name} is back` : `${s.data.name} put away`) },
    { type: "separator" as const },
    { label: "Remove", icon: Trash2, danger: true, onSelect: () => removeOne(s, s.data.name) },
  ];
  const domainMenu = (d: Rec<"domain">) => [
    { label: "Open the site", icon: ExternalLink, onSelect: () => void bridge.app.openExternal(`https://${d.data.name}`) },
    { label: "Edit", icon: Pencil, onSelect: () => edit("domain", d) },
    { label: "Renewed for a year", icon: RefreshCw, onSelect: () => renewed({ id: d.id, kind: "domain" }) },
    { label: "Copy the name", icon: Copy, onSelect: () => copy("Domain", d.data.name) },
    { label: d.data.gone ? "Still mine" : "Let it go", icon: d.data.gone ? ArchiveRestore : Archive, onSelect: () => update(d, { gone: !d.data.gone || undefined }, d.data.gone ? `${d.data.name} is back` : `${d.data.name} put away`) },
    { type: "separator" as const },
    { label: "Remove", icon: Trash2, danger: true, onSelect: () => removeOne(d, d.data.name) },
  ];

  const nav = useListNav(shownProjects, {
    selector: (id) => `[data-project="${id}"]`,
    onOpen: (p) => navigate(`/work/${p.id}`),
    onDelete: (l) => removeProjects(l),
    onNew: () => addHere(),
  });
  const chosen = tab === "projects" ? nav.chosen() : [];
  function addHere() {
    edit(tab === "projects" ? "project" : tab === "clients" ? "client" : tab === "servers" ? "server" : "domain");
  }
  usePageKeys(
    (e) => {
      if (e.key === "t" || e.key === "T") {
        edit("work_log", null, { type: "time" });
        return true;
      }
      if (tab === "projects" && (e.key === "s" || e.key === "S") && nav.active) {
        const p = shownProjects.find((x) => x.id === nav.active);
        if (p) timer(p);
        return true;
      }
    },
    [tab, nav.active, shownProjects],
  );

  const empty = !projects.length && !clients.length && !servers.length && !domains.length;

  // ----- the four tabs -----
  const projectCard = (p: Rec<"project">, i: number) => {
    const s = projectStats(logs, p.id, today);
    const owed = projectOwed(p.data, logs, p.id);
    const running = typeof p.data.timer_from === "number";
    const dueIn = p.data.due && p.data.status !== "done" ? renewal(p.data.due, today, 7) : null;
    return (
      <motion.div
        key={p.id}
        layout="position"
        data-project={p.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.02 }}
        onClick={(e) => nav.click(p, e)}
        onDoubleClick={() => navigate(`/work/${p.id}`)}
        onContextMenu={(e) => ctx(e, projectMenu(p))}
        className={clsx(
          "group flex cursor-pointer flex-col gap-3 rounded-[16px] p-4 glass transition-[box-shadow,transform] hover:-translate-y-0.5",
          nav.selected.has(p.id) ? "shadow-[inset_0_0_0_1.5px_var(--c-accent)] bg-accent-soft/40" : nav.active === p.id ? "shadow-[inset_0_0_0_1.5px_var(--c-accent)]" : "hairline hover:shadow-[var(--shadow-card)]",
          p.data.status === "done" && "opacity-75",
        )}
      >
        <div className="flex items-start gap-3">
          <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-[12px]", running ? "accent-grad text-on-accent" : p.data.status === "active" ? "bg-accent-soft text-accent-text" : "bg-surface2 text-text2")}>
            {running ? <Clock size={18} /> : <Briefcase size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14.5px] font-semibold">{p.data.name}</span>
              {p.data.pinned && <Pin size={12} className="shrink-0 text-text3" />}
            </div>
            <div className="truncate text-[12px] text-text2">{p.data.client_id ? `For ${clientName.get(p.data.client_id) || "a client"}` : "Your own"}</div>
          </div>
          {running ? <Tag tone="accent">Timer on</Tag> : <Tag tone={STATUS_TONE[p.data.status] || "default"}>{statusWord(p.data.status)}</Tag>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-[12px]">
          <div>
            <div className="text-text3">This week</div>
            <div className="font-semibold tnum">{s.thisWeek ? minutesShort(s.thisWeek) : "—"}</div>
          </div>
          <div>
            <div className="text-text3">In all</div>
            <div className="font-semibold tnum">{s.minutes ? minutesShort(s.minutes) : "—"}</div>
          </div>
          <div>
            <div className="text-text3">{owed ? "Owed" : "Paid"}</div>
            <div className={clsx("font-semibold tnum", owed && owed.owed > 0 && "text-warn")}>{owed ? (owed.owed > 0 ? money(owed.owed, currency) : "Nothing") : s.paid ? money(s.paid, currency) : "—"}</div>
          </div>
        </div>
        {owed && owed.worth > 0 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--viz-grid)]" title={`${money(owed.paid, currency)} paid of ${money(owed.worth, currency)}`}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(1, owed.paid / owed.worth) * 100}%` }} transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }} className="h-full rounded-full bg-[var(--c-success)]" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-text3">
          {dueIn && <span className={clsx(dueIn.state === "past" && "text-danger", dueIn.state === "soon" && "text-warn")}>Due {daysWord(dueIn.days!)}</span>}
          {s.last && (
            <span>
              {dueIn ? "· " : ""}Last worked {shortDate(s.last, today)}
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={(e) => (e.stopPropagation(), timer(p))}
            className={clsx("flex h-7 items-center gap-1 rounded-[8px] px-2 font-medium transition-colors", running ? "bg-accent-soft text-accent-text" : "text-text2 opacity-0 hover:bg-hover hover:text-text group-hover:opacity-100")}
            aria-label={running ? "Stop the timer" : "Start the timer"}
          >
            {running ? <Square size={12} /> : <Play size={12} />}
            {running ? "Stop" : "Start"}
          </button>
        </div>
      </motion.div>
    );
  };

  const projectsTab = (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0">
        {shownProjects.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="project-grid">
            <AnimatePresence initial={false}>{shownProjects.map(projectCard)}</AnimatePresence>
          </div>
        ) : (
          <Card>
            <Empty
              icon={Briefcase}
              title={projects.length ? (text ? "Nothing matches" : showDone ? "Nothing finished yet" : "Everything's done") : "No projects yet"}
              body={projects.length ? (text ? "Change the search." : "Start something new.") : "Your projects, whether for a client or your own: the hours you put in, what you're owed and what's been paid."}
              action={
                <Button variant="primary" icon={Plus} onClick={() => edit("project")}>
                  New project
                </Button>
              }
            />
          </Card>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardTitle title="Hours a week" icon={Clock} sub="The last eight weeks" action={<Legend series={HOUR_SERIES} />} />
          <ColumnChart
            label="Hours worked each week, billable and not"
            data={weeks}
            series={HOUR_SERIES}
            format={(n) => `${n} h`}
            highlight={weeks[weeks.length - 1]?.key}
            height={190}
          />
        </Card>
        <Card>
          <CardTitle
            title="Lately"
            icon={Wallet}
            action={
              <Button size="sm" variant="ghost" icon={Banknote} onClick={() => edit("work_log", null, { type: "payment" })}>
                Got paid
              </Button>
            }
          />
          {recent.length ? (
            <div className="-mx-2 flex flex-col">
              {recent.map((l) => (
                <button key={l.id} type="button" data-log={l.id} onClick={() => edit("work_log", l)} className="flex items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-hover">
                  <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-[9px]", l.data.type === "payment" ? "bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)] text-success" : "bg-surface2 text-text2")}>
                    {l.data.type === "payment" ? <Banknote size={15} /> : <Clock size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{l.data.project_id ? projectName.get(l.data.project_id) || "A project" : "No project"}</span>
                    <span className="block truncate text-[11.5px] text-text3">{[shortDate(l.data.date, today), l.data.note].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className={clsx("text-[13px] font-semibold tnum", l.data.type === "payment" && "text-success")}>{l.data.type === "payment" ? `+${money(l.data.amount || 0, currency)}` : minutesShort(l.data.minutes || 0)}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty compact icon={Clock} title="Nothing logged yet" body="Log time with T, or start a project's timer." />
          )}
        </Card>
      </div>
    </div>
  );

  const clientsTab = shownClients.length ? (
    <Card pad={false} data-testid="client-table">
      <table className="w-full text-[13px]">
        <thead className="text-[11px] uppercase tracking-[0.06em] text-text3">
          <tr>
            <th className="px-4 py-2.5 text-left font-semibold">Client</th>
            <th className="px-2 py-2.5 text-left font-semibold">Contact</th>
            <th className="px-2 py-2.5 text-right font-semibold">Projects</th>
            <th className="px-2 py-2.5 text-right font-semibold">Hours</th>
            <th className="px-4 py-2.5 text-right font-semibold">Owed</th>
          </tr>
        </thead>
        <tbody>
          {shownClients.map((c) => {
            const mine = projects.filter((p) => p.data.client_id === c.id);
            const minutes = mine.reduce((m, p) => m + projectStats(logs, p.id, today).minutes, 0);
            const owed = mine.reduce((m, p) => m + (projectOwed(p.data, logs, p.id)?.owed || 0), 0);
            const going = mine.filter((p) => p.data.status !== "done").length;
            return (
              <tr key={c.id} data-client={c.id} onClick={() => edit("client", c)} onContextMenu={(e) => ctx(e, clientMenu(c))} className="cursor-pointer border-t border-line/60 hover:bg-hover">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-text">{c.data.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.data.name}</div>
                      {c.data.company && <div className="truncate text-[11.5px] text-text3">{c.data.company}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-text2">
                  <div className="flex flex-col">
                    {c.data.email && (
                      <button type="button" onClick={(e) => (e.stopPropagation(), void bridge.app.openExternal(`mailto:${c.data.email}`))} className="w-fit truncate hover:text-accent-text">
                        {c.data.email}
                      </button>
                    )}
                    {c.data.phone && (
                      <button type="button" onClick={(e) => (e.stopPropagation(), copy("Phone number", c.data.phone!))} className="w-fit truncate text-[12px] text-text3 hover:text-text" title="Copy">
                        {c.data.phone}
                      </button>
                    )}
                    {!c.data.email && !c.data.phone && "—"}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right tnum">{going ? `${going} going` : mine.length ? `${mine.length} done` : "—"}</td>
                <td className="px-2 py-2.5 text-right tnum">{minutes ? minutesShort(minutes) : "—"}</td>
                <td className={clsx("px-4 py-2.5 text-right font-medium tnum", owed > 0 && "text-warn")}>{owed > 0 ? money(owed, currency) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  ) : (
    <Card>
      <Empty icon={Users} title={clients.length ? "Nothing matches" : "No clients yet"} body={clients.length ? "Change the search." : "The people you work for, with their usual rate: their new projects start with it."} />
    </Card>
  );

  const serversTab = shownServers.length ? (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="server-grid">
      {shownServers.map((s, i) => {
        const r = renewal(s.data.renews_on, today, 7);
        const pointing = domains.filter((d) => d.data.server_id === s.id && !d.data.gone);
        return (
          <motion.div
            {...rise(i)}
            key={s.id}
            data-server={s.id}
            onClick={() => edit("server", s)}
            onContextMenu={(e) => ctx(e, serverMenu(s))}
            className={clsx("group flex cursor-pointer flex-col gap-3 rounded-[16px] p-4 glass hairline transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]", s.data.gone && "opacity-70")}
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent-text">
                <Server size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold">{s.data.name}</div>
                <div className="truncate text-[12px] text-text2">{[s.data.provider, s.data.os].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              {s.data.cost ? (
                <span className="text-[13px] font-semibold tnum">
                  {money(s.data.cost, currency)}
                  <span className="text-[11px] font-normal text-text3"> /mo</span>
                </span>
              ) : null}
            </div>
            {s.data.host && (
              <button
                type="button"
                onClick={(e) => (e.stopPropagation(), copy("ssh command", sshOf(s)))}
                className="flex items-center gap-2 rounded-[10px] bg-surface2 px-3 py-2 text-left font-mono text-[12px] text-text2 hairline hover:text-text"
                title="Copy the ssh command"
              >
                <Terminal size={13} className="shrink-0 text-text3" />
                <span className="min-w-0 flex-1 truncate">{sshOf(s)}</span>
                <Copy size={12} className="shrink-0 opacity-0 group-hover:opacity-100" />
              </button>
            )}
            <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-text3">
              {r.state !== "none" && <span className={clsx(r.state === "past" && "text-danger", r.state === "soon" && "text-warn")}>Bill {daysWord(r.days!)}</span>}
              {pointing.length > 0 && (
                <span className="truncate">
                  {r.state !== "none" ? "· " : ""}
                  {pointing.map((d) => d.data.name).join(", ")}
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  ) : (
    <Card>
      <Empty
        icon={Server}
        title={servers.length ? "Nothing matches" : "No servers yet"}
        body={servers.length ? "Change the search." : "Where your projects run: the address, who you log in as (never the password), what it costs and when the bill comes."}
      />
    </Card>
  );

  const domainsTab = shownDomains.length ? (
    <Card pad={false} data-testid="domain-table">
      <table className="w-full text-[13px]">
        <thead className="text-[11px] uppercase tracking-[0.06em] text-text3">
          <tr>
            <th className="px-4 py-2.5 text-left font-semibold">Domain</th>
            <th className="px-2 py-2.5 text-left font-semibold">Expires</th>
            <th className="px-2 py-2.5 text-left font-semibold">For</th>
            <th className="px-2 py-2.5 text-left font-semibold">Points at</th>
            <th className="px-4 py-2.5 text-right font-semibold">A year</th>
          </tr>
        </thead>
        <tbody>
          {shownDomains.map((d) => {
            const r = renewal(d.data.expires_on, today);
            return (
              <tr key={d.id} data-domain={d.id} onClick={() => edit("domain", d)} onContextMenu={(e) => ctx(e, domainMenu(d))} className={clsx("group cursor-pointer border-t border-line/60 hover:bg-hover", d.data.gone && "opacity-70")}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="shrink-0 text-text3" />
                    <span className="truncate font-mono font-medium">{d.data.name}</span>
                    <button
                      type="button"
                      onClick={(e) => (e.stopPropagation(), void bridge.app.openExternal(`https://${d.data.name}`))}
                      aria-label={`Open ${d.data.name}`}
                      className="grid h-6 w-6 place-items-center rounded-md text-text3 opacity-0 hover:bg-hover hover:text-text group-hover:opacity-100"
                    >
                      <ExternalLink size={13} />
                    </button>
                  </div>
                  {d.data.registrar && <div className="pl-[22px] text-[11.5px] text-text3">{d.data.registrar}</div>}
                </td>
                <td className="px-2 py-2.5">
                  {d.data.auto_renew ? (
                    <Tag tone="success">Renews itself</Tag>
                  ) : r.state === "none" ? (
                    <span className="text-text3">—</span>
                  ) : (
                    <span className={clsx(r.state === "past" ? "text-danger" : r.state === "soon" ? "text-warn" : "text-text2")}>
                      {shortDate(d.data.expires_on!, today)} <span className="text-[11.5px] text-text3">({daysWord(r.days!)})</span>
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-text2">{d.data.project_id ? projectName.get(d.data.project_id) || "—" : "—"}</td>
                <td className="px-2 py-2.5 text-text2">{d.data.server_id ? serverName.get(d.data.server_id) || "—" : "—"}</td>
                <td className="px-4 py-2.5 text-right tnum">{d.data.cost ? money(d.data.cost, currency) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  ) : (
    <Card>
      <Empty icon={Globe} title={domains.length ? "Nothing matches" : "No domains yet"} body={domains.length ? "Change the search." : "Your domain names and when each expires: you'll hear about it a month, a week and a day before."} />
    </Card>
  );

  const tabCounts: Record<Tab, number> = {
    projects: projects.filter((p) => p.data.status !== "done").length,
    clients: clients.filter((c) => !c.data.past).length,
    servers: servers.filter((s) => !s.data.gone).length,
    domains: domains.filter((d) => !d.data.gone).length,
  };
  const ICON: Record<Tab, LucideIcon> = { projects: Briefcase, clients: Users, servers: Server, domains: Globe };
  const LABEL: Record<Tab, string> = { projects: "Projects", clients: "Clients", servers: "Servers", domains: "Domains" };

  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-6" data-testid="work">
      <div className="mx-auto max-w-[1320px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">Projects, clients, servers & domains</div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">Work</h1>
          </div>
          <Button icon={Clock} onClick={() => edit("work_log", null, { type: "time" })} kbd="T">
            Log time
          </Button>
          <Menu
            trigger={(open) => (
              <Button variant="primary" icon={Plus} onClick={open} kbd="N">
                Add
              </Button>
            )}
            items={[
              { label: "New project", icon: Briefcase, onSelect: () => edit("project") },
              { label: "Got paid", icon: Banknote, onSelect: () => edit("work_log", null, { type: "payment" }) },
              { label: "New client", icon: UserRound, onSelect: () => edit("client") },
              { label: "Add a server", icon: Server, onSelect: () => edit("server") },
              { label: "Add a domain", icon: Globe, onSelect: () => edit("domain") },
            ]}
          />
        </motion.header>

        {!empty && (
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
            <motion.div {...rise(1)}>
              <Stat className="h-full" label="Active projects" icon={Briefcase} value={sum.active} sub={projects.some((p) => typeof p.data.timer_from === "number") ? "A timer is running" : undefined} onClick={() => setQuery({ tab: null })} />
            </motion.div>
            <motion.div {...rise(2)}>
              <Stat className="h-full" label="This week" icon={Clock} value={sum.weekMinutes} format={(n) => (n ? minutesShort(n) : "0h")} sub={minutesInWords(sum.weekMinutes) === "0 min" ? "Nothing logged yet" : minutesInWords(sum.weekMinutes)} />
            </motion.div>
            <motion.div {...rise(3)}>
              <Stat className="h-full" label="Paid this month" icon={Banknote} tone="var(--c-success)" value={sum.paidMonth} format={(n) => money(Math.round(n), currency)} />
            </motion.div>
            <motion.div {...rise(4)}>
              <Stat className="h-full" label="Owed to you" icon={Wallet} tone="var(--c-warn)" value={sum.owed} format={(n) => money(Math.round(n), currency)} sub={sum.owed ? "Billable hours not paid yet" : "All paid up"} />
            </motion.div>
            <motion.div {...rise(5)}>
              <Stat className="h-full" label="Servers a month" icon={Server} value={sum.serverCost} format={(n) => (n ? money(Math.round(n), currency) : "—")} onClick={() => setQuery({ tab: "servers" })} />
            </motion.div>
          </div>
        )}

        {due.length > 0 && (
          <motion.section {...rise(6)} className="mb-5" data-testid="renewals">
            <div className="flex gap-3 overflow-x-auto pb-1">
              {due.map((r) => (
                <div key={r.id} data-renewal={r.id} className={clsx("flex w-[310px] shrink-0 items-center gap-3 rounded-[16px] p-3.5 glass", r.days < 0 ? "shadow-[inset_0_0_0_1px_var(--c-danger)]" : "shadow-[inset_0_0_0_1px_var(--c-warn)]")}>
                  <span
                    className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-[12px]", r.days < 0 ? "bg-[color-mix(in_srgb,var(--c-danger)_16%,transparent)] text-danger" : "bg-[color-mix(in_srgb,var(--c-warn)_16%,transparent)] text-warn")}
                  >
                    {r.kind === "domain" ? <Globe size={18} /> : <Server size={18} />}
                  </span>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => edit(r.kind, useRecords.getState().byId[r.id])}>
                    <div className="truncate text-[13.5px] font-semibold">{r.name}</div>
                    <div className="truncate text-[12px] text-text2">
                      {r.kind === "domain" ? (r.days < 0 ? "Expired" : "Expires") : r.days < 0 ? "Bill was due" : "Bill"} {daysWord(r.days)}
                    </div>
                  </button>
                  <Button size="sm" icon={RefreshCw} onClick={() => renewed(r)}>
                    {r.kind === "domain" ? "Renewed" : "Paid"}
                  </Button>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {empty ? (
          <motion.div {...rise(2)}>
            <Card>
              <Empty
                icon={Briefcase}
                title="Your work, in one place"
                body="Projects for clients or your own with the hours you put in and what's been paid, the people you work for, and the servers and domains it all runs on."
                action={
                  <div className="flex gap-2">
                    <Button variant="primary" icon={Plus} onClick={() => edit("project")}>
                      New project
                    </Button>
                    <Button icon={Globe} onClick={() => edit("domain")}>
                      Add a domain
                    </Button>
                  </div>
                }
              />
            </Card>
          </motion.div>
        ) : (
          <>
            <motion.div {...rise(7)} className="mb-4 flex flex-wrap items-center gap-2">
              <Segmented<Tab> value={tab} onChange={(t) => setQuery({ tab: t === "projects" ? null : t })} options={TABS.map((t) => ({ value: t, label: LABEL[t], icon: ICON[t], count: tabCounts[t] }))} />
              <div className="w-[240px]">
                <Input icon={Search} value={text} onChange={setText} size="sm" placeholder={`Search ${LABEL[tab].toLowerCase()}`} aria-label={`Search ${LABEL[tab].toLowerCase()}`} />
              </div>
              <div className="flex-1" />
              {tab === "projects" && doneCount > 0 && (
                <Chip active={showDone} icon={CheckCircle2} count={doneCount} onClick={() => setShowDone((x) => !x)}>
                  Finished
                </Chip>
              )}
              {tab !== "projects" && pastCount > 0 && (
                <Chip active={showPast} icon={Archive} count={pastCount} onClick={() => setShowPast((x) => !x)}>
                  {tab === "clients" ? "Past clients" : tab === "servers" ? "Shut down" : "Let go"}
                </Chip>
              )}
              <Button size="sm" variant="ghost" icon={Plus} onClick={addHere}>
                {tab === "projects" ? "New project" : tab === "clients" ? "New client" : tab === "servers" ? "Add a server" : "Add a domain"}
              </Button>
            </motion.div>
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0, 0, 0.2, 1] }}>
              {tab === "projects" ? projectsTab : tab === "clients" ? clientsTab : tab === "servers" ? serversTab : domainsTab}
            </motion.div>
          </>
        )}
      </div>

      <BulkBar count={chosen.length} onClear={nav.clear}>
        <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => (chosen.forEach((p) => useRecords.getState().update<"project">(p.id, { status: "done", timer_from: null })), toast(`${chosen.length} projects done`), nav.clear())}>
          Mark done
        </Button>
        <Button size="sm" variant="ghost" icon={Trash2} className="text-danger" onClick={() => (removeProjects(chosen), nav.clear())}>
          Remove
        </Button>
      </BulkBar>
    </div>
  );
}
