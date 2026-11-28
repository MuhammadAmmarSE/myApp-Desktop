// Changes the assistant proposed for your records: you save the ones you keep. A saved change goes
// through store/records.ts like any change you make (offline first), after it's cleaned again here
// against what this computer has. Then the server is told, so the card shows it and the assistant
// hears about it. What you decided is kept here until the server has it, so a change can't be
// saved twice, even after a restart or while offline. (The phone's lib/proposals.ts does the same.)
import { create } from "zustand";
import { cleanChange, isoDate, newRecordData, nextPotColor, updatedRecordData, type Change, type ProposalItem, type Rec } from "@myapp/core";
import { movePot } from "@/lib/pots";
import { buyTogether } from "@/lib/purchase";
import { owedStep } from "@/lib/owed";
import { api } from "@/lib/api";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";

export type Decision = { index: number; saved: boolean; record_id?: string };
type State = {
  loaded: boolean;
  // decisions the server doesn't have yet, by "runId:callId"
  pending: Record<string, Decision[]>;
  load: () => void;
  add: (key: string, results: Decision[]) => void;
  drop: (key: string, indexes: number[]) => void;
};

const META = "proposal_decisions";
const save = (pending: Record<string, Decision[]>) => useRecords.getState().setMeta(META, JSON.stringify(pending));

export const useProposals = create<State>((set, get) => ({
  loaded: false,
  pending: {},
  load: () => {
    if (get().loaded) return;
    let pending: Record<string, Decision[]> = {};
    try {
      pending = JSON.parse(useRecords.getState().meta[META] || "{}") || {};
    } catch {
      pending = {};
    }
    set({ loaded: true, pending: Object.assign(pending, get().pending) });
  },
  add: (key, results) => {
    const pending = Object.assign({}, get().pending, { [key]: (get().pending[key] || []).concat(results) });
    set({ pending });
    save(pending);
  },
  drop: (key, indexes) => {
    const left = (get().pending[key] || []).filter((d) => !indexes.includes(d.index));
    const pending = Object.assign({}, get().pending);
    if (left.length) pending[key] = left;
    else delete pending[key];
    set({ pending });
    save(pending);
  },
}));

const keyOf = (runId: number, callId: string) => `${runId}:${callId}`;

// what's decided on a card: what the server has, then what this computer hasn't sent yet
export function decisionsOf(runId: number, p: ProposalItem, pending: Record<string, Decision[]>): Record<number, { saved: boolean; recordId?: string }> {
  const out: Record<number, { saved: boolean; recordId?: string }> = Object.assign({}, p.decided);
  for (const d of pending[keyOf(runId, p.id)] || []) if (!out[d.index]) out[d.index] = { saved: d.saved, recordId: d.record_id };
  return out;
}

// one change, saved: { ok, id, undo } or why it couldn't be
function apply(change: Change): { ok: true; id: string; undo: () => void } | { ok: false; why: string } {
  const s = useRecords.getState();
  const get = (id: string) => {
    const r = s.byId[id];
    return r && !r.deleted ? { kind: r.kind, data: r.data } : null;
  };
  const today = isoDate();
  const c = cleanChange(change, { today, get });
  if ("error" in c) return { ok: false, why: c.error.replace(/\(find it first\)/, "(it may have been deleted)") };
  const ch = c.change;
  if (ch.op === "create") {
    const rec = s.create(ch.kind, newRecordData(ch, { currency: useSettings.getState().currency, today, potColor: nextPotColor(s.lists.pot as Rec<"pot">[]) }));
    return { ok: true, id: rec.id, undo: () => useRecords.getState().remove(rec.id) };
  }
  // money moved between pots: kept on one of them
  if (ch.op === "move") {
    const undo = movePot(ch.from, ch.to, ch.amount, ch.note, ch.date);
    if (!undo) return { ok: false, why: "That pot isn't here any more." };
    return { ok: true, id: (ch.from || ch.to) as string, undo };
  }
  // several list items bought together for one price
  if (ch.op === "buy") {
    const r = buyTogether(ch.ids, { amount: ch.amount, date: ch.date, account: ch.account, fundId: ch.fund, potId: ch.pot_id, note: ch.note });
    if (!r) return { ok: false, why: "Those items aren't on your list any more, or they have a price already." };
    return { ok: true, id: r.money.id, undo: r.undo };
  }
  // a step on your money with someone: took some back, paid back, gave or lent more
  if (ch.op === "step") {
    const r = s.byId[ch.id];
    if (!r || r.deleted) return { ok: false, why: "That isn't here any more." };
    return { ok: true, id: ch.id, undo: owedStep(ch.id, ch.step, ch.amount, { date: ch.date, note: ch.note }) };
  }
  const was = s.byId[ch.id] as Rec;
  if (ch.op === "update") {
    const before = was.data;
    s.update(ch.id, () => updatedRecordData(ch.kind, before, ch.set));
    return { ok: true, id: ch.id, undo: () => useRecords.getState().update(ch.id, () => before as any) };
  }
  s.remove(ch.id);
  return { ok: true, id: ch.id, undo: () => useRecords.getState().restore(Object.assign({}, was, { deleted: 0 as const })) };
}

// tell the server what's been decided on a card (quietly retried by the next decision or visit)
export async function flush(runId: number, callId: string) {
  const key = keyOf(runId, callId);
  const results = useProposals.getState().pending[key];
  if (!results || !results.length) return;
  try {
    await api("POST", `/operator/runs/${runId}/proposals/${encodeURIComponent(callId)}`, { results });
    useProposals.getState().drop(
      key,
      results.map((r) => r.index),
    );
  } catch (e: any) {
    if (e && (e.code === "DECIDED" || e.code === "NOT_FOUND"))
      useProposals.getState().drop(
        key,
        results.map((r) => r.index),
      );
  }
}

// save some changes of a card (indexes), skip others: { saved, failed: [{ index, why }], undo }
export function decide(runId: number, p: ProposalItem, saveIdx: number[], skipIdx: number[]) {
  const results: Decision[] = [];
  const undos: (() => void)[] = [];
  const failed: { index: number; why: string }[] = [];
  for (const i of saveIdx) {
    const change = p.changes[i];
    if (!change) continue;
    const r = apply(change);
    if (!r.ok) {
      failed.push({ index: i, why: r.why });
      continue;
    }
    undos.push(r.undo);
    results.push({ index: i, saved: true, record_id: change.op === "create" ? r.id : undefined });
  }
  for (const i of skipIdx) if (p.changes[i]) results.push({ index: i, saved: false });
  if (results.length) {
    useProposals.getState().add(keyOf(runId, p.id), results);
    void flush(runId, p.id);
  }
  return { saved: results.filter((r) => r.saved).length, failed, undo: () => undos.reverse().forEach((u) => u()) };
}
