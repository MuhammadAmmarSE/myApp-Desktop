import { describe, expect, it } from "vitest";
import { economySeries, monthlyCarSpend } from "@/lib/car";
import { rec } from "./helpers";

const fill = (date: string, odometer: number, litres: number, full = true, amount = 1000) => rec("car_log", { type: "fuel", date, odometer, litres, full, amount });

describe("economySeries", () => {
  it("works out km per litre between full fills, adding the part fills between", () => {
    const logs = [fill("2026-11-20", 1800, 20), fill("2026-11-01", 1000, 30), fill("2026-11-10", 1300, 10, false), fill("2026-11-15", 1500, 15)];
    expect(economySeries(logs)).toEqual([
      { date: "2026-11-15", kmPerLitre: 20 },
      { date: "2026-11-20", kmPerLitre: 15 },
    ]);
  });
  it("needs a full fill to start from, and skips fills with no reading", () => {
    expect(economySeries([fill("2026-11-01", 1000, 30, false), fill("2026-11-05", 1200, 10)])).toEqual([]);
    expect(economySeries([fill("2026-11-01", 0, 30), fill("2026-11-05", 1200, 10)])).toEqual([]);
  });
});

describe("monthlyCarSpend", () => {
  it("splits fuel from everything else, month by month", () => {
    const logs = [fill("2026-10-03", 1, 1, true, 500), fill("2026-11-03", 1, 1, true, 700), rec("car_log", { type: "service", date: "2026-11-09", amount: 2000 }), rec("car_log", { type: "paper", date: "2026-11-12", amount: null })];
    expect(monthlyCarSpend(logs, ["2026-10", "2026-11", "2026-12"])).toEqual([
      { month: "2026-10", fuel: 500, other: 0 },
      { month: "2026-11", fuel: 700, other: 2000 },
      { month: "2026-12", fuel: 0, other: 0 },
    ]);
  });
});
