// The editor drawer: one place where any record is added or changed, from any page (and from
// Search, the tray and the menu). It slides in from the right and leaves the page in view.
import { useState } from "react";
import { Bell, Bookmark, Briefcase, Cake, CalendarDays, Car, CheckSquare, Clock, Gamepad2, Gift, Globe, Languages, Package, Server, ShoppingCart, Sparkles, Timer, UserRound, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";
import {
  addDays,
  CAR_PAPERS,
  CAR_SERVICES,
  daysBetween,
  EXPENSE_CATEGORIES,
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
import { ChipRow, Form, FormFooter, RemindChips, Row2, TagsInput } from "./kit";
import { ClientForm, DomainForm, ProjectForm, ServerForm, WorkLogForm } from "./WorkEditors";
import { InterestForm, MediaForm, PracticeForm, WishForm, WordForm } from "./InterestEditors";

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
  const linked = !!rec?.data.money_id;
  const ok = !!name.trim();
  const save = () => {
    if (!ok) return;
    const s = useRecords.getState();
    let money_id = rec?.data.money_id ?? null;
    const price = paid && paid > 0 ? paid : null;
    if (price && !money_id) money_id = s.create("money", { type: "expense", amount: price, currency, category: list === "grocery" ? "Groceries" : "Shopping", note: name.trim(), date: isoDate(), account: "cash" }).id;
    const data: Partial<ItemData> = { name: name.trim(), qty: qty.trim() || undefined, list, mode: where === "online" ? "online" : "store", today: where === "today", link: where === "online" ? link.trim() || undefined : undefined, note: note.trim() || undefined, regular, price, money_id, ...(price ? { done: true, done_at: rec?.data.done_at || Date.now() } : {}) };
    if (rec) s.update<"item">(rec.id, data);
    else s.create("item", { ...(data as ItemData), done: data.done ?? false });
    toast.success(price && !rec?.data.money_id ? "Bought, and added to Money" : rec ? "Saved" : "Added to the list");
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
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Input size="lg" value={name} onChange={setName} placeholder="Item" autoFocus aria-label="Item" />
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
      <Field label="Bought it? What it cost" hint={linked ? "Already in Money." : `Saving a price marks it bought and adds it to Money (${currency}).`}>
        <NumberInput value={paid} onChange={setPaid} placeholder="0" disabled={linked} aria-label="Price paid" />
      </Field>
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
  const cats: readonly string[] = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const cur = d.currency || currency;
  const ok = !!amount && amount > 0 && !!category;
  const why = !amount || amount <= 0 ? "Type an amount" : !category ? "Pick a category" : "";
  const save = () => {
    if (!ok) return;
    const data: MoneyData = { type, amount: Math.round(amount! * 100) / 100, currency: cur, category, note: note.trim() || undefined, date, account, recurring: monthly ? "monthly" : null };
    if (rec) useRecords.getState().update<"money">(rec.id, data);
    else useRecords.getState().create("money", data);
    toast.success(`${type === "income" ? "Earned" : "Spent"} ${fmtMoney(data.amount, cur)} saved`);
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
      <Field label="What for">
        <Input value={note} onChange={setNote} placeholder="Optional" />
      </Field>
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
      <div className="flex items-center justify-between rounded-[12px] bg-surface2 px-3.5 py-3 hairline">
        <div>
          <div className="text-[13px] font-medium">Every month</div>
          <div className="text-[12px] text-text3">Bills and salary: marked monthly, so you can see what's fixed.</div>
        </div>
        <Switch checked={monthly} onChange={setMonthly} label="Monthly" />
      </div>
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
          <NumberInput value={year} onChange={(v) => setYear(v == null ? null : Math.round(v))} placeholder="Optional" />
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
        <Field label="On the clock (km)" hint={car?.data.odometer ? `Last reading: ${car.data.odometer.toLocaleString()} km` : "For km per litre and the next service."}>
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
};

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
  const title = e ? (payment ? (e.rec ? "Edit payment" : "Got paid") : e.rec ? META[e.kind].edit : e.kind === "money" && e.preset?.type === "income" ? "Money in" : META[e.kind].add) : "";
  return (
    <Drawer open={!!editing} onClose={close} title={title} icon={meta?.icon} iconTone={meta?.tone}>
      {e && FormC && <FormC key={e.n} rec={e.rec || null} preset={e.preset} close={close} />}
    </Drawer>
  );
}
