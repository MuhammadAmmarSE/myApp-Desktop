// A hisaab on the computer: steps that settle it (keeping what's left is your income, covering the
// extra is your spending; giving it back changes nothing of yours), each undone exactly, and
// deleting it takes what was bought with it and leaves the list items as yours.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fundSummary, monthTotals, type Rec } from "@myapp/core";

vi.mock("@/lib/bridge", () => ({
  isMac: () => false,
  bridge: { db: { load: async () => ({ records: [], meta: {} }), put: async () => {}, markClean: async () => {}, setMeta: async () => {} }, on: () => () => {} },
}));

const { useRecords } = await import("@/store/records");
const { addMove, removeFund, removeMove, removeSpend } = await import("@/lib/funds");

const st = () => useRecords.getState();
const live = <K extends "money" | "item" | "fund">(k: K) => st().lists[k] as Rec<K>[];
const summary = (id: string) => fundSummary(st().byId[id] as Rec<"fund">, live("money"), live("item"));
const today = new Date().toISOString().slice(0, 10);

let fund: Rec<"fund">;
beforeEach(() => {
  st().reset();
  fund = st().create("fund", { from: "Mother", purpose: "Groceries", amount: 5000, currency: "PKR", date: today, moves: [], closed: false });
  st().create("money", { type: "expense", amount: 4200, currency: "PKR", category: "Groceries", date: today, paid_from: fund.id });
  st().create("money", { type: "expense", amount: 300, currency: "PKR", category: "Fuel", date: today });
});

describe("a hisaab", () => {
  it("keeps her money out of yours", () => {
    expect(summary(fund.id).left).toBe(800);
    expect(monthTotals(live("money"), today.slice(0, 7), "PKR").spent).toBe(300);
  });
  it("keeping what's left is your income, and undo takes it back", () => {
    const undo = addMove(fund.id, "kept", 800);
    expect(summary(fund.id).left).toBe(0);
    expect((st().byId[fund.id] as Rec<"fund">).data.closed).toBe(true);
    expect(monthTotals(live("money"), today.slice(0, 7), "PKR").earned).toBe(800);
    undo();
    expect(summary(fund.id).left).toBe(800);
    expect((st().byId[fund.id] as Rec<"fund">).data.closed).toBe(false);
    expect(monthTotals(live("money"), today.slice(0, 7), "PKR").earned).toBe(0);
  });
  it("giving it back settles it and changes nothing of yours", () => {
    addMove(fund.id, "returned", 800);
    expect((st().byId[fund.id] as Rec<"fund">).data.closed).toBe(true);
    expect(monthTotals(live("money"), today.slice(0, 7), "PKR")).toMatchObject({ spent: 300, earned: 0 });
  });
  it("spending over: covering it is your spending; taking that step back removes it", () => {
    st().create("money", { type: "expense", amount: 1000, currency: "PKR", category: "Groceries", date: today, paid_from: fund.id });
    expect(summary(fund.id).left).toBe(-200);
    addMove(fund.id, "covered", 200);
    expect(summary(fund.id).left).toBe(0);
    expect(monthTotals(live("money"), today.slice(0, 7), "PKR").spent).toBe(500);
    removeMove(fund.id, 0);
    expect(summary(fund.id).left).toBe(-200);
    expect(monthTotals(live("money"), today.slice(0, 7), "PKR").spent).toBe(300);
  });
  it("deleting a purchase puts its item back to 'price not noted'", () => {
    const m = live("money").find((x) => x.data.paid_from === fund.id)!;
    const item = st().create("item", { name: "Rice", list: "grocery", mode: "store", today: true, done: true, money_id: m.id, price: 4200, fund_id: fund.id });
    const undo = removeSpend(m);
    expect(summary(fund.id).unpriced.map((i) => i.id)).toEqual([item.id]);
    undo();
    expect(summary(fund.id).spent).toBe(4200);
  });
  it("deleting it takes what was bought with it; the list items stay, as yours; undo puts it all back", () => {
    const item = st().create("item", { name: "Eggs", list: "grocery", mode: "store", today: true, done: false, fund_id: fund.id });
    const undo = removeFund(fund);
    expect(live("fund")).toHaveLength(0);
    expect(live("money").map((m) => m.data.amount)).toEqual([300]);
    expect((st().byId[item.id] as Rec<"item">).data.fund_id).toBeNull();
    undo();
    expect(live("fund")).toHaveLength(1);
    expect(summary(fund.id).spent).toBe(4200);
    expect(summary(fund.id).toBuy.map((i) => i.id)).toEqual([item.id]);
  });
});
