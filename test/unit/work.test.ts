// Work and Interests on the desktop: the chart data, the word splitter, and saving and removing
// with the Money entries they make (the store is real; the main process is a stand-in).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rec } from "@myapp/core";
import { rec } from "./helpers";

vi.mock("@/lib/bridge", () => ({
  isMac: () => false,
  bridge: { app: { platform: "linux" }, db: { load: async () => ({ records: [], meta: {} }), put: async () => {}, markClean: async () => {}, setMeta: async () => {} } },
}));

const { weeklyHours, saveWorkLog, removeProject, renewedUntil } = await import("@/lib/work");
const { practiceGrid, splitWord, gotWish, removeInterest } = await import("@/lib/interests");
const { useRecords, EMPTY_LISTS } = await import("@/store/records");

const live = (kind: string) => (useRecords.getState().lists as unknown as Record<string, Rec[]>)[kind];

beforeEach(() => useRecords.setState({ byId: {}, lists: EMPTY_LISTS() }));

describe("weeklyHours", () => {
  it("adds time up by week (Monday on), billable apart from the rest", () => {
    const logs = [
      rec("work_log", { type: "time", date: "2026-11-24", minutes: 90 }),
      rec("work_log", { type: "time", date: "2026-11-25", minutes: 30, billable: false }),
      rec("work_log", { type: "time", date: "2026-11-17", minutes: 120 }),
      rec("work_log", { type: "payment", date: "2026-11-24", amount: 500 }),
      rec("work_log", { type: "time", date: "2026-09-01", minutes: 600 }),
    ];
    const w = weeklyHours(logs, "2026-11-26", 3);
    expect(w.map((x) => x.key)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(w.map((x) => x.values)).toEqual([
      { billable: 0, other: 0 },
      { billable: 2, other: 0 },
      { billable: 1.5, other: 0.5 },
    ]);
    expect(w[2].label).toBe("23 Nov");
  });
});

describe("practiceGrid and splitWord", () => {
  it("lays the weeks out Monday first, stops at today, adds up a day", () => {
    const p = [rec("practice", { date: "2026-11-26", minutes: 20, interest_id: "a" }), rec("practice", { date: "2026-11-26", minutes: 10, interest_id: "b" }), rec("practice", { date: "2026-11-16", minutes: 15, interest_id: "a" })];
    const g = practiceGrid(p, "2026-11-26", 2);
    expect(g).toHaveLength(2);
    expect(g[0][0]).toEqual({ date: "2026-11-16", minutes: 15, weekday: 0 });
    expect(g[1].map((d) => d.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]);
    expect(g[1][3].minutes).toBe(30);
    expect(practiceGrid(p, "2026-11-26", 2, "a")[1][3].minutes).toBe(20);
  });
  it("reads word = meaning in a few ways, and refuses half of one", () => {
    expect(splitWord("kitab = book")).toEqual(["kitab", "book"]);
    expect(splitWord("qalam: pen")).toEqual(["qalam", "pen"]);
    expect(splitWord("bayt - house")).toEqual(["bayt", "house"]);
    expect(splitWord("as-salamu alaykum = peace be upon you")).toEqual(["as-salamu alaykum", "peace be upon you"]);
    expect(splitWord("kitab =")).toBeNull();
    expect(splitWord("just a word")).toBeNull();
  });
});

describe("saving and removing", () => {
  it("a payment goes into Money as income; removing the project takes its log and that income, and Undo brings them back", () => {
    const s = useRecords.getState();
    const p = s.create("project", { name: "Shop site", status: "active" });
    saveWorkLog(null, { project_id: p.id, type: "time", date: "2026-11-24", minutes: 60 }, false, "Shop site");
    const payId = saveWorkLog(null, { project_id: p.id, type: "payment", date: "2026-11-25", amount: 400 }, true, "Shop site");
    const pay = useRecords.getState().byId[payId] as Rec<"work_log">;
    const income = useRecords.getState().byId[pay.data.money_id!] as Rec<"money">;
    expect(income.data).toMatchObject({ type: "income", amount: 400, category: "Freelance", note: "Shop site" });
    const undo = removeProject(useRecords.getState().byId[p.id] as Rec<"project">);
    expect(live("project")).toHaveLength(0);
    expect(live("work_log")).toHaveLength(0);
    expect(live("money")).toHaveLength(0);
    undo();
    expect(live("work_log")).toHaveLength(2);
    expect(live("money")).toHaveLength(1);
  });
  it("taking a payment out of Money removes the income", () => {
    const id = saveWorkLog(null, { type: "payment", date: "2026-11-25", amount: 90 }, true, "");
    const r = useRecords.getState().byId[id] as Rec<"work_log">;
    saveWorkLog(r, { ...r.data, amount: 90 }, false, "");
    expect(live("money")).toHaveLength(0);
    expect((useRecords.getState().byId[id] as Rec<"work_log">).data.money_id).toBeNull();
  });
  it("a wish you get lands in My things and Money; Undo takes both back", () => {
    const w = useRecords.getState().create("wish", { name: "Keyboard", price: 90 });
    const undo = gotWish(w, { money: true, thing: true }, "2026-11-26");
    expect(live("thing")[0].data).toMatchObject({ name: "Keyboard", price: 90, bought_on: "2026-11-26" });
    expect(live("money")[0].data).toMatchObject({ amount: 90, category: "Shopping" });
    expect((useRecords.getState().byId[w.id] as Rec<"wish">).data.got).toBe(true);
    undo();
    expect(live("thing")).toHaveLength(0);
    expect(live("money")).toHaveLength(0);
    expect((useRecords.getState().byId[w.id] as Rec<"wish">).data.got).toBeUndefined();
  });
  it("removing an interest removes its practice and keeps its words", () => {
    const s = useRecords.getState();
    const i = s.create("interest", { name: "Arabic" });
    s.create("practice", { interest_id: i.id, date: "2026-11-26", minutes: 15 });
    s.create("word", { interest_id: i.id, term: "kitab", meaning: "book" });
    const undo = removeInterest(i);
    expect(live("practice")).toHaveLength(0);
    expect(live("word")).toHaveLength(1);
    undo();
    expect(live("practice")).toHaveLength(1);
  });
  it("a domain renewed runs a year on from its expiry, or from today once it's past", () => {
    expect(renewedUntil("2027-01-10", "2026-11-26")).toBe("2028-01-10");
    expect(renewedUntil("2026-10-01", "2026-11-26")).toBe("2027-11-26");
  });
});

describe("typing a duration", () => {
  it("reads the ways people type it", async () => {
    const { parseMinutes, minutesShort } = await import("@/lib/work");
    expect(parseMinutes("90")).toBe(90);
    expect(parseMinutes("45m")).toBe(45);
    expect(parseMinutes("45 min")).toBe(45);
    expect(parseMinutes("1h")).toBe(60);
    expect(parseMinutes("1h 30")).toBe(90);
    expect(parseMinutes("1h30m")).toBe(90);
    expect(parseMinutes("1:05")).toBe(65);
    expect(parseMinutes("1.5h")).toBe(90);
    expect(parseMinutes("2 hours")).toBe(120);
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes("soon")).toBeNull();
    expect(minutesShort(45)).toBe("45m");
    expect(minutesShort(120)).toBe("2h");
    expect(minutesShort(95)).toBe("1h 35m");
  });
});

describe("the project timer", () => {
  it("logs to the nearest five minutes, and at least one", async () => {
    const { timerMinutes, elapsed, startTimer, stopTimer } = await import("@/lib/work");
    expect(timerMinutes(0, 42 * 60000)).toBe(40);
    expect(timerMinutes(0, 43 * 60000)).toBe(45);
    expect(timerMinutes(0, 2 * 60000)).toBe(2);
    expect(timerMinutes(0, 10000)).toBe(1);
    expect(elapsed(0, (3600 + 125) * 1000)).toBe("01:02:05");
    const p = useRecords.getState().create("project", { name: "Site", status: "idea" });
    startTimer(p, 1000);
    const running = useRecords.getState().byId[p.id] as Rec<"project">;
    expect(running.data.timer_from).toBe(1000);
    expect(running.data.status).toBe("active");
    expect(stopTimer(running, 1000 + 61 * 60000)).toBe(60);
    expect((useRecords.getState().byId[p.id] as Rec<"project">).data.timer_from).toBeNull();
  });
});
