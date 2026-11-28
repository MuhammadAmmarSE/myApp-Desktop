// Pots on the computer: a pot's editor (name, kind, target, rule), moving money between pots, and
// the pieces the Money page and the expense editor use (a pot's mark and meter, where a month's
// money went, the pot spending comes out of, an income split into pots).
import { useMemo, useState } from "react";
import clsx from "clsx";
import { CircleSlash, Landmark, PiggyBank, Receipt, Sparkles, Wallet, type LucideIcon } from "lucide-react";
import { isoDate, POT_TYPE_META, POT_TYPES, ruleWords, splitTotal, type MonthJobs, type PotRule, type PotSplit, type PotType, type Rec } from "@myapp/core";
import { Chip, DatePicker, Field, Input, NumberInput, Segmented, toast } from "@/components/ui";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { navigate } from "@/lib/router";
import { money as fmtMoney } from "@/lib/format";
import { createPot, movePot, potVar, removePot, usePots, type PotRow } from "@/lib/pots";
import { Form, FormFooter } from "./kit";

export const POT_ICON: Record<PotType, LucideIcon> = { spend: Wallet, bills: Receipt, save: PiggyBank, debt: Landmark };

// a pot's mark: its icon on its own colour
export function PotMark({ pot, size = 32 }: { pot: Rec<"pot">; size?: number }) {
  const Icon = POT_ICON[pot.data.type] || Wallet;
  const slot = `${(((Math.round(Number(pot.data.color) || 0)) % 8) + 8) % 8}`;
  return (
    <span className="grid shrink-0 place-items-center rounded-[9px]" style={{ width: size, height: size, background: `var(--pot-${slot}-soft)`, color: potVar(pot) }}>
      <Icon size={Math.round(size * 0.48)} strokeWidth={2} />
    </span>
  );
}

