// Local-calendar helpers. Dates are stored as YYYY-MM-DD strings in the person's own calendar
// (what they meant when they said "Saturday"), never converted through UTC.

const pad = (n: number) => String(n).padStart(2, "0");

export const isoDate = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isoTime = (d: Date = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidDate = (s: unknown): s is string => {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};
export const isValidTime = (s: unknown): s is string => typeof s === "string" && TIME_RE.test(s);

// "2026-11-26" -> a Date at local midnight
export const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
// "2026-11-26" + "14:30" -> epoch ms in the device's own time zone
export const toEpoch = (date: string, time?: string | null) => {
  const d = parseDate(date);
  if (time && isValidTime(time)) {
    const [h, mi] = time.split(":").map(Number);
    d.setHours(h, mi, 0, 0);
  }
  return d.getTime();
};

export const addDays = (s: string, n: number) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

export const daysBetween = (from: string, to: string) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);

// The next time a yearly date (month/day) comes round, on or after `from`. 29 Feb falls on
// 28 Feb in a year without it.
export const nextOccurrence = (month: number, day: number, from: string = isoDate()) => {
  const f = parseDate(from);
  const at = (y: number) => {
    const last = new Date(y, month, 0).getDate();
    return new Date(y, month - 1, Math.min(day, last));
  };
  let d = at(f.getFullYear());
  if (d.getTime() < f.getTime()) d = at(f.getFullYear() + 1);
  return isoDate(d);
};

// How many years a yearly date marks on its next occurrence (a 3rd birthday, a 5th anniversary).
export const yearsAt = (year: number | null | undefined, next: string) => (year ? parseDate(next).getFullYear() - year : null);

export const startOfMonth = (s: string = isoDate()) => `${s.slice(0, 7)}-01`;
export const monthKey = (s: string) => s.slice(0, 7);
