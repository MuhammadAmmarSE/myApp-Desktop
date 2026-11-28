// Money someone gave you to spend for them (a hisaab): the sums come from core (fundSummary), these
// are the computer's changes to it (the same as the phone's). Every change goes through the record store and can be undone.
import { useMemo } from "react";
import { fundCategory, fundSummary, isoDate, itemsOfMoney, onFund, withMove, type FundData, type FundMove, type FundMoveType, type FundSummary, type Rec } from "@myapp/core";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";

export type FundRow = { fund: Rec<"fund">; summary: FundSummary<Rec<"money">, Rec<"item">> };

// "Ammi's money"
export const fundOwner = (f: { data: FundData }) => `${f.data.from || "Their"}'s money`;

// every hisaab with where it stands: still open (newest first), and settled
export function useFunds(): { open: FundRow[]; settled: FundRow[]; byId: Map<string, FundRow> } {
  const funds = useList("fund");
  const money = useList("money");
  const items = useList("item");
  return useMemo(() => {
    const rows = funds.map((fund) => ({ fund, summary: fundSummary(fund, money, items) }));
    return { open: rows.filter((r) => !r.fund.data.closed).sort(byDate), settled: rows.filter((r) => r.fund.data.closed).sort(bySettled), byId: new Map(rows.map((r) => [r.fund.id, r])) };
  }, [funds, money, items]);
}

// newest given first; settled ones by the day they were settled
function byDate(a: FundRow, b: FundRow) {
  const d = b.fund.data.date.localeCompare(a.fund.data.date);
  return d !== 0 ? d : b.fund.created_at - a.fund.created_at;
}
function bySettled(a: FundRow, b: FundRow) {
  const d = String(b.fund.data.closed_on || "").localeCompare(String(a.fund.data.closed_on || ""));
  return d !== 0 ? d : byDate(a, b);
}

const current = (id: string) => useRecords.getState().byId[id] as unknown as Rec<"fund"> | undefined;
const lists = () => {
  const s = useRecords.getState();
  return { money: s.lists.money, items: s.lists.item };
};

// One step on a hisaab: they gave more, you gave back what was left, kept it (your income),
// they paid you back, or you covered the extra (your spending). Keeping and covering are your own
// money, so they're in Money too. Returns what undoes it.
export function addMove(fundId: string, type: FundMoveType, amount: number, note?: string, day?: string): () => void {
  const s = useRecords.getState();
  const fund = current(fundId);
  if (!fund || !(amount > 0)) return () => {};
  const before = fund.data;
  const date = day || isoDate();
  const move: FundMove = { type, amount: Math.round(amount * 100) / 100, date, note: note || undefined };
  let made: Rec<"money"> | null = null;
  const what = `${fund.data.purpose || "money"} from ${fund.data.from}`;
  const currency = fund.data.currency || useSettings.getState().currency;
  if (type === "kept") made = s.create("money", { type: "income", amount: move.amount, currency, category: "Gift", note: `Kept from ${what}`, date, account: "cash", settles: fund.id });
  if (type === "covered") made = s.create("money", { type: "expense", amount: move.amount, currency, category: fundCategory(fund), note: `Extra on ${what}`, date, account: "cash", settles: fund.id });
  if (made) move.money_id = made.id;
  const { money, items } = lists();
  s.update<"fund">(fund.id, () => withMove(fund, move, money, items));
  return () => {
    const st = useRecords.getState();
    if (made) st.remove(made.id);
    st.update<"fund">(fund.id, () => before);
  };
}

// take a step back: the move goes, and the money it put in Money with it
export function removeMove(fundId: string, index: number): () => void {
  const s = useRecords.getState();
  const fund = current(fundId);
  const move = fund?.data.moves?.[index];
  if (!fund || !move) return () => {};
  const before = fund.data;
  const money = move.money_id ? (s.byId[move.money_id] as unknown as Rec<"money"> | undefined) : undefined;
  if (money && !money.deleted) s.remove(money.id);
  const moves = (fund.data.moves || []).filter((_, i) => i !== index);
  s.update<"fund">(fund.id, (d) => ({ ...d, moves, closed: false, closed_on: null }));
  return () => {
    const st = useRecords.getState();
    if (money && !money.deleted) st.restore(money as never);
    st.update<"fund">(fund.id, () => before);
  };
}

