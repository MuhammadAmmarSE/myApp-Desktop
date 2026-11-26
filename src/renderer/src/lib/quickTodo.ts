// The quick-add line on To-dos reads a few plain words so a to-do can be added in one go:
//   "Call the plumber tomorrow 10am #home !"  → due tomorrow at 10:00, tag home, high priority
// Days: today, tonight, tomorrow (tmrw), a weekday ("fri", "next monday": the coming one), "in 3 days", a date
// ("12 dec", "dec 12", "2026-12-12"). Times: "10am", "5:30pm", "17:30", "at 9". "every day /
// week / month" repeats it. What it doesn't recognise stays in the title.
import { addDays, isValidDate, parseDate, type Repeat } from "@myapp/core";

export type QuickTodo = { title: string; due: string | null; time: string | null; priority: "high" | "normal"; tags: string[]; repeat: Repeat };

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function weekday(word: string): number {
  const w = word.toLowerCase();
  if (w.length < 3) return -1;
  return DAYS.findIndex((d) => d.startsWith(w));
}

const month = (word: string) => {
  const w = word.toLowerCase().slice(0, 3);
  return MONTHS.indexOf(w);
};

// the next date with that day of the month, this year or next
function onDay(today: string, m: number, d: number): string | null {
  const t = parseDate(today);
  for (const y of [t.getFullYear(), t.getFullYear() + 1]) {
    const s = `${y}-${pad(m + 1)}-${pad(d)}`;
    if (isValidDate(s) && s >= today) return s;
  }
  return null;
}

export function parseQuick(input: string, today: string): QuickTodo {
  let text = ` ${input.trim()} `;
  let due: string | null = null;
  let time: string | null = null;
  let priority: "high" | "normal" = "normal";
  let repeat: Repeat = null;
  const tags: string[] = [];
  // try each place a rule matches until one is accepted, then take those words out of the title
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean, fromEnd = false) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    const all = [...text.matchAll(g)];
    for (const m of fromEnd ? all.reverse() : all) {
      if (fn(m)) {
        text = text.slice(0, m.index!) + " " + text.slice(m.index! + m[0].length);
        return;
      }
    }
  };

  // #tags and a ! for high priority
  text = text.replace(/\s#([\p{L}\p{N}_-]{1,30})/gu, (_, t: string) => (tags.push(t.toLowerCase()), " "));
  take(/\s!{1,3}(?=\s)/, () => ((priority = "high"), true));
  take(/\s(?:high priority|urgent)(?=\s)/i, () => ((priority = "high"), true));

  // repeats
  take(/\s(?:every\s?day|daily)(?=\s)/i, () => ((repeat = "daily"), true));
  take(/\s(?:every\s?week|weekly)(?=\s)/i, () => ((repeat = "weekly"), true));
  take(/\s(?:every\s?month|monthly)(?=\s)/i, () => ((repeat = "monthly"), true));

  // times: 10am, 5:30 pm, 17:30, at 9
  take(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i, (m) => {
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    if (h < 1 || h > 12 || min > 59) return false;
    if (m[3].toLowerCase() === "pm" && h !== 12) h += 12;
    if (m[3].toLowerCase() === "am" && h === 12) h = 0;
    time = `${pad(h)}:${pad(min)}`;
    return true;
  });
  if (!time)
    take(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => {
      time = `${pad(Number(m[1]))}:${m[2]}`;
      return true;
    });
  if (!time)
    take(/\sat\s(\d{1,2})(?=\s)/i, (m) => {
      const h = Number(m[1]);
      if (h > 23) return false;
      // "at 9" means the morning, "at 5" the afternoon: the next sensible hour
      time = `${pad(h < 7 ? h + 12 : h)}:00`;
      return true;
    });

  // days
  take(/\stoday(?=\s)/i, () => ((due = today), true));
  take(/\stonight(?=\s)/i, () => ((due = today), time || (time = "20:00"), true));
  take(/\s(?:tomorrow|tmrw|tmr)(?=\s)/i, () => ((due = addDays(today, 1)), true));
  take(/\sin\s(\d{1,3})\s(day|days|week|weeks)(?=\s)/i, (m) => ((due = addDays(today, Number(m[1]) * (m[2].startsWith("week") ? 7 : 1))), true));
  take(/\snext\sweek(?=\s)/i, () => ((due = addDays(today, 7)), true));
  take(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (m) => (isValidDate(m[1]) ? ((due = m[1]), true) : false));
  take(/\s(\d{1,2})(?:st|nd|rd|th)?\s([a-z]{3,9})(?=\s)/i, (m) => {
    const mo = month(m[2]);
    if (mo < 0) return false;
    const d = onDay(today, mo, Number(m[1]));
    return d ? ((due = d), true) : false;
  });
  take(/\s([a-z]{3,9})\s(\d{1,2})(?:st|nd|rd|th)?(?=\s)/i, (m) => {
    const mo = month(m[1]);
    if (mo < 0 || due) return false;
    const d = onDay(today, mo, Number(m[2]));
    return d ? ((due = d), true) : false;
  });
  // a weekday: the coming one ("next friday" too); the last one in the line wins, so a word in
  // the title that happens to be a day ("sat dish") stays in the title
  take(
    /\s(?:on\s)?(?:next\s|this\s)?([a-z]{3,9})(?=\s)/i,
    (m) => {
      const w = weekday(m[1]);
      if (w < 0 || due) return false;
      const t = parseDate(today).getDay();
      let ahead = (w - t + 7) % 7;
      if (ahead === 0) ahead = 7;
      due = addDays(today, ahead);
      return true;
    },
    true,
  );
  // a time with no day means today
  if (time && !due) due = today;
  if (repeat && !due) due = today;

  const title = text.replace(/\s+/g, " ").trim();
  return { title: title.charAt(0).toUpperCase() + title.slice(1), due, time, priority, tags: [...new Set(tags)], repeat };
}
