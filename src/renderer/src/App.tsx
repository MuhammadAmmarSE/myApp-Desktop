// The app: load what is on this computer, apply the theme, then sign-in or the pages. Commands
// from the tray, the menu, notifications and Quick capture arrive here.
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { motion } from "motion/react";
import { actionToRecords, isKind } from "@myapp/core";
import { talk } from "@/lib/talk";
import { addMove, useFunds } from "@/lib/funds";
import { autoSplit, createPot, movePot, usePots } from "@/lib/pots";
import { owedStep, useOwed } from "@/lib/owed";
import type { Command } from "@shared/ipc";
import { useApplyTheme } from "@/theme";
import { page as pageMotion } from "@/theme/motion";
import { bridge } from "@/lib/bridge";
import { match, navigate, useLocation } from "@/lib/router";
import { useGlobalKeys } from "@/lib/keys";
import { startAlerts } from "@/lib/alerts";
import { startActivity } from "@/lib/activity";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { startSync, syncNow } from "@/store/sync";
import { useUI, edit } from "@/store/ui";
import { useBadges } from "@/store/badges";
import { ConfirmHost, ContextMenuHost, ToastHost, toast, Working } from "@/components/ui";
import { TitleBar } from "@/components/shell/TitleBar";
import { Sidebar } from "@/components/shell/Sidebar";
import { Background } from "@/components/shell/Background";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { ShortcutsHelp } from "@/components/shell/ShortcutsHelp";
import { ApprovalsHost } from "@/components/shell/ApprovalsHost";
import { IdentityHost } from "@/components/shell/IdentityHost";
import { EditorHost } from "@/components/forms/Editors";
import { BrandMark } from "@/components/shell/BrandMark";
import SignIn from "@/pages/SignIn";
import Today from "@/pages/Today";

