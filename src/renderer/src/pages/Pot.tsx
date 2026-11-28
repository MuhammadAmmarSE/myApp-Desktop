// One pot: what's in it, how far along it is, what went in (from what you earned, or moved from
// elsewhere) and what came out (spending, or moved away). Add money to it, move money out, spend
// from it, cover it when it's gone over. Right-click a move to take it back.
import { useMemo } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { ArrowDownLeft, ArrowLeft, ArrowRightLeft, ArrowUpRight, Pencil, PiggyBank, RotateCcw, Sparkles, Trash2, Wallet } from "lucide-react";
import { isoDate, monthYearWord, potStanding, potSummary, POT_TYPE_META, ruleWords, type PotEntry, type Rec } from "@myapp/core";
import { Button, Card, CardTitle, Empty, IconButton, toast, useContextMenu } from "@/components/ui";
import { PotMark, PotMeter } from "@/components/forms/PotEditors";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { findMove, potVar, removePot, removePotMove } from "@/lib/pots";
import { usePageKeys } from "@/lib/keys";
import { navigate } from "@/lib/router";
import { dayWord, money } from "@/lib/format";
import { rise } from "@/theme/motion";

export default function Pot({ params }: { params: Record<string, string> }) {
  const pot = useRecords((s) => s.byId[params.id] as Rec<"pot"> | undefined);
  const pots = useList("pot");
  const money$ = useList("money");
  const currency = useSettings((s) => s.currency);
  const ctx = useContextMenu();
  const today = isoDate();
  const s = useMemo(() => (pot && !pot.deleted ? potSummary(pot, pots, money$, { today, currency }) : null), [pot, pots, money$, today, currency]);

  const addMoney = () => pot && s && edit("pot_move", null, { from: undefined, to: pot.id, suggested: s.over ? -s.balance : s.stillNeeded > 0 ? s.stillNeeded : undefined });
  const moveOut = () => pot && s && edit("pot_move", null, { from: pot.id, to: undefined, suggested: s.balance > 0 ? s.balance : undefined });
  const spend = () => pot && edit("money", null, { type: "expense", pot_id: pot.id });
  usePageKeys(
    (e) => {
      if (!pot || pot.deleted) return;
      const k = e.key.toLowerCase();
      if (k === "e") return (edit("pot", pot), true);
      if (k === "a") return (addMoney(), true);
      if (k === "m") return (moveOut(), true);
      if (k === "s") return (spend(), true);
      if (e.key === "Escape") return (navigate("/money"), true);
    },
    [pot, s],
  );

  if (!pot || pot.deleted || !s) {
    return (
      <div className="grid h-full place-items-center">
        <Empty icon={PiggyBank} title="This pot isn't here" body="It may have been deleted on another device." action={<Button onClick={() => navigate("/money")}>Back to Money</Button>} />
      </div>
    );
  }
  const p = pot.data;
  const cur = p.currency || currency;
  const meta = POT_TYPE_META[p.type] || POT_TYPE_META.spend;
  const fmt = (n: number) => money(n, cur);
  const nameOf = (other: string | null | undefined) => (other ? pots.find((x) => x.id === other)?.data.name || "a pot that's gone" : "money not in a pot");
  const remove = () => {
    const undo = removePot(pot);
    navigate("/money");
    toast.undo(`Deleted the pot ${p.name}. What went in and came out stays in Money.`, undo);
  };
  const figures: [string, string][] =
    p.type === "debt"
      ? [
          ["Paid off", fmt(s.paid)],
          [s.owed != null ? "Still owed" : "Set aside", fmt(s.owed != null ? s.owed : s.balance)],
        ]
      : p.type === "save"
        ? [
            ["Saved", fmt(Math.max(0, s.balance))],
            [p.target ? "Goal" : "In this month", fmt(p.target ? Number(p.target) : s.month.in)],
          ]
        : [
            ["In this month", fmt(s.month.in)],
            ["Spent this month", fmt(s.month.spent)],
          ];
  const ruleLine = [
    p.rule ? ruleWords(p.rule, cur) : "",
    s.stillNeeded > 0 && (p.type === "bills" || p.type === "spend") ? `still needs ${fmt(s.stillNeeded)} this month` : "",
    s.perMonth && p.target_date ? `${fmt(s.perMonth)} a month to get there by ${monthYearWord(p.target_date)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="h-full overflow-y-auto px-8 pb-24 pt-6" data-testid="pot">
      <div className="mx-auto max-w-[1100px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-center gap-3">
          <IconButton icon={ArrowLeft} label="Back to Money" kbd="Esc" onClick={() => navigate("/money")} />
          <PotMark pot={pot} size={38} />
          <div className="mr-auto min-w-0">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">
              {meta.name} pot{p.archived ? " · put away" : ""}
            </div>
            <h1 className="truncate font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]" data-testid="pot-title">
              {p.name}
            </h1>
          </div>
          <IconButton icon={Pencil} label="Edit the pot" kbd="E" onClick={() => edit("pot", pot)} />
          <IconButton icon={Trash2} label="Delete the pot" onClick={remove} />
        </motion.header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex min-w-0 flex-col gap-5">
            <motion.div {...rise(1)}>
              <Card strong className="relative overflow-hidden" data-testid="pot-standing">
                <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full opacity-20 blur-2xl" style={{ background: potVar(pot) }} />
                <div className="relative text-[12px] font-medium uppercase tracking-[0.06em] text-text3">{s.over ? "Over by" : p.type === "debt" ? "Set aside" : "In it now"}</div>
                <div className={clsx("relative mt-2 font-display text-[32px] font-semibold leading-none tracking-[-0.02em] tnum", s.over && "text-danger")} data-testid="pot-balance">
                  {fmt(Math.abs(s.balance))}
                </div>
                <PotMeter row={{ pot, summary: s }} className="relative mt-4 !h-2" />
                <div className="relative mt-3 text-[12.5px] text-text2">{potStanding(pot, s, currency)}</div>
                <div className="relative mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
                  {figures.map(([label, value]) => (
                    <div key={label} className="rounded-[10px] bg-surface2 p-3 hairline">
                      <div className="text-text3">{label}</div>
                      <div className="mt-0.5 font-semibold tnum">{value}</div>
                    </div>
                  ))}
                </div>
                {ruleLine && (
                  <div className="relative mt-3 flex items-start gap-2 text-[12.5px] text-text2">
                    <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: potVar(pot) }} />
                    <span>{ruleLine}</span>
                  </div>
                )}
                {p.notes && <div className="relative mt-3 text-[12.5px] text-text2">{p.notes}</div>}
                <div className="relative mt-4 flex flex-wrap gap-2">
                  {s.over && (
                    <Button size="sm" icon={ArrowDownLeft} onClick={addMoney}>
                      Cover it
                    </Button>
                  )}
                  <Button size="sm" variant={s.over ? "secondary" : "primary"} icon={ArrowDownLeft} onClick={addMoney} kbd="A">
                    Add money
                  </Button>
                  <Button size="sm" variant="secondary" icon={ArrowRightLeft} onClick={moveOut} kbd="M">
                    Move out
                  </Button>
                  <Button size="sm" variant="secondary" icon={ArrowUpRight} onClick={spend} kbd="S">
                    {p.type === "debt" ? "Pay from it" : "Spend from it"}
                  </Button>
                </div>
              </Card>
            </motion.div>
            <motion.p {...rise(2)} className="px-1 text-[12px] leading-[1.5] text-text3">
              A pot is part of your own money with a job. It keeps what&apos;s in it from month to month; your totals in Money stay the same.
            </motion.p>
          </div>

          <motion.div {...rise(2)} className="min-w-0">
            <Card>
              <CardTitle title="In and out" icon={ArrowRightLeft} sub={s.entries.length ? `${s.entries.length} ${s.entries.length === 1 ? "entry" : "entries"}` : undefined} />
              {s.entries.length ? (
                <div className="-mx-2 flex flex-col" data-testid="pot-entries">
                  {s.entries.map((e, i) => (
                    <EntryLine
                      key={`${e.type}-${e.date}-${i}`}
                      e={e}
                      pot={pot}
                      fmt={fmt}
                      nameOf={nameOf}
                      onContext={(ev, takeBack) =>
                        takeBack &&
                        ctx(ev, [
                          {
                            label: "Take it back",
                            icon: RotateCcw,
                            danger: true,
                            onSelect: takeBack,
                          },
                        ])
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="px-1 text-[12.5px] text-text3">Nothing yet. When you add what you earned, give some of it to {p.name}; or add money to it here.</div>
              )}
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function EntryLine({ e, pot, fmt, nameOf, onContext }: { e: PotEntry<Rec<"money">>; pot: Rec<"pot">; fmt: (n: number) => string; nameOf: (id: string | null | undefined) => string; onContext: (ev: React.MouseEvent, takeBack: (() => void) | null) => void }) {
  const into = e.type === "income" || e.type === "move_in" || e.type === "opening" || e.type === "refund";
  const moved = e.type === "move_in" || e.type === "move_out";
  const title = e.type === "income" ? e.note || "From what you earned" : e.type === "spend" ? e.note || "Spent" : e.type === "move_in" ? `From ${nameOf(e.other)}` : e.type === "move_out" ? `To ${nameOf(e.other)}` : "Already in it";
  const detail = [e.date ? dayWord(e.date) : "When you made the pot", e.type === "income" ? "earned" : moved ? "moved" : "", e.note && moved ? e.note : ""].filter(Boolean).join(" · ");
  const Icon = moved ? ArrowRightLeft : into ? ArrowDownLeft : e.type === "spend" ? ArrowUpRight : Wallet;
  const where = moved ? findMove(pot.id, e.other ?? null, e.amount, e.date, e.type === "move_in" ? "in" : "out") : null;
  const takeBack = where ? () => toast.undo(`Took back the move ${title.toLowerCase()}`, removePotMove(where.potId, where.index)) : null;
  const open = e.money ? () => edit("money", e.money as Rec<"money">) : null;
  return (
    <div
      className={clsx("group flex items-center gap-3 rounded-[10px] px-2 py-2", (open || takeBack) && "hover:bg-hover")}
      onContextMenu={(ev) => onContext(ev, takeBack)}
      data-pot-entry={e.type}
    >
      <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-[9px]", into ? "bg-[color-mix(in_srgb,var(--c-success)_15%,transparent)] text-success" : moved ? "bg-surface2 text-text3 hairline" : "bg-accent-soft text-accent-text")}>
        <Icon size={15} />
      </span>
      <button type="button" disabled={!open} onClick={open || undefined} className="min-w-0 flex-1 text-left disabled:cursor-default">
        <div className="truncate text-[13px]">{title}</div>
        <div className="truncate text-[11.5px] text-text3">{detail}</div>
      </button>
      {takeBack && (
        <button type="button" onClick={takeBack} className="rounded-md px-2 py-1 text-[11.5px] text-text3 opacity-0 transition-opacity hover:bg-surface2 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Take back: ${title}`}>
          Take back
        </button>
      )}
      <span className={clsx("whitespace-nowrap text-[13px] font-medium tnum", into ? "text-success" : "text-text")}>
        {into ? "+" : "−"}
        {fmt(e.amount)}
      </span>
    </div>
  );
}
