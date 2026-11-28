// One hisaab: money someone gave you to spend for them. What they gave, what you bought with it,
// what's still to buy, what's left with you (or what they owe you), each step that settled it, and
// the hisaab itself to copy and send them. Their money is never counted as your own spending.
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Check, Copy, HandCoins, History, Pencil, Plus, ReceiptText, RotateCcw, ShoppingBasket, Trash2, Undo2, UserRound, Wallet } from "lucide-react";
import { fundCandidates, fundSummary, hisaabText, isoDate, type FundMoveType, type Rec } from "@myapp/core";
import { Button, Card, CardTitle, Dialog, Empty, Field, IconButton, Input, NumberInput, Tag, toast, useContextMenu } from "@/components/ui";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { addMove, removeFund, removeMove, removeSpend, reopenIfOwed, takeOffFund } from "@/lib/funds";
import { FundAttachDialog } from "@/components/forms/FundAttach";
import { usePageKeys } from "@/lib/keys";
import { navigate } from "@/lib/router";
import { bridge } from "@/lib/bridge";
import { dayWord, money } from "@/lib/format";
import { rise } from "@/theme/motion";

// "today", "yesterday", or "on 23 Nov", for the middle of a sentence
const givenOn = (date: string) => {
  const w = dayWord(date);
  return /^(today|yesterday)$/i.test(w) ? w.toLowerCase() : `on ${w}`;
};

const STEP: Record<FundMoveType, { title: string; button: string; hint: (who: string) => string; word: string }> = {
  more: { title: "They gave more", button: "Add it", hint: (who) => `More money from ${who} for the same thing; it adds to what they gave.`, word: "They gave more" },
  returned: { title: "Give back what's left", button: "Given back", hint: (who) => `You hand it back to ${who}. It never was yours, so Money doesn't change.`, word: "Given back" },
  kept: { title: "Keep what's left", button: "Keep it", hint: (who) => `${who} let you keep it: it goes into Money as yours (earned, a gift).`, word: "Kept, in Money as yours" },
  paid_back: { title: "They paid you back", button: "Paid back", hint: (who) => `${who} gave you back the extra you spent. Your money, back with you.`, word: "Paid you back" },
  covered: { title: "Cover it yourself", button: "I'll cover it", hint: () => "The extra you spent becomes your own spending, in Money.", word: "Covered by you, in Money" },
};
const STEP_ICON: Record<FundMoveType, typeof Wallet> = { more: Plus, returned: Undo2, kept: ArrowDownLeft, paid_back: ArrowDownLeft, covered: ArrowUpRight };

