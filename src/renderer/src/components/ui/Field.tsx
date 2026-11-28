// Text fields. Every field has a clear button once something is typed, a quiet border that lights
// up in the accent when you're in it, and room for an icon and a hint.
import { createContext, forwardRef, useContext, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type MutableRefObject, type ReactNode, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";
import { X, type LucideIcon } from "lucide-react";
import { groupTyped, ungroup } from "@myapp/core";

// A Field's label belongs to the first control inside it (screen readers read it, clicking it
// focuses the control). Controls ask for the id with useFieldId; only the first one gets it, so a
// field holding several inputs never repeats an id.
const FieldCtx = createContext<{ id: string; owner: MutableRefObject<string | null> } | null>(null);
export function useFieldId(own?: string): string | undefined {
  const ctx = useContext(FieldCtx);
  const me = useId();
  if (own) return own;
  if (!ctx) return undefined;
  if (ctx.owner.current === null) ctx.owner.current = me;
  return ctx.owner.current === me ? ctx.id : undefined;
}

export const fieldBox =
  "group/field relative flex w-full items-center rounded-[10px] bg-surface2 hairline transition-[box-shadow,background-color] duration-150 hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-text3)_55%,transparent)] focus-within:!shadow-[inset_0_0_0_1px_var(--c-accent),0_0_0_3px_color-mix(in_srgb,var(--c-accent)_22%,transparent)]";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> & {
  icon?: LucideIcon;
  onChange?: (value: string) => void;
  clearable?: boolean;
  size?: "sm" | "md" | "lg";
  invalid?: boolean;
  right?: ReactNode;
  boxClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon: Icon, onChange, clearable = true, size = "md", invalid, right, className, boxClassName, value, ...rest },
  ref,
) {
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement);
  const id = useFieldId(rest.id);
  const h = size === "sm" ? "h-8 text-[13px]" : size === "lg" ? "h-11 text-[15px]" : "h-9 text-[13.5px]";
  const showClear = clearable && value != null && String(value).length > 0 && !rest.readOnly && !rest.disabled;
  return (
    <div className={clsx(fieldBox, invalid && "!shadow-[inset_0_0_0_1px_var(--c-danger)]", rest.disabled && "opacity-55", boxClassName)}>
      {Icon && <Icon size={15} strokeWidth={2} className="pointer-events-none ml-3 shrink-0 text-text3 transition-colors group-focus-within/field:text-accent-text" />}
      <input
        ref={inner}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        spellCheck={rest.type === "email" || rest.type === "password" ? false : rest.spellCheck}
        className={clsx("w-full min-w-0 bg-transparent px-3 text-text outline-none placeholder:text-text3", Icon && "pl-2", h, className)}
        {...rest}
        id={id}
      />
      {showClear && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange?.("");
            inner.current?.focus();
          }}
          className="mr-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-text3 opacity-0 transition-opacity hover:bg-hover hover:text-text group-focus-within/field:opacity-100 group-hover/field:opacity-100"
        >
          <X size={14} />
        </button>
      )}
      {right}
    </div>
  );
});

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & {
  onChange?: (value: string) => void;
  autoGrow?: boolean;
  minRows?: number;
  maxRows?: number;
  boxClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { onChange, autoGrow = true, minRows = 3, maxRows = 14, className, boxClassName, value, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);
  const id = useFieldId(rest.id);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = "auto";
    const pad = 20;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minRows * lh + pad), maxRows * lh + pad)}px`;
  }, [value, autoGrow, minRows, maxRows]);
  return (
    <div className={clsx(fieldBox, "items-stretch", boxClassName)}>
      <textarea
        ref={inner}
        value={value ?? ""}
        rows={minRows}
        onChange={(e) => onChange?.(e.target.value)}
        className={clsx("w-full resize-none bg-transparent px-3 py-2.5 text-[13.5px] leading-[1.5] text-text outline-none placeholder:text-text3", className)}
        {...rest}
        id={id}
      />
    </div>
  );
});

export function Field({ label, hint, error, children, className, htmlFor, right }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; htmlFor?: string; right?: ReactNode }) {
  const auto = useId();
  const owner = useRef<string | null>(null);
  const id = htmlFor || auto;
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      {(label || right) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={id} className="text-[12px] font-medium text-text2">
              {label}
            </label>
          )}
          {right}
        </div>
      )}
      {htmlFor ? children : <FieldCtx.Provider value={{ id, owner }}>{children}</FieldCtx.Provider>}
      {error ? <p className="text-[12px] text-danger">{error}</p> : hint ? <p className="text-[12px] text-text3">{hint}</p> : null}
    </div>
  );
}

// a number, typed freely: shown with its thousands marked as you type ("150,000"), handed back as a
// number; null when empty. `plain` leaves the marks out (a year).
const markOf = (v: number | null | undefined, plain?: boolean) => (v == null ? "" : plain ? String(v) : groupTyped(String(v)));
export function NumberInput({ value, onChange, plain, ...rest }: Omit<InputProps, "value" | "onChange"> & { value: number | null | undefined; onChange: (v: number | null) => void; plain?: boolean }) {
  const [text, setText] = useState(markOf(value, plain));
  const inner = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  // a value set from outside (a reset, an edit elsewhere) shows; one being typed is left alone
  useEffect(() => {
    const raw = plain ? text.replace(/,/g, "") : ungroup(text);
    const cur = raw.trim() === "" ? null : Number(raw);
    if ((value ?? null) !== (Number.isNaN(cur as number) ? null : cur)) setText(markOf(value, plain));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // the caret stays after the digit you just typed, though the marks moved round it
  useLayoutEffect(() => {
    const el = inner.current;
    if (caret.current == null || !el || document.activeElement !== el) return;
    el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);
  return (
    <Input
      ref={inner}
      inputMode="decimal"
      value={text}
      onChange={(v) => {
        if (plain) {
          const clean = v.replace(/[^\d.,-]/g, "");
          setText(clean);
          const n = Number(clean.replace(/,/g, ""));
          onChange(clean === "" || Number.isNaN(n) ? null : n);
          return;
        }
        const pos = inner.current?.selectionStart ?? v.length;
        const before = v.slice(0, pos).replace(/[^\d.]/g, "").length;
        const shown = groupTyped(v);
        let i = 0;
        for (let seen = 0; i < shown.length && seen < before; i++) if (/[\d.]/.test(shown[i])) seen++;
        caret.current = i;
        setText(shown);
        const raw = ungroup(v);
        const n = Number(raw);
        onChange(raw === "" || Number.isNaN(n) ? null : n);
      }}
      {...rest}
      className={clsx("tnum", rest.className)}
    />
  );
}
