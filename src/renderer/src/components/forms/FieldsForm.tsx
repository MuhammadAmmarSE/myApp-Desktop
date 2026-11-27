// A form built from a list of fields, for the records whose editors are plain (Work and
// Interests): text, numbers, chips, a pick from a list, a day, a duration, stars, a yes/no and
// reminder days. Fields can sit two to a row (`half`) and show only when another field says so; a
// field that isn't showing saves nothing (a fixed price doesn't keep an hourly rate). The phone's
// FormSheet takes the same list.
import { useState, type ReactNode } from "react";
import { DatePicker, Field, Input, NumberInput, Select, Stars, Textarea, Chip } from "@/components/ui";
import { minutesInWords } from "@myapp/core";
import { minutesShort, parseMinutes } from "@/lib/work";
import { ChipRow, Form, FormFooter, RemindChips, SwitchRow } from "./kit";

export type Values = Record<string, unknown>;
type Base = { key: string; show?: (v: Values) => boolean; hint?: (v: Values) => ReactNode; half?: boolean };
export type FieldSpec = Base &
  (
    | { type: "text"; placeholder: string; label?: string; required?: string; multiline?: boolean; mono?: boolean; big?: boolean; focus?: boolean }
    | { type: "number"; label: string; placeholder?: string; required?: string }
    | { type: "chips"; label: string; options: [string, string][]; clear?: string }
    | { type: "pick"; label: string; options: { id: string; name: string }[]; none: string; onPick?: (id: string | null, v: Values) => Values | void }
    | { type: "day"; label: string; placeholder?: string; clearable?: boolean }
    | { type: "minutes"; label: string; quick?: number[]; required?: string }
    | { type: "stars"; label: string }
    | { type: "toggle"; title: string; sub?: string }
    | { type: "remind"; label: string; days: number[] }
  );

const blank = (x: unknown) => x === undefined || x === null || (typeof x === "string" && !x.trim()) || (typeof x === "number" && !(x > 0));
const remindWord = (n: number) => (n === 0 ? "On the day" : n === 1 ? "The day before" : n === 7 ? "A week before" : n === 30 ? "A month before" : `${n} days before`);
const visible = (f: FieldSpec, v: Values) => !f.show || f.show(v);

// from what the form edits back to a record's data: text trimmed, empty numbers gone, keys
// starting with "_" (the form's own switches) left out
export function dump(fields: FieldSpec[], v: Values): Values {
  const out: Values = {};
  for (const [k, x] of Object.entries(v)) if (!k.startsWith("_")) out[k] = x;
  for (const f of fields) {
    const x = v[f.key];
    if (!visible(f, v)) {
      // two fields can share a key (the rate per hour, or for the job): only a hidden one that no
      // showing field also uses is emptied
      if (!fields.some((g) => g.key === f.key && visible(g, v))) out[f.key] = undefined;
      continue;
    }
    if (f.type === "text") out[f.key] = typeof x === "string" && x.trim() ? x.trim() : undefined;
    else if (f.type === "number") out[f.key] = typeof x === "number" && x > 0 ? Math.round(x * 100) / 100 : null;
    else if (f.type === "minutes") out[f.key] = typeof x === "number" && x > 0 ? Math.round(x) : null;
    else if (f.type === "toggle") out[f.key] = x ? true : undefined;
  }
  return out;
}

// what's still missing before it can be saved ("" when nothing is)
export function missing(fields: FieldSpec[], v: Values): string {
  for (const f of fields) if ("required" in f && f.required && visible(f, v) && blank(v[f.key])) return f.required;
  return "";
}

function MinutesInput({ value, onChange, quick, label }: { value: number | null | undefined; onChange: (m: number | null) => void; quick?: number[]; label: string }) {
  const [text, setText] = useState(value ? minutesShort(value) : "");
  const parsed = parseMinutes(text);
  return (
    <div className="flex flex-col gap-2">
      {quick && (
        <div className="flex flex-wrap gap-1.5">
          {quick.map((m) => (
            <Chip
              key={m}
              active={value === m}
              onClick={() => {
                onChange(m);
                setText(minutesShort(m));
              }}
            >
              {minutesInWords(m)}
            </Chip>
          ))}
        </div>
      )}
      <Input
        value={text}
        aria-label={label}
        placeholder="e.g. 45m, 1h 30, 1:15"
        invalid={!!text.trim() && parsed == null}
        onChange={(t) => {
          setText(t);
          onChange(parseMinutes(t));
        }}
        right={parsed ? <span className="mr-3 shrink-0 text-[12px] text-text3">{minutesInWords(parsed)}</span> : undefined}
      />
    </div>
  );
}

