// The editor drawer: one place where any record is added or changed, from any page (and from
// Search, the tray and the menu). It slides in from the right and leaves the page in view.
import { useMemo, useState } from "react";
import { Banknote, Bell, Bookmark, Briefcase, Cake, CalendarDays, Car, CheckSquare, Clock, Gamepad2, Gift, Globe, HandCoins, Languages, Package, PiggyBank, ArrowRightLeft, ReceiptText, Server, ShoppingCart, Sparkles, Timer, UserRound, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";
import {
  groupNumber,
  addDays,
  CAR_PAPERS,
  CAR_SERVICES,
  daysBetween,
  EXPENSE_CATEGORIES,
  findPerson,
  INCOME_CATEGORIES,
  isoDate,
  PAPER_REMIND,
  RELATIONS,
  THING_CATEGORIES,
  toEpoch,
  WARRANTY_REMIND,
  type CarData,
  type CarLogData,
  type CarLogType,
  type DateData,
  type ItemData,
  type MoneyData,
  type PersonData,
  type Rec,
  type Relation,
  type Repeat,
  type ThingData,
} from "@myapp/core";
import { DatePicker, Drawer, Field, Input, NumberInput, Segmented, Select, Switch, Textarea, TimeField, toast, Chip, Button } from "@/components/ui";
import { useRecords, useList } from "@/store/records";
import { useSettings } from "@/store/settings";
import { useUI, type EditKind } from "@/store/ui";
import { removeCar, removeCarLog, saveCarLog } from "@/lib/car";
import { removeThing, saveThing, warrantyEnd } from "@/lib/things";
import { hhmm, money as fmtMoney, MONTHS_LONG } from "@/lib/format";
import { navigate } from "@/lib/router";
import { removeFund, reopenIfOwed } from "@/lib/funds";
import { setPurchaseFund } from "@/lib/purchase";
import { ChipRow, Form, FormFooter, RemindChips, Row2, TagsInput } from "./kit";
import { ClientForm, DomainForm, ProjectForm, ServerForm, WorkLogForm } from "./WorkEditors";
import { InterestForm, MediaForm, PracticeForm, WishForm, WordForm } from "./InterestEditors";
import { PurchaseForm } from "./Purchase";
import { OwedForm, OwedStepForm } from "./OwedEditors";
import { PotForm, PotMoveForm, PotPicker, SplitEditor, splitAsNumbers, splitFromNumbers, splitOverNumbers } from "./PotEditors";
import { autoSplit, suggestedPot, usePots } from "@/lib/pots";

type FormProps<K extends EditKind> = { rec: Rec<any> | null; preset?: Record<string, any>; close: () => void; kind?: K };

const META: Record<EditKind, { icon: LucideIcon; add: string; edit: string; tone?: string }> = {
  todo: { icon: CheckSquare, add: "New to-do", edit: "Edit to-do" },
  item: { icon: ShoppingCart, add: "Add to a list", edit: "Edit item" },
  money: { icon: Wallet, add: "Money out", edit: "Edit entry" },
  event: { icon: CalendarDays, add: "New event", edit: "Edit event", tone: "var(--c-info)" },
  reminder: { icon: Bell, add: "New reminder", edit: "Edit reminder", tone: "var(--c-warn)" },
  clip: { icon: Bookmark, add: "Save text for later", edit: "Edit saved text" },
  date: { icon: Cake, add: "New date", edit: "Edit date" },
  person: { icon: UserRound, add: "Add a person", edit: "Edit person" },
  thing: { icon: Package, add: "Add something you own", edit: "Edit" },
  car: { icon: Car, add: "Add your car", edit: "Edit car" },
  car_log: { icon: Wrench, add: "Add to the car's log", edit: "Edit log entry" },
  project: { icon: Briefcase, add: "New project", edit: "Edit project" },
  client: { icon: Users, add: "New client", edit: "Edit client" },
  work_log: { icon: Clock, add: "Log time", edit: "Edit time" },
  server: { icon: Server, add: "Add a server", edit: "Edit server" },
  domain: { icon: Globe, add: "Add a domain", edit: "Edit domain" },
  interest: { icon: Sparkles, add: "New interest", edit: "Edit interest" },
  practice: { icon: Timer, add: "Log practice", edit: "Edit practice" },
  word: { icon: Languages, add: "Add a word", edit: "Edit word" },
  media: { icon: Gamepad2, add: "Add a game, book or show", edit: "Edit" },
  wish: { icon: Gift, add: "Add to your wishlist", edit: "Edit wish" },
  fund: { icon: HandCoins, add: "Money given to you to spend", edit: "Edit the hisaab" },
  pot: { icon: PiggyBank, add: "A new pot", edit: "Edit the pot" },
  pot_move: { icon: ArrowRightLeft, add: "Move money", edit: "Move money" },
  purchase: { icon: ReceiptText, add: "Bought together", edit: "Bought together" },
  owed: { icon: Banknote, add: "Your money with someone", edit: "Edit" },
  owed_step: { icon: Banknote, add: "A step", edit: "A step" },
};

const undoToast = (text: string, rec: Rec) => toast.undo(text, () => useRecords.getState().restore(rec));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------- to-do ----------------
function TodoForm({ rec, preset, close }: FormProps<"todo">) {
  const d = rec?.data || {};
  const [title, setTitle] = useState<string>(d.title ?? preset?.title ?? "");
  const [notes, setNotes] = useState<string>(d.notes ?? "");
  const [due, setDue] = useState<string | null>(rec ? (d.due ?? null) : (preset?.due ?? null));
  const [time, setTime] = useState<string | null>(d.time ?? preset?.time ?? null);
  const [high, setHigh] = useState(d.priority === "high");
  const [repeat, setRepeat] = useState<Repeat>(d.repeat ?? null);
  const [tags, setTags] = useState<string[]>(d.tags ?? []);
  const [done, setDone] = useState<boolean>(!!d.done);
  const today = isoDate();
  const ok = !!title.trim();
  const save = () => {
    if (!ok) return;
    const data = { title: title.trim(), notes: notes.trim() || undefined, due, time: due ? time : null, priority: high ? ("high" as const) : ("normal" as const), repeat: due ? repeat : null, tags, done, done_at: done ? (d.done_at ?? Date.now()) : null };
    if (rec) useRecords.getState().update<"todo">(rec.id, data);
    else useRecords.getState().create("todo", data);
    toast.success(rec ? "To-do saved" : "To-do added");
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          onSave={save}
          onCancel={close}
          onDelete={
            rec
              ? () => {
                  useRecords.getState().remove(rec.id);
                  undoToast("To-do deleted", rec);
                  close();
                }
              : undefined
          }
          extra={rec ? <Switch checked={done} onChange={setDone} label="Done" visible /> : undefined}
        />
      }
    >
      <Input size="lg" value={title} onChange={setTitle} placeholder="What needs doing?" autoFocus aria-label="Title" />
      <Field label="When">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[
            ["No date", null],
            ["Today", today],
            ["Tomorrow", addDays(today, 1)],
            ["In a week", addDays(today, 7)],
          ].map(([l, v]) => (
            <Chip key={String(l)} active={due === v} onClick={() => setDue(v)}>
              {l}
            </Chip>
          ))}
        </div>
        <Row2>
          <DatePicker value={due} onChange={setDue} />
          <TimeField value={time} onChange={setTime} placeholder={due ? "Add a time" : "Pick a day first"} />
        </Row2>
      </Field>
      {due && time && <p className="-mt-2 text-[12px] text-text3">A reminder rings at {time} on that day.</p>}
      {due && (
        <Field label="Repeats">
          <Segmented<string>
            value={repeat || "never"}
            onChange={(v) => setRepeat(v === "never" ? null : (v as Repeat))}
            options={[
              { value: "never", label: "Never" },
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        </Field>
      )}
      <Field label="Priority">
        <Segmented<string>
          value={high ? "high" : "normal"}
          onChange={(v) => setHigh(v === "high")}
          options={[
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ]}
        />
      </Field>
      <Field label="Tags">
        <TagsInput value={tags} onChange={setTags} placeholder="work, home…" />
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={setNotes} placeholder="Anything to remember about it" minRows={3} />
      </Field>
    </Form>
  );
}

// ---------------- list item ----------------
type Where = "today" | "later" | "online";
const whereOf = (d?: Partial<ItemData>): Where => (d?.mode === "online" ? "online" : d?.today === false ? "later" : "today");
function ItemForm({ rec, preset, close }: FormProps<"item">) {
  const d: Partial<ItemData> = rec?.data || preset || {};
  const currency = useSettings((s) => s.currency);
  const [name, setName] = useState(d.name || "");
  const [qty, setQty] = useState(d.qty || "");
  const [list, setList] = useState<ItemData["list"]>(d.list || "grocery");
  const [where, setWhere] = useState<Where>(whereOf(d));
  const [link, setLink] = useState(d.link || "");
  const [note, setNote] = useState(d.note || "");
  const [regular, setRegular] = useState(!!d.regular);
  const [paid, setPaid] = useState<number | null>(d.price ?? null);
  // whose money it's bought with: yours, or a hisaab's (then its cost comes off theirs)
  const funds = useList("fund");
  const [fundId, setFundId] = useState<string>(d.fund_id || "");
  const fund = fundId ? funds.find((f) => f.id === fundId) : undefined;
  const fundChoices = funds.filter((f) => !f.data.closed || f.id === fundId);
  // opened to mark it bought: the price comes first
  const buying = !!preset?.buying;
  // its purchase, if it's still in Money (one deleted there leaves it without a price), and how many
  // things were bought together in it
  const allItems = useList("item");
  const allMoney = useList("money");
  const purchase = rec?.data.money_id ? allMoney.find((m) => m.id === rec.data.money_id) : undefined;
  const together = purchase ? allItems.filter((i) => i.data.money_id === purchase.id).length : 0;
  const linked = !!purchase;
  const ok = !!name.trim();
  const save = () => {
    if (!ok) return;
    const s = useRecords.getState();
    let money_id = linked ? rec?.data.money_id ?? null : null;
    const price = paid && paid > 0 && !(together > 1) ? paid : null;
    if (price && !money_id)
      money_id = s.create("money", {
        type: "expense",
        amount: price,
        currency: fund?.data.currency || currency,
        category: list === "grocery" ? "Groceries" : "Shopping",
        note: qty.trim() ? `${name.trim()} (${qty.trim()})` : name.trim(),
        date: isoDate(),
        account: "cash",
        ...(fund ? { paid_from: fund.id } : {}),
      }).id;
    // moved to (or off) someone's money: its cost moves with it, and everything bought together in it
    else if (money_id && (rec?.data.fund_id || "") !== fundId) setPurchaseFund(money_id, fundId || null);
    const done = !!price || buying;
    const data: Partial<ItemData> = {
      name: name.trim(),
      qty: qty.trim() || undefined,
      list,
      mode: where === "online" ? "online" : "store",
      today: where === "today",
      link: where === "online" ? link.trim() || undefined : undefined,
      note: note.trim() || undefined,
      regular,
      price,
      money_id,
      fund_id: fundId || null,
      ...(done ? { done: true, done_at: rec?.data.done_at || Date.now() } : {}),
    };
    if (rec) s.update<"item">(rec.id, data);
    else s.create("item", { ...(data as ItemData), done: data.done ?? false });
    if (fundId) reopenIfOwed(fundId);
    if (rec?.data.fund_id && rec.data.fund_id !== fundId) reopenIfOwed(rec.data.fund_id);
    toast.success(
      price && !linked
        ? fund
          ? `Bought with ${fund.data.from}'s money`
          : "Bought, and added to Money"
        : buying
          ? `Bought. Add its price later to put it on ${fund ? `${fund.data.from}'s hisaab` : "Money"}.`
          : rec
            ? "Saved"
            : "Added to the list",
    );
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          onSave={save}
          onCancel={close}
          onDelete={
            rec
              ? () => {
                  useRecords.getState().remove(rec.id);
                  undoToast("Removed from the list", rec);
                  close();
                }
              : undefined
          }
        />
      }
    >
      {buying && (
        <Field label={`What did ${name || "it"} cost?`} hint={fund ? `It comes off ${fund.data.from}'s hisaab, not your spending. Leave it empty to add the price later.` : "Leave it empty to add the price later."}>
          <NumberInput size="lg" value={paid} onChange={setPaid} placeholder="0" autoFocus disabled={linked} aria-label="Price paid" />
          {!linked && rec && (
            <button type="button" className="mt-2 text-[12.5px] text-accent-text hover:underline" onClick={() => useUI.getState().edit("purchase", null, { picked: [rec.id] })}>
              Bought it with other things? One price for all
            </button>
          )}
        </Field>
      )}
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Input size="lg" value={name} onChange={setName} placeholder="Item" autoFocus={!buying} aria-label="Item" />
        <Input size="lg" value={qty} onChange={setQty} placeholder="Qty" aria-label="Quantity" />
      </div>
      <Field label="List">
        <Segmented<ItemData["list"]>
          block
          value={list}
          onChange={setList}
          options={[
            { value: "grocery", label: "Grocery" },
            { value: "shopping", label: "Shopping" },
          ]}
        />
      </Field>
      <Field label="Where">
        <Segmented<Where>
          block
          value={where}
          onChange={setWhere}
          options={[
            { value: "today", label: "Buy today" },
            { value: "later", label: "In a shop, later" },
            { value: "online", label: "Order online" },
          ]}
        />
      </Field>
      {where === "online" && (
        <Field label="Link to the product">
          <Input value={link} onChange={setLink} placeholder="https://…" type="url" />
        </Field>
      )}
      <Field label="Note">
        <Input value={note} onChange={setNote} placeholder="Brand, size, which shop…" />
      </Field>
      <div className="flex items-center justify-between rounded-[12px] bg-surface2 px-3.5 py-3 hairline">
        <div>
          <div className="text-[13px] font-medium">I buy this often</div>
          <div className="text-[12px] text-text3">Regulars stay in the Regulars list, to add again in one click.</div>
        </div>
        <Switch checked={regular} onChange={setRegular} label="Regular" />
      </div>
      {fundChoices.length > 0 && (
        <Field label="Whose money" hint={fund ? `Bought with ${fund.data.from}'s money: its cost comes off their hisaab, not your spending.` : undefined}>
          <Select<string> value={fundId} onChange={setFundId} options={[{ value: "", label: "Mine" }, ...fundChoices.map((f) => ({ value: f.id, label: `${f.data.from}'s · ${f.data.purpose || "money"}` }))]} />
        </Field>
      )}
      {!buying && (
        <Field
          label="Bought it? What it cost"
          hint={
            together > 1 && purchase
              ? `Bought together with ${together - 1 === 1 ? "1 other" : `${together - 1} others`} for ${fmtMoney(purchase.data.amount, purchase.data.currency)}, ${rec?.data.fund_id ? "on the hisaab" : "in Money"}.${fundChoices.length ? " Whose money changes for all of them." : ""}`
              : linked
                ? rec?.data.fund_id
                  ? "Already on the hisaab."
                  : "Already in Money."
                : fund
                  ? `Saving a price marks it bought and puts it on ${fund.data.from}'s hisaab.`
                  : `Saving a price marks it bought and adds it to Money (${currency}).`
          }
        >
          <NumberInput value={paid} onChange={setPaid} placeholder="0" disabled={linked} aria-label="Price paid" />
        </Field>
      )}
    </Form>
  );
}

