// One price for several things on your list: you bought five vegetables for 1,000 together and
// don't know (or care) what each cost. It's saved once, as one expense, and every item it covers
// points at it (money_id), with no price of its own: nothing is counted twice, and taking one item
// back later can leave the rest of the purchase as it was. The same on the phone and the computer.
import type { ItemData, MoneyData } from "./kinds";
import { addDays } from "./dates";

type It = { id: string; data: ItemData; deleted?: 0 | 1; created_at?: number };
type Mo = { id: string; data: MoneyData; deleted?: 0 | 1 };

// an item's name as the purchase lists it: "Tomatoes (1 kg)"
export const itemLabel = (i: { data: ItemData }) => (i.data.qty ? `${i.data.name} (${i.data.qty})` : i.data.name);

// what the purchase says it was: "Tomatoes, onions, potatoes and 2 more" for many, every name for few
export function itemsNote(items: { data: ItemData }[], max = 6): string {
  const names = items.map(itemLabel).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, max - 1).join(", ")} and ${names.length - (max - 1)} more`;
}

// the order a purchase lists them in: as they were added to the list; added together, the ones
// already ticked first, in the order they were ticked
export function inListOrder<I extends { data: ItemData; created_at?: number }>(items: I[]): I[] {
  const ticked = (i: I) => (i.data.done && i.data.done_at ? i.data.done_at : Infinity);
  return items
    .map((i, n) => ({ i, n }))
    .sort((a, b) => (a.i.created_at || 0) - (b.i.created_at || 0) || (ticked(a.i) === ticked(b.i) ? 0 : ticked(a.i) < ticked(b.i) ? -1 : 1) || a.n - b.n)
    .map((x) => x.i);
}

// the purchase's note once some of its items come off it: the names left, when the note was the
// list of their names (in any order); null when it was something you wrote (it stays as it is)
export function noteWithout(note: string | undefined, all: { id: string; data: ItemData }[], keep: { id: string; data: ItemData }[]): string | null {
  if (!note || !keep.length) return null;
  const at = (i: { data: ItemData }) => note.indexOf(itemLabel(i));
  if (all.some((i) => at(i) < 0)) return null;
  const ordered = all.slice().sort((a, b) => at(a) - at(b));
  if (itemsNote(ordered) !== note) return null;
  return itemsNote(ordered.filter((i) => keep.some((k) => k.id === i.id)));
}

// the category a purchase of these goes under: Groceries if any came off the grocery list
export const purchaseCategory = (items: { data: ItemData }[]) => (items.some((i) => i.data.list === "grocery") || !items.length ? "Groceries" : "Shopping");

// the expense for several items bought together. fundId: bought with money someone gave you (it
// goes on their hisaab, never in a pot or your spending); potId: your own spending out of a pot.
export function purchaseData(
  items: { data: ItemData; created_at?: number }[],
  o: { amount: number; currency: string; date: string; account?: MoneyData["account"]; fundId?: string | null; potId?: string | null; category?: string; note?: string },
): MoneyData {
  const data: MoneyData = {
    type: "expense",
    amount: Math.round(o.amount * 100) / 100,
    currency: o.currency,
    category: o.category || purchaseCategory(items),
    note: (o.note && o.note.trim()) || itemsNote(inListOrder(items as { data: ItemData; created_at?: number }[])) || undefined,
    date: o.date,
    account: o.account || "cash",
    recurring: null,
  };
  if (o.fundId) data.paid_from = o.fundId;
  else if (o.potId) data.pot_id = o.potId;
  return data;
}

// whether an item's expense is still there (one deleted in Money leaves the item without a price)
export function hasLiveMoney(item: { data: ItemData }, money: Mo[] | Set<string>): boolean {
  const id = item.data.money_id;
  if (!id) return false;
  if (money instanceof Set) return money.has(id);
  return money.some((m) => m.id === id && !m.deleted);
}

// the items one expense covers (one, or several bought together)
export const itemsOfMoney = <I extends It>(moneyId: string | null | undefined, items: I[]): I[] => (moneyId ? items.filter((i) => !i.deleted && i.data.money_id === moneyId) : []);

// the others bought together with this item, if it was one of several
export const boughtWith = <I extends It>(item: It, items: I[]): I[] => itemsOfMoney(item.data.money_id, items).filter((i) => i.id !== item.id);

// What can be priced together: things still on the list, and things bought without a price (or
// whose expense was deleted) in the last two weeks (any time, for one hisaab's), those first, newest
// first. fundId: only that hisaab's items (null: only your own); undefined: every item.
export function buyableItems<I extends It>(items: I[], money: Mo[], opts: { today: string; fundId?: string | null; now?: number }): I[] {
  const live = new Set(money.filter((m) => !m.deleted).map((m) => m.id));
  const since = Date.parse(`${addDays(opts.today, -14)}T00:00:00`);
  const unpriced = (i: I) => i.data.done && !hasLiveMoney(i, live) && (!!opts.fundId || (i.data.done_at || 0) >= since);
  const toBuy = (i: I) => !i.data.done;
  return items
    .filter((i) => !i.deleted && (opts.fundId === undefined || (i.data.fund_id || null) === (opts.fundId || null)) && (unpriced(i) || toBuy(i)))
    .sort((a, b) => {
      const ua = a.data.done ? 1 : 0;
      const ub = b.data.done ? 1 : 0;
      if (ua !== ub) return ub - ua;
      if (ua) return (b.data.done_at || 0) - (a.data.done_at || 0);
      const ta = a.data.today && a.data.mode === "store" ? 1 : 0;
      const tb = b.data.today && b.data.mode === "store" ? 1 : 0;
      return tb - ta || a.data.name.localeCompare(b.data.name);
    });
}

// whose money the ticked items were marked for: one hisaab's id when they all share it, else null
export function sharedFund(items: { data: ItemData }[]): string | null {
  const ids = Array.from(new Set(items.map((i) => i.data.fund_id || null)));
  return ids.length === 1 ? ids[0] : null;
}

// an item's data once bought as part of a purchase (no price of its own: the purchase has it)
export function boughtData(item: { data: ItemData }, moneyId: string, fundId: string | null, at: number): ItemData {
  return Object.assign({}, item.data, { done: true, done_at: item.data.done && item.data.done_at ? item.data.done_at : at, money_id: moneyId, price: null, fund_id: fundId });
}

// "about Rs 200 each" (only ever shown as a guide; nothing stores it)
export const perItem = (amount: number, n: number) => (n > 0 ? Math.round((amount / n) * 100) / 100 : 0);
