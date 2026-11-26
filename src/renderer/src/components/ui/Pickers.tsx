// Picking a day and a time. The day picker is a month you can page through, with Today, Tomorrow
// and Next week one click away; the time field takes "5pm", "17:30" or "930" and shows it back as
// a time, with the common ones offered.
import { useMemo, useState } from "react";
import clsx from "clsx";
import { useFieldId } from "./Field";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { addDays, dayWord, isoDate, isValidTime, parseDate, shortDate, time12 } from "@myapp/core";
import { Popover } from "./Overlay";
import { MONTHS_LONG, WEEKDAYS_SHORT } from "@/lib/format";
import { useSettings } from "@/store/settings";

export function MonthGrid({ value, onPick, marks, weekStart, month, onMonth }: { value?: string | null; onPick: (d: string) => void; marks?: Record<string, number>; weekStart: 0 | 1; month: string; onMonth: (m: string) => void }) {
  const today = isoDate();
  const first = parseDate(`${month}-01`);
  const shift = (first.getDay() - weekStart + 7) % 7;
  const start = addDays(`${month}-01`, -shift);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const names = weekStart === 1 ? [...WEEKDAYS_SHORT.slice(1), WEEKDAYS_SHORT[0]] : WEEKDAYS_SHORT;
  const step = (n: number) => {
    const d = new Date(first.getFullYear(), first.getMonth() + n, 1);
    onMonth(isoDate(d).slice(0, 7));
  };
  return (
    <div className="w-[252px] select-none">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-display text-[14px] font-semibold">
          {MONTHS_LONG[first.getMonth()]} <span className="text-text3">{first.getFullYear()}</span>
        </span>
        <div className="flex gap-0.5">
          <button type="button" aria-label="Previous month" onClick={() => step(-1)} className="grid h-7 w-7 place-items-center rounded-md text-text2 hover:bg-hover">
            <ChevronLeft size={16} />
          </button>
          <button type="button" aria-label="Next month" onClick={() => step(1)} className="grid h-7 w-7 place-items-center rounded-md text-text2 hover:bg-hover">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {names.map((n) => (
          <div key={n} className="pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-text3">
            {n.slice(0, 2)}
          </div>
        ))}
        {days.map((d) => {
          const out = d.slice(0, 7) !== month;
          const sel = d === value;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              aria-label={d}
              aria-pressed={sel}
              onClick={() => onPick(d)}
              className={clsx(
                "relative grid h-8 place-items-center rounded-[8px] text-[12.5px] tnum transition-colors",
                sel ? "accent-grad font-semibold text-on-accent shadow-[0_4px_12px_-5px_var(--c-glow)]" : isToday ? "font-semibold text-accent-text hover:bg-hover" : out ? "text-text3/60 hover:bg-hover" : "text-text hover:bg-hover",
              )}
            >
              {Number(d.slice(8))}
              {!!marks?.[d] && !sel && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// "Today · 26 Nov", "Friday · 29 Nov", "Mon 6 Jan 2027"
const dateLabel = (d: string, today: string) => {
  const w = dayWord(d, today);
  return /\d/.test(w) ? w : `${w} · ${shortDate(d, today)}`;
};

export function DatePicker({ value, onChange, placeholder = "No date", clearable = true, size = "md", className, presets = true }: { value: string | null | undefined; onChange: (d: string | null) => void; placeholder?: string; clearable?: boolean; size?: "sm" | "md"; className?: string; presets?: boolean }) {
  const weekStart = useSettings((s) => s.weekStart);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [month, setMonth] = useState((value || isoDate()).slice(0, 7));
  const fieldId = useFieldId();
  const today = isoDate();
  const nextWeek = useMemo(() => {
    const d = parseDate(today);
    const toMon = (8 - d.getDay()) % 7 || 7;
    return addDays(today, toMon);
  }, [today]);
  const pick = (d: string | null) => {
    onChange(d);
    setEl(null);
  };
  return (
    <>
      <button
        type="button"
        id={fieldId}
        onClick={(e) => {
          setMonth((value || today).slice(0, 7));
          setEl(el ? null : e.currentTarget);
        }}
        className={clsx(
          "group/dp flex w-full items-center gap-2 rounded-[10px] bg-surface2 px-3 text-left hairline transition-[box-shadow] hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-text3)_55%,transparent)]",
          el && "!shadow-[inset_0_0_0_1px_var(--c-accent),0_0_0_3px_color-mix(in_srgb,var(--c-accent)_22%,transparent)]",
          size === "sm" ? "h-8 text-[13px]" : "h-9 text-[13.5px]",
          className,
        )}
      >
        <CalendarDays size={15} className="shrink-0 text-text3" />
        <span className={clsx("flex-1 truncate", !value && "text-text3")}>{value ? dateLabel(value, today) : placeholder}</span>
        {clearable && value && (
          <span
            role="button"
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="grid h-5 w-5 place-items-center rounded text-text3 opacity-0 hover:bg-hover hover:text-text group-hover/dp:opacity-100"
          >
            <X size={13} />
          </span>
        )}
      </button>
      <Popover open={!!el} anchor={el} onClose={() => setEl(null)} className="p-3">
        {presets && (
          <div className="mb-3 grid grid-cols-3 gap-1">
            {[
              ["Today", today],
              ["Tomorrow", addDays(today, 1)],
              ["Next week", nextWeek],
            ].map(([l, d]) => (
              <button key={l} type="button" onClick={() => pick(d)} className={clsx("h-7 rounded-[7px] text-[12px] font-medium hover:bg-hover", value === d ? "bg-accent-soft text-accent-text" : "bg-surface2 text-text2")}>
                {l}
              </button>
            ))}
          </div>
        )}
        <MonthGrid value={value} onPick={pick} weekStart={weekStart} month={month} onMonth={setMonth} />
      </Popover>
    </>
  );
}

// "5pm", "5:30 pm", "17:30", "930", "9" -> "HH:mm" (null if it can't be read)
export function parseTime(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, ":");
  if (!s) return null;
  if (isValidTime(s)) return s;
  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap.startsWith("p") && h < 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const COMMON = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

export function TimeField({ value, onChange, placeholder = "No time", size = "md", className }: { value: string | null | undefined; onChange: (t: string | null) => void; placeholder?: string; size?: "sm" | "md"; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const fieldId = useFieldId();
  const shown = text ?? (value ? time12(value) : "");
  const commit = () => {
    if (text == null) return;
    const t = parseTime(text);
    if (t || text.trim() === "") onChange(t);
    setText(null);
  };
  return (
    <>
      <div
        className={clsx(
          "group/tf flex w-full items-center gap-2 rounded-[10px] bg-surface2 px-3 hairline transition-[box-shadow] focus-within:!shadow-[inset_0_0_0_1px_var(--c-accent),0_0_0_3px_color-mix(in_srgb,var(--c-accent)_22%,transparent)]",
          size === "sm" ? "h-8 text-[13px]" : "h-9 text-[13.5px]",
          className,
        )}
      >
        <Clock size={15} className="shrink-0 text-text3" />
        <input
          value={shown}
          placeholder={placeholder}
          onFocus={(e) => setEl(e.currentTarget.parentElement)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            commit();
            setTimeout(() => setEl(null), 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              setEl(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={fieldId ? undefined : "Time"}
          id={fieldId}
          className="w-full min-w-0 bg-transparent text-text outline-none placeholder:text-text3"
        />
        {text != null && text.trim() && !parseTime(text) && <span className="shrink-0 text-[11px] text-warn">e.g. 5:30pm</span>}
        {value && text == null && (
          <button type="button" aria-label="Clear time" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(null)} className="grid h-5 w-5 place-items-center rounded text-text3 opacity-0 hover:bg-hover hover:text-text group-hover/tf:opacity-100">
            <X size={13} />
          </button>
        )}
      </div>
      <Popover open={!!el} anchor={el} onClose={() => setEl(null)} width={el?.offsetWidth} className="max-h-[220px] overflow-y-auto">
        {COMMON.map((t) => (
          <button
            key={t}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(t);
              setText(null);
              setEl(null);
            }}
            className={clsx("flex h-7 w-full items-center rounded-[7px] px-2.5 text-[12.5px] hover:bg-hover", value === t ? "text-accent-text" : "text-text")}
          >
            {time12(t)}
          </button>
        ))}
      </Popover>
    </>
  );
}
