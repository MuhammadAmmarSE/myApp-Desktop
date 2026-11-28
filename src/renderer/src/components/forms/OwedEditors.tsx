// Your money with someone on the computer: kept with them ("Abu has 150,000 of mine") or lent
// ("Ali borrowed 20,000"). The editor for one (who, how much, when, from where, and for a loan when
// it comes back), and the form for each step after: took some back / they paid back, gave more /
// lent more.
import { useState } from "react";
import { addDays, findPerson, isoDate, owedMoveWord, owedSummary, type MoneyData, type OwedType, type Rec } from "@myapp/core";
import { Chip, DatePicker, Field, Input, NumberInput, Segmented, Textarea, toast } from "@/components/ui";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { navigate } from "@/lib/router";
import { money as fmtMoney } from "@/lib/format";
import { createOwed, owedStep, removeOwed } from "@/lib/owed";
import { Form, FormFooter } from "./kit";

type Account = NonNullable<MoneyData["account"]>;
const ACCOUNTS: { value: Account; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
];
const round = (n: number) => Math.round(n * 100) / 100;

export function OwedForm({ rec, preset, close }: { rec: Rec<"owed"> | null; preset?: Record<string, any>; close: () => void }) {
  const currency = useSettings((s) => s.currency);
  const peopleRecs = useList("person");
  const people = peopleRecs.map((p) => ({ id: p.id, name: p.data.name, relation: p.data.relation }));
  const d = rec?.data;
  const [type, setType] = useState<OwedType>(d?.type || (preset?.type === "loan" ? "loan" : "keeping"));
  const [amount, setAmount] = useState<number | null>(d?.amount ?? null);
  const [who, setWho] = useState(d?.who || "");
  const [date, setDate] = useState(d?.date || isoDate());
  const [account, setAccount] = useState<Account>(d?.account || "cash");
  const [due, setDue] = useState<string | null>(d?.due || null);
  const [notes, setNotes] = useState(d?.notes || "");
  const loan = type === "loan";
  const cur = d?.currency || currency;
  const ok = !!amount && amount > 0 && !!who.trim();
  const why = !amount || amount <= 0 ? "How much?" : !who.trim() ? (loan ? "Who did you lend it to?" : "Who has it?") : "";
  const save = () => {
    if (!ok) return;
    const person = findPerson(people, who.trim());
    const data = { type, who: who.trim(), person_id: person ? person.id : null, amount: round(amount!), date, account, due: loan ? due : null, notes: notes.trim() || undefined };
    if (rec) {
      useRecords.getState().update<"owed">(rec.id, data);
      toast.success("Saved");
    } else {
      const made = createOwed(data);
      toast.success(loan ? `Lent ${fmtMoney(data.amount, cur)} to ${data.who}` : `${data.who} has ${fmtMoney(data.amount, cur)} of yours`);
      navigate(`/owed/${made.id}`);
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
          saveLabel={rec ? "Save" : loan ? "Save the loan" : "Save it"}
          onDelete={
            rec
              ? () => {
                  const undo = removeOwed(rec);
                  toast.undo(loan ? `Deleted the loan to ${rec.data.who}` : `Deleted the money with ${rec.data.who}`, undo);
                  navigate("/money");
                  close();
                }
              : undefined
          }
        />
      }
    >
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: "keeping", label: "Keeping it for me" },
          { value: "loan", label: "I lent it" },
        ]}
        block
      />
      <div className="text-[12.5px] text-text2">
        {loan ? "Money you lent: it's still yours, so it isn't spending. Mark what they pay back as it comes." : "Your money that someone else holds for you. It's still yours: take from it whenever you need, and Money shows how much is with them."}
      </div>
      <NumberInput
        size="lg"
        value={amount}
        onChange={setAmount}
        placeholder="0"
        autoFocus
        aria-label="How much"
        className="!text-[22px] font-display font-semibold tnum"
        boxClassName="!h-14"
        right={<span className="pointer-events-none mr-4 text-[13px] font-medium text-text3">{cur}</span>}
      />
      <Field label={loan ? "Lent to" : "Who has it"}>
        <Input value={who} onChange={setWho} placeholder={loan ? "e.g. Ali" : "e.g. Abu"} aria-label={loan ? "Lent to" : "Who has it"} />
        {people.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {people
              .filter((p) => p.relation !== "me")
              .slice(0, 10)
              .map((p) => (
                <Chip key={p.id} active={who.trim().toLowerCase() === p.name.toLowerCase()} onClick={() => setWho(p.name)}>
                  {p.name}
                </Chip>
              ))}
          </div>
        )}
      </Field>
      <Field label={loan ? "Lent on" : "Given on"}>
        <DatePicker value={date} onChange={(v) => setDate(v || isoDate())} clearable={false} />
      </Field>
      <Field label="It came from">
        <Segmented value={account} onChange={setAccount} options={ACCOUNTS} />
      </Field>
      {loan && (
        <Field label="They'll pay it back by">
          <DatePicker value={due} onChange={setDue} placeholder="Not said" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={due === addDays(isoDate(), 7)} onClick={() => setDue(addDays(isoDate(), 7))}>
              In a week
            </Chip>
            <Chip active={due === addDays(isoDate(), 30)} onClick={() => setDue(addDays(isoDate(), 30))}>
              In a month
            </Chip>
          </div>
        </Field>
      )}
      <Field label="Note">
        <Textarea value={notes} onChange={setNotes} placeholder="Optional" rows={2} />
      </Field>
    </Form>
  );
}

