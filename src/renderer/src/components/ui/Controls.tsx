// Small controls: switch, checkbox, segmented control, select, chips, tags, badges, key caps.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { Popover } from "./Overlay";
import { useFieldId } from "./Field";
import { ease } from "@/theme/motion";

// `visible` shows the label beside the switch (in editors); without it the label is only read out
// (in a settings row whose title already says it)
export function Switch({ checked, onChange, label, disabled, size = "md", visible }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean; size?: "sm" | "md"; visible?: boolean }) {
  const w = size === "sm" ? 30 : 36;
  const h = size === "sm" ? 18 : 21;
  const k = h - 6;
  const sw = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx("relative shrink-0 rounded-full transition-[background-color,box-shadow] duration-200 disabled:opacity-40", checked ? "accent-grad shadow-[0_0_0_1px_transparent,0_4px_14px_-6px_var(--c-glow)]" : "bg-surface2 hairline")}
      style={{ width: w, height: h }}
    >
      <motion.span
        className={clsx("absolute top-[3px] rounded-full shadow-sm", checked ? "bg-on-accent" : "bg-text2")}
        style={{ width: k, height: k }}
        initial={false}
        animate={{ left: checked ? w - k - 3 : 3 }}
        transition={{ duration: 0.2, ease: ease.standard }}
      />
    </button>
  );
  if (!visible || !label) return sw;
  return (
    <label className={clsx("inline-flex cursor-default select-none items-center gap-2 text-[13px]", checked ? "text-text" : "text-text2", disabled && "opacity-50")}>
      {sw}
      {label}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, size = 18, round, disabled, className }: { checked: boolean; onChange?: (v: boolean) => void; label?: string; size?: number; round?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={clsx(
        "group/cb relative grid shrink-0 place-items-center transition-[background-color,box-shadow,transform] duration-150 active:scale-90 disabled:opacity-40",
        round ? "rounded-full" : "rounded-[6px]",
        checked ? "accent-grad shadow-[0_3px_10px_-4px_var(--c-glow)]" : "shadow-[inset_0_0_0_1.6px_var(--c-text3)] hover:shadow-[inset_0_0_0_1.6px_var(--c-accent)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size - 4} height={size - 4} className="text-on-accent">
        <motion.path
          d="M5 12.5l4.2 4.2L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.22, ease: ease.out }}
        />
      </svg>
    </button>
  );
}

export type SegOption<T extends string> = { value: T; label: ReactNode; icon?: LucideIcon; count?: number };

export function Segmented<T extends string>({ value, onChange, options, size = "md", className, block }: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; size?: "sm" | "md"; className?: string; block?: boolean }) {
  const id = useId();
  return (
    <div role="tablist" className={clsx("inline-flex rounded-[10px] bg-surface2 p-[3px] hairline", block && "flex w-full", className)}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(o.value)}
            className={clsx(
              "relative flex items-center justify-center gap-1.5 rounded-[8px] font-medium transition-colors duration-150",
              size === "sm" ? "h-6 px-2.5 text-[12px]" : "h-7 px-3 text-[12.5px]",
              block && "flex-1",
              on ? "text-text" : "text-text3 hover:text-text2",
            )}
          >
            {on && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-[8px] bg-surface shadow-[var(--shadow-card)] hairline" transition={{ duration: 0.22, ease: ease.standard }} />}
            <span className="relative flex items-center gap-1.5">
              {Icon && <Icon size={13} strokeWidth={2.2} />}
              {o.label}
              {o.count != null && o.count > 0 && <span className={clsx("rounded-full px-1.5 text-[10.5px] tnum", on ? "bg-accent-soft text-accent-text" : "bg-hover text-text3")}>{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type SelectOption<T> = { value: T; label: string; hint?: string; icon?: LucideIcon; color?: string };

export function Select<T extends string | number | null>({
  value,
  onChange,
  options,
  placeholder = "Choose",
  size = "md",
  className,
  icon: Icon,
  width,
  searchable,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
  icon?: LucideIcon;
  width?: number;
  searchable?: boolean;
  label?: string;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const fieldId = useFieldId();
  const list = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value);
  useEffect(() => {
    if (el && !searchable) setTimeout(() => list.current?.focus(), 0);
  }, [el, searchable]);
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const close = useCallback(() => {
    setEl(null);
    setQ("");
  }, []);
  const pick = (o: SelectOption<T>) => {
    onChange(o.value);
    close();
  };
  return (
    <>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-label={label}
        id={fieldId}
        onClick={(e) => {
          setEl(el ? null : e.currentTarget);
          setActive(Math.max(0, options.findIndex((o) => o.value === value)));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setEl(e.currentTarget);
          }
        }}
        className={clsx(
          "group/sel flex w-full items-center gap-2 rounded-[10px] bg-surface2 px-3 text-left text-text hairline transition-[box-shadow] hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-text3)_55%,transparent)]",
          el && "!shadow-[inset_0_0_0_1px_var(--c-accent),0_0_0_3px_color-mix(in_srgb,var(--c-accent)_22%,transparent)]",
          size === "sm" ? "h-8 text-[13px]" : "h-9 text-[13.5px]",
          className,
        )}
      >
        {Icon && <Icon size={15} className="shrink-0 text-text3" />}
        {cur?.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cur.color }} />}
        {cur?.icon && !Icon && <cur.icon size={15} className="shrink-0 text-text2" />}
        <span className={clsx("flex-1 truncate", !cur && "text-text3")}>{cur?.label ?? placeholder}</span>
        <ChevronDown size={15} className={clsx("shrink-0 text-text3 transition-transform duration-200", el && "rotate-180")} />
      </button>
      <Popover open={!!el} anchor={el} onClose={close} width={width ?? Math.max(el?.offsetWidth || 180, 180)}>
        {searchable && (
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Search…"
            className="mb-1 h-8 w-full rounded-[8px] bg-surface2 px-2.5 text-[13px] text-text outline-none placeholder:text-text3"
          />
        )}
        <div
          ref={list}
          role="listbox"
          tabIndex={-1}
          className="max-h-[300px] overflow-y-auto outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(shown.length - 1, a + 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
            if (e.key === "Enter" && shown[active]) pick(shown[active]);
          }}
        >
          {shown.map((o, i) => (
            <div
              key={String(o.value)}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={clsx("flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-[13px]", i === active && "bg-hover")}
            >
              {o.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color }} />}
              {o.icon && <o.icon size={15} className="shrink-0 text-text2" />}
              <span className="flex-1 truncate">{o.label}</span>
              {o.hint && <span className="text-[11.5px] text-text3">{o.hint}</span>}
              {o.value === value && <Check size={14} className="text-accent-text" />}
            </div>
          ))}
          {!shown.length && <div className="px-2.5 py-2 text-[12.5px] text-text3">Nothing matches</div>}
        </div>
      </Popover>
    </>
  );
}