// a hisaab and everything that hangs on it: what was bought with it and what settled it go, the
// list items stay on the list as yours. Returns what puts it all back.
export function removeFund(fund: Rec<"fund">): () => void {
  const s = useRecords.getState();
  const money = s.lists.money.filter((m) => m.data.paid_from === fund.id || m.data.settles === fund.id);
  const items = s.lists.item.filter((i) => i.data.fund_id === fund.id);
  for (const m of money) s.remove(m.id);
  for (const i of items) s.update<"item">(i.id, { fund_id: null });
  s.remove(fund.id);
  return () => {
    const st = useRecords.getState();
    st.restore(fund);
    for (const m of money) st.restore(m);
    for (const i of items) st.update<"item">(i.id, { fund_id: fund.id });
  };
}

// opens again if a later purchase means it isn't settled any more
export function reopenIfOwed(fundId: string) {
  const fund = current(fundId);
  if (!fund || !fund.data.closed) return;
  const { money, items } = lists();
  const s = fundSummary(fund, money, items);
  if (s.left !== 0 || s.toBuy.length) useRecords.getState().update<"fund">(fund.id, { closed: false, closed_on: null });
}

// a purchase off a hisaab: the list items it came from (one, or several bought together) go back
// to "price not noted"
export function removeSpend(m: Rec<"money">): () => void {
  const s = useRecords.getState();
  const items = itemsOfMoney(m.id, s.lists.item as Rec<"item">[]);
  s.remove(m.id);
  for (const item of items) s.update<"item">(item.id, { money_id: null, price: null });
  if (m.data.paid_from) reopenIfOwed(m.data.paid_from);
  return () => {
    const st = useRecords.getState();
    st.restore(m);
    for (const item of items) st.update<"item">(item.id, { money_id: m.id, price: item.data.price });
  };
}

// things you bought with their money but noted as your own (before they gave it, or before the
// hisaab was made): onto the hisaab, off your spending (and out of any pot). Returns what undoes it.
export function moveOntoFund(fundId: string, ids: string[]): () => void {
  const s = useRecords.getState();
  const before: { id: string; data: Rec<"money">["data"] }[] = [];
  const items: { id: string; fund_id: string | null | undefined }[] = [];
  for (const id of ids) {
    const m = s.byId[id] as unknown as Rec<"money"> | undefined;
    if (!m || m.deleted || m.kind !== "money" || m.data.paid_from) continue;
    before.push({ id, data: m.data });
    s.update<"money">(id, () => onFund(m.data, fundId));
    // the list items it was bought for (several, when bought together) are on the hisaab too
    for (const item of itemsOfMoney(id, s.lists.item as Rec<"item">[])) {
      items.push({ id: item.id, fund_id: item.data.fund_id });
      s.update<"item">(item.id, { fund_id: fundId });
    }
  }
  reopenIfOwed(fundId);
  return () => {
    const st = useRecords.getState();
    for (const b of before) st.update<"money">(b.id, () => b.data);
    for (const i of items) st.update<"item">(i.id, { fund_id: i.fund_id ?? null });
  };
}

// a purchase on a hisaab that was really your own: back into your spending
export function takeOffFund(m: Rec<"money">): () => void {
  const s = useRecords.getState();
  const fundId = m.data.paid_from;
  const before = m.data;
  s.update<"money">(m.id, () => onFund(before, null));
  const items = itemsOfMoney(m.id, s.lists.item as Rec<"item">[]).filter((i) => i.data.fund_id === fundId);
  for (const item of items) s.update<"item">(item.id, { fund_id: null });
  if (fundId) reopenIfOwed(fundId);
  return () => {
    const st = useRecords.getState();
    st.update<"money">(m.id, () => before);
    for (const item of items) st.update<"item">(item.id, { fund_id: fundId || null });
  };
}
