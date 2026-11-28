// Your money with others on the computer: Abu keeps 150,000 for you, you take some back, give more;
// Ali borrows 50,000, pays some back, the rest let go. Every step undoes exactly, and none of it
// touches the month's totals, except letting a loan go (that becomes spending).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monthTotals, owedSummary, owedTotals, type Rec } from "@myapp/core";

vi.mock("@/lib/bridge", () => ({
  isMac: () => false,
  bridge: { db: { load: async () => ({ records: [], meta: {} }), put: async () => {}, markClean: async () => {}, setMeta: async () => {} }, on: () => () => {} },
}));

const { useRecords } = await import("@/store/records");
const { useSettings } = await import("@/store/settings");
const { createOwed, owedStep, removeOwed, takeStepBack } = await import("@/lib/owed");

const st = () => useRecords.getState();
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const get = (id: string) => st().byId[id] as unknown as Rec<"owed">;
const left = (id: string) => owedSummary(get(id)).left;
const money = () => st().lists.money as Rec<"money">[];

let abu: Rec<"owed">;
beforeEach(() => {
  st().reset();
  useSettings.setState({ currency: "PKR" });
  st().create("money", { type: "income", amount: 200000, currency: "PKR", category: "Salary", date: today });
  abu = createOwed({ type: "keeping", who: "Abu", amount: 150000, date: today });
});

describe("money with others", () => {
  it("kept with someone: still yours, so the month's totals don't move", () => {
    expect(abu.data).toMatchObject({ type: "keeping", currency: "PKR", moves: [], closed: false });
    expect(left(abu.id)).toBe(150000);
    expect(monthTotals(money(), month, "PKR")).toMatchObject({ earned: 200000, spent: 0, net: 200000 });
    expect(owedTotals(st().lists.owed as Rec<"owed">[], "PKR")).toMatchObject({ keeping: 150000, lent: 0, total: 150000 });
  });
  it("taking some back and giving more, each undone exactly", () => {
    const undo = owedStep(abu.id, "back", 20000, { note: "for rent" });
    expect(left(abu.id)).toBe(130000);
    expect(get(abu.id).data.moves?.[0]).toMatchObject({ type: "back", amount: 20000, note: "for rent" });
    owedStep(abu.id, "more", 5000);
    expect(left(abu.id)).toBe(135000);
    takeStepBack(abu.id, 1);
    expect(left(abu.id)).toBe(130000);
    undo();
    expect(left(abu.id)).toBe(150000);
    expect(money()).toHaveLength(1);
  });
  it("taking it all back settles it; never more than they have", () => {
    owedStep(abu.id, "back", 999999);
    expect(get(abu.id).data).toMatchObject({ closed: true });
    expect(left(abu.id)).toBe(0);
    expect(owedTotals(st().lists.owed as Rec<"owed">[], "PKR").total).toBe(0);
  });
  it("a loan paid back in part, the rest let go becomes spending, and deleting puts it all back", () => {
    const ali = createOwed({ type: "loan", who: "Ali", amount: 50000, date: today, due: today, account: "bank" });
    owedStep(ali.id, "back", 20000);
    const undoLetGo = owedStep(ali.id, "forgave", 999999);
    expect(get(ali.id).data.closed).toBe(true);
    const spent = money().filter((m) => m.data.type === "expense");
    expect(spent).toHaveLength(1);
    expect(spent[0].data).toMatchObject({ amount: 30000, category: "Gifts", account: "bank" });
    expect(monthTotals(money(), month, "PKR").spent).toBe(30000);
    undoLetGo();
    expect(money().filter((m) => m.data.type === "expense")).toHaveLength(0);
    owedStep(ali.id, "forgave", 30000);
    const undoDelete = removeOwed(get(ali.id));
    expect(st().byId[ali.id].deleted).toBe(1);
    expect(money().filter((m) => m.data.type === "expense")).toHaveLength(0);
    undoDelete();
    expect(st().byId[ali.id].deleted).toBe(0);
    expect(money().filter((m) => m.data.type === "expense")).toHaveLength(1);
  });
});