const Capture = lazy(() => import("@/pages/Capture"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Todos = lazy(() => import("@/pages/Todos"));
const Lists = lazy(() => import("@/pages/Lists"));
const Notes = lazy(() => import("@/pages/Notes"));
const Saved = lazy(() => import("@/pages/Saved"));
const Money = lazy(() => import("@/pages/Money"));
const People = lazy(() => import("@/pages/People"));
const CarPage = lazy(() => import("@/pages/Car"));
const Things = lazy(() => import("@/pages/Things"));
const Work = lazy(() => import("@/pages/Work"));
const WorkProject = lazy(() => import("@/pages/WorkProject"));
const Fund = lazy(() => import("@/pages/Fund"));
const Pot = lazy(() => import("@/pages/Pot"));
const Owed = lazy(() => import("@/pages/Owed"));
const Interests = lazy(() => import("@/pages/Interests"));
const Assistant = lazy(() => import("@/pages/Assistant"));
const Settings = lazy(() => import("@/pages/Settings"));
const Nudges = lazy(() => import("@/pages/Nudges"));
const Quick = lazy(() => import("@/pages/Quick"));

const ROUTES: [string, ComponentType<{ params: Record<string, string> }>][] = [
  ["/", Today],
  ["/capture", Capture],
  ["/calendar", Calendar],
  ["/todos", Todos],
  ["/lists", Lists],
  ["/notes", Notes],
  ["/notes/:id", Notes],
  ["/saved", Saved],
  ["/money", Money],
  ["/funds/:id", Fund],
  ["/pots/:id", Pot],
  ["/owed/:id", Owed],
  ["/people", People],
  ["/car", CarPage],
  ["/things", Things],
  ["/work", Work],
  ["/work/:id", WorkProject],
  ["/interests", Interests],
  ["/assistant", Assistant],
  ["/assistant/:id", Assistant],
  ["/settings", Settings],
  ["/nudges", Nudges],
];

// one key per section, so moving inside a section (one note to the next) doesn't replay the entrance
const sectionOf = (path: string) => "/" + (path.split("/")[1] || "");

function Pages() {
  const { path } = useLocation();
  let Page: ComponentType<{ params: Record<string, string> }> | null = null;
  let params: Record<string, string> = {};
  for (const [pattern, C] of ROUTES) {
    const m = match(pattern, path);
    if (m) {
      Page = C;
      params = m;
      break;
    }
  }
  useEffect(() => {
    if (!Page) navigate("/", { replace: true });
  }, [Page]);
  if (!Page) return null;
  // the new page fades in straight away: waiting for the old one to fade out first held every
  // click back by its exit
  return (
    <motion.div key={sectionOf(path)} variants={pageMotion} initial="initial" animate="enter" className="h-full">
      <Suspense fallback={<div className="grid h-full place-items-center"><Working label="Opening" /></div>}>
        <Page params={params} />
      </Suspense>
    </motion.div>
  );
}

function handleCommand(cmd: Command) {
  if (cmd.type === "navigate") navigate(cmd.to);
  else if (cmd.type === "palette") useUI.getState().openPalette();
  else if (cmd.type === "shortcuts") useUI.getState().setShortcuts(true);
  else if (cmd.type === "sync") void syncNow();
  else if (cmd.type === "talk") talk();
  else if (cmd.type === "new") {
    if (cmd.what === "capture") navigate("/capture");
    else if (cmd.what === "note") navigate("/notes/new");
    else if (cmd.what === "income") edit("money", null, { type: "income" });
    else edit(cmd.what);
  } else if (cmd.type === "create") {
    // what Quick capture saved: made here, where the records live. A draft may point at another one
    // made in the same batch by its stand-in ref (a hisaab and what's bought with it).
    const s = useRecords.getState();
    const made = new Map<string, string>();
    const real = (v: unknown) => (typeof v === "string" && made.has(v) ? made.get(v) : v);
    let n = 0;
    for (const d of cmd.drafts) {
      if (!d || typeof d.kind !== "string" || !d.data || typeof d.data !== "object") continue;
      if (d.kind === "fund_more") {
        const m = d.data.move || {};
        if (typeof d.data.fund_id === "string" && Number(m.amount) > 0) void addMove(d.data.fund_id, "more", Number(m.amount), m.note, m.date);
        n++;
        continue;
      }
      if (d.kind === "owed_move") {
        const m = d.data.move || {};
        if (typeof d.data.owed_id === "string" && (m.type === "back" || m.type === "more") && Number(m.amount) > 0) owedStep(d.data.owed_id, m.type, Number(m.amount), { date: m.date, note: m.note });
        n++;
        continue;
      }
      if (d.kind === "pot_move") {
        const m = d.data.move || {};
        const pot = real(d.data.pot_id);
        const other = m.other == null ? null : real(m.other);
        if (typeof pot === "string" && Number(m.amount) > 0) void movePot(m.dir === "out" ? pot : null, m.dir === "out" ? (other as string | null) : pot, Number(m.amount), m.note, m.date);
        n++;
        continue;
      }
      if (!isKind(d.kind)) continue;
      const data = { ...d.data };
      for (const k of ["fund_id", "paid_from", "settles", "pot_id"]) if (k in data) data[k] = real(data[k]) ?? null;
      if (Array.isArray(data.split)) data.split = data.split.map((x: any) => ({ ...x, pot_id: real(x && x.pot_id) })).filter((x: any) => typeof x.pot_id === "string");
      // an income with no split of its own: split by your pots' rules, as Capture does
      if (d.kind === "money" && data.type === "income" && !data.paid_from && !(Array.isArray(data.split) && data.split.length)) {
        const split = autoSplit(Number(data.amount) || 0);
        if (split.length) data.split = split;
      }
      const rec = d.kind === "pot" ? createPot(data) : s.create(d.kind, data);
      if (typeof d.ref === "string") made.set(d.ref, rec.id);
      n++;
    }
    if (n) toast.success(cmd.say || (n === 1 ? "Saved" : `Saved ${n} things`));
  }
}

// What the shell keeps in step: sync, reminders, commands from the main process, the Quick
// capture window's context and the taskbar badge. It draws nothing, so the records and settings it
// follows don't redraw the shell (and every page in it) when they change.
function ShellEffects() {
  useGlobalKeys();
  const badges = useBadges();
  const currency = useSettings((s) => s.currency);
  const themeId = useSettings((s) => s.themeId);
  const motion = useSettings((s) => s.motion);
  const people = useRecords((s) => s.lists.person);
  const openFunds = useFunds().open;
  const potRows = usePots().rows;
  const owedRows = useOwed().open;
  useEffect(() => {
    startSync();
    startAlerts();
    startNudges();
    return bridge.on("command", handleCommand);
  }, []);
  // what the Quick capture window needs to know
  useEffect(() => {
    bridge.quick.setContext({
      currency,
      themeId,
      motion,
      people: people.map((p) => ({ id: p.id, name: p.data.name, relation: p.data.relation })),
      funds: openFunds.map((r) => ({ id: r.fund.id, from: r.fund.data.from, purpose: r.fund.data.purpose, left: r.summary.left })),
      pots: potRows.map((r) => ({ id: r.pot.id, name: r.pot.data.name, type: r.pot.data.type, balance: r.summary.balance, rule: !!r.pot.data.rule })),
      owed: owedRows.slice(0, 20).map((r) => ({ id: r.rec.id, who: r.rec.data.who, type: r.rec.data.type, left: r.left })),
    });
  }, [currency, themeId, motion, people, openFunds, potRows, owedRows]);
  // late to-dos on the dock / taskbar
  const late = badges.overdue.tone === "danger" ? badges.overdue.n : 0;
  useEffect(() => bridge.badge(late), [late]);
  return null;
}

function Shell() {
  return (
    <div className="relative flex h-full flex-col">
      <ShellEffects />
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1">
          <Pages />
        </main>
      </div>
      <CommandPalette />
      <ShortcutsHelp />
      <EditorHost />
      <ApprovalsHost />
      <IdentityHost />
    </div>
  );
}

function Splash() {
  return (
    <div className="grid h-full place-items-center">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="flex flex-col items-center gap-4">
        <BrandMark size={64} spin />
        <Working label="Getting your day ready" />
      </motion.div>
    </div>
  );
}

export function App() {
  useApplyTheme();
  useEffect(() => startActivity(), []);
  const status = useAuth((s) => s.status);
  const [ready, setReady] = useState(false);
  const { path } = useLocation();
  const quick = path === "/quick";

  useEffect(() => {
    if (window.location.hash.startsWith("#/quick")) return; // Quick capture keeps no records of its own
    (async () => {
      await useRecords.getState().load();
      useSettings.getState().load();
      await useAuth.getState().restore();
      setReady(true);
    })();
    // a sign-out from the server (this device was signed out elsewhere) comes as a navigation
    return bridge.on("command", (c) => {
      if (c.type === "navigate" && c.to.startsWith("/sign-in")) {
        const notice = new URLSearchParams(c.to.split("?")[1] || "").get("notice") || "Please sign in again.";
        useAuth.getState().endSession(notice);
      }
    });
  }, []);

  if (quick) {
    return (
      <Suspense fallback={null}>
        <Quick />
      </Suspense>
    );
  }
  return (
    <ContextMenuHost>
      <Background />
      <div className="relative z-10 h-full">{!ready || status === "loading" ? <Splash /> : status === "signed-out" ? <SignIn /> : <Shell />}</div>
      <div id="overlay-root" className="relative z-[100]" />
      <ToastHost />
      <ConfirmHost />
    </ContextMenuHost>
  );
}

// for unit tests
export { handleCommand, actionToRecords };
