// Pots on the computer: an income given jobs, spending out of a pot, money moved between pots (and
// undone, and taken back), rules that split an income, the pot spending likely comes out of, and
// deleting a pot leaving what you earned and spent where it was.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monthJobs, monthTotals, potSummary, type Rec } from "@myapp/core";

vi.mock("@/lib/bridge", () => ({
  isMac: () => false,
  bridge: { db: { load: async () => ({ records: [], meta: {} }), put: async () => {}, markClean: async () => {}, setMeta: async () => {} }, on: () => () => {} },
}));

const { useRecords } = await import("@/store/records");
const { useSettings } = await import("@/store/settings");
const { autoSplit, createPot, findMove, movePot, potVar, removePot, removePotMove, suggestedPot } = await import("@/lib/pots");

const st = () => useRecords.getState();
const live = <K extends "money" | "pot">(k: K) => st().lists[k] as Rec<K>[];
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const sum = (id: string) => potSummary(st().byId[id] as Rec<"pot">, live("pot"), live("money"), { today, currency: "PKR" });

let personal: Rec<"pot">;
let loan: Rec<"pot">;
beforeEach(() => {
  st().reset();
  useSettings.setState({ currency: "PKR" });
  personal = createPot({ name: "Personal", type: "spend", target: 120000 });
  loan = createPot({ name: "Loan", type: "debt", target: 500000 });
  // someone paid 300,000: 100,000 for personal spending, 100,000 towards the loan, the rest free
  st().create("money", { type: "income", amount: 300000, currency: "PKR", category: "Salary", date: today, split: [{ pot_id: personal.id, amount: 100000 }, { pot_id: loan.id, amount: 100000 }] });
  st().create("money", { type: "expense", amount: 25000, currency: "PKR", category: "Food", note: "Dinner out", date: today, pot_id: personal.id });
  st().create("money", { type: "expense", amount: 40000, currency: "PKR", category: "Loans & debt", note: "Installment", date: today, pot_id: loan.id });
});

describe("pots", () => {
  it("new pots get their own colour and come at the end of the order", () => {
    expect(personal.data.color).not.toBe(loan.data.color);
    expect(Number(loan.data.order)).toBeGreaterThan(Number(personal.data.order));
    expect(potVar(personal)).toMatch(/^var\(--pot-[0-7]\)$/);
  });
  it("an income's split and spending out of a pot, with your totals unchanged", () => {
    expect(sum(personal.id).balance).toBe(75000);
    expect(sum(loan.id).balance).toBe(60000);
    expect(sum(loan.id).paid).toBe(40000);
    expect(sum(loan.id).owed).toBe(460000);
    const totals = monthTotals(live("money"), month, "PKR");
    expect(totals).toMatchObject({ earned: 300000, spent: 65000 });
    const jobs = monthJobs(live("money"), live("pot"), month, "PKR");
    expect(jobs.earned).toBe(300000);
    expect(jobs.notInPot).toBe(100000);
    expect(jobs.freeLeft).toBe(100000);
  });
  it("moving money between pots, undone exactly", () => {
    const undo = movePot(personal.id, loan.id, 10000, "Extra this month", today)!;
    expect(sum(personal.id).balance).toBe(65000);
    expect(sum(loan.id).balance).toBe(70000);
    undo();
    expect(sum(personal.id).balance).toBe(75000);
    expect(sum(loan.id).balance).toBe(60000);
  });
  it("money not in a pot moved in, then taken back from the pot's list", () => {
    movePot(null, personal.id, 5000, undefined, today);
    expect(sum(personal.id).balance).toBe(80000);
    const where = findMove(personal.id, null, 5000, today, "in")!;
    expect(where.potId).toBe(personal.id);
    const undo = removePotMove(where.potId, where.index);
    expect(sum(personal.id).balance).toBe(75000);
    undo();
    expect(sum(personal.id).balance).toBe(80000);
  });
  it("a move kept on the other pot is still found from this one", () => {
    movePot(loan.id, personal.id, 2000, undefined, today);
    const where = findMove(personal.id, loan.id, 2000, today, "in")!;
    expect(where.potId).toBe(loan.id);
    removePotMove(where.potId, where.index);
    expect(sum(personal.id).balance).toBe(75000);
  });
  it("moving nothing, or into the same pot, does nothing", () => {
    expect(movePot(personal.id, personal.id, 1000)).toBeNull();
    expect(movePot(personal.id, loan.id, 0)).toBeNull();
  });
  it("rules split an income: set amounts first, then shares of the whole", () => {
    st().update<"pot">(loan.id, { rule: { kind: "fixed", value: 50000 } });
    st().update<"pot">(personal.id, { rule: { kind: "percent", value: 30 } });
    const split = autoSplit(200000);
    expect(split).toHaveLength(2);
    expect(split).toEqual(expect.arrayContaining([
      { pot_id: personal.id, amount: 60000 },
      { pot_id: loan.id, amount: 50000 },
    ]));
  });
  it("suggests the pot you used before for the same thing, and never one put away", () => {
    expect(suggestedPot("Dinner out", "Food")).toBe(personal.id);
    expect(suggestedPot("", "Loans & debt")).toBe(loan.id);
    st().update<"pot">(personal.id, { archived: true });
    expect(suggestedPot("Dinner out", "Food")).toBeNull();
  });
  it("deleting a pot leaves what you earned and spent, and undo brings it back", () => {
    const undo = removePot(personal);
    expect(live("pot").map((p) => p.id)).toEqual([loan.id]);
    expect(monthTotals(live("money"), month, "PKR")).toMatchObject({ earned: 300000, spent: 65000 });
    undo();
    expect(sum(personal.id).balance).toBe(75000);
  });
});
