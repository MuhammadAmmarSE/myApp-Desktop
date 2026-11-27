// Interests' arithmetic, shared by the apps: practice time and streaks, and words to remember
// (flashcards that come back less often the better you know them). Pure, tested here once.
import { addDays } from "./dates";
import type { PracticeData, WordData } from "./kinds";
import { weekStart } from "./work";

type P = { data: PracticeData };

// Days until a word comes back, by how well you know it (its box, 0..5): a new or missed word the
// same day, then 1, 3, 7, 14 and 30 days.
export const WORD_GAPS = [0, 1, 3, 7, 14, 30];

// After answering a word: knew it moves it up a box (and further away), didn't sends it back to
// the start (it comes up again today).
export function reviewWord(word: WordData, knew: boolean, today: string): Pick<WordData, "box" | "due" | "right" | "wrong"> {
  const box = knew ? Math.min(WORD_GAPS.length - 1, (word.box || 0) + 1) : 0;
  return { box, due: addDays(today, WORD_GAPS[box]), right: (word.right || 0) + (knew ? 1 : 0), wrong: (word.wrong || 0) + (knew ? 0 : 1) };
}

// Words to go over now: due today or before (a new word is due straight away), most overdue
// first, then the ones you know least.
export function dueWords<T extends { data: WordData }>(words: T[], today: string, interestId?: string | null): T[] {
  return words.filter((w) => (!interestId || w.data.interest_id === interestId) && (!w.data.due || w.data.due <= today)).sort((a, b) => (a.data.due || "").localeCompare(b.data.due || "") || (a.data.box || 0) - (b.data.box || 0));
}

// How well a set of words is known: how many in each box, and how many you know well (box 4+).
export function wordProgress(words: { data: WordData }[]) {
  const boxes = WORD_GAPS.map(() => 0);
  for (const w of words) boxes[Math.min(WORD_GAPS.length - 1, Math.max(0, w.data.box || 0))]++;
  return { total: words.length, boxes, known: boxes[4] + boxes[5] };
}

const forInterest = (p: P, id?: string | null) => !id || p.data.interest_id === id;

// Minutes practised each of the last 7 days (oldest first, today last).
export function last7Days(practice: P[], today: string, interestId?: string | null): number[] {
  const days = [6, 5, 4, 3, 2, 1, 0].map((n) => addDays(today, -n));
  const out = days.map(() => 0);
  for (const p of practice) {
    if (!forInterest(p, interestId)) continue;
    const i = days.indexOf(p.data.date);
    if (i >= 0) out[i] += p.data.minutes > 0 ? p.data.minutes : 0;
  }
  return out;
}

// Minutes this week (Monday on).
export function practiceThisWeek(practice: P[], today: string, interestId?: string | null): number {
  const from = weekStart(today);
  let m = 0;
  for (const p of practice) if (forInterest(p, interestId) && p.data.date >= from && p.data.date <= today && p.data.minutes > 0) m += p.data.minutes;
  return m;
}

// Days in a row with some practice, up to today (or up to yesterday, while today's still to come).
export function practiceStreak(practice: P[], today: string, interestId?: string | null): number {
  const days = new Set<string>();
  for (const p of practice) if (forInterest(p, interestId) && p.data.minutes > 0) days.add(p.data.date);
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
