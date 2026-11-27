// Saving Interests, and what its page draws. Getting something on the wishlist can save it in
// Money (Shopping) and in My things at once; Undo takes both back. Removing an interest removes its
// practice log; its words stay. (The phone's lib/interests.ts does the same.)
import { addDays, isoDate, parseDate, weekStart, type PracticeData, type Rec, type WishData } from "@myapp/core";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";

export function gotWish(rec: Rec<"wish">, opts: { money: boolean; thing: boolean }, today = isoDate()): () => void {
  const s = useRecords.getState();
  const price = rec.data.price && rec.data.price > 0 ? rec.data.price : null;
  const money = opts.money && price ? s.create("money", { type: "expense", amount: price, currency: useSettings.getState().currency, category: "Shopping", note: rec.data.name, date: today, account: "cash", recurring: null }) : null;
  const thing = opts.thing ? s.create("thing", { name: rec.data.name, category: "Other", bought_on: today, price, money_id: money?.id ?? null, notes: rec.data.link || undefined }) : null;
  const patch: Partial<WishData> = { got: true, got_on: today, money_id: money?.id ?? null, thing_id: thing?.id ?? null };
  s.update<"wish">(rec.id, patch);
  return () => {
    const st = useRecords.getState();
    st.update<"wish">(rec.id, { got: undefined, got_on: null, money_id: null, thing_id: null });
    if (money) st.remove(money.id);
    if (thing) st.remove(thing.id);
  };
}

export function removeInterest(rec: Rec<"interest">): () => void {
  const s = useRecords.getState();
  const practice = (s.lists.practice as Rec<"practice">[]).filter((p) => p.data.interest_id === rec.id);
  s.remove(rec.id);
  for (const p of practice) s.remove(p.id);
  return () => {
    useRecords.getState().restore(rec);
    for (const p of practice) useRecords.getState().restore(p);
  };
}

// "kitab = book", "kitab - book", "kitab: book" → a word and its meaning
export function splitWord(s: string): [string, string] | null {
  const m = s.match(/^(.+?)\s*(?:=|:|\s-\s|–|—)\s*(.+)$/);
  return m && m[1].trim() && m[2].trim() ? [m[1].trim(), m[2].trim()] : null;
}

// The last `weeks` weeks of practice as a grid: one column a week (Monday at the top), each day
// with its minutes; days after today are left out. For the page's heat map.
export function practiceGrid(practice: { data: PracticeData }[], today: string, weeks = 12, interestId?: string | null): { date: string; minutes: number; weekday: number }[][] {
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const by = new Map<string, number>();
  for (const p of practice) {
    if (interestId && p.data.interest_id !== interestId) continue;
    if (p.data.date < first || p.data.date > today || !(p.data.minutes > 0)) continue;
    by.set(p.data.date, (by.get(p.data.date) || 0) + p.data.minutes);
  }
  const cols: { date: string; minutes: number; weekday: number }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d);
      if (date > today) break;
      col.push({ date, minutes: by.get(date) || 0, weekday: (parseDate(date).getDay() + 6) % 7 });
    }
    cols.push(col);
  }
  return cols;
}
