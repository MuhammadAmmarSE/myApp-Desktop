// The sidebar: the pages grouped by what they're for, with counts that matter (late to-dos, dates
// this week, questions from the assistant). It folds to icons; your account sits at the bottom.
import { motion } from "motion/react";
import clsx from "clsx";
import { ChevronsLeft, ChevronsRight, LogOut, Plus, RefreshCw, Settings, Sparkles, UserRound } from "lucide-react";
import { NAV } from "@/lib/nav";
import { navigate, useLocation } from "@/lib/router";
import { initials, ago } from "@/lib/format";
import { modKey } from "@/lib/bridge";
import { useBadges } from "@/store/badges";
import { useSettings } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { syncNow, useSync } from "@/store/sync";
import { useRecords } from "@/store/records";
import { confirmDialog, Menu, Tooltip, toast } from "@/components/ui";
import { ease } from "@/theme/motion";
import { BrandMark } from "./BrandMark";

export function Sidebar() {
  const { path } = useLocation();
  const collapsed = useSettings((s) => s.sidebar) === "icons";
  const set = useSettings((s) => s.set);
  const badges = useBadges();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const name = useSettings((s) => s.name) || user?.name || "";
  const sync = useSync();
  const dirty = useRecords((s) => s.dirtyCount);
  const mod = modKey();
  const active = (to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`));

  const syncLine = sync.syncing ? "Syncing…" : sync.offline ? "Offline · will sync when back" : sync.error ? sync.error : dirty ? `${dirty} change${dirty === 1 ? "" : "s"} to send` : sync.lastAt ? `Synced ${ago(sync.lastAt)}` : "Not synced yet";
  const syncTone = sync.error ? "bg-danger" : sync.offline || dirty ? "bg-warn" : "bg-success";

  return (
    <motion.nav
      aria-label="Pages"
      initial={false}
      animate={{ width: collapsed ? 68 : 236 }}
      transition={{ duration: 0.24, ease: ease.standard }}
      className="glass relative z-20 flex h-full shrink-0 flex-col border-r border-line"
    >
      <div className={clsx("flex items-center gap-2.5 px-4 pb-3 pt-3", collapsed && "justify-center px-0")}>
        <BrandMark size={30} spin />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="font-display text-[17px] font-semibold leading-none tracking-[-0.01em]">Redline</div>
            <div className="mt-1 truncate text-[11px] text-text3">{name ? `${name}'s day` : "Your day, in sync"}</div>
          </div>
        )}
      </div>

      <div className={clsx("px-3 pb-2", collapsed && "px-2.5")}>
        <Tooltip label={collapsed ? "Capture with AI" : null} kbd={`${mod}⇧C`} placement="right-start">
          <button
            type="button"
            onClick={() => navigate("/capture")}
            className={clsx(
              "accent-grad group flex h-9 w-full items-center gap-2 rounded-[11px] text-[13px] font-semibold text-on-accent shadow-[0_1px_0_0_rgb(255_255_255/0.22)_inset,0_8px_22px_-10px_var(--c-glow)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98]",
              collapsed ? "justify-center px-0" : "px-3",
            )}
          >
            <Sparkles size={16} className="shrink-0" />
            {!collapsed && <span className="flex-1 text-left">Capture</span>}
            {!collapsed && <span className="rounded bg-black/15 px-1.5 text-[10.5px] font-medium opacity-80">{mod}⇧C</span>}
          </button>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2">
        {NAV.map((g) => (
          <div key={g.title} className="mt-3 first:mt-1">
            {!collapsed ? <div className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text3">{g.title}</div> : <div className="mx-auto mb-1.5 h-px w-6 bg-line" />}
            {g.items.map((it) => {
              const on = active(it.to);
              const b = it.badge ? badges[it.badge] : null;
              const Icon = it.icon;
              const link = (
                <button
                  key={it.to}
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => navigate(it.to)}
                  className={clsx(
                    "group relative mb-0.5 flex h-[34px] w-full items-center gap-2.5 rounded-[9px] text-[13.5px] transition-colors duration-150",
                    collapsed ? "justify-center" : "px-2.5",
                    on ? "font-medium text-text" : "text-text2 hover:bg-hover hover:text-text",
                  )}
                >
                  {on && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[9px] bg-[color-mix(in_srgb,var(--c-accent)_13%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-accent)_22%,transparent)]" transition={{ duration: 0.24, ease: ease.standard }} />}
                  {on && <motion.span layoutId="nav-bar" className="absolute -left-3 top-2 h-[18px] w-[3px] rounded-r-full accent-grad" transition={{ duration: 0.24, ease: ease.standard }} />}
                  <Icon size={17} strokeWidth={on ? 2.2 : 1.9} className={clsx("relative shrink-0", on && "text-accent-text")} />
                  {!collapsed && <span className="relative flex-1 truncate text-left">{it.label}</span>}
                  {b && b.n > 0 && (
                    <span
                      className={clsx(
                        "relative grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[10.5px] font-semibold tnum",
                        collapsed && "absolute right-1 top-0.5 h-[15px] min-w-[15px] px-1 text-[9.5px]",
                        b.tone === "danger" ? "bg-danger text-white" : b.tone === "accent" ? "accent-grad text-on-accent" : "bg-hover text-text2",
                      )}
                    >
                      {b.n > 99 ? "99+" : b.n}
                    </span>
                  )}
                </button>
              );
              return collapsed ? (
                <Tooltip key={it.to} label={it.label} kbd={it.n ? `${mod} ${it.n}` : undefined} placement="right-start" delay={200}>
                  {link}
                </Tooltip>
              ) : (
                link
              );
            })}
          </div>
        ))}
      </div>

      <div className={clsx("border-t border-line p-2.5", collapsed && "px-2")}>
        <Menu
          placement="top-start"
          width={230}
          items={[
            { type: "label", label: syncLine },
            { label: "Sync now", icon: RefreshCw, kbd: `${mod} R`, onSelect: () => void syncNow().then((ok) => ok && toast.success("Up to date")) },
            { label: "New to-do", icon: Plus, kbd: `${mod} N`, onSelect: () => navigate("/todos?new=1") },
            { label: "Settings", icon: Settings, kbd: `${mod} ,`, onSelect: () => navigate("/settings") },
            { type: "separator" },
            {
              label: "Sign out",
              icon: LogOut,
              danger: true,
              onSelect: async () => {
                const ok = await confirmDialog({ title: "Sign out of Redline?", body: "Everything stays on your server. This computer's copy is cleared, and comes back when you sign in again.", confirm: "Sign out", danger: true });
                if (ok) await signOut();
              },
            },
          ]}
          trigger={(open) => (
            <button type="button" onClick={open} aria-label="Account" className={clsx("flex w-full items-center gap-2.5 rounded-[10px] p-1.5 text-left transition-colors hover:bg-hover", collapsed && "justify-center")}>
              <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full accent-grad text-[12px] font-semibold text-on-accent">
                {name ? initials(name) : <UserRound size={15} />}
                <span className={clsx("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--c-surface)]", syncTone, sync.syncing && "animate-pulse")} />
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text">{name || user?.email || "You"}</span>
                  <span className="block truncate text-[11px] text-text3" data-testid="sync-line">
                    {syncLine}
                  </span>
                </span>
              )}
            </button>
          )}
        />
        <button
          type="button"
          onClick={() => set({ sidebar: collapsed ? "full" : "icons" })}
          aria-label={collapsed ? "Show the full sidebar" : "Fold the sidebar"}
          className="mt-1 flex h-7 w-full items-center justify-center gap-1.5 rounded-[8px] text-[11.5px] text-text3 hover:bg-hover hover:text-text2"
        >
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          {!collapsed && <span>Fold</span>}
        </button>
      </div>
    </motion.nav>
  );
}