// ---------------- money ----------------
function MoneyForm({ rec, preset, close }: FormProps<"money">) {
  const currency = useSettings((s) => s.currency);
  const d: Partial<MoneyData> = rec?.data || {};
  const [type, setType] = useState<MoneyData["type"]>(d.type || preset?.type || "expense");
  const [amount, setAmount] = useState<number | null>(d.amount ?? preset?.amount ?? null);
  const [category, setCategory] = useState(d.category || preset?.category || "");
  const [note, setNote] = useState(d.note || preset?.note || "");
  const [date, setDate] = useState<string>(d.date || preset?.date || isoDate());
  const [account, setAccount] = useState<NonNullable<MoneyData["account"]>>(d.account || "cash");
  const [monthly, setMonthly] = useState(d.recurring === "monthly");
  // a purchase out of money someone gave you: it goes on their hisaab, not in your spending
  const fundId: string | undefined = d.paid_from || preset?.paid_from || undefined;
  const fund = useRecords((s) => (fundId ? (s.byId[fundId] as Rec<"fund"> | undefined) : undefined));
  const cats: readonly string[] = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const cur = d.currency || currency;
  // pots: the pot spending comes out of, and how an income is split (by pot id); "touched" once you
  // pick yourself, until then a new expense shows the pot you used before and a new income your rules
  const pots = usePots();
  const presetPot: string | null = preset?.pot_id || null;
  const [potId, setPotId] = useState<string | null>(rec ? d.pot_id || null : presetPot);
  const [potTouched, setPotTouched] = useState(!!rec || !!presetPot);
  const [split, setSplit] = useState<Record<string, number | null>>(splitAsNumbers(d.split));
  const [splitTouched, setSplitTouched] = useState(!!rec);
  const value = Number(amount) || 0;
  const potsHere = !fundId && pots.rows.length > 0;
  const hasRules = pots.rows.some((r) => !!r.pot.data.rule);
  const suggested = useMemo(() => (potsHere && type === "expense" && !rec ? suggestedPot(note, category) : null), [potsHere, type, note, category, rec]);
  const potShown = potTouched ? potId : type === "expense" ? suggested : null;
  const auto = useMemo(() => (!splitTouched && type === "income" && hasRules && value > 0 ? splitAsNumbers(autoSplit(value, rec?.id)) : null), [splitTouched, type, hasRules, value, rec?.id]);
  const splitShown = auto || split;
  const splitRows = useMemo(() => pots.rows.concat(pots.away.filter((r) => splitShown[r.pot.id])), [pots, splitShown]);
  const tooMuch = type === "income" && potsHere && splitOverNumbers(splitRows, splitShown, value);
  const ok = !!amount && amount > 0 && !!category && !tooMuch;
  const why = !amount || amount <= 0 ? "Type an amount" : !category ? "Pick a category" : tooMuch ? "The pots get more than came in" : "";
  const save = () => {
    if (!ok) return;
    const total = Math.round(amount! * 100) / 100;
    const data: MoneyData = { type, amount: total, currency: cur, category, note: note.trim() || undefined, date, account, recurring: monthly && !fundId ? "monthly" : null };
    if (!fundId) {
      // an edit clears what no longer applies (spending isn't split; income doesn't come out of a pot)
      data.pot_id = type === "expense" && potShown && pots.byId.has(potShown) ? potShown : undefined;
      const sp = type === "income" ? splitFromNumbers(splitRows, splitShown, total) : [];
      data.split = sp.length ? sp : undefined;
    }
    if (rec) useRecords.getState().update<"money">(rec.id, data);
    else useRecords.getState().create("money", fundId ? { ...data, currency: fund?.data.currency || cur, paid_from: fundId } : data);
    if (fundId) reopenIfOwed(fundId);
    toast.success(fund ? `${fmtMoney(data.amount, cur)} on ${fund.data.from}'s hisaab` : `${type === "income" ? "Earned" : "Spent"} ${fmtMoney(data.amount, cur)} saved`);
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          why={why}
          onSave={save}
          onCancel={close}
          onDelete={
            rec
              ? () => {
                  useRecords.getState().remove(rec.id);
                  undoToast("Entry deleted", rec);
                  close();
                }
              : undefined
          }
        />
      }
    >
      {fund ? (
        <div className="rounded-[12px] bg-surface2 px-3.5 py-2.5 text-[12.5px] text-text2 hairline">
          Bought with {fund.data.from}&apos;s money ({fund.data.purpose || "money"}): it comes off their hisaab, not your spending.
        </div>
      ) : (
        <Segmented<MoneyData["type"]>
          block
          value={type}
          onChange={(t) => {
            setType(t);
            setCategory("");
          }}
          options={[
            { value: "expense", label: "Spent" },
            { value: "income", label: "Earned" },
          ]}
        />
      )}
      <div className="relative">
        <NumberInput size="lg" value={amount} onChange={setAmount} placeholder="0" autoFocus aria-label="Amount" className="!text-[22px] font-display font-semibold tnum" boxClassName="!h-14" right={<span className="pointer-events-none mr-4 text-[13px] font-medium text-text3">{cur}</span>} />
      </div>
      <Field label="Category">
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label={fund ? "What you bought" : "What for"}>
        <Input value={note} onChange={setNote} placeholder={fund ? "e.g. Rice and oil" : "Optional"} />
      </Field>
      {potsHere && type === "expense" && (
        <Field label="Comes out of">
          <PotPicker
            rows={pots.rows.concat(pots.away.filter((r) => r.pot.id === potShown))}
            value={potShown}
            onChange={(id) => (setPotId(id), setPotTouched(true))}
            amount={value > 0 ? value - (rec && d.pot_id === potShown && d.type === "expense" ? Number(d.amount) || 0 : 0) : 0}
            suggested={potTouched ? null : suggested}
            currency={cur}
          />
        </Field>
      )}
      {potsHere && type === "income" && (
        <Field label="Give it jobs" hint={hasRules && !splitTouched && !rec ? "Split by your pots' rules. Change any amount to make it your own." : undefined}>
          <SplitEditor
            rows={splitRows}
            total={value}
            split={splitShown}
            onChange={(next) => (setSplit(next), setSplitTouched(true))}
            onRules={() => (setSplit(splitAsNumbers(value > 0 ? autoSplit(value, rec?.id) : [])), setSplitTouched(true))}
            hasRules={hasRules}
            currency={cur}
          />
        </Field>
      )}
      {!fundId && !pots.rows.length && type === "income" && !rec && (
        <div className="text-[12px] text-text3">
          Tip: make pots on the Money page (Personal, Bills, a loan, savings) and split what you earn between them.
        </div>
      )}
      <Row2>
        <Field label="Day">
          <DatePicker value={date} onChange={(v) => setDate(v || isoDate())} clearable={false} />
        </Field>
        <Field label={type === "income" ? "Into" : "Paid with"}>
          <Select<NonNullable<MoneyData["account"]>>
            value={account}
            onChange={setAccount}
            options={(["cash", "bank", "card", "wallet"] as const).map((a) => ({ value: a, label: cap(a) }))}
          />
        </Field>
      </Row2>
      {!fund && (
        <div className="flex items-center justify-between rounded-[12px] bg-surface2 px-3.5 py-3 hairline">
          <div>
            <div className="text-[13px] font-medium">Every month</div>
            <div className="text-[12px] text-text3">Bills and salary: marked monthly, so you can see what's fixed.</div>
          </div>
          <Switch checked={monthly} onChange={setMonthly} label="Monthly" />
        </div>
      )}
    </Form>
  );
}

