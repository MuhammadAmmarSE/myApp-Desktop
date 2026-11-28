// One price for several things on the list (five vegetables for 1,000), with every figure checked
// after each step: the month in Money (spent, left), the hisaab (spent, left), a pot's balance, the
// account it was paid from, and what's still waiting for a price. Then taking one back, none, the
// purchase deleted in Money, and moving it onto (and off) someone's money.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buyableItems, fundSummary, hisaabText, monthTotals, ownMoney, potSummary, type Rec } from "@myapp/core";

vi.mock("@/lib/bridge", () => ({
  isMac: () => false,
  bridge: { db: { load: async () => ({ records: [], meta: {} }), put: async () => {}, markClean: async () => {}, setMeta: async () => {} }, on: () => () => {} },
}));

const { useRecords } = await import("@/store/records");
const { useSettings } = await import("@/store/settings");
const { buyTogether, unbuyAll, unbuyOne, setPurchaseFund } = await import("@/lib/purchase");
const { moveOntoFund, removeSpend, takeOffFund } = await import("@/lib/funds");
const { createPot } = await import("@/lib/pots");

const st = () => useRecords.getState();
const live = <K extends "money" | "item" | "fund" | "pot">(k: K) => st().lists[k] as Rec<K>[];
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const totals = () => monthTotals(ownMoney(live("money")), month, "PKR");
const item = (id: string) => st().byId[id] as Rec<"item">;
const fundOf = (id: string) => fundSummary(st().byId[id] as Rec<"fund">, live("money"), live("item"));
const VEG = ["Tomatoes", "Onions", "Potatoes", "Peas", "Spinach"];

let veg: Rec<"item">[];
let earned: number;
beforeEach(() => {
  st().reset();
  useSettings.setState({ currency: "PKR" });
  st().create("money", { type: "income", amount: 100000, currency: "PKR", category: "Salary", date: today });
  st().create("money", { type: "expense", amount: 2000, currency: "PKR", category: "Fuel", date: today });
  earned = 100000;
  // five vegetables on today's list, each ticked as bought without a price
  veg = VEG.map((name, n) => st().create("item", { name, list: "grocery", mode: "store", today: true, done: true, done_at: Date.now() + n }));
});

describe("one price for several", () => {
  it("five vegetables for 1,000: one entry in Money, counted once, every one marked bought", () => {
    expect(totals()).toMatchObject({ earned, spent: 2000 });
    expect(buyableItems(live("item"), live("money"), { today }).map((i) => i.data.name).sort()).toEqual(VEG.slice().sort());
    const r = buyTogether(
      veg.map((v) => v.id),
      { amount: 1000, account: "cash" },
    )!;
    expect(r.count).toBe(5);
    const spends = live("money").filter((m) => m.data.type === "expense" && m.data.category === "Groceries");
    expect(spends).toHaveLength(1);
    expect(spends[0].data).toMatchObject({ amount: 1000, account: "cash", note: "Tomatoes, Onions, Potatoes, Peas and Spinach" });
    expect(spends[0].data.paid_from).toBeFalsy();
    expect(totals()).toMatchObject({ earned, spent: 3000 });
    expect(totals().earned - totals().spent).toBe(97000);
    for (const v of veg) expect(item(v.id).data).toMatchObject({ done: true, money_id: r.money.id, price: null });
    expect(buyableItems(live("item"), live("money"), { today })).toHaveLength(0);
    // undone: as if it never happened
    r.undo();
    expect(totals().spent).toBe(2000);
    for (const v of veg) expect(item(v.id).data.money_id).toBeFalsy();
  });

  it("only one wasn't bought: it goes back on the list, the 1,000 stays for the other four, the note follows", () => {
    const r = buyTogether(
      veg.map((v) => v.id),
      { amount: 1000 },
    )!;
    const undo = unbuyOne(item(veg[3].id));
    expect(item(veg[3].id).data).toMatchObject({ done: false, money_id: null });
    expect(totals().spent).toBe(3000);
    expect((st().byId[r.money.id] as Rec<"money">).data.note).toBe("Tomatoes, Onions, Potatoes and Spinach");
    undo();
    expect(item(veg[3].id).data).toMatchObject({ done: true, money_id: r.money.id });
    expect((st().byId[r.money.id] as Rec<"money">).data.note).toBe("Tomatoes, Onions, Potatoes, Peas and Spinach");
  });

  it("a note you wrote stays when one comes off", () => {
    const r = buyTogether(
      veg.map((v) => v.id),
      { amount: 1000, note: "Sabzi from the market" },
    )!;
    unbuyOne(item(veg[0].id));
    expect((st().byId[r.money.id] as Rec<"money">).data.note).toBe("Sabzi from the market");
  });

  it("none were bought: all five back on the list and the 1,000 out of Money; undo puts it all back", () => {
    const r = buyTogether(
      veg.map((v) => v.id),
      { amount: 1000 },
    )!;
    const undo = unbuyAll(item(veg[1].id));
    expect(totals().spent).toBe(2000);
    for (const v of veg) expect(item(v.id).data).toMatchObject({ done: false, money_id: null });
    undo();
    expect(totals().spent).toBe(3000);
    for (const v of veg) expect(item(v.id).data.money_id).toBe(r.money.id);
  });

  it("deleted in Money: they wait for a price again, and a new price (by bank) is counted once", () => {
    const r = buyTogether(
      veg.map((v) => v.id),
      { amount: 1000 },
    )!;
    st().remove(r.money.id);
    expect(totals().spent).toBe(2000);
    const waiting = buyableItems(live("item"), live("money"), { today });
    expect(waiting).toHaveLength(5);
    const again = buyTogether(
      waiting.map((i) => i.id),
      { amount: 800, account: "bank" },
    )!;
    expect(again.money.data.account).toBe("bank");
    expect(totals().spent).toBe(2800);
  });

  it("already priced items are left out; nothing to buy gives nothing", () => {
    buyTogether([veg[0].id], { amount: 300 });
    const r = buyTogether(
      veg.map((v) => v.id),
      { amount: 700 },
    )!;
    expect(r.count).toBe(4);
    expect(totals().spent).toBe(3000);
    expect(buyTogether([veg[0].id], { amount: 100 })).toBeNull();
    expect(buyTogether([veg[1].id], { amount: 0 })).toBeNull();
  });

  it("out of a pot: the pot's balance goes down by the total, once", () => {
    const personal = createPot({ name: "Personal", type: "spend" });
    st().update<"money">(live("money").find((m) => m.data.type === "income")!.id, { split: [{ pot_id: personal.id, amount: 10000 }] });
    const bal = () => potSummary(st().byId[personal.id] as Rec<"pot">, live("pot"), live("money"), { today, currency: "PKR" }).balance;
    expect(bal()).toBe(10000);
    buyTogether(
      veg.map((v) => v.id),
      { amount: 1000, potId: personal.id },
    );
    expect(bal()).toBe(9000);
    expect(totals().spent).toBe(3000);
  });
});

