// Your own money with someone else: kept with them, or lent (core's owed.ts has the sums). These
// are the computer's changes, the same as the phone's, each with what undoes it exactly. Only
// letting the rest of a loan go touches Money (it becomes an expense: that money is gone).
import { useMemo } from "react";
import { forgivenExpense, isoDate, owedSummary, owedTotals, owedWithMove, owedWithoutMove, type OwedData, type OwedMove, type OwedMoveType, type Rec } from "@myapp/core";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { useNow } from "@/lib/clock";

const live = (id: string | null | undefined) => {
  const r = id ? useRecords.getState().byId[id] : undefined;
  return r && !r.deleted ? (r as unknown as Rec) : undefined;
};
const current = (id: string) => live(id) as Rec<"owed"> | undefined;
const stepId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export type NewOwed = Pick<OwedData, "type" | "who" | "amount" | "date"> & Partial<Pick<OwedData, "person_id" | "currency" | "account" | "due" | "notes">>;
export function createOwed(data: NewOwed): Rec<"owed"> {
  const currency = data.currency || useSettings.getState().currency;
  return useRecords.getState().create("owed", { ...data, currency, moves: [], closed: false }) as unknown as Rec<"owed">;
}

// one step: took some back / paid back, gave more / lent more, or let the rest go. Returns the undo.
export function owedStep(id: string, type: OwedMoveType, amount: number, opts: { date?: string; account?: OwedMove["account"]; note?: string } = {}): () => void {
  const s = useRecords.getState();
  const rec = current(id);
  if (!rec || !(amount > 0)) return () => {};
  const before = rec.data;
  const date = opts.date || isoDate();
  let moneyId: string | null = null;
  if (type === "forgave") {
    const amt = Math.min(amount, owedSummary(rec).left);
    if (!(amt > 0)) return () => {};
    moneyId = s.create("money", forgivenExpense(rec, amt, date, useSettings.getState().currency)).id;
    amount = amt;
  }
  const move: OwedMove = Object.assign({ id: stepId(), type, amount, date }, opts.account ? { account: opts.account } : {}, opts.note ? { note: opts.note } : {}, moneyId ? { money_id: moneyId } : {});
  s.update<"owed">(rec.id, () => owedWithMove(rec, move));
  return () => {
    const st = useRecords.getState();
    st.update<"owed">(rec.id, () => before);
    if (moneyId) st.remove(moneyId);
  };
}

// a step taken back later (the expense of letting a loan go with it). Returns the undo.
export function takeStepBack(id: string, index: number): () => void {
  const s = useRecords.getState();
  const rec = current(id);
  const move = rec?.data.moves?.[index];
  if (!rec || !move) return () => {};
  const before = rec.data;
  const m = live(move.money_id);
  s.update<"owed">(rec.id, () => owedWithoutMove(rec, index));
  if (m) s.remove(m.id);
  return () => {
    const st = useRecords.getState();
    st.update<"owed">(rec.id, () => before);
    if (m) st.restore(m as never);
  };
}

// deleted, with the expense letting the rest go (if any). Returns the undo.
export function removeOwed(rec: Rec<"owed">): () => void {
  const s = useRecords.getState();
  const spent = (rec.data.moves || []).map((m) => live(m.money_id)).filter((m): m is Rec => !!m);
  s.remove(rec.id);
  for (const m of spent) s.remove(m.id);
  return () => {
    const st = useRecords.getState();
    st.restore(rec as never);
    for (const m of spent) st.restore(m as never);
  };
}

export type OwedRow = { rec: Rec<"owed">; left: number; given: number; part: number; overdue: boolean };

// everyone who has some of your money: open ones (late first, then most) and the ones settled
export function useOwed() {
  const all = useList("owed");
  const currency = useSettings((s) => s.currency);
  const today = isoDate(new Date(useNow()));
  return useMemo(() => {
    const rows: OwedRow[] = all.map((rec) => {
      const s = owedSummary(rec, today);
      return { rec, left: s.left, given: s.given, part: s.part, overdue: s.overdue };
    });
    const open = rows.filter((r) => !r.rec.data.closed && r.left > 0).sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.left - a.left);
    const settled = rows.filter((r) => r.rec.data.closed || r.left <= 0).sort((a, b) => (b.rec.data.closed_on || "").localeCompare(a.rec.data.closed_on || ""));
    return { open, settled, totals: owedTotals(all, currency, today), today, byId: new Map(rows.map((r) => [r.rec.id, r])) };
  }, [all, currency, today]);
}