// how far along a pot is: a limit turns amber then red as it's used up; a goal fills in its colour
export function PotMeter({ row, className }: { row: PotRow; className?: string }) {
  const s = row.summary;
  if (s.progress == null) return null;
  const share = Math.min(1, s.progress);
  const color = s.meter === "use" ? (s.progress > 1 ? "var(--c-danger)" : s.progress > 0.85 ? "var(--c-warn)" : potVar(row.pot)) : potVar(row.pot);
  return (
    <div className={clsx("h-1.5 overflow-hidden rounded-full bg-surface2", className)} role="meter" aria-valuenow={Math.round(s.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(share ? 3 : 0, share * 100)}%`, background: color }} />
    </div>
  );
}

// where a month's money went: a bar split by pot (with a gap between) and a key beside it
export function JobsBar({ jobs, rows, currency }: { jobs: MonthJobs; rows: Map<string, PotRow>; currency: string }) {
  const parts = useMemo(() => {
    const list = jobs.jobs.filter((j) => j.amount > 0).map((j) => ({ key: j.pot_id, name: rows.get(j.pot_id)?.pot.data.name || "A pot", amount: j.amount, color: potVar(rows.get(j.pot_id)?.pot) }));
    if (jobs.notInPot > 0) list.push({ key: "free", name: "Not in a pot", amount: jobs.notInPot, color: "var(--c-text3)" });
    return list;
  }, [jobs, rows]);
  const total = parts.reduce((n, p) => n + p.amount, 0);
  if (!total) return null;
  return (
    <div className="flex flex-col gap-2.5" data-testid="pot-jobs">
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-label={parts.map((p) => `${p.name} ${fmtMoney(p.amount, currency)}`).join(", ")}>
        {parts.map((p) => (
          <div key={p.key} style={{ flex: p.amount / total, background: p.color, minWidth: 3 }} />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate text-text2">{p.name}</span>
            <span className="tnum">{fmtMoney(p.amount, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// the pot spending comes out of: none, or one of your pots with what's in it
export function PotPicker({ rows, value, onChange, amount, suggested, currency }: { rows: PotRow[]; value: string | null; onChange: (id: string | null) => void; amount: number; suggested: string | null; currency: string }) {
  const chosen = rows.find((r) => r.pot.id === value);
  const over = chosen && amount > 0 && chosen.summary.balance - amount < 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Chip icon={CircleSlash} active={!value} onClick={() => onChange(null)}>
          No pot
        </Chip>
        {rows.map((r) => (
          <button
            key={r.pot.id}
            type="button"
            onClick={() => onChange(r.pot.id)}
            aria-pressed={value === r.pot.id}
            aria-label={[r.pot.data.name, fmtMoney(r.summary.balance, r.pot.data.currency || currency), suggested === r.pot.id ? "suggested" : ""].filter(Boolean).join(", ")}
            className={clsx("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors", value === r.pot.id ? "text-text" : "border-line text-text2 hover:bg-hover")}
            style={value === r.pot.id ? { borderColor: potVar(r.pot), background: `var(--pot-${(((Math.round(Number(r.pot.data.color) || 0)) % 8) + 8) % 8}-soft)` } : suggested === r.pot.id ? { borderColor: potVar(r.pot) } : undefined}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: potVar(r.pot) }} />
            {r.pot.data.name}
            <span className="text-text3 tnum">{fmtMoney(r.summary.balance, r.pot.data.currency || currency)}</span>
            {suggested === r.pot.id && value !== r.pot.id && <span className="text-[11px] text-text3">· suggested</span>}
          </button>
        ))}
      </div>
      {suggested && value === suggested && (
        <div className="flex items-center gap-1.5 text-[12px] text-text3">
          <Sparkles size={12} /> Picked from what you did before.
        </div>
      )}
      {over && (
        <div className="text-[12px] text-warn">
          This takes {chosen.pot.data.name} {fmtMoney(amount - chosen.summary.balance, currency)} over. You can still save it and move money in later.
        </div>
      )}
    </div>
  );
}

// an income given jobs: an amount for each pot, what's left as money not in a pot, and the rules
export function SplitEditor({ rows, total, split, onChange, onRules, hasRules, currency }: { rows: PotRow[]; total: number; split: Record<string, number | null>; onChange: (next: Record<string, number | null>) => void; onRules: () => void; hasRules: boolean; currency: string }) {
  const given = rows.reduce((n, r) => n + (Number(split[r.pot.id]) || 0), 0);
  const left = Math.round((total - given) * 100) / 100;
  const parts = rows.map((r) => ({ id: r.pot.id, amount: Number(split[r.pot.id]) || 0, color: potVar(r.pot) })).filter((p) => p.amount > 0);
  return (
    <div className="flex flex-col gap-2.5" data-testid="split-editor">
      {total > 0 && (
        <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-surface2">
          {parts.map((p) => (
            <div key={p.id} style={{ flex: Math.min(p.amount, total), background: p.color }} />
          ))}
          {left > 0 && <div style={{ flex: left }} />}
        </div>
      )}
      {rows.map((r) => (
        <div key={r.pot.id} className="flex items-center gap-2.5">
          <PotMark pot={r.pot} size={26} />
          <span className="min-w-0 flex-1 truncate text-[13px]">{r.pot.data.name}</span>
          <div className="w-[150px]">
            <NumberInput size="sm" value={split[r.pot.id] ?? null} onChange={(v) => onChange({ ...split, [r.pot.id]: v })} placeholder="0" aria-label={`Into ${r.pot.data.name}`} />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className={left < 0 ? "text-danger" : "text-text2"}>{left < 0 ? `${fmtMoney(-left, currency)} more than came in` : left > 0 ? `${fmtMoney(left, currency)} not in a pot` : total > 0 ? "Every bit has a job" : ""}</span>
        {hasRules && (
          <button type="button" onClick={onRules} className="inline-flex items-center gap-1.5 text-accent-text hover:underline">
            <Sparkles size={12} /> Split by my rules
          </button>
        )}
      </div>
    </div>
  );
}
export const splitAsNumbers = (split: PotSplit[] | undefined): Record<string, number | null> => Object.fromEntries((split || []).map((s) => [s.pot_id, s.amount]));
export function splitFromNumbers(rows: PotRow[], split: Record<string, number | null>, total: number): PotSplit[] {
  const out: PotSplit[] = [];
  let left = total;
  for (const r of rows) {
    const a = Math.min(Math.max(0, Number(split[r.pot.id]) || 0), left);
    if (a > 0) {
      out.push({ pot_id: r.pot.id, amount: Math.round(a * 100) / 100 });
      left = Math.round((left - a) * 100) / 100;
    }
  }
  return out;
}
export const splitOverNumbers = (rows: PotRow[], split: Record<string, number | null>, total: number) => rows.reduce((n, r) => n + (Number(split[r.pot.id]) || 0), 0) > total + 0.004;
export { splitTotal };

type RuleKind = "none" | PotRule["kind"];

export function PotForm({ rec, close }: { rec: Rec<"pot"> | null; close: () => void }) {
  const currency = useSettings((s) => s.currency);
  const d = rec?.data;
  const [name, setName] = useState(d?.name || "");
  const [type, setType] = useState<PotType>(d?.type || "spend");
  const [target, setTarget] = useState<number | null>(d?.target ?? null);
  const [date, setDate] = useState<string | null>(d?.target_date || null);
  const [rule, setRule] = useState<RuleKind>(d?.rule ? d.rule.kind : "none");
  const [ruleValue, setRuleValue] = useState<number | null>(d?.rule?.value ?? null);
  const [opening, setOpening] = useState<number | null>(d?.opening ?? null);
  const cur = d?.currency || currency;
  const meta = POT_TYPE_META[type];
  const v = Number(ruleValue) || 0;
  const ruleOk = rule === "none" || rule === "fill" || (v > 0 && (rule !== "percent" || v <= 100));
  const ok = !!name.trim() && ruleOk;
  const why = !name.trim() ? "Give it a name" : !ruleOk ? (rule === "percent" ? "A share from 1 to 100%" : "Say how much") : "";
  const save = () => {
    if (!ok) return;
    const r: PotRule | null = rule === "none" ? null : rule === "fill" ? { kind: "fill" } : { kind: rule, value: v };
    const data = { name: name.trim(), type, target: target && target > 0 ? target : null, target_date: type === "save" || type === "debt" ? date : null, rule: r, opening: opening && opening > 0 ? opening : null };
    if (rec) {
      useRecords.getState().update<"pot">(rec.id, data);
      toast.success("Saved");
    } else {
      const made = createPot(data);
      toast.success(`Made the pot ${made.data.name}`);
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
          saveLabel={rec ? "Save" : "Make the pot"}
          extra={
            rec ? (
              <button type="button" className="text-[12.5px] text-text2 hover:text-text" onClick={() => (useRecords.getState().update<"pot">(rec.id, { archived: !rec.data.archived }), toast.success(rec.data.archived ? "In use again" : "Put away"), close())}>
                {rec.data.archived ? "Use again" : "Put away"}
              </button>
            ) : undefined
          }
          onDelete={
            rec
              ? () => {
                  const undo = removePot(rec);
                  toast.undo(`Deleted the pot ${rec.data.name}. What went in and came out stays in Money.`, undo);
                  navigate("/money");
                  close();
                }
              : undefined
          }
        />
      }
    >
      <Field label="Name">
        <Input value={name} onChange={setName} placeholder={`e.g. ${meta.example}`} autoFocus aria-label="Pot name" />
      </Field>
      <Field label="What it's for" hint={meta.what}>
        <Segmented<PotType> block value={type} onChange={setType} options={POT_TYPES.map((t) => ({ value: t, label: POT_TYPE_META[t].name }))} />
      </Field>
      <Field label={`${meta.target} (optional)`}>
        <NumberInput value={target} onChange={setTarget} placeholder="0" aria-label={meta.target} right={<span className="pointer-events-none mr-3 text-[12px] text-text3">{cur}</span>} />
      </Field>
      {meta.date && (
        <Field label={`${meta.date} (optional)`}>
          <DatePicker value={date} onChange={setDate} />
        </Field>
      )}
      <Field label="Each time you earn" hint={rule === "none" ? "Split what you earn into it yourself, or give it a rule and it's split for you (you can change it before saving)." : `${ruleWords(rule === "fill" ? { kind: "fill" } : { kind: rule, value: v }, cur)}.`}>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={rule === "none"} onClick={() => setRule("none")}>
            I&apos;ll split it
          </Chip>
          <Chip active={rule === "percent"} onClick={() => setRule("percent")}>
            A share (%)
          </Chip>
          <Chip active={rule === "fixed"} onClick={() => setRule("fixed")}>
            A set amount
          </Chip>
          {(Number(target) > 0 || type === "bills") && (
            <Chip active={rule === "fill"} onClick={() => setRule("fill")}>
              What it still needs
            </Chip>
          )}
        </div>
        {(rule === "percent" || rule === "fixed") && (
          <NumberInput boxClassName="mt-2" value={ruleValue} onChange={setRuleValue} placeholder={rule === "percent" ? "e.g. 30" : "e.g. 25000"} aria-label={rule === "percent" ? "Share of each income, in percent" : "Amount from each income"} right={<span className="pointer-events-none mr-3 text-[12px] text-text3">{rule === "percent" ? "%" : cur}</span>} />
        )}
      </Field>
      <Field label="Already in it (optional)" hint="Money you'd already set aside before making the pot. It isn't counted as earned.">
        <NumberInput value={opening} onChange={setOpening} placeholder="0" aria-label="Already in it" />
      </Field>
    </Form>
  );
}

// moving money: from a pot (or money not in a pot) to another; preset { from, to, suggested } where
// the end being picked is undefined
export function PotMoveForm({ preset, close }: { preset?: Record<string, any>; close: () => void }) {
  const currency = useSettings((s) => s.currency);
  const pots = usePots();
  const from: string | null | undefined = preset?.from;
  const to: string | null | undefined = preset?.to;
  const picking: "from" | "to" = from === undefined ? "from" : "to";
  const fixed = picking === "from" ? (to ?? null) : (from ?? null);
  const [amount, setAmount] = useState<number | null>(Number(preset?.suggested) > 0 ? Number(preset?.suggested) : null);
  const [note, setNote] = useState("");
  const [other, setOther] = useState<string | null>(null);
  const a = picking === "from" ? other : fixed;
  const b = picking === "from" ? fixed : other;
  const ok = !!amount && amount > 0 && a !== b;
  const nameOf = (id: string | null) => (id ? pots.byId.get(id)?.pot.data.name || "A pot" : "Money not in a pot");
  const save = () => {
    if (!ok) return;
    const undo = movePot(a, b, amount!, note.trim() || undefined, isoDate());
    if (!undo) return;
    toast.undo(`Moved ${fmtMoney(amount!, currency)}: ${nameOf(a)} → ${nameOf(b)}`, undo);
    close();
  };
  const choices = [{ id: null as string | null, label: "Money not in a pot" }].concat(pots.rows.map((r) => ({ id: r.pot.id as string | null, label: `${r.pot.data.name} · ${fmtMoney(r.summary.balance, currency)}` }))).filter((x) => x.id !== fixed);
  const fixedRow = fixed ? pots.byId.get(fixed) : null;
  return (
    <Form footer={<FormFooter ok={ok} why={!amount ? "How much?" : a === b ? "Pick somewhere else" : ""} onSave={save} onCancel={close} saveLabel="Move it" />}>
      <div className="text-[13px] text-text2">
        {picking === "from" ? `Into ${nameOf(fixed)}` : `Out of ${nameOf(fixed)}`}
        {fixedRow ? ` (${fmtMoney(fixedRow.summary.balance, currency)} in it now)` : ""}.
      </div>
      <NumberInput size="lg" value={amount} onChange={setAmount} placeholder="0" autoFocus aria-label="Amount" className="!text-[22px] font-display font-semibold tnum" boxClassName="!h-14" right={<span className="pointer-events-none mr-4 text-[13px] font-medium text-text3">{currency}</span>} />
      <Field label={picking === "from" ? "From" : "To"}>
        <div className="flex flex-wrap gap-1.5">
          {choices.map((x) => (
            <Chip key={x.id || "free"} active={other === x.id} onClick={() => setOther(x.id)}>
              {x.label}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Note">
        <Input value={note} onChange={setNote} placeholder="Optional" aria-label="Note" />
      </Field>
    </Form>
  );
}