const STEP_HINT: Record<OwedType, Record<"back" | "more", (who: string) => string>> = {
  keeping: {
    back: (who) => `Money you took from what ${who} has. It's yours either way, so Money doesn't change.`,
    more: (who) => `More of your money for ${who} to keep.`,
  },
  loan: {
    back: (who) => `What ${who} gave back. It was yours all along, so it isn't income.`,
    more: (who) => `More you lent ${who}.`,
  },
};

// one step on it: preset { id, step: "back" | "more" }
export function OwedStepForm({ preset, close }: { preset?: Record<string, any>; close: () => void }) {
  const currency = useSettings((s) => s.currency);
  const rec = useRecords((s) => (preset?.id ? (s.byId[preset.id] as unknown as Rec<"owed"> | undefined) : undefined));
  const step: "back" | "more" = preset?.step === "more" ? "more" : "back";
  const [amount, setAmount] = useState<number | null>(null);
  const [account, setAccount] = useState<Account>(rec?.data.account || "cash");
  const [date, setDate] = useState(isoDate());
  const [note, setNote] = useState("");
  if (!rec || rec.deleted) return <div className="text-[13px] text-text2">This isn&apos;t here any more.</div>;
  const d = rec.data;
  const cur = d.currency || currency;
  const left = owedSummary(rec).left;
  const tooMuch = step === "back" && !!amount && amount > left;
  const ok = !!amount && amount > 0 && !tooMuch;
  const word = owedMoveWord(d.type, step);
  const save = () => {
    if (!ok) return;
    const undo = owedStep(rec.id, step, round(amount!), { date, account, note: note.trim() || undefined });
    toast.undo(`${word}: ${fmtMoney(amount!, cur)}`, undo);
    close();
  };
  return (
    <Form footer={<FormFooter ok={ok} why={!amount ? "How much?" : tooMuch ? `${d.who} has ${fmtMoney(left, cur)} of yours` : ""} onSave={save} onCancel={close} saveLabel={word} />}>
      <div className="text-[12.5px] text-text2">{STEP_HINT[d.type][step](d.who || "They")}</div>
      <NumberInput
        size="lg"
        value={amount}
        onChange={setAmount}
        placeholder="0"
        autoFocus
        aria-label="Amount"
        className="!text-[22px] font-display font-semibold tnum"
        boxClassName="!h-14"
        right={<span className="pointer-events-none mr-4 text-[13px] font-medium text-text3">{cur}</span>}
      />
      {step === "back" && left > 0 && amount !== left && (
        <div>
          <Chip onClick={() => setAmount(left)}>All of it: {fmtMoney(left, cur)}</Chip>
        </div>
      )}
      {tooMuch && <div className="text-[12.5px] text-danger">{d.who} has {fmtMoney(left, cur)} of yours.</div>}
      <Field label={step === "back" ? "It went to" : "It came from"}>
        <Segmented value={account} onChange={setAccount} options={ACCOUNTS} />
      </Field>
      <Field label="On">
        <DatePicker value={date} onChange={(v) => setDate(v || isoDate())} clearable={false} />
      </Field>
      <Field label="Note">
        <Input value={note} onChange={setNote} placeholder="Optional" aria-label="Note" />
      </Field>
    </Form>
  );
}