export function Chip({ active, onClick, children, icon: Icon, count, className, tone }: { active?: boolean; onClick?: () => void; children: ReactNode; icon?: LucideIcon; count?: number; className?: string; tone?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-150 active:scale-[0.97]",
        active ? "bg-accent-soft text-accent-text shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-accent)_45%,transparent)]" : "bg-surface2 text-text2 hairline hover:text-text",
        className,
      )}
    >
      {tone && <span className="h-2 w-2 rounded-full" style={{ background: tone }} />}
      {Icon && <Icon size={13} strokeWidth={2.2} />}
      {children}
      {count != null && <span className={clsx("tnum text-[11px]", active ? "opacity-80" : "text-text3")}>{count}</span>}
    </button>
  );
}

export function Tag({ children, onClick, onRemove, tone = "default", className }: { children: ReactNode; onClick?: () => void; onRemove?: () => void; tone?: "default" | "accent" | "success" | "warn" | "danger" | "info"; className?: string }) {
  const tones = {
    default: "bg-hover text-text2",
    accent: "bg-accent-soft text-accent-text",
    success: "bg-[color-mix(in_srgb,var(--c-success)_15%,transparent)] text-success",
    warn: "bg-[color-mix(in_srgb,var(--c-warn)_16%,transparent)] text-warn",
    danger: "bg-[color-mix(in_srgb,var(--c-danger)_15%,transparent)] text-danger",
    info: "bg-[color-mix(in_srgb,var(--c-info)_15%,transparent)] text-info",
  };
  return (
    <span onClick={onClick} className={clsx("inline-flex h-5 max-w-full items-center gap-1 rounded-[6px] px-1.5 text-[11.5px] font-medium", tones[tone], onClick && "cursor-default hover:brightness-125", className)}>
      <span className="truncate [&>svg]:inline [&>svg]:align-[-1.5px]">{children}</span>
      {onRemove && (
        <button type="button" aria-label="Remove" onClick={(e) => (e.stopPropagation(), onRemove())} className="-mr-0.5 rounded opacity-60 hover:opacity-100">
          ×
        </button>
      )}
    </span>
  );
}

export function Badge({ children, tone = "accent", className }: { children: ReactNode; tone?: "accent" | "muted" | "danger" | "warn"; className?: string }) {
  const tones = { accent: "accent-grad text-on-accent", muted: "bg-hover text-text2", danger: "bg-danger text-white", warn: "bg-warn text-black" };
  return <span className={clsx("inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[10.5px] font-semibold tnum", tones[tone], className)}>{children}</span>;
}

export const Kbd = ({ children, className }: { children: ReactNode; className?: string }) => (
  <kbd className={clsx("inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line bg-surface2 px-1.5 font-sans text-[11px] font-medium text-text2 shadow-[0_1px_0_var(--c-line)]", className)}>{children}</kbd>
);

export const Divider = ({ className }: { className?: string }) => <div className={clsx("h-px w-full bg-line", className)} />;
