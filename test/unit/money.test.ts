import { describe, expect, it } from "vitest";
import { billDay, byCategory, daysIn, monthTitle, monthlyBills, perDay, perMonth, projection, running, shiftMonth } from "@/lib/money";
import { rec } from "./helpers";

const m = (type: "expense" | "income", amount: number, category: string, date: string, extra: Record<string, unknown> = {}) => rec("money", { type, amount, currency: "PKR", category, date, ...extra });
const MONEY = [
  m("expense", 100, "Food", "2026-11-01"),
  m("expense", 50, "Food", "2026-11-01"),
  m("expense", 300, "Fuel", "2026-11-15"),
  m("income", 1000, "Salary", "2026-11-01", { recurring: "monthly", note: "Salary" }),
  m("expense", 900, "Rent", "2026-10-05", { recurring: "monthly", note: "Rent" }),
  m("expense", 80, "Food", "2026-10-20"),
  m("expense", 20, "Food", "2026-11-03", { currency: "USD" }),
];

describe("months", () => {
  it("shifts across years and knows how long they are", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 3)).toBe("2027-02");
    expect(daysIn("2028-02")).toBe(29);
    expect(daysIn("2026-11")).toBe(30);
  });
  it("names a month, with the year only when it isn't this year", () => {
    expect(monthTitle("2026-11", 2026)).toBe("November");
    expect(monthTitle("2025-11", 2026)).toBe("November 2025");
  });
});

describe("sums", () => {
  it("adds up each day, only in your currency", () => {
    const d = perDay(MONEY, "2026-11", "PKR");
    expect(d).toHaveLength(30);
    expect(d[0]).toBe(150);
    expect(d[2]).toBe(0);
    expect(d[14]).toBe(300);
    expect(perDay(MONEY, "2026-11", "PKR", "income")[0]).toBe(1000);
    expect(running([1, 2, 3])).toEqual([1, 3, 6]);
  });
  it("adds up each month of a year", () => {
    const y = perMonth(MONEY, 2026, "PKR");
    expect(y[10]).toEqual({ month: "2026-11", spent: 450, earned: 1000 });
    expect(y[9]).toEqual({ month: "2026-10", spent: 980, earned: 0 });
  });
  it("lists where it went, biggest first", () => {
    const c = byCategory(MONEY, (r) => r.data.date.startsWith("2026-11"), "PKR");
    expect(c.map((x) => [x.label, x.value, x.count])).toEqual([
      ["Fuel", 300, 1],
      ["Food", 150, 2],
    ]);
  });
  it("projects the month at today's pace", () => {
    expect(projection(300, 10, 30)).toBe(900);
    expect(projection(300, 0, 30)).toBeNull();
  });
});

describe("monthly bills", () => {
  it("says which bills are noted this month, unnoted first", () => {
    const b = monthlyBills(MONEY, "2026-11");
    expect(b.map((x) => [x.latest.data.category, !!x.noted])).toEqual([
      ["Rent", false],
      ["Salary", true],
    ]);
    expect(billDay(b[0], "2026-11")).toBe("2026-11-05");
  });
  it("ignores bills that start after the month", () => {
    expect(monthlyBills(MONEY, "2026-09")).toEqual([]);
  });
  it("puts the 31st on the month's last day", () => {
    const b = monthlyBills([m("expense", 10, "Gym", "2026-10-31", { recurring: "monthly" })], "2026-11");
    expect(billDay(b[0], "2026-11")).toBe("2026-11-30");
  });
});
