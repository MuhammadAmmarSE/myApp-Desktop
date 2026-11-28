// Your money with one person: kept with them ("Abu has 150,000 of mine") or lent ("Ali owes you
// 30,000 of 50,000"). What's still with them, each step (took some back, paid back, gave more), and
// the whole of it to copy and send them. It's your money throughout: none of it is spending,
// except letting the rest of a loan go. Right-click a step to take it back.
import { useMemo } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { ArrowDownLeft, ArrowLeft, Banknote, Copy, HandHeart, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { isoDate, owedMoveWord, owedSummary, owedText, type OwedMove, type Rec } from "@myapp/core";
import { Button, Card, CardTitle, confirmDialog, Empty, IconButton, toast, useContextMenu } from "@/components/ui";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { owedStep, removeOwed, takeStepBack } from "@/lib/owed";
import { usePageKeys } from "@/lib/keys";
import { navigate } from "@/lib/router";
import { bridge } from "@/lib/bridge";
import { dayWord, money } from "@/lib/format";
import { rise } from "@/theme/motion";

const ACCOUNT_WORD: Record<string, string> = { cash: "cash", bank: "bank", card: "card", wallet: "wallet" };

export default function Owed({ params }: { params: Record<string, string> }) {
  const rec = useRecords((s) => s.byId[params.id] as unknown as Rec<"owed"> | undefined);
  const currency = useSettings((s) => s.currency);
  const ctx = useContextMenu();
  const today = isoDate();
  const s = useMemo(() => (rec && !rec.deleted ? owedSummary(rec, today) : null), [rec, today]);
  const back = () => rec && edit("owed_step", null, { id: rec.id, step: "back" });
  const more = () => rec && edit("owed_step", null, { id: rec.id, step: "more" });
  usePageKeys(
    (e) => {
      if (!rec || rec.deleted) return;
      const k = e.key.toLowerCase();
      if (k === "e") return (edit("owed", rec), true);
      if (k === "b" && !rec.data.closed) return (back(), true);
      if (k === "m") return (more(), true);
      if (e.key === "Escape") return (navigate("/money"), true);
    },
    [rec],
  );

  if (!rec || rec.deleted || !s) {
    return (
      <div className="grid h-full place-items-center">
        <Empty icon={Banknote} title="This isn't here" body="It may have been deleted on another device." action={<Button onClick={() => navigate("/money")}>Back to Money</Button>} />
      </div>
    );
  }
  const d = rec.data;
  const cur = d.currency || currency;
  const loan = d.type === "loan";
  const who = d.who || "They";
  const fmt = (n: number) => money(n, cur);
  const remove = () => {
    const undo = removeOwed(rec);
    navigate("/money");
    toast.undo(loan ? `Deleted the loan to ${who}` : `Deleted the money with ${who}`, undo);
  };
  const letGo = async () => {
    const ok = await confirmDialog({ title: "Let the rest go?", body: `${who} won't pay back ${fmt(s.left)}. It becomes your spending in Money (a gift), and this loan is settled.`, confirm: "Let it go", danger: true });
    if (!ok) return;
    toast.undo(`Let ${fmt(s.left)} go`, owedStep(rec.id, "forgave", s.left));
  };
  const copy = () => {
    bridge.clipboard.write(owedText(rec, currency, today));
    toast.success("Copied: paste it in a message to them");
  };
  const caption = d.closed
    ? loan
      ? s.forgiven
        ? `${fmt(s.back)} paid back, ${fmt(s.forgiven)} let go.`
        : `${who} paid back all ${fmt(s.given)}.`
      : `You took back all ${fmt(s.given)}.`
    : loan
      ? `${fmt(s.back)} paid back of ${fmt(s.given)}${d.due ? ` · ${s.overdue ? "was due" : "due"} ${dayWord(d.due)}` : ""}.`
      : `Of ${fmt(s.given)} you gave ${who} to keep${s.back ? `, you took back ${fmt(s.back)}` : ""}. Still yours: take from it whenever you need.`;

  return (
    <div className="h-full overflow-y-auto px-8 pb-24 pt-6" data-testid="owed">
      <div className="mx-auto max-w-[1100px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-center gap-3">
          <IconButton icon={ArrowLeft} label="Back to Money" kbd="Esc" onClick={() => navigate("/money")} />
          <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-text">
            <Banknote size={18} />
          </span>
          <div className="mr-auto min-w-0">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">{loan ? "Udhaar · money you lent" : "Amanat · your money, kept for you"}</div>
            <h1 className="truncate font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]" data-testid="owed-title">
              {loan ? `Lent to ${who}` : `With ${who}`}
            </h1>
          </div>
          <IconButton icon={Pencil} label="Edit" kbd="E" onClick={() => edit("owed", rec)} />
          <IconButton icon={Trash2} label="Delete" onClick={remove} />
        </motion.header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex min-w-0 flex-col gap-5">
            <motion.div {...rise(1)}>
              <Card strong className="relative overflow-hidden" data-testid="owed-standing">
                <div className="relative text-[12px] font-medium uppercase tracking-[0.06em] text-text3">{d.closed ? "Settled" : loan ? `${who} owes you` : `${who} has`}</div>
                <div className={clsx("relative mt-2 font-display text-[32px] font-semibold leading-none tracking-[-0.02em] tnum", d.closed ? "text-success" : s.overdue && "text-danger")} data-testid="owed-left">
                  {d.closed ? "Settled" : fmt(s.left)}
                </div>
                {loan && (
                  <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-surface2" role="meter" aria-valuenow={Math.round(s.part * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Paid back">
                    <div className={clsx("h-full rounded-full transition-[width] duration-300", d.closed ? "bg-success" : s.overdue ? "bg-danger" : "bg-accent")} style={{ width: `${Math.max(s.part ? 3 : 0, s.part * 100)}%` }} />
                  </div>
                )}
                <div className="relative mt-3 text-[12.5px] text-text2">{caption}</div>
                <div className="relative mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
                  <div className="rounded-[10px] bg-surface2 p-3 hairline">
                    <div className="text-text3">{loan ? "You lent" : "You gave"}</div>
                    <div className="mt-0.5 font-semibold tnum">{fmt(s.given)}</div>
                  </div>
                  <div className="rounded-[10px] bg-surface2 p-3 hairline">
                    <div className="text-text3">{loan ? "Paid back" : "Took back"}</div>
                    <div className="mt-0.5 font-semibold tnum">{fmt(s.back)}</div>
                  </div>
                </div>
                {d.notes && <div className="relative mt-3 text-[12.5px] text-text2">{d.notes}</div>}
                <div className="relative mt-4 flex flex-wrap gap-2">
                  {!d.closed && (
                    <Button size="sm" icon={ArrowDownLeft} onClick={back} kbd="B" data-testid="owed-back">
                      {owedMoveWord(d.type, "back")}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" icon={Plus} onClick={more} kbd="M" data-testid="owed-more">
                    {owedMoveWord(d.type, "more")}
                  </Button>
                  {loan && !d.closed && (
                    <Button size="sm" variant="secondary" icon={HandHeart} onClick={letGo} data-testid="owed-let-go">
                      Let the rest go
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" icon={Copy} onClick={copy} data-testid="owed-copy">
                    Copy to send them
                  </Button>
                </div>
              </Card>
            </motion.div>
            <motion.p {...rise(2)} className="px-1 text-[12px] leading-[1.5] text-text3">
              {loan ? "Lending isn't spending, and being paid back isn't income: your totals in Money don't change." : "It's still your money: your totals in Money don't change, and Money shows how much of it is with others."}
            </motion.p>
          </div>

          <motion.div {...rise(2)} className="min-w-0">
            <Card>
              <CardTitle title="What happened" icon={Banknote} sub={`${(d.moves || []).length + 1} ${(d.moves || []).length ? "entries" : "entry"}`} />
              <div className="-mx-2 flex flex-col" data-testid="owed-steps">
                <StepLine title={loan ? "Lent" : "Given to keep"} detail={[dayWord(d.date), d.account ? `from ${ACCOUNT_WORD[d.account]}` : ""].filter(Boolean).join(" · ")} amount={fmt(d.amount)} into={false} />
                {(d.moves || []).map((m, index) => {
                  const word = owedMoveWord(d.type, m.type);
                  const takeBack = () => toast.undo(`Removed the step: ${word.toLowerCase()} ${fmt(m.amount)}`, takeStepBack(rec.id, index));
                  return (
                    <StepLine
                      key={m.id || `${index}-${m.date}`}
                      move={m}
                      title={m.type === "forgave" ? "Let go (your spending, in Money)" : word}
                      detail={[dayWord(m.date), m.account ? `${m.type === "back" ? "to" : "from"} ${ACCOUNT_WORD[m.account]}` : "", m.note].filter(Boolean).join(" · ")}
                      amount={fmt(m.amount)}
                      into={m.type === "back"}
                      takeBack={takeBack}
                      onContext={(ev) => ctx(ev, [{ label: "Take it back", icon: RotateCcw, danger: true, onSelect: takeBack }])}
                    />
                  );
                })}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function StepLine({ move, title, detail, amount, into, takeBack, onContext }: { move?: OwedMove; title: string; detail: string; amount: string; into: boolean; takeBack?: () => void; onContext?: (ev: React.MouseEvent) => void }) {
  const Icon = !move ? Banknote : move.type === "back" ? ArrowDownLeft : move.type === "forgave" ? HandHeart : Plus;
  return (
    <div className={clsx("group flex items-center gap-3 rounded-[10px] px-2 py-2", takeBack && "hover:bg-hover")} onContextMenu={onContext} data-owed-step={move ? move.type : "start"}>
      <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-[9px]", into ? "bg-[color-mix(in_srgb,var(--c-success)_15%,transparent)] text-success" : "bg-accent-soft text-accent-text")}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">{title}</div>
        <div className="truncate text-[11.5px] text-text3">{detail}</div>
      </div>
      {takeBack && (
        <button type="button" onClick={takeBack} className="rounded-md px-2 py-1 text-[11.5px] text-text3 opacity-0 transition-opacity hover:bg-surface2 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Take back: ${title}`}>
          Take back
        </button>
      )}
      <span className={clsx("whitespace-nowrap text-[13px] font-medium tnum", into ? "text-success" : "text-text")}>{amount}</span>
    </div>
  );
}
