// A nudge with what you can do about it: Done, Snooze 1 hour, Snooze till tomorrow, Dismiss, and
// Open the record it's about. One sits on Today (the most pressing); the assistant's page and the
// Nudges page list them. Each action can be undone. Seeing one marks it seen (once).
import { useEffect } from "react";
import clsx from "clsx";
import { ArrowRight, BellRing, Check, Clock, MessageCircleQuestion, MoreHorizontal, Sparkles, Sunrise, X, type LucideIcon } from "lucide-react";
import { isoDate, isoTime, NUDGE_CATEGORY_WORD, nudgeCategory, nudgeEndWord, type NudgeKind, type Rec } from "@myapp/core";
import { Button, Card, IconButton, Menu, toast } from "@/components/ui";
import { nudgeDismiss, nudgeDone, nudgeSeen, nudgeSnooze, openNudge, openTarget } from "@/lib/nudges";
import { dayWord, time12 } from "@/lib/format";

type Nudge = Rec<"nudge">;

export const NUDGE_ICON: Record<NudgeKind, LucideIcon> = { reminder: BellRing, question: MessageCircleQuestion, message: Sparkles };

export const nudgeLabel = (n: Nudge) => (n.data.created_by === "assistant" ? "From your assistant" : NUDGE_CATEGORY_WORD[nudgeCategory(n)].name);

// "Today at 6pm", "Snoozed till tomorrow at 9am"
export function whenWords(n: Nudge, today: string): string {
  const snoozed = n.data.status === "snoozed" && !!n.data.snooze_until;
  const d = new Date(snoozed ? (n.data.snooze_until as number) : n.data.due_at);
  const day = dayWord(isoDate(d), today);
  return `${snoozed ? "Snoozed till " : ""}${snoozed && /^(Today|Tomorrow)$/.test(day) ? day.toLowerCase() : day} at ${time12(isoTime(d))}`;
}

// what each button does, with Undo
export const act = {
  done: (n: Nudge) => toast.undo("Done", nudgeDone(n)),
  hour: (n: Nudge) => toast.undo("Snoozed for an hour", nudgeSnooze(n, "hour")),
  tomorrow: (n: Nudge) => toast.undo("Snoozed till tomorrow", nudgeSnooze(n, "tomorrow")),
  dismiss: (n: Nudge) => toast.undo("Dismissed", nudgeDismiss(n)),
};

// the card (Today, and the first one on the Nudges page)
export function NudgeCard({ nudge, more, onMore }: { nudge: Nudge; more?: number; onMore?: () => void }) {
  const Icon = NUDGE_ICON[nudge.data.kind] || BellRing;
  const target = openTarget(nudge);
  useEffect(() => {
    nudgeSeen(nudge);
  }, [nudge]);
  return (
    <Card className="relative overflow-hidden !p-4" data-testid="nudge-card" data-nudge={nudge.id}>
      <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-accent opacity-[0.14] blur-3xl" />
      <div className="relative flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent-text">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-text">{nudgeLabel(nudge)}</div>
          <div className="mt-0.5 text-[14.5px] font-semibold leading-snug" data-testid="nudge-text">
            {nudge.data.text}
          </div>
          {nudge.data.reason && <div className="mt-0.5 text-[12.5px] text-text3">{nudge.data.reason}</div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" icon={Check} onClick={() => act.done(nudge)} data-testid="nudge-done">
              Done
            </Button>
            <Button size="sm" icon={Clock} onClick={() => act.hour(nudge)} data-testid="nudge-hour">
              1 hour
            </Button>
            <Button size="sm" icon={Sunrise} onClick={() => act.tomorrow(nudge)} data-testid="nudge-tomorrow">
              Tomorrow
            </Button>
            {target && (
              <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => openNudge(nudge)} data-testid="nudge-open">
                Open
              </Button>
            )}
            {more ? (
              <button type="button" onClick={onMore} className="ml-auto text-[12.5px] font-medium text-accent-text hover:underline" data-testid="nudge-more">
                {more === 1 ? "1 more nudge" : `${more} more nudges`} →
              </button>
            ) : null}
          </div>
        </div>
        <IconButton icon={X} label="Dismiss" size="sm" onClick={() => act.dismiss(nudge)} />
      </div>
    </Card>
  );
}

// one line in a list, with its actions on hover and in a menu
export function NudgeRow({ nudge, today, past }: { nudge: Nudge; today: string; past?: boolean }) {
  const Icon = NUDGE_ICON[nudge.data.kind] || BellRing;
  const target = openTarget(nudge);
  const items = past
    ? target
      ? [{ label: "Open", icon: ArrowRight, onSelect: () => openNudge(nudge) }]
      : []
    : [
        { label: "Done", icon: Check, onSelect: () => act.done(nudge) },
        { label: "Snooze for an hour", icon: Clock, onSelect: () => act.hour(nudge) },
        { label: "Snooze till tomorrow", icon: Sunrise, onSelect: () => act.tomorrow(nudge) },
        ...(target ? [{ label: "Open", icon: ArrowRight, onSelect: () => openNudge(nudge) }] : []),
        { label: "Dismiss", icon: X, danger: true, onSelect: () => act.dismiss(nudge) },
      ];
  return (
    <div className="group flex items-center gap-3 border-b border-line py-2.5 last:border-0" data-nudge-row={nudge.id}>
      <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-[9px]", past ? "bg-surface2 text-text3 hairline" : "bg-accent-soft text-accent-text")}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={clsx("truncate text-[13.5px]", past && "text-text2")}>{nudge.data.text}</div>
        <div className="truncate text-[12px] text-text3">{[past ? nudgeEndWord(nudge) : whenWords(nudge, today), nudgeLabel(nudge)].join(" · ")}</div>
      </div>
      {!past && (
        <Button size="xs" variant="ghost" icon={Check} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => act.done(nudge)}>
          Done
        </Button>
      )}
      {items.length > 0 && <Menu items={items} trigger={(open) => <IconButton icon={MoreHorizontal} label={`What to do with “${nudge.data.text}”`} size="sm" onClick={open} />} />}
    </div>
  );
}