describe("one price for several on a hisaab", () => {
  let fund: Rec<"fund">;
  let fruit: Rec<"item">[];
  beforeEach(() => {
    fund = st().create("fund", { from: "Aunt", purpose: "Groceries", amount: 3000, currency: "PKR", date: today, moves: [], closed: false });
    fruit = ["Apples", "Bananas", "Grapes"].map((name) => st().create("item", { name, list: "grocery", mode: "store", today: true, done: false, fund_id: fund.id }));
  });

  it("bought with her money: off what she gave, never in my spending; the hisaab names them", () => {
    const r = buyTogether(
      fruit.map((f) => f.id),
      { amount: 900, fundId: fund.id },
    )!;
    expect(r.money.data.paid_from).toBe(fund.id);
    expect(fundOf(fund.id)).toMatchObject({ received: 3000, spent: 900, left: 2100 });
    expect(fundOf(fund.id).toBuy).toHaveLength(0);
    expect(totals().spent).toBe(2000);
    const text = hisaabText(st().byId[fund.id] as Rec<"fund">, fundOf(fund.id), { currency: "PKR", today, items: live("item") });
    expect(text).toContain("Apples, Bananas and Grapes");
    expect(text).toContain("Rs 900");
  });

  it("the purchase deleted from the hisaab: all three wait for a price, her 3,000 is whole again", () => {
    const r = buyTogether(
      fruit.map((f) => f.id),
      { amount: 900, fundId: fund.id },
    )!;
    const undo = removeSpend(st().byId[r.money.id] as Rec<"money">);
    expect(fundOf(fund.id)).toMatchObject({ spent: 0, left: 3000 });
    expect(fundOf(fund.id).unpriced.map((i) => i.data.name).sort()).toEqual(["Apples", "Bananas", "Grapes"]);
    undo();
    expect(fundOf(fund.id).left).toBe(2100);
    expect(fundOf(fund.id).unpriced).toHaveLength(0);
  });

  it("deleted in Money directly: the hisaab knows they have no price again", () => {
    const r = buyTogether(
      fruit.map((f) => f.id),
      { amount: 900, fundId: fund.id },
    )!;
    st().remove(r.money.id);
    expect(fundOf(fund.id)).toMatchObject({ spent: 0, left: 3000 });
    expect(fundOf(fund.id).unpriced).toHaveLength(3);
  });

  it("marked for her money but paid with mine: off her hisaab, in my spending", () => {
    buyTogether(
      fruit.map((f) => f.id),
      { amount: 900, fundId: null },
    );
    expect(fundOf(fund.id)).toMatchObject({ spent: 0, left: 3000 });
    expect(fundOf(fund.id).toBuy).toHaveLength(0);
    for (const f of fruit) expect(item(f.id).data.fund_id).toBeNull();
    expect(totals().spent).toBe(2900);
  });

  it("my own purchase of five moved onto her hisaab, and back: every item follows, totals exact", () => {
    const r = buyTogether(
      veg.map((v) => v.id),
      { amount: 1000 },
    )!;
    const undo = moveOntoFund(fund.id, [r.money.id]);
    expect(totals().spent).toBe(2000);
    expect(fundOf(fund.id)).toMatchObject({ spent: 1000, left: 2000 });
    for (const v of veg) expect(item(v.id).data.fund_id).toBe(fund.id);
    const back = takeOffFund(st().byId[r.money.id] as Rec<"money">);
    expect(totals().spent).toBe(3000);
    expect(fundOf(fund.id).left).toBe(3000);
    for (const v of veg) expect(item(v.id).data.fund_id).toBeNull();
    back();
    expect(fundOf(fund.id).left).toBe(2000);
    undo();
    expect(fundOf(fund.id).left).toBe(3000);
    expect(totals().spent).toBe(3000);
  });

  it("whose money changed from one item's editor: the whole purchase and all its items move", () => {
    const r = buyTogether(
      veg.map((v) => v.id),
      { amount: 1000 },
    )!;
    setPurchaseFund(r.money.id, fund.id);
    expect(fundOf(fund.id).left).toBe(2000);
    expect(totals().spent).toBe(2000);
    for (const v of veg) expect(item(v.id).data.fund_id).toBe(fund.id);
    setPurchaseFund(r.money.id, null);
    expect(fundOf(fund.id).left).toBe(3000);
    expect(totals().spent).toBe(3000);
  });
});
