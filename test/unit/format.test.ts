import { describe, expect, it } from "vitest";
import { initials, ordinal, readingTime } from "@/lib/format";
import { describe as describeAction, remember } from "@/lib/capture";

describe("format", () => {
  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
  it("initials", () => {
    expect(initials("Alex Morgan")).toBe("AM");
    expect(initials("jamie")).toBe("J");
    expect(initials("  ")).toBe("?");
    expect(initials("Mary Ann Lee")).toBe("MA");
  });
  it("reading time", () => {
    expect(readingTime("")).toEqual({ words: 0, minutes: 1 });
    expect(readingTime("word ".repeat(660)).minutes).toBe(3);
  });
});

describe("capture cards", () => {
  it("describes each kind of thing the AI found", () => {
    expect(describeAction({ type: "item", name: "Milk", qty: "2", list: "grocery", mode: "store", today: true }, "PKR")).toEqual({ title: "Milk (2)", edit: "name", detail: "Grocery · buy today" });
    expect(describeAction({ type: "money", money_type: "expense", amount: 1200, category: "Fuel", note: "Fuel", date: "2026-11-26" } as never, "PKR").detail).toMatch(/^Spent .*1,200 · Fuel · /);
    expect(describeAction({ type: "clip", text: "ABC-123", tags: [] } as never, "PKR")).toEqual({ title: "ABC-123", edit: "text", detail: "Saved text" });
  });
  it("remembers what you typed, newest first, without repeats", () => {
    expect(remember(["b", "a"], "a")).toEqual(["a", "b"]);
    expect(remember(["1", "2", "3"], "4", 3)).toEqual(["4", "1", "2"]);
  });
});
