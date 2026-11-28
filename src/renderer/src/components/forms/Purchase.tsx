// Several things bought for one price (five vegetables for 1,000): tick them, type what it all
// cost, and it's saved once, in Money or on the hisaab whose money paid, with each item marked
// bought. Shows what it comes to before you save: how many, about how much each, and what's left of
// their money. Things bought without a price come first, ticked. The same as the phone's.
import { useMemo, useState } from "react";
import clsx from "clsx";
import { buyableItems, fundAfter, fundSummary, isoDate, itemLabel, itemsNote, perItem, purchaseCategory, sharedFund, type MoneyData } from "@myapp/core";
import { Checkbox, Chip, DatePicker, Field, Input, NumberInput, Segmented, Tag, toast } from "@/components/ui";
import { useList } from "@/store/records";
import { useSettings } from "@/store/settings";
import { buyTogether } from "@/lib/purchase";
import { suggestedPot, usePots } from "@/lib/pots";
import { ago, money } from "@/lib/format";
import { Form, FormFooter } from "./kit";
import { PotPicker } from "./PotEditors";

// what several things bought together usually are
const CATEGORIES = ["Groceries", "Shopping", "Home", "Food & dining", "Family", "Kids", "Health", "Other"];

// preset: { picked?: item ids to start ticked, fundId?: only that hisaab's items (from its page) }
export function PurchaseForm({ preset, close }: { preset?: Record<string, any>; close: () => void }) {
  const items = useList("item");
  const money$ = useList("money");
  const funds = useList("fund");
  const pots = usePots();
  const currency = useSettings((s) => s.currency);
  const scope: string | undefined = preset?.fundId || undefined;
  const today = isoDate();
  const list = useMemo(() => buyableItems(items, money$, { today, fundId: scope }), [items, money$, today, scope]);
  // ticked to start: what you asked for, or what was bought without a price
  const [picked, setPicked] = useState<string[]>(() => (Array.isArray(preset?.picked) && preset.picked.length ? preset.picked : list.filter((i) => i.data.done).map((i) => i.id)));
  const [amount, setAmount] = useState<number | null>(null);
  const [fundChoice, setFundChoice] = useState<string>(scope || "");
  const [fundTouched, setFundTouched] = useState(!!scope);
  const [account, setAccount] = useState<NonNullable<MoneyData["account"]>>("cash");
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [potId, setPotId] = useState<string | null>(null);
  const [potTouched, setPotTouched] = useState(false);

  const chosen = list.filter((i) => picked.includes(i.id));
  const value = amount && amount > 0 ? amount : 0;
  // whose money: what you picked, else the hisaab the ticked items are all marked for
  const fundShown = fundTouched ? fundChoice || null : sharedFund(chosen);
  const fund = fundShown ? funds.find((f) => f.id === fundShown) : undefined;
  const fundRows = funds.filter((f) => !f.data.closed || f.id === fundShown);
  const cur = fund?.data.currency || currency;
  const catShown = category || purchaseCategory(chosen);
  const noteShown = note.trim() || itemsNote(chosen);
  const suggested = !fund && pots.rows.length ? suggestedPot(noteShown, catShown) : null;
  const potShown = fund ? null : potTouched ? potId : suggested;
  const s = fund ? fundSummary(fund, money$, items) : null;
  const moving = chosen.filter((i) => (i.data.fund_id || null) !== (fund?.id || null)).length;
  const ok = chosen.length > 0 && value > 0;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.concat(id)));
  const allOn = list.length > 0 && list.every((i) => picked.includes(i.id));

  const save = () => {
    if (!ok) return;
    const r = buyTogether(
      chosen.map((i) => i.id),
      { amount: value, date, account, fundId: fund?.id || null, potId: potShown, category: catShown, note: note.trim() || undefined },
    );
    if (!r) return toast("Those have a price already");
    close();
    toast.undo(`${r.count === 1 ? "1 thing" : `${r.count} things`} for ${money(r.money.data.amount, cur)}${fund ? ` from ${fund.data.from}'s money` : ", in Money"}`, r.undo);
  };
  const summary = ok
    ? [`${chosen.length === 1 ? "1 thing" : `${chosen.length} things`} for ${money(value, cur)}`, chosen.length > 1 ? `about ${money(perItem(value, chosen.length), cur)} each` : "", fund && s ? `${fund.data.from}'s money: ${fundAfter(fund, s, value, currency)}` : ""]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          onSave={save}
          onCancel={close}
          saveLabel={ok ? `Save ${money(value, cur)} for ${chosen.length}` : "Save"}
          why={!chosen.length ? "Tick what you bought" : "Type what it all cost"}
          extra={summary ? <span className="text-[12px] text-text2" data-testid="purchase-summary">{summary}</span> : undefined}
        />
      }
    >
      <p className="text-[12.5px] text-text2">One price for everything you tick: it&apos;s saved once{fund ? `, on ${fund.data.from}'s hisaab` : " in Money"}, and each is marked bought.</p>
      <Field label="What it all cost">
        <NumberInput size="lg" value={amount} onChange={setAmount} placeholder="0" autoFocus aria-label="What it all cost" right={<span className="pointer-events-none mr-4 text-[13px] font-medium text-text3">{cur}</span>} />
      </Field>
      <Field label={`What you bought${chosen.length ? ` · ${chosen.length} ticked` : ""}`}>
        {list.length ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-end">
              <button type="button" className="text-[12px] text-accent-text hover:underline" onClick={() => setPicked(allOn ? [] : list.map((i) => i.id))}>
                {allOn ? "Untick all" : `Tick all ${list.length}`}
              </button>
            </div>
            <div className="flex max-h-[300px] flex-col overflow-y-auto rounded-[12px] bg-surface2 hairline" data-testid="purchase-items">
              {list.map((it, n) => {
                const on = picked.includes(it.id);
                const marked = it.data.fund_id ? funds.find((f) => f.id === it.data.fund_id) : undefined;
                const detail = [it.data.done ? `bought ${ago(it.data.done_at || it.updated_at)}, no price yet` : it.data.today && it.data.mode === "store" ? "on today's list" : it.data.mode === "online" ? "to order online" : "for a later shop", it.data.list === "shopping" ? "shopping" : ""]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={it.id} role="presentation" onClick={() => toggle(it.id)} className={clsx("flex cursor-pointer items-center gap-3 px-3 py-2", n > 0 && "border-t border-line", on ? "bg-accent-soft" : "hover:bg-hover")}>
                    <Checkbox checked={on} onChange={() => toggle(it.id)} label={itemLabel(it)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{itemLabel(it)}</div>
                      <div className="truncate text-[11.5px] text-text3">{detail}</div>
                    </div>
                    {marked && !scope && <Tag>{`${marked.data.from}'s`}</Tag>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-[12.5px] text-text3">Nothing on your list to price. Add what you bought to a list first, or note it in Money.</div>
        )}
      </Field>
      {fundRows.length > 0 && !scope && (
        <Field
          label="Whose money"
          hint={
            moving && fund
              ? `${moving === 1 ? "1 of these was" : `${moving} of these were`} not marked for ${fund.data.from}'s money: it goes on the hisaab too.`
              : moving && !fund
                ? `${moving === 1 ? "1 of these was" : `${moving} of these were`} marked for someone's money: paid with yours, it comes off their hisaab.`
                : undefined
          }
        >
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!fundShown} onClick={() => (setFundChoice(""), setFundTouched(true))}>
              Mine
            </Chip>
            {fundRows.map((f) => (
              <Chip key={f.id} active={fundShown === f.id} onClick={() => (setFundChoice(f.id), setFundTouched(true))}>
                {`${f.data.from}'s · ${f.data.purpose || "money"}`}
              </Chip>
            ))}
          </div>
        </Field>
      )}
      {!fund && (
        <Field label="Paid with">
          <Segmented<NonNullable<MoneyData["account"]>>
            block
            value={account}
            onChange={setAccount}
            options={[
              { value: "cash", label: "Cash" },
              { value: "bank", label: "Bank" },
              { value: "card", label: "Card" },
              { value: "wallet", label: "Wallet" },
            ]}
          />
        </Field>
      )}
      {!fund && pots.rows.length > 0 && (
        <Field label="Comes out of">
          <PotPicker rows={pots.rows} value={potShown} onChange={(id) => (setPotId(id), setPotTouched(true))} amount={value} suggested={potTouched ? null : suggested} currency={cur} />
        </Field>
      )}
      <Field label="Day">
        <DatePicker value={date} onChange={(v) => setDate(v || isoDate())} clearable={false} />
      </Field>
      <Field label="Category">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={catShown === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="What it was">
        <Input value={note} onChange={setNote} placeholder={chosen.length ? itemsNote(chosen, 3) : "Optional"} aria-label="What it was" />
      </Field>
    </Form>
  );
}