// ---------------- money given to you to spend (a hisaab) ----------------
const PURPOSES = ["Groceries", "Medicine", "Bills", "Shopping", "Household"];
function FundForm({ rec, close }: FormProps<"fund">) {
  const currency = useSettings((s) => s.currency);
  const peopleRecs = useList("person");
  const people = peopleRecs.map((p) => ({ id: p.id, name: p.data.name, relation: p.data.relation }));
  const d = rec?.data || {};
  const [amount, setAmount] = useState<number | null>(d.amount ?? null);
  const [from, setFrom] = useState<string>(d.from || "");
  const [purpose, setPurpose] = useState<string>(d.purpose || "");
  const [date, setDate] = useState<string>(d.date || isoDate());
  const [notes, setNotes] = useState<string>(d.notes || "");
  const cur = d.currency || currency;
  const ok = !!amount && amount > 0 && !!from.trim();
  const why = !amount || amount <= 0 ? "How much did they give?" : !from.trim() ? "Who gave it?" : "";
  const save = () => {
    if (!ok) return;
    const person = findPerson(people, from.trim());
    const data = { from: from.trim(), person_id: person ? person.id : null, purpose: purpose.trim() || "Shopping", amount: Math.round(amount! * 100) / 100, date, notes: notes.trim() || undefined };
    const s = useRecords.getState();
    if (rec) {
      s.update<"fund">(rec.id, data);
      toast.success("Saved");
    } else {
      const made = s.create("fund", { ...data, currency, moves: [], closed: false });
      toast.success(`Started the hisaab: ${fmtMoney(data.amount, currency)} from ${data.from}`);
      navigate(`/funds/${made.id}`);
    }
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          why={why}
          onSave={save}
          onCancel={close}
          saveLabel={rec ? "Save" : "Start the hisaab"}
          onDelete={
            rec
              ? () => {
                  const undo = removeFund(rec);
                  toast.undo(`Deleted the hisaab from ${rec.data.from}`, undo);
                  navigate("/money");
                  close();
                }
              : undefined
          }
        />
      }
    >
      {!rec && <div className="text-[12.5px] text-text2">For money someone gives you to buy things for them. What you spend of it stays out of your own spending, and the hisaab keeps what&apos;s left.</div>}
      <NumberInput
        size="lg"
        value={amount}
        onChange={setAmount}
        placeholder="0"
        autoFocus
        aria-label="How much they gave"
        className="!text-[22px] font-display font-semibold tnum"
        boxClassName="!h-14"
        right={<span className="pointer-events-none mr-4 text-[13px] font-medium text-text3">{cur}</span>}
      />
      <Field label="Who gave it">
        <Input value={from} onChange={setFrom} placeholder="e.g. Mother" aria-label="Who gave it" />
        {people.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {people
              .filter((p) => p.relation !== "me")
              .slice(0, 10)
              .map((p) => (
                <Chip key={p.id} active={from.trim().toLowerCase() === p.name.toLowerCase()} onClick={() => setFrom(p.name)}>
                  {p.name}
                </Chip>
              ))}
          </div>
        )}
      </Field>
      <Field label="What for">
        <div className="flex flex-wrap gap-1.5">
          {PURPOSES.map((p) => (
            <Chip key={p} active={purpose === p} onClick={() => setPurpose(p)}>
              {p}
            </Chip>
          ))}
        </div>
        <Input className="mt-2" value={PURPOSES.includes(purpose) ? "" : purpose} onChange={setPurpose} placeholder="Or say what (optional)" aria-label="What for" />
      </Field>
      <Field label="Given on">
        <DatePicker value={date} onChange={(v) => setDate(v || isoDate())} clearable={false} />
      </Field>
      <Field label="Note">
        <Textarea value={notes} onChange={setNotes} placeholder="Optional" rows={2} />
      </Field>
    </Form>
  );
}

