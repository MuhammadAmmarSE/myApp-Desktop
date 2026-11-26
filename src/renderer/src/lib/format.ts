// Dates, times and money as the screens show them: the same words as on the phone (core/format).
export { MONTHS_LONG, WEEKDAYS_LONG, dayWord, shortDate, monthDay, time12, clock, whenWord, ago, greeting, CURRENCIES, money, compact, plural, addDays, isoDate } from "@myapp/core";

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// 1,234 words · 6 min read
export const readingTime = (text: string) => {
  const words = (text.trim().match(/\S+/g) || []).length;
  return { words, minutes: Math.max(1, Math.round(words / 220)) };
};

export const initials = (name: string) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("") || "?";

// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st
export const ordinal = (n: number) => {
  const t = n % 100;
  const suffix = t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
};
