// One price for several things on your list (five vegetables for 1,000): one expense in Money, or
// on the hisaab whose money paid, with every item it covers pointing at it and no price of its
// own. The sums and the shape of it are core's (purchase.ts); these are the computer's changes, through
// the record store, each with what undoes it exactly.
import { boughtData, isoDate, itemsOfMoney, noteWithout, onFund, purchaseData, type MoneyData, type Rec } from "@myapp/core";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { reopenIfOwed } from "@/lib/funds";

export type BuyOptions = { amount: number; date?: string; account?: MoneyData["account"]; fundId?: string | null; potId?: string | null; category?: string; note?: string };

const live = (id: string | null | undefined) => {
  const r = id ? useRecords.getState().byId[id] : undefined;
  return r && !r.deleted ? r : undefined;
};

// bought together for one price: { money, undo }, or null when there's nothing to buy (no item
// left that hasn't a price already, or no amount)
export function buyTogether(ids: string[], o: BuyOptions): { money: Rec<"money">; count: number; undo: () => void } | null {
  const s = useRecords.getState();
  const items = Array.from(new Set(ids))
    .map((id) => s.byId[id] as Rec<"item"> | undefined)
    .filter((i): i is Rec<"item"> => !!i && !i.deleted && i.kind === "item" && !live(i.data.money_id));
  if (!items.length || !(o.amount > 0)) return null;
  const fundId = o.fundId && live(o.fundId) ? o.fundId : null;
  const fund = fundId ? (s.byId[fundId] as Rec<"fund">) : undefined;
  const currency = fund?.data.currency || useSettings.getState().currency;
  const money = s.create("money", purchaseData(items, { amount: o.amount, currency, date: o.date || isoDate(), account: o.account, fundId, potId: fundId ? null : o.potId, category: o.category, note: o.note }));
  const before = items.map((i) => ({ id: i.id, data: i.data }));
  const at = Date.now();
  for (const i of items) s.update<"item">(i.id, () => boughtData(i, money.id, fundId, at));
  // the hisaabs touched: the one that paid, and any an item was marked for before
  const funds = Array.from(new Set([fundId, ...items.map((i) => i.data.fund_id || null)].filter((x): x is string => !!x)));
  funds.forEach(reopenIfOwed);
  return {
    money,
    count: items.length,
    undo: () => {
      const st = useRecords.getState();
      st.remove(money.id);
      for (const b of before) st.update<"item">(b.id, () => b.data);
      funds.forEach(reopenIfOwed);
    },
  };
}

// one item of a purchase wasn't bought: it goes back on the list, and the purchase stays as it was
// for the rest (its note, when it was the list of their names, loses this one)
export function unbuyOne(item: Rec<"item">): () => void {
  const s = useRecords.getState();
  const m = live(item.data.money_id) as Rec<"money"> | undefined;
  const all = itemsOfMoney(item.data.money_id, s.lists.item as Rec<"item">[]);
  const rest = all.filter((i) => i.id !== item.id);
  const was = item.data;
  s.update<"item">(item.id, { done: false, done_at: null, money_id: null, price: null });
  let note: MoneyData | null = null;
  const after = m ? noteWithout(m.data.note, all, rest) : null;
  if (m && after) {
    note = m.data;
    s.update<"money">(m.id, { note: after });
  }
  if (was.fund_id) reopenIfOwed(was.fund_id);
  return () => {
    const st = useRecords.getState();
    st.update<"item">(item.id, () => was);
    if (note && m) st.update<"money">(m.id, () => note as MoneyData);
  };
}

// none of it was bought after all: every item on that purchase back on the list, and what it cost
// out of Money (or off the hisaab)
export function unbuyAll(item: Rec<"item">): () => void {
  const s = useRecords.getState();
  const m = live(item.data.money_id) as Rec<"money"> | undefined;
  const all = itemsOfMoney(item.data.money_id, s.lists.item as Rec<"item">[]);
  const list = all.some((i) => i.id === item.id) ? all : all.concat([item]);
  const before = list.map((i) => ({ id: i.id, data: i.data }));
  for (const i of list) s.update<"item">(i.id, { done: false, done_at: null, money_id: null, price: null });
  if (m) s.remove(m.id);
  const funds = Array.from(new Set(list.map((i) => i.data.fund_id).filter((x): x is string => !!x)));
  funds.forEach(reopenIfOwed);
  return () => {
    const st = useRecords.getState();
    if (m) st.restore(m);
    for (const b of before) st.update<"item">(b.id, () => b.data);
  };
}

// a purchase moved onto someone's money (or back to yours): the expense and every item on it
export function setPurchaseFund(moneyId: string, fundId: string | null) {
  const s = useRecords.getState();
  const m = live(moneyId) as Rec<"money"> | undefined;
  if (m) s.update<"money">(m.id, () => onFund(m.data, fundId));
  for (const i of itemsOfMoney(moneyId, s.lists.item as Rec<"item">[])) s.update<"item">(i.id, { fund_id: fundId });
}