// ---------------- event ----------------
const BEFORE = [
  { value: -1, label: "No reminder" },
  { value: 0, label: "When it starts" },
  { value: 10, label: "10 min before" },
  { value: 30, label: "30 min before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "A day before" },
];
function EventForm({ rec, preset, close }: FormProps<"event">) {
  const d = rec?.data || {};
  const people = useList("person");
  const [title, setTitle] = useState(d.title ?? preset?.title ?? "");
  const [date, setDate] = useState<string>(d.date || preset?.date || isoDate());
  const [time, setTime] = useState<string | null>(d.time ?? preset?.time ?? null);
  const [place, setPlace] = useState(d.place || "");
  const [note, setNote] = useState(d.note || "");
  const [person, setPerson] = useState<string | null>(d.person_id ?? null);
  const [remind, setRemind] = useState<number>(d.remind_min == null ? (rec ? -1 : 30) : d.remind_min);
  const ok = !!title.trim() && !!date;
  const why = !title.trim() ? "Give it a name" : !date ? "Pick a day" : "";
  const save = () => {
    if (!ok) return;
    const data = { title: title.trim(), date, time, place: place.trim() || undefined, note: note.trim() || undefined, person_id: person, remind_min: time && remind >= 0 ? remind : null };
    if (rec) useRecords.getState().update<"event">(rec.id, data);
    else useRecords.getState().create("event", data);
    toast.success(rec ? "Event saved" : "Event added");
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          why={why}
          onSave={save}
          onCancel={close}
          onDelete={
            rec
              ? () => {
                  useRecords.getState().remove(rec.id);
                  undoToast("Event deleted", rec);
                  close();
                }
              : undefined
          }
        />
      }
    >
      <Input size="lg" value={title} onChange={setTitle} placeholder="What's happening?" autoFocus aria-label="Title" />
      <Row2>
        <Field label="Day">
          <DatePicker value={date} onChange={(v) => setDate(v || isoDate())} clearable={false} />
        </Field>
        <Field label="Time">
          <TimeField value={time} onChange={setTime} placeholder="All day" />
        </Field>
      </Row2>
      {time && (
        <Field label="Remind me">
          <Select<number> value={remind} onChange={setRemind} options={BEFORE} />
        </Field>
      )}
      <Field label="Where">
        <Input value={place} onChange={setPlace} placeholder="Optional" />
      </Field>
      {people.length > 0 && (
        <Field label="With">
          <Select<string | null> value={person} onChange={setPerson} searchable options={[{ value: null, label: "No one in particular" }, ...people.map((p) => ({ value: p.id as string | null, label: p.data.name }))]} />
        </Field>
      )}
      <Field label="Note">
        <Textarea value={note} onChange={setNote} placeholder="Optional" minRows={2} />
      </Field>
    </Form>
  );
}

