// The app: load what is on this computer, apply the theme, then sign-in or the pages. Commands
// from the tray, the menu, notifications and Quick capture arrive here.
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { motion } from "motion/react";
import { actionToRecords, type Kind } from "@myapp/core";
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
const Assistant = lazy(() => import("@/pages/Assistant"));
const Settings = lazy(() => import("@/pages/Settings"));
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
  ["/people", People],
  ["/car", CarPage],
  ["/things", Things],
  ["/assistant", Assistant],
  ["/assistant/:id", Assistant],
  ["/settings", Settings],
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
  else if (cmd.type === "new") {
    if (cmd.what === "capture") navigate("/capture");
    else if (cmd.what === "note") navigate("/notes/new");
    else if (cmd.what === "income") edit("money", null, { type: "income" });
    else edit(cmd.what);
  } else if (cmd.type === "create") {
    // what Quick capture saved: made here, where the records live
    const s = useRecords.getState();
    let n = 0;
    for (const d of cmd.drafts) {
      if (!d || typeof d.kind !== "string" || !d.data) continue;
      s.create(d.kind as Kind, d.data);
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
  useEffect(() => {
    startSync();
    startAlerts();
    return bridge.on("command", handleCommand);
  }, []);
  // what the Quick capture window needs to know
  useEffect(() => {
    bridge.quick.setContext({ currency, themeId, motion, people: people.map((p) => ({ id: p.id, name: p.data.name, relation: p.data.relation })) });
  }, [currency, themeId, motion, people]);
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