export function FieldsForm({
  fields,
  initial,
  onSave,
  close,
  onDelete,
  deleteLabel = "Delete",
  saveLabel = "Save",
  check,
  children,
}: {
  fields: FieldSpec[];
  initial: Values;
  onSave: (data: Values, raw: Values) => void;
  close: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  saveLabel?: string;
  check?: (v: Values) => string; // more that must hold before saving, in words
  children?: (v: Values, set: (key: string, value: unknown) => void) => ReactNode;
}) {
  const [v, setV] = useState<Values>(initial);
  const set = (key: string, value: unknown) => setV((p) => ({ ...p, [key]: value }));
  const why = missing(fields, v) || check?.(v) || "";
  const save = () => {
    if (why) return;
    onSave(dump(fields, v), v);
    close();
  };

  const control = (f: FieldSpec) => {
    const hint = f.hint?.(v);
    switch (f.type) {
      case "text": {
        const value = (v[f.key] as string) || "";
        const input = f.multiline ? (
          <Textarea value={value} onChange={(t) => set(f.key, t)} placeholder={f.placeholder} minRows={2} aria-label={f.label || f.placeholder} />
        ) : (
          <Input
            value={value}
            onChange={(t) => set(f.key, t)}
            placeholder={f.placeholder}
            size={f.big ? "lg" : "md"}
            autoFocus={f.focus}
            className={f.mono ? "font-mono" : undefined}
            aria-label={f.label || f.placeholder}
            spellCheck={f.mono ? false : undefined}
          />
        );
        return f.label ? (
          <Field label={f.label} hint={hint}>
            {input}
          </Field>
        ) : (
          <div className="flex flex-col gap-1">
            {input}
            {hint && <p className="text-[12px] text-text3">{hint}</p>}
          </div>
        );
      }
      case "number":
        return (
          <Field label={f.label} hint={hint}>
            <NumberInput value={(v[f.key] as number) ?? null} onChange={(n) => set(f.key, n)} placeholder={f.placeholder || "0"} aria-label={f.label} />
          </Field>
        );
      case "chips":
        return (
          <Field label={f.label} hint={hint}>
            <ChipRow<string | null>
              value={blank(v[f.key]) ? null : (v[f.key] as string)}
              onChange={(x) => set(f.key, x ?? undefined)}
              options={[...(f.clear ? [{ value: null, label: f.clear }] : []), ...f.options.map(([value, label]) => ({ value, label }))]}
            />
          </Field>
        );
      case "pick":
        return (
          <Field label={f.label} hint={hint}>
            <Select<string>
              value={(v[f.key] as string) || ""}
              searchable={f.options.length > 8}
              onChange={(id) => {
                const next = id || null;
                const patch = f.onPick?.(next, v);
                setV((p) => ({ ...p, ...(patch || {}), [f.key]: next }));
              }}
              options={[{ value: "", label: f.none }, ...f.options.map((o) => ({ value: o.id, label: o.name }))]}
            />
          </Field>
        );
      case "day":
        return (
          <Field label={f.label} hint={hint}>
            <DatePicker value={(v[f.key] as string) ?? null} onChange={(d) => set(f.key, d)} placeholder={f.placeholder} clearable={f.clearable !== false} />
          </Field>
        );
      case "minutes":
        return (
          <Field label={f.label} hint={hint}>
            <MinutesInput label={f.label} value={(v[f.key] as number) ?? null} onChange={(m) => set(f.key, m)} quick={f.quick} />
          </Field>
        );
      case "stars":
        return (
          <Field label={f.label} hint={hint}>
            <Stars label={f.label} value={(v[f.key] as number) ?? null} onChange={(n) => set(f.key, n)} />
          </Field>
        );
      case "toggle":
        return <SwitchRow title={f.title} sub={f.sub} checked={!!v[f.key]} onChange={(x) => set(f.key, x)} />;
      case "remind":
        return (
          <Field label={f.label} hint={hint}>
            <RemindChips value={(v[f.key] as number[]) || []} onChange={(x) => set(f.key, x)} options={f.days.map((n) => ({ n, label: remindWord(n) }))} />
          </Field>
        );
    }
  };

  // two half fields in a row share it
  const shown = fields.filter((f) => visible(f, v));
  const rows: ReactNode[] = [];
  for (let i = 0; i < shown.length; i++) {
    const f = shown[i];
    const g = shown[i + 1];
    if (f.half && g?.half) {
      rows.push(
        <div key={`${f.key}+${g.key}`} className="grid grid-cols-2 gap-3">
          <div className="min-w-0">{control(f)}</div>
          <div className="min-w-0">{control(g)}</div>
        </div>,
      );
      i++;
    } else rows.push(<div key={`${f.key}-${i}`}>{control(f)}</div>);
  }

  return (
    <Form footer={<FormFooter ok={!why} why={why} onSave={save} onCancel={close} onDelete={onDelete} deleteLabel={deleteLabel} saveLabel={saveLabel} />}>
      {rows}
      {children?.(v, set)}
    </Form>
  );
}