// ---------------- reminder ----------------
function ReminderForm({ rec, preset, close }: FormProps<"reminder">) {
  const at0 = rec?.data.at ? new Date(rec.data.at) : preset?.at ? new Date(preset.at) : new Date(Date.now() + 3600000);
  const [text, setText] = useState<string>(rec?.data.text ?? preset?.text ?? "");
  const [date, setDate] = useState<string>(isoDate(at0));
  const [time, setTime] = useState<string | null>(hhmm(new Date(Math.ceil(at0.getTime() / 300000) * 300000)));
  const [done, setDone] = useState<boolean>(!!rec?.data.done);
  const at = time ? toEpoch(date, time) : NaN;
  const past = at < Date.now();
  const ok = !!text.trim() && !!time;
  const why = !text.trim() ? "Say what to remind you of" : !time ? "Pick a time" : "";
  const save = () => {
    if (!ok) return;
    const data = { text: text.trim(), at, done, done_at: done ? (rec?.data.done_at ?? Date.now()) : null };
    if (rec) useRecords.getState().update<"reminder">(rec.id, data);
    else useRecords.getState().create("reminder", data);
    toast.success(rec ? "Reminder saved" : "Reminder set");
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          why={why}
          onSave={save}
          onCancel={close}
          onDelete={
            rec
              ? () => {
                  useRecords.getState().remove(rec.id);
                  undoToast("Reminder deleted", rec);
                  close();
                }
              : undefined
          }
          extra={rec ? <Switch checked={done} onChange={setDone} label="Done" visible /> : undefined}
        />
      }
    >
      <Input size="lg" value={text} onChange={setText} placeholder="Remind me to…" autoFocus aria-label="Reminder" />
      <Row2>
        <Field label="Day">
          <DatePicker value={date} onChange={(v) => setDate(v || isoDate())} clearable={false} />
        </Field>
        <Field label="Time">
          <TimeField value={time} onChange={setTime} />
        </Field>
      </Row2>
      <div className="flex flex-wrap gap-1.5">
        {[
          ["In 1 hour", 60],
          ["In 3 hours", 180],
          ["Tonight", -1],
          ["Tomorrow morning", -2],
        ].map(([l, m]) => (
          <Chip
            key={String(l)}
            onClick={() => {
              const n = new Date();
              let t: Date;
              if (m === -1) t = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 20, 0);
              else if (m === -2) t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 9, 0);
              else t = new Date(Math.ceil((n.getTime() + (m as number) * 60000) / 300000) * 300000);
              setDate(isoDate(t));
              setTime(hhmm(t));
            }}
          >
            {l}
          </Chip>
        ))}
      </div>
      {time && past && !done && <p className="text-[12.5px] text-warn">That time has passed, so it won't ring.</p>}
    </Form>
  );
}

// ---------------- saved text ----------------
function ClipForm({ rec, preset, close }: FormProps<"clip">) {
  const d = rec?.data || {};
  const [text, setText] = useState<string>(d.text ?? preset?.text ?? "");
  const [title, setTitle] = useState<string>(d.title ?? "");
  const [tags, setTags] = useState<string[]>(d.tags ?? []);
  const [pinned, setPinned] = useState<boolean>(!!d.pinned);
  const ok = !!text.trim();
  const save = () => {
    if (!ok) return;
    const data = { title: title.trim() || undefined, text: text.trim(), tags, pinned };
    if (rec) useRecords.getState().update<"clip">(rec.id, data);
    else useRecords.getState().create("clip", { ...data, uses: 0 });
    toast.success("Saved");
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          onSave={save}
          onCancel={close}
          onDelete={
            rec
              ? () => {
                  useRecords.getState().remove(rec.id);
                  undoToast("Deleted", rec);
                  close();
                }
              : undefined
          }
        />
      }
    >
      <Field label="Text">
        <Textarea value={text} onChange={setText} placeholder="Paste or type the text: an address, an account number, a command, a reply…" minRows={5} autoFocus className="font-mono !text-[13px]" />
      </Field>
      <Field label="Name it">
        <Input value={title} onChange={setTitle} placeholder="Optional, e.g. Bank account" />
      </Field>
      <Field label="Tags">
        <TagsInput value={tags} onChange={setTags} placeholder="bank, home, work" />
      </Field>
      <div className="flex items-center justify-between rounded-[12px] bg-surface2 px-3.5 py-3 hairline">
        <div className="text-[13px] font-medium">Pin to the top</div>
        <Switch checked={pinned} onChange={setPinned} label="Pinned" />
      </div>
    </Form>
  );
}

