// Pots: your own money given jobs (the sums are core's: potSummary, ruleSplit, monthJobs). These
// are the computer's changes to them (the same as the phone's), every one through the record store
// and undoable.
import { useMemo } from "react";
import { isoDate, nextPotColor, potMoveFor, potSummary, ruleSplit, sortPots, suggestPot, withPotMove, type PotData, type PotSplit, type PotSummary, type Rec } from "@myapp/core";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";

export type PotRow = { pot: Rec<"pot">; summary: PotSummary<Rec<"money">> };

// every pot with where it stands: the ones in use (in your order) and the ones put away
export function usePots(): { rows: PotRow[]; away: PotRow[]; byId: Map<string, PotRow>; all: Rec<"pot">[] } {
  const pots = useList("pot");
  const money = useList("money");
  const currency = useSettings((s) => s.currency);
  const today = isoDate();
  return useMemo(() => {
    const rows = sortPots(pots).map((pot) => ({ pot, summary: potSummary(pot, pots, money, { today, currency }) }));
    return { rows: rows.filter((r) => !r.pot.data.archived), away: rows.filter((r) => r.pot.data.archived), byId: new Map(rows.map((r) => [r.pot.id, r])), all: pots };
  }, [pots, money, currency, today]);
}

// a pot's colour: the theme's pot palette (--pot-0 … --pot-7, set from core's POT_COLORS)
export const potVar = (pot: { data: PotData } | undefined | null) => `var(--pot-${(((Math.round(Number(pot?.data.color) || 0)) % 8) + 8) % 8})`;

export const potsNow = () => useRecords.getState().lists.pot as Rec<"pot">[];

// a new pot: the next colour no pot has, at the end of your order
export function createPot(data: Pick<PotData, "name" | "type"> & Partial<PotData>): Rec<"pot"> {
  const all = potsNow();
  const order = all.reduce((n, p) => Math.max(n, typeof p.data.order === "number" ? p.data.order : -1), -1) + 1;
  const full: PotData = Object.assign({ currency: useSettings.getState().currency, moves: [], archived: false, color: nextPotColor(all), order }, data);
  return useRecords.getState().create("pot", full);
}

// money moved between pots (null = money not in a pot); returns what undoes it
export function movePot(from: string | null, to: string | null, amount: number, note?: string, date = isoDate()): (() => void) | null {
  const mv = potMoveFor(from, to, amount, date, note);
  if (!mv) return null;
  const s = useRecords.getState();
  const pot = s.byId[mv.pot_id] as Rec<"pot"> | undefined;
  if (!pot || pot.deleted) return null;
  const before = pot.data;
  s.update<"pot">(pot.id, () => withPotMove(pot, mv.move));
  return () => useRecords.getState().update<"pot">(pot.id, () => before);
}

// take back one move kept on a pot
export function removePotMove(potId: string, index: number): () => void {
  const s = useRecords.getState();
  const pot = s.byId[potId] as Rec<"pot"> | undefined;
  if (!pot) return () => {};
  const before = pot.data;
  s.update<"pot">(pot.id, () => Object.assign({}, before, { moves: (before.moves || []).filter((_, i) => i !== index) }));
  return () => useRecords.getState().update<"pot">(pot.id, () => before);
}

// where a move on another pot's list is kept: the pot whose moves hold it, and its place there
export function findMove(potId: string, other: string | null, amount: number, date: string, dir: "in" | "out"): { potId: string; index: number } | null {
  const s = useRecords.getState();
  const own = s.byId[potId] as Rec<"pot"> | undefined;
  const i = (own?.data.moves || []).findIndex((m) => m.dir === dir && m.other === other && m.amount === amount && m.date === date);
  if (own && i >= 0) return { potId, index: i };
  if (!other) return null;
  const far = s.byId[other] as Rec<"pot"> | undefined;
  const j = (far?.data.moves || []).findIndex((m) => m.other === potId && m.dir === (dir === "in" ? "out" : "in") && m.amount === amount && m.date === date);
  return far && j >= 0 ? { potId: other, index: j } : null;
}

// what an income splits into by your pots' rules (except: the income being changed)
export function autoSplit(amount: number, except?: string): PotSplit[] {
  const s = useRecords.getState();
  return ruleSplit(s.lists.pot as Rec<"pot">[], s.lists.money as Rec<"money">[], amount, { today: isoDate(), currency: useSettings.getState().currency, except });
}

// the pot this spending likely comes out of
export function suggestedPot(note: string, category: string): string | null {
  const s = useRecords.getState();
  const live = new Set((s.lists.pot as Rec<"pot">[]).filter((p) => !p.data.archived).map((p) => p.id));
  return suggestPot(s.lists.money as Rec<"money">[], { note, category, today: isoDate() }, (id) => live.has(id));
}

// a pot deleted: spending that came out of it and splits into it are kept, as money not in a pot
export function removePot(pot: Rec<"pot">): () => void {
  useRecords.getState().remove(pot.id);
  return () => useRecords.getState().restore(Object.assign({}, pot, { deleted: 0 as const }));
}
