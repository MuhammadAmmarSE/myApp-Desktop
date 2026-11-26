import { describe, expect, it } from "vitest";
import { parseQuick } from "@/lib/quickTodo";

// Thursday 26 November 2026
const TODAY = "2026-11-26";

describe("parseQuick", () => {
  it("reads a day, a time, a tag and high priority", () => {
    expect(parseQuick("Call the plumber tomorrow 10am #home !", TODAY)).toEqual({ title: "Call the plumber", due: "2026-11-27", time: "10:00", priority: "high", tags: ["home"], repeat: null });
  });
  it("keeps plain text as the title", () => {
    const q = parseQuick("Buy a new kettle", TODAY);
    expect(q).toMatchObject({ title: "Buy a new kettle", due: null, time: null, priority: "normal", tags: [], repeat: null });
  });
  it("reads pm times with minutes and 24-hour times", () => {
    expect(parseQuick("Meet the team 5:30pm", TODAY)).toMatchObject({ title: "Meet the team", time: "17:30" });
    expect(parseQuick("Standup 09:15", TODAY)).toMatchObject({ title: "Standup", time: "09:15" });
    expect(parseQuick("Lunch 12pm", TODAY).time).toBe("12:00");
    expect(parseQuick("Wake 12am", TODAY).time).toBe("00:00");
  });
  it("reads 'at 9' as morning and 'at 5' as afternoon", () => {
    expect(parseQuick("Gym at 9", TODAY).time).toBe("09:00");
    expect(parseQuick("Pick up kids at 5", TODAY).time).toBe("17:00");
  });
  it("tonight is today at 8pm unless a time is given", () => {
    expect(parseQuick("Call mum tonight", TODAY)).toMatchObject({ title: "Call mum", due: TODAY, time: "20:00" });
    expect(parseQuick("Call mum tonight 9pm", TODAY)).toMatchObject({ due: TODAY, time: "21:00" });
  });
  it("reads relative days", () => {
    expect(parseQuick("Renew passport in 3 days", TODAY).due).toBe("2026-11-29");
    expect(parseQuick("Review in 2 weeks", TODAY).due).toBe("2026-12-10");
    expect(parseQuick("Plan the trip next week", TODAY).due).toBe("2026-12-03");
  });
  it("a weekday is the coming one, including 'next'", () => {
    expect(parseQuick("Call mum friday", TODAY)).toMatchObject({ title: "Call mum", due: "2026-11-27" });
    expect(parseQuick("Meet Ali next monday 5:30pm", TODAY)).toMatchObject({ title: "Meet Ali", due: "2026-11-30", time: "17:30" });
    // today is Thursday: "thursday" means next week's
    expect(parseQuick("Bins thursday", TODAY).due).toBe("2026-12-03");
  });
  it("the last weekday in the line wins, so a title word stays", () => {
    expect(parseQuick("Fix sat dish on sat", TODAY)).toMatchObject({ title: "Fix sat dish", due: "2026-11-28" });
  });
  it("reads dates in three ways, rolling into next year when passed", () => {
    expect(parseQuick("Dentist 12 dec", TODAY).due).toBe("2026-12-12");
    expect(parseQuick("Dentist dec 12th", TODAY).due).toBe("2026-12-12");
    expect(parseQuick("Taxes 2027-01-31", TODAY).due).toBe("2027-01-31");
    expect(parseQuick("Birthday party 3 mar", TODAY).due).toBe("2027-03-03");
  });
  it("ignores an impossible date and keeps it in the title", () => {
    const q = parseQuick("Check 31 feb", TODAY);
    expect(q.due).toBeNull();
    expect(q.title).toContain("31 feb");
  });
  it("reads repeats and several tags", () => {
    expect(parseQuick("Water the plants every week #home #garden", TODAY)).toMatchObject({ title: "Water the plants", repeat: "weekly", tags: ["home", "garden"] });
    expect(parseQuick("Vitamins daily", TODAY).repeat).toBe("daily");
    expect(parseQuick("Rent monthly", TODAY).repeat).toBe("monthly");
  });
  it("reads 'urgent' as high priority", () => {
    expect(parseQuick("Urgent fix the login", TODAY).priority).toBe("high");
  });
});