// ---------------- date (birthday, anniversary) ----------------
const KIND_LABEL: Record<DateData["kind"], string> = { birthday: "Birthday", anniversary: "Anniversary", other: "Other" };
function DateForm({ rec, preset, close }: FormProps<"date">) {
  const people = useList("person");
  const d: Partial<DateData> = rec?.data || preset || {};
  const [kind, setKind] = useState<DateData["kind"]>(d.kind || "birthday");
  const [title, setTitle] = useState(d.title || "");
  const [touched, setTouched] = useState(!!d.title);
  const [personId, setPersonId] = useState<string | null>(d.person_id ?? null);
  const [month, setMonth] = useState<number | null>(d.month ?? null);
  const [day, setDay] = useState<number | null>(d.day ?? null);
  const [year, setYear] = useState<number | null>(d.year ?? null);
  const [remind, setRemind] = useState<number[]>(d.remind || [7, 1, 0]);
  const person = people.find((p) => p.id === personId);
  const suggested = person ? (person.data.relation === "me" ? `My ${KIND_LABEL[kind].toLowerCase()}` : `${person.data.name}'s ${KIND_LABEL[kind].toLowerCase()}`) : KIND_LABEL[kind];
  const shown = touched ? title : suggested;
  const maxDay = month ? new Date(2024, month, 0).getDate() : 31;
  const ok = !!month && !!day && day <= maxDay && !!shown.trim();
  const why = !month || !day ? "Pick the month and day" : day > maxDay ? "That month is shorter" : !shown.trim() ? "Give it a name" : "";
  const save = () => {
    if (!ok) return;
    const data: DateData = { title: shown.trim(), kind, month: month!, day: day!, year: year && year >= 1900 && year <= 2200 ? year : null, person_id: personId, remind: [...remind].sort((a, b) => b - a) };
    if (rec) useRecords.getState().update<"date">(rec.id, data);
    else useRecords.getState().create("date", data);
    toast.success("Date saved");
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          why={why}
          onSave={save}
          onCancel={close}
          onDelete={
            rec
              ? () => {
                  useRecords.getState().remove(rec.id);
                  undoToast("Date deleted", rec);
                  close();
                }
              : undefined
          }
        />
      }
    >
      <Segmented<DateData["kind"]> block value={kind} onChange={setKind} options={(Object.keys(KIND_LABEL) as DateData["kind"][]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      {people.length > 0 && (
        <Field label="Whose">
          <Select<string | null> value={personId} onChange={setPersonId} searchable options={[{ value: null, label: "No one" }, ...people.map((p) => ({ value: p.id as string | null, label: p.data.relation === "me" ? `${p.data.name} (me)` : p.data.name }))]} />
        </Field>
      )}
      <Field label="Name">
        <Input
          value={shown}
          onChange={(v) => {
            setTouched(true);
            setTitle(v);
          }}
          placeholder="e.g. Mum's birthday"
        />
      </Field>
      <div className="grid grid-cols-[1.4fr_0.8fr_1fr] gap-3">
        <Field label="Month">
          <Select<number | null> value={month} onChange={setMonth} placeholder="Month" options={MONTHS_LONG.map((m, i) => ({ value: (i + 1) as number | null, label: m }))} />
        </Field>
        <Field label="Day">
          <Select<number | null> value={day} onChange={setDay} placeholder="Day" options={Array.from({ length: maxDay }, (_, i) => ({ value: (i + 1) as number | null, label: String(i + 1) }))} />
        </Field>
        <Field label="Year" hint="For the age">
          <NumberInput plain value={year} onChange={(v) => setYear(v == null ? null : Math.round(v))} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Remind me">
        <RemindChips value={remind} onChange={setRemind} options={[{ n: 30, label: "A month before" }, { n: 7, label: "A week before" }, { n: 1, label: "The day before" }, { n: 0, label: "On the day" }]} />
      </Field>
    </Form>
  );
}

// ---------------- person ----------------
const REL_LABEL: Record<Relation, string> = { me: "Me", wife: "Wife", husband: "Husband", son: "Son", daughter: "Daughter", parent: "Parent", sibling: "Brother / sister", family: "Family", friend: "Friend", work: "Work", other: "Other" };
export const relationLabel = (r: Relation) => REL_LABEL[r] || "Other";
function PersonForm({ rec, preset, close }: FormProps<"person">) {
  const d: Partial<PersonData> = rec?.data || preset || {};
  const [name, setName] = useState(d.name || "");
  const [relation, setRelation] = useState<Relation>(d.relation || "family");
  const [phone, setPhone] = useState(d.phone || "");
  const [notes, setNotes] = useState(d.notes || "");
  const [details, setDetails] = useState<{ label: string; value: string }[]>(d.details?.length ? d.details : []);
  const ok = !!name.trim();
  const save = () => {
    if (!ok) return;
    const data: PersonData = { name: name.trim(), relation, phone: phone.trim() || undefined, notes: notes.trim() || undefined, details: details.filter((x) => x.label.trim() && x.value.trim()) };
    if (rec) useRecords.getState().update<"person">(rec.id, data);
    else useRecords.getState().create("person", data);
    toast.success(`${data.name} saved`);
    close();
  };
  const setDetail = (i: number, k: "label" | "value", v: string) => setDetails((ds) => ds.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          onSave={save}
          onCancel={close}
          onDelete={
            rec
              ? () => {
                  useRecords.getState().remove(rec.id);
                  undoToast(`${rec.data.name} removed`, rec);
                  close();
                }
              : undefined
          }
        />
      }
    >
      <Input size="lg" value={name} onChange={setName} placeholder="Name" autoFocus aria-label="Name" />
      <Row2>
        <Field label="Who they are">
          <Select<Relation> value={relation} onChange={setRelation} options={RELATIONS.map((r) => ({ value: r, label: REL_LABEL[r] }))} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={setPhone} placeholder="Optional" type="tel" />
        </Field>
      </Row2>
      <Field label="Things to remember" hint="Sizes, favourite things, gift ideas, allergies…">
        <div className="flex flex-col gap-2">
          {details.map((x, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input value={x.label} onChange={(v) => setDetail(i, "label", v)} placeholder="e.g. Ring size" aria-label="Detail name" clearable={false} />
              <Input value={x.value} onChange={(v) => setDetail(i, "value", v)} placeholder="e.g. 6" aria-label="Detail value" clearable={false} />
              <Button variant="ghost" size="md" onClick={() => setDetails((ds) => ds.filter((_, j) => j !== i))} aria-label="Remove detail">
                ×
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setDetails((ds) => [...ds, { label: "", value: "" }])} className="self-start">
            + Add a detail
          </Button>
        </div>
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={setNotes} placeholder="Optional" minRows={3} />
      </Field>
    </Form>
  );
}

// ---------------- my things ----------------
type Cover = "none" | 6 | 12 | 24 | 36 | "date";
function ThingForm({ rec, close }: FormProps<"thing">) {
  const currency = useSettings((s) => s.currency);
  const d: Partial<ThingData> = rec?.data || {};
  const [name, setName] = useState(d.name || "");
  const [category, setCategory] = useState<string>(d.category || "Electronics");
  const [brand, setBrand] = useState(d.brand || "");
  const [price, setPrice] = useState<number | null>(d.price ?? null);
  const [moneyChoice, setMoneyChoice] = useState<boolean | null>(rec ? !!d.money_id : null);
  const [bought, setBought] = useState<string | null>(rec ? (d.bought_on ?? null) : isoDate());
  const [shop, setShop] = useState(d.shop || "");
  const months = d.warranty_until && d.bought_on ? ([6, 12, 24, 36] as const).find((n) => warrantyEnd(d.bought_on!, n) === d.warranty_until) : undefined;
  const [cover, setCover] = useState<Cover>(!d.warranty_until ? "none" : months || "date");
  const [until, setUntil] = useState<string | null>(d.warranty_until ?? null);
  const [remind, setRemind] = useState<number[]>(d.remind || WARRANTY_REMIND);
  const [serial, setSerial] = useState(d.serial || "");
  const [receipt, setReceipt] = useState(d.receipt_no || "");
  const [notes, setNotes] = useState(d.notes || "");
  const [gone, setGone] = useState(!!d.gone);
  const end = cover === "none" ? null : cover === "date" ? until : warrantyEnd(bought || isoDate(), cover);
  const recent = !bought || daysBetween(bought, isoDate()) <= 31;
  const inMoney = moneyChoice ?? recent;
  const ok = !!name.trim() && (cover !== "date" || !!until);
  const why = !name.trim() ? "Say what it is" : cover === "date" && !until ? "Pick when the warranty ends" : "";
  const save = () => {
    if (!ok) return;
    const data: ThingData = { ...(rec?.data || {}), name: name.trim(), category, brand: brand.trim() || undefined, serial: serial.trim() || undefined, bought_on: bought, price: price && price > 0 ? price : null, shop: shop.trim() || undefined, receipt_no: receipt.trim() || undefined, warranty_until: end, remind: end ? remind : undefined, notes: notes.trim() || undefined, gone: gone || undefined };
    saveThing(rec || null, data, inMoney && !!price);
    toast.success(!rec && inMoney && price ? "Saved, and added to Money" : "Saved");
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          why={why}
          onSave={save}
          onCancel={close}
          onDelete={
            rec
              ? () => {
                  const undo = removeThing(rec);
                  toast.undo(`${rec.data.name} removed`, undo);
                  close();
                }
              : undefined
          }
        />
      }
    >
      <Input size="lg" value={name} onChange={setName} placeholder="What is it? e.g. Washing machine" autoFocus aria-label="Name" />
      <Row2>
        <Field label="Kind">
          <Select<string> value={category} onChange={setCategory} options={THING_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Brand and model">
          <Input value={brand} onChange={setBrand} placeholder="Optional" />
        </Field>
      </Row2>
      <Row2>
        <Field label="Bought on">
          <DatePicker value={bought} onChange={setBought} placeholder="Not sure" />
        </Field>
        <Field label="Where">
          <Input value={shop} onChange={setShop} placeholder="Shop or website" />
        </Field>
      </Row2>
      <Field label={`Price (${currency})`}>
        <NumberInput value={price} onChange={setPrice} placeholder="Optional" />
      </Field>
      {!!price && (
        <div className="flex items-center justify-between rounded-[12px] bg-surface2 px-3.5 py-3 hairline">
          <div>
            <div className="text-[13px] font-medium">Also in Money</div>
            <div className="text-[12px] text-text3">{recent ? "Saved as an expense on the day you bought it." : "Bought a while ago: usually left out of Money."}</div>
          </div>
          <Switch checked={inMoney} onChange={setMoneyChoice} label="In Money" />
        </div>
      )}
      <Field label="Warranty">
        <ChipRow<Cover>
          value={cover}
          onChange={setCover}
          options={[
            { value: "none", label: "None" },
            { value: 6, label: "6 months" },
            { value: 12, label: "1 year" },
            { value: 24, label: "2 years" },
            { value: 36, label: "3 years" },
            { value: "date", label: "Until a day…" },
          ]}
        />
      </Field>
      {cover === "date" && <DatePicker value={until} onChange={setUntil} placeholder="The warranty's last day" />}
      {end && (
        <Field label={`Covered until ${end}. Remind me`}>
          <RemindChips value={remind} onChange={setRemind} options={[{ n: 30, label: "A month before" }, { n: 7, label: "A week before" }, { n: 1, label: "The day before" }]} />
        </Field>
      )}
      <Row2>
        <Field label="Serial number">
          <Input value={serial} onChange={setSerial} placeholder="Optional" className="font-mono" />
        </Field>
        <Field label="Receipt number">
          <Input value={receipt} onChange={setReceipt} placeholder="Optional" className="font-mono" />
        </Field>
      </Row2>
      <Field label="Notes">
        <Textarea value={notes} onChange={setNotes} placeholder="Optional" minRows={2} />
      </Field>
      {rec && (
        <div className="flex items-center justify-between rounded-[12px] bg-surface2 px-3.5 py-3 hairline">
          <div>
            <div className="text-[13px] font-medium">No longer have it</div>
            <div className="text-[12px] text-text3">Sold, given away or thrown out: kept for the record, out of the way.</div>
          </div>
          <Switch checked={gone} onChange={setGone} label="Gone" />
        </div>
      )}
    </Form>
  );
}

// ---------------- car ----------------
const FUELS: { value: NonNullable<CarData["fuel"]>; label: string }[] = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "hybrid", label: "Hybrid" },
  { value: "cng", label: "CNG" },
  { value: "electric", label: "Electric" },
];
function CarForm({ rec, close }: FormProps<"car">) {
  const d: Partial<CarData> = rec?.data || {};
  const [name, setName] = useState(d.name || "");
  const [plate, setPlate] = useState(d.plate || "");
  const [model, setModel] = useState(d.model || "");
  const [fuel, setFuel] = useState<CarData["fuel"]>(d.fuel || "petrol");
  const [odo, setOdo] = useState<number | null>(d.odometer ?? null);
  const ok = !!name.trim();
  const save = () => {
    if (!ok) return;
    const data: CarData = { ...(rec?.data || {}), name: name.trim(), plate: plate.trim().toUpperCase() || undefined, model: model.trim() || undefined, fuel, odometer: odo ? Math.round(odo) : undefined };
    if (rec) useRecords.getState().update<"car">(rec.id, data);
    else useRecords.getState().create("car", data);
    toast.success(`${data.name} saved`);
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          onSave={save}
          onCancel={close}
          deleteLabel="Remove"
          onDelete={
            rec
              ? () => {
                  const undo = removeCar(rec);
                  toast.undo(`Removed ${rec.data.name}`, undo);
                  close();
                }
              : undefined
          }
        />
      }
    >
      <Input size="lg" value={name} onChange={setName} placeholder="What you call it, e.g. Corolla" autoFocus aria-label="Car name" />
      <Row2>
        <Field label="Number plate">
          <Input value={plate} onChange={setPlate} placeholder="Optional" className="uppercase" />
        </Field>
        <Field label="Make, model and year">
          <Input value={model} onChange={setModel} placeholder="Optional" />
        </Field>
      </Row2>
      <Field label="Fuel">
        <Segmented<NonNullable<CarData["fuel"]>> block value={fuel || "petrol"} onChange={setFuel} options={FUELS} />
      </Field>
      <Field label="On the clock now (km)" hint="Fill-ups and services move it on as you go.">
        <NumberInput value={odo} onChange={setOdo} placeholder="Optional" />
      </Field>
    </Form>
  );
}

