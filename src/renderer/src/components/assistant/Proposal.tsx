// What the assistant does with your records, in the conversation: a quiet line for each look it
// takes ("Looked through your records · Found 2"), and a card for the changes it proposes. Each
// change says what happens to what; Save keeps it (saved here like any change you make), Skip
// leaves it; Save all for the rest. Nothing is saved until you click.
import { useEffect } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import {
  BellRing,
  BookOpen,
  Bookmark,
  Briefcase,
  Cake,
  CalendarDays,
  Calculator,
  Car,
  Check,
  Clapperboard,
  Fuel,
  Gift,
  HandCoins,
  Brain,
  Globe,
  Handshake,
  Languages,
  LayoutList,
  ListChecks,
  NotebookPen,
  Package,
  Search,
  Server,
  ShoppingCart,
  Sparkles,
  Target,
  Timer,
  User,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { describeChange, describeStep, type Kind, type Step } from "@myapp/core";
import { Button, Spin, Tag, toast } from "@/components/ui";
import { decide, decisionsOf, flush, useProposals } from "@/lib/proposals";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";

export const READ_TOOLS = ["find_records", "get_records", "money_totals", "my_overview", "app_guide"];

const KIND_ICON: Record<Kind, LucideIcon> = {
  todo: ListChecks,
  item: ShoppingCart,
  note: NotebookPen,
  clip: Bookmark,
  person: User,
  date: Cake,
  money: Wallet,
  event: CalendarDays,
  reminder: BellRing,
  car: Car,
  car_log: Fuel,
  thing: Package,
  project: Briefcase,
  client: Handshake,
  work_log: Timer,
  server: Server,
  domain: Globe,
  interest: Target,
  practice: Target,
  word: Languages,
  media: Clapperboard,
  wish: Gift,
  memory: Brain,
  fund: HandCoins,
};
const READ_ICON: Record<string, LucideIcon> = { find_records: Search, get_records: Search, money_totals: Calculator, my_overview: LayoutList, app_guide: BookOpen };

// one look at your records: a line, not a card
export function LookedUp({ step }: { step: Step }) {
  const { title, code } = describeStep(step);
  const Icon = READ_ICON[step.tool] || Search;
  const failed = step.status === "failed";
  return (
    <div className={clsx("flex items-center gap-2 px-1 text-[12.5px]", failed ? "text-danger" : "text-text3")} data-step={step.tool}>
      {step.status === "running" ? <Spin size={13} /> : <Icon size={13} />}
      <span className="truncate">{[title, code && code !== "everything" ? code : "", step.status === "running" ? "" : step.summary].filter(Boolean).join(" · ")}</span>
    </div>
  );
}

export function ProposalCard({ runId, step }: { runId: number; step: Step }) {
  const p = step.proposal!;
  const currency = useSettings((s) => s.currency);
  const pending = useProposals((s) => s.pending);
  const byId = useRecords((s) => s.byId);
  const decided = decisionsOf(runId, p, pending);
  const open = p.changes.map((_, i) => i).filter((i) => !decided[i]);

  // decisions made while offline (or before a restart) go to the server when the card shows again
  useEffect(() => {
    useProposals.getState().load();
    void flush(runId, p.id);
  }, [runId, p.id]);

  const run = (save: number[], skip: number[]) => {
    const r = decide(runId, p, save, skip);
    if (r.failed.length) toast(`Couldn't save: ${r.failed[0].why}`, { tone: "error" });
    else if (r.saved) toast.undo(r.saved === 1 ? "Saved" : `Saved ${r.saved} changes`, r.undo);
  };

  const why = typeof step.args?.why === "string" ? step.args.why : "";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={clsx("flex flex-col gap-2.5 rounded-[14px] p-3.5 glass", open.length ? "shadow-[inset_0_0_0_1px_var(--c-accent)]" : "hairline")}
      data-testid="proposal"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-accent-soft text-accent-text">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{open.length ? (p.changes.length === 1 ? "Save this?" : "Save these?") : "Your changes"}</div>
          {why && <div className="truncate text-[12px] text-text3">{why}</div>}
        </div>
        {open.length ? <Tag tone="accent">{open.length} to decide</Tag> : <Check size={16} className="text-success" />}
      </div>
      {p.changes.map((ch, i) => {
        const rec = ch.op === "create" ? null : byId[ch.id];
        const w = describeChange(ch, { currency, current: rec && !rec.deleted ? rec.data : null });
        const Icon = KIND_ICON[ch.kind] || Sparkles;
        const d = decided[i];
        const danger = ch.op === "remove";
        return (
          <div key={i} className={clsx("flex items-start gap-3 rounded-[11px] bg-surface2 p-3 hairline", d && !d.saved && "opacity-60")} data-change={i}>
            <Icon size={17} className={clsx("mt-0.5 shrink-0", danger ? "text-danger" : "text-accent-text")} />
            <div className="min-w-0 flex-1">
              <div className={clsx("text-[11.5px] font-medium", danger ? "text-danger" : "text-text3")}>{w.verb}</div>
              <div className={clsx("selectable text-[14px] font-semibold", danger && d?.saved && "line-through")}>{w.title}</div>
              {w.detail && <div className="selectable mt-0.5 line-clamp-3 text-[12.5px] text-text2">{w.detail}</div>}
              {d && (
                <div className={clsx("mt-1.5 flex items-center gap-1 text-[12px]", d.saved ? "text-success" : "text-text3")}>
                  {d.saved ? <Check size={13} /> : <X size={13} />} {d.saved ? (danger ? "Deleted" : "Saved") : "Skipped"}
                </div>
              )}
            </div>
            {!d && (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => run([], [i])}>
                  Skip
                </Button>
                <Button size="sm" variant={danger ? "danger" : "primary"} icon={danger ? undefined : Check} onClick={() => run([i], [])}>
                  {danger ? "Delete" : "Save"}
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {open.length > 1 && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => run([], open)}>
            Skip all
          </Button>
          <Button variant="primary" icon={Check} onClick={() => run(open, [])}>
            Save all {open.length}
          </Button>
        </div>
      )}
      {p.dropped.length > 0 && <p className="text-[12px] text-text3">{p.dropped.length === 1 ? "One more change couldn't be used." : `${p.dropped.length} more changes couldn't be used.`}</p>}
    </motion.div>
  );
}
