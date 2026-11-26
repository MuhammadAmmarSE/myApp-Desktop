// Words and numbers as the screens show them (the phone and the desktop app alike).
import { daysBetween, isoDate, parseDate } from "./dates";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const dayWord = (date: string, today = isoDate()) => {
  const n = daysBetween(today, date);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  const d = parseDate(date);
  if (n > 1 && n < 7) return WEEKDAYS_LONG[d.getDay()];
  const sameYear = d.getFullYear() === parseDate(today).getFullYear();
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? "" : ` ${d.getFullYear()}`}`;
};
// "10 Dec", or "10 Dec 2027" when it isn't this year
export const shortDate = (date: string, today = isoDate()) => {
  const d = parseDate(date);
  const sameYear = d.getFullYear() === parseDate(today).getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? "" : ` ${d.getFullYear()}`}`;
};
export const monthDay = (month: number, day: number) => `${day} ${MONTHS[month - 1]}`;

export const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const hr = h % 12 || 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${ap}` : `${hr}${ap}`;
};
export const clock = (ms: number) => {
  const d = new Date(ms);
  return time12(`${d.getHours()}:${d.getMinutes()}`);
};
export const whenWord = (ms: number) => {
  const d = new Date(ms);
  return `${dayWord(isoDate(d))}, ${clock(ms)}`;
};
export const ago = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
export const greeting = (h = new Date().getHours()) => (h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good night");

const SYMBOLS: Record<string, string> = { PKR: "Rs", USD: "$", AED: "AED", SAR: "SAR", GBP: "£", EUR: "€" };
export const CURRENCIES = Object.keys(SYMBOLS);
const group = (n: number) => {
  const [i, f] = Math.abs(n).toFixed(2).split(".");
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return f === "00" ? int : `${int}.${f}`;
};
export const money = (n: number, currency = "PKR") => {
  const sym = SYMBOLS[currency] || currency;
  const s = `${sym}${sym.length > 1 ? " " : ""}${group(n)}`;
  return n < 0 ? `−${s}` : s;
};
// 1,240,000 -> 1.24M ; 48,500 -> 48.5k
export const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 2).replace(/\.?0+$/, "")}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "")}k`;
  return group(n);
};
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