// ---------------- car log ----------------
function CarLogForm({ rec, preset, close }: FormProps<"car_log">) {
  const cars = useList("car");
  const currency = useSettings((s) => s.currency);
  const renew: Rec<"car_log"> | null = preset?.renew || null;
  const d: Partial<CarLogData> = rec?.data || {};
  const r = !rec && renew ? renew.data : null;
  const [carId, setCarId] = useState<string | null>(d.car_id || preset?.car_id || r?.car_id || cars[0]?.id || null);
  const [type, setType] = useState<CarLogType>((d.type as CarLogType) || preset?.type || "fuel");
  const [date, setDate] = useState<string>(d.date || isoDate());
  const [amount, setAmount] = useState<number | null>(d.amount ?? null);
  const [litres, setLitres] = useState<number | null>(d.litres ?? null);
  const [odo, setOdo] = useState<number | null>(d.odometer ?? null);
  const [full, setFull] = useState(d.full !== false);
  const [title, setTitle] = useState<string>(d.title || r?.title || preset?.title || (type === "paper" ? "Insurance" : type === "service" ? "Oil change" : ""));
  const [number, setNumber] = useState(d.number || r?.number || "");
  const [notes, setNotes] = useState(d.notes || "");
  const yearOn = r?.next_date && r.next_date > isoDate() ? addDays(r.next_date, 365) : addDays(isoDate(), 365);
  const [nextDate, setNextDate] = useState<string | null>(d.next_date ?? (type === "paper" ? yearOn : null));
  const [nextKm, setNextKm] = useState<number | null>(d.next_km ?? null);
  const [remind, setRemind] = useState<number[]>(d.remind || r?.remind || PAPER_REMIND);
  const car = cars.find((c) => c.id === carId) || null;
  const ok = !!car && (type === "fuel" ? !!(amount || litres) : type === "service" ? !!title.trim() : !!title.trim() && !!nextDate);
  const why = !car ? "Pick the car" : type === "fuel" && !(amount || litres) ? "Type the cost or the litres" : type !== "fuel" && !title.trim() ? "Say what it was" : type === "paper" && !nextDate ? "Pick when it expires" : "";
  const switchType = (t: CarLogType) => {
    setType(t);
    setTitle(t === "paper" ? "Insurance" : t === "service" ? "Oil change" : "");
    setNextDate(t === "paper" ? yearOn : null);
  };
  const save = () => {
    if (!ok || !car) return;
    const data: CarLogData = {
      ...(rec?.data || {}),
      car_id: car.id,
      type,
      date,
      amount: amount && amount > 0 ? amount : null,
      odometer: odo ? Math.round(odo) : null,
      litres: type === "fuel" ? litres : null,
      full: type === "fuel" ? full : undefined,
      title: type === "fuel" ? undefined : title.trim(),
      number: type === "paper" ? number.trim() || undefined : undefined,
      notes: notes.trim() || undefined,
      next_date: type === "fuel" ? null : nextDate,
      next_km: type === "service" ? (nextKm ? Math.round(nextKm) : null) : null,
      remind: type === "paper" ? remind : undefined,
    };
    saveCarLog(rec || null, data, car.data.name);
    if (odo && odo > (car.data.odometer || 0)) useRecords.getState().update<"car">(car.id, { odometer: Math.round(odo) });
    toast.success(!rec && amount ? (type === "fuel" ? "Fill-up saved, and added to Money" : "Saved, and added to Money") : "Saved");
    close();
  };
  return (
    <Form
      footer={
        <FormFooter
          ok={ok}
          why={why}
          onSave={save}
          onCancel={close}
          deleteLabel="Remove"
          onDelete={
            rec
              ? () => {
                  const undo = removeCarLog(rec);
                  toast.undo("Removed", undo);
                  close();
                }
              : undefined
          }
        />
      }
    >
      {!rec && (
        <Segmented<CarLogType>
          block
          value={type}
          onChange={switchType}
          options={[
            { value: "fuel", label: "Fuel" },
            { value: "service", label: "Service" },
            { value: "paper", label: "Papers" },
          ]}
        />
      )}
      {cars.length > 1 && (
        <Field label="Car">
          <Select<string | null> value={carId} onChange={setCarId} options={cars.map((c) => ({ value: c.id as string | null, label: c.data.name }))} />
        </Field>
      )}
      {!car && <p className="text-[13px] text-warn">Add your car first.</p>}
      {type !== "fuel" && (
        <Field label={type === "paper" ? "Which paper" : "What was done"}>
          <Select<string> value={title} onChange={setTitle} options={(type === "paper" ? CAR_PAPERS : CAR_SERVICES).map((x): { value: string; label: string } => ({ value: x, label: x })).concat(title && !(type === "paper" ? (CAR_PAPERS as readonly string[]) : (CAR_SERVICES as readonly string[])).includes(title) ? [{ value: title, label: title }] : [])} />
        </Field>
      )}
      <Row2>
        <Field label={type === "paper" ? "Renewed on" : type === "fuel" ? "Filled on" : "Done on"}>
          <DatePicker value={date} onChange={(v) => setDate(v || isoDate())} clearable={false} />
        </Field>
        <Field label={`Cost (${currency})`}>
          <NumberInput value={amount} onChange={setAmount} placeholder={type === "paper" ? "Optional" : "0"} />
        </Field>
      </Row2>
      {type === "fuel" && (
        <Row2>
          <Field label="Litres">
            <NumberInput value={litres} onChange={setLitres} placeholder="Optional" />
          </Field>
          <Field label="Filled to full">
            <Segmented<string>
              block
              value={full ? "yes" : "no"}
              onChange={(v) => setFull(v === "yes")}
              options={[
                { value: "yes", label: "Full" },
                { value: "no", label: "Partly" },
              ]}
            />
          </Field>
        </Row2>
      )}
      {type !== "paper" && (
        <Field label="On the clock (km)" hint={car?.data.odometer ? `Last reading: ${groupNumber(car.data.odometer)} km` : "For km per litre and the next service."}>
          <NumberInput value={odo} onChange={setOdo} placeholder="Optional" />
        </Field>
      )}
      {type === "service" && (
        <Row2>
          <Field label="Next service on">
            <DatePicker value={nextDate} onChange={setNextDate} placeholder="Optional" />
          </Field>
          <Field label="Or at (km)">
            <NumberInput value={nextKm} onChange={setNextKm} placeholder="Optional" />
          </Field>
        </Row2>
      )}
      {type === "paper" && (
        <>
          <Row2>
            <Field label="Expires on">
              <DatePicker value={nextDate} onChange={setNextDate} />
            </Field>
            <Field label="Number">
              <Input value={number} onChange={setNumber} placeholder="Policy or document no." className="font-mono" />
            </Field>
          </Row2>
          <Field label="Remind me">
            <RemindChips value={remind} onChange={setRemind} options={[{ n: 30, label: "A month before" }, { n: 7, label: "A week before" }, { n: 1, label: "The day before" }, { n: 0, label: "On the day" }]} />
          </Field>
        </>
      )}
      <Field label="Notes">
        <Textarea value={notes} onChange={setNotes} placeholder="Optional" minRows={2} />
      </Field>
    </Form>
  );
}