export default function Fund({ params }: { params: Record<string, string> }) {
  const fund = useRecords((s) => s.byId[params.id] as Rec<"fund"> | undefined);
  const money$ = useList("money");
  const items = useList("item");
  const currency = useSettings((s) => s.currency);
  const ctx = useContextMenu();
  const [step, setStep] = useState<FundMoveType | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [toBuy, setToBuy] = useState("");
  const [attach, setAttach] = useState(false);
  const s = useMemo(() => (fund && !fund.deleted ? fundSummary(fund, money$, items) : null), [fund, money$, items]);
  // your own spending around when they gave it: some of it may have been with their money
  const already = useMemo(() => (fund && !fund.deleted && !fund.data.closed ? fundCandidates(fund, money$, { today: isoDate() }).length : 0), [fund, money$]);

  usePageKeys(
    (e) => {
      if (!fund || fund.deleted) return;
      const k = e.key.toLowerCase();
      if (k === "e") return (edit("fund", fund), true);
      if (k === "a") return (edit("money", null, { paid_from: fund.id, type: "expense", category: fund.data.purpose === "Medicine" ? "Health" : "Groceries" }), true);
      if (k === "p" && already) return (setAttach(true), true);
      if (e.key === "Escape") return (navigate("/money"), true);
    },
    [fund, already],
  );

  if (!fund || fund.deleted || !s) {
    return (
      <div className="grid h-full place-items-center">
        <Empty icon={HandCoins} title="This hisaab isn't here" body="It may have been deleted on another device." action={<Button onClick={() => navigate("/money")}>Back to Money</Button>} />
      </div>
    );
  }
  const f = fund.data;
  const cur = f.currency || currency;
  const who = f.from || "They";
  const fmt = (n: number) => money(n, cur);
  const spentShare = s.received > 0 ? Math.min(1, s.spent / s.received) : 0;
  // under the big number: what's been spent of it (the number itself says what's left or owed)
  const subline = f.closed
    ? `Nothing left with you, nothing owed: all square with ${who}.`
    : s.state === "over"
      ? `You spent ${fmt(s.spent)}, ${fmt(-s.left)} more than ${who} gave.`
      : `Spent ${fmt(s.spent)} of ${fmt(s.received)}${s.toBuy.length ? `, ${s.toBuy.length} still to buy` : ""}.`;
  const actions: { type: FundMoveType; primary?: boolean }[] = f.closed
    ? []
    : s.state === "holding"
      ? [{ type: "returned", primary: true }, { type: "kept" }, { type: "more" }]
      : s.state === "over"
        ? [{ type: "paid_back", primary: true }, { type: "covered" }, { type: "more" }]
        : [{ type: "more" }];

  const open = (t: FundMoveType) => {
    setStep(t);
    setAmount(t === "more" ? null : Math.abs(s.left) || null);
    setNote("");
  };
  const done = () => {
    if (!step || !amount || amount <= 0) return;
    const undo = addMove(fund.id, step, amount, note.trim());
    toast.undo(STEP[step].word, undo);
    setStep(null);
  };
  const addItems = () => {
    const names = toBuy
      .split(/,|\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!names.length) return;
    const st = useRecords.getState();
    for (const name of names) st.create("item", { name, list: "grocery", mode: "store", today: true, done: false, fund_id: fund.id });
    reopenIfOwed(fund.id);
    setToBuy("");
    toast.success(names.length > 1 ? `${names.length} things on today's list, with ${who}'s money` : `${names[0]} on today's list, with ${who}'s money`);
  };
  const copy = () => {
    bridge.clipboard.write(hisaabText(fund, s, { currency, today: isoDate(), items }));
    toast.success("Hisaab copied: paste it in a message to them");
  };
  const remove = () => {
    const undo = removeFund(fund);
    navigate("/money");
    toast.undo(`Deleted the hisaab from ${who}`, undo);
  };
  const buy = (it: Rec<"item">) => edit("item", it, { buying: true });

  return (
    <div className="h-full overflow-y-auto px-8 pb-24 pt-6" data-testid="fund">
      <div className="mx-auto max-w-[1100px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-center gap-3">
          <IconButton icon={ArrowLeft} label="Back to Money" kbd="Esc" onClick={() => navigate("/money")} />
          <div className="mr-auto">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">Money from {who} · hisaab</div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">{f.purpose || "Hisaab"}</h1>
          </div>
          <Button icon={Copy} onClick={copy} data-testid="copy-hisaab">
            Copy the hisaab
          </Button>
          <IconButton icon={Pencil} label="Edit the hisaab" kbd="E" onClick={() => edit("fund", fund)} />
          <IconButton icon={Trash2} label="Delete the hisaab" onClick={remove} />
        </motion.header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex min-w-0 flex-col gap-5">
            <motion.div {...rise(1)}>
              <Card strong className="relative overflow-hidden" data-testid="fund-standing">
                <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full accent-grad opacity-20 blur-2xl" />
                <div className="relative text-[12px] font-medium uppercase tracking-[0.06em] text-text3">
                  {f.closed ? `Settled ${f.closed_on ? dayWord(f.closed_on) : ""}`.trim() : s.state === "over" ? `${who} owes you` : s.state === "even" ? "All spent" : "Left with you"}
                </div>
                <div className={clsx("relative mt-2 font-display text-[32px] font-semibold leading-none tracking-[-0.02em] tnum", f.closed ? "text-success" : s.state === "over" && "text-danger")}>{f.closed ? "Settled" : fmt(Math.abs(s.left))}</div>
                <div className="relative mt-2 text-[12.5px] text-text2">{subline}</div>
                <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-surface2" aria-label={`Spent ${fmt(s.spent)} of ${fmt(s.received)}`}>
                  <div className={clsx("h-2 rounded-full", f.closed ? "bg-success" : s.state === "over" ? "bg-danger" : "accent-grad")} style={{ width: `${Math.max(spentShare ? 3 : 0, spentShare * 100)}%` }} />
                </div>
                <div className="relative mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
                  <div className="rounded-[10px] bg-surface2 p-3 hairline">
                    <div className="text-text3">They gave</div>
                    <div className="mt-0.5 font-semibold tnum">{fmt(s.received)}</div>
                  </div>
                  <div className="rounded-[10px] bg-surface2 p-3 hairline">
                    <div className="text-text3">You spent</div>
                    <div className="mt-0.5 font-semibold tnum">{fmt(s.spent)}</div>
                  </div>
                </div>
                {f.notes && <div className="relative mt-3 text-[12.5px] text-text2">{f.notes}</div>}
                {actions.length > 0 && (
                  <div className="relative mt-4 flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <Button key={a.type} size="sm" variant={a.primary ? "primary" : "secondary"} onClick={() => open(a.type)}>
                        {STEP[a.type].title}
                      </Button>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>

            <motion.div {...rise(2)}>
              <Card>
                <CardTitle
                  title="Still to buy"
                  icon={ShoppingBasket}
                  sub={s.toBuy.length ? `${s.toBuy.length} on the list` : undefined}
                  action={
                    s.toBuy.length + s.unpriced.length > 1 ? (
                      <Button size="xs" variant="ghost" icon={ReceiptText} onClick={() => edit("purchase", null, { fundId: fund.id, picked: s.unpriced.map((i) => i.id) })} data-testid="fund-one-price">
                        One price for several
                      </Button>
                    ) : undefined
                  }
                />
                <div className="mb-2 flex gap-2">
                  <div className="flex-1">
                    <Input value={toBuy} onChange={setToBuy} onKeyDown={(e) => e.key === "Enter" && addItems()} placeholder={`Something to buy with ${who}'s money (commas add several)`} aria-label="Something to buy" />
                  </div>
                  <Button icon={Plus} onClick={addItems} disabled={!toBuy.trim()}>
                    Add
                  </Button>
                </div>
                <div className="-mx-2 flex flex-col">
                  {[...s.toBuy, ...s.unpriced].map((it) => {
                    const unpriced = it.data.done;
                    return (
                      <div key={it.id} className="group flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-hover" data-tobuy={it.id}>
                        <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-[9px]", unpriced ? "bg-[color-mix(in_srgb,var(--c-warn)_15%,transparent)] text-warn" : "bg-surface2 text-text3 hairline")}>
                          {unpriced ? <Wallet size={15} /> : <ShoppingBasket size={15} />}
                        </span>
                        <button type="button" onClick={() => edit("item", it)} className="min-w-0 flex-1 text-left">
                          <div className="truncate text-[13px]">{it.data.qty ? `${it.data.name} (${it.data.qty})` : it.data.name}</div>
                          <div className="text-[11.5px] text-text3">{unpriced ? "Bought, price not noted yet" : it.data.today && it.data.mode === "store" ? "On today's list" : it.data.mode === "online" ? "To order online" : "For a later shop"}</div>
                        </button>
                        <Button size="xs" icon={Check} onClick={() => buy(it)}>
                          {unpriced ? "Add the price" : "Bought"}
                        </Button>
                      </div>
                    );
                  })}
                  {!s.toBuy.length && !s.unpriced.length && <div className="px-2 py-1 text-[12.5px] text-text3">Nothing waiting. Add what they asked you to bring.</div>}
                </div>
              </Card>
            </motion.div>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <motion.div {...rise(3)}>
              <Card pad={false}>
                <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                  <ShoppingBasket size={16} className="text-accent-text" />
                  <span className="mr-auto text-[14px] font-semibold">Bought with it</span>
                  <span className="text-[12px] text-text3 tnum">{s.spends.length}</span>
                  <Button size="xs" icon={Plus} kbd="A" data-testid="add-purchase" onClick={() => edit("money", null, { paid_from: fund.id, type: "expense", category: "Groceries" })}>
                    Add
                  </Button>
                </div>
                {s.spends.length ? (
                  <table className="w-full text-[13px]" data-testid="fund-spends">
                    <tbody>
                      {s.spends.map((m) => (
                        <tr
                          key={m.id}
                          className="border-t border-line/60 first:border-t-0 hover:bg-hover"
                          onClick={() => edit("money", m)}
                          onContextMenu={(e) =>
                            ctx(e, [
                              { label: "Edit", icon: Pencil, onSelect: () => edit("money", m) },
                              ...(m.data.type === "expense" ? [{ label: "Make it my own spending", icon: UserRound, onSelect: () => toast.undo(`${m.data.note || m.data.category} is your own spending again`, takeOffFund(m)) }] : []),
                              { type: "separator" },
                              { label: "Delete", icon: Trash2, danger: true, onSelect: () => toast.undo(`Deleted ${m.data.note || m.data.category}`, removeSpend(m)) },
                            ])
                          }
                        >
                          <td className="whitespace-nowrap px-4 py-2 text-text2">{dayWord(m.data.date)}</td>
                          <td className="max-w-[280px] truncate px-2 py-2">
                            {m.data.note || m.data.category}
                            {(() => {
                              const n = items.filter((i) => i.data.money_id === m.id).length;
                              return n > 1 ? <span className="ml-2 text-[11.5px] text-text3">{n} things from the list</span> : null;
                            })()}
                          </td>
                          <td className="px-2 py-2">
                            <Tag>{m.data.category}</Tag>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-right font-medium tnum">
                            {m.data.type === "income" ? "+" : "−"}
                            {money(m.data.amount, m.data.currency || cur)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty compact icon={ShoppingBasket} title="Nothing bought yet" body="Mark an item bought with its price, or add what you bought here." />
                )}
                {already > 0 && (
                  <div className="border-t border-line px-4 py-2.5">
                    <Button size="sm" variant="ghost" icon={History} kbd="P" onClick={() => setAttach(true)} data-testid="attach-open">
                      Put what you already bought on it
                    </Button>
                  </div>
                )}
              </Card>
            </motion.div>

            {(f.moves || []).length > 0 && (
              <motion.div {...rise(4)}>
                <Card>
                  <CardTitle title="Given and settled" icon={HandCoins} />
                  <div className="-mx-2 flex flex-col">
                    {(f.moves || []).map((m, i) => {
                      const Icon = STEP_ICON[m.type];
                      return (
                        <div key={`${i}-${m.date}`} className="group flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-hover" data-move={m.type}>
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-surface2 text-text2 hairline">
                            <Icon size={15} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px]">{STEP[m.type].word}</div>
                            <div className="text-[11.5px] text-text3">{[dayWord(m.date), m.note].filter(Boolean).join(" · ")}</div>
                          </div>
                          <span className="text-[13px] font-medium tnum">{fmt(m.amount)}</span>
                          <IconButton
                            icon={RotateCcw}
                            size="sm"
                            label="Take it back"
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => toast.undo(`Took back: ${STEP[m.type].word.toLowerCase()}`, removeMove(fund.id, i))}
                          />
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>
            )}
            <div className="text-center text-[12px] text-text3">Given {givenOn(f.date)}. What you spend of it isn&apos;t in your own spending; keeping what&apos;s left or covering the extra is.</div>
          </div>
        </div>
      </div>

      <FundAttachDialog open={attach} fund={fund} onClose={() => setAttach(false)} />
      <Dialog
        open={!!step}
        onClose={() => setStep(null)}
        title={step ? STEP[step].title : ""}
        description={step ? STEP[step].hint(who) : undefined}
        icon={HandCoins}
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStep(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={done} disabled={!amount || amount <= 0}>
              {step ? STEP[step].button : ""}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3" onKeyDown={(e) => e.key === "Enter" && done()}>
          <Field label="Amount">
            <NumberInput size="lg" value={amount} onChange={setAmount} placeholder="0" autoFocus aria-label="Amount" right={<span className="pointer-events-none mr-4 text-[13px] font-medium text-text3">{cur}</span>} />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={setNote} placeholder="Optional" />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