// ---------------- host ----------------
const potName = (id: string | null | undefined) => (id ? (useRecords.getState().byId[id]?.data as { name?: string } | undefined)?.name || "a pot" : "money not in a pot");
const FORMS: Record<EditKind, (p: FormProps<any>) => React.ReactElement> = {
  todo: TodoForm,
  item: ItemForm,
  money: MoneyForm,
  event: EventForm,
  reminder: ReminderForm,
  clip: ClipForm,
  date: DateForm,
  person: PersonForm,
  thing: ThingForm,
  car: CarForm,
  car_log: CarLogForm,
  project: ProjectForm,
  client: ClientForm,
  work_log: WorkLogForm,
  server: ServerForm,
  domain: DomainForm,
  interest: InterestForm,
  practice: PracticeForm,
  word: WordForm,
  media: MediaForm,
  wish: WishForm,
  fund: FundForm,
  pot: ({ rec, close }) => <PotForm rec={rec} close={close} />,
  pot_move: ({ preset, close }) => <PotMoveForm preset={preset} close={close} />,
  purchase: ({ preset, close }) => <PurchaseForm preset={preset} close={close} />,
  owed: ({ rec, preset, close }) => <OwedForm rec={rec} preset={preset} close={close} />,
  owed_step: ({ preset, close }) => <OwedStepForm preset={preset} close={close} />,
};

// "Took some back from Abu" / "Ali paid back"
function owedStepTitle(preset?: Record<string, any>) {
  const r = preset?.id ? (useRecords.getState().byId[preset.id] as unknown as Rec<"owed"> | undefined) : undefined;
  if (!r) return "A step";
  const loan = r.data.type === "loan";
  return preset?.step === "more" ? (loan ? `Lend ${r.data.who} more` : `Give ${r.data.who} more to keep`) : loan ? `${r.data.who} paid back` : `Take some back from ${r.data.who}`;
}

export function EditorHost() {
  const editing = useUI((s) => s.editing);
  const close = useUI((s) => s.closeEditor);
  // keep showing the last form while the drawer slides away
  const [last, setLast] = useState(editing);
  if (editing && editing !== last) setLast(editing);
  const e = editing || last;
  const meta = e ? META[e.kind] : null;
  const FormC = e ? FORMS[e.kind] : null;
  const payment = e?.kind === "work_log" && (e.rec ? (e.rec.data as { type?: string }).type : e.preset?.type) === "payment";
  const title = e
    ? payment
      ? e.rec
        ? "Edit payment"
        : "Got paid"
      : e.kind === "item" && e.preset?.buying
        ? `Bought ${e.rec ? (e.rec.data as ItemData).name : "it"}?`
        : e.kind === "money" && (e.preset?.paid_from || (e.rec?.data as MoneyData | undefined)?.paid_from)
          ? e.rec
            ? "Edit the purchase"
            : "A purchase on the hisaab"
          : e.kind === "owed_step"
            ? owedStepTitle(e.preset)
            : e.kind === "owed" && !e.rec && e.preset?.type === "loan"
              ? "Money you lent"
          : e.kind === "pot_move"
            ? e.preset?.from === undefined
              ? `Move money into ${potName(e.preset?.to)}`
              : `Move money out of ${potName(e.preset?.from)}`
            : e.rec
            ? META[e.kind].edit
            : e.kind === "money" && e.preset?.type === "income"
              ? "Money in"
              : META[e.kind].add
    : "";
  return (
    <Drawer open={!!editing} onClose={close} title={title} icon={meta?.icon} iconTone={meta?.tone}>
      {e && FormC && <FormC key={e.n} rec={e.rec || null} preset={e.preset} close={close} />}
    </Drawer>
  );
}
