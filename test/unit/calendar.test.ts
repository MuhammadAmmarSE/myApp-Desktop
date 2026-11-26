import { describe, expect, it } from "vitest";
import { addMonthsTo, byWhen, calendarItems, groupByDay, minutesOf, monthMatrix, moveTo, retime, timeOf, weekOf, yearlyOn } from "@/lib/calendar";
import { lists, rec } from "./helpers";

describe("calendarItems", () => {
  const l = lists();
  const sam = rec("person", { name: "Sam", relation: "friend" });
  const car = rec("car", { name: "Corolla" });
  l.person.push(sam);
  l.car.push(car);
  l.event.push(rec("event", { title: "Dentist", date: "2026-12-02", time: "16:30", place: "Clinic", person_id: sam.id }));
  l.event.push(rec("event", { title: "Outside", date: "2027-02-01" }));
  l.reminder.push(rec("reminder", { text: "Bins", at: new Date(2026, 11, 3, 19, 5).getTime(), done: false }));
  l.reminder.push(rec("reminder", { text: "Old", at: new Date(2026, 11, 3, 9, 0).getTime(), done: true }));
  l.todo.push(rec("todo", { title: "Report", due: "2026-12-01", time: "15:00", done: false, priority: "high" }));
  l.todo.push(rec("todo", { title: "No date", done: false }));
  l.todo.push(rec("todo", { title: "Finished", due: "2026-12-01", done: true }));
  l.date.push(rec("date", { title: "Sam's birthday", kind: "birthday", month: 12, day: 5, year: 1990, person_id: sam.id, remind: [] }));
  l.date.push(rec("date", { title: "Leap day", kind: "other", month: 2, day: 29, year: null, remind: [] }));
  // two insurance renewals: only the newest counts
  l.car_log.push(rec("car_log", { car_id: car.id, type: "paper", title: "Insurance", date: "2025-12-01", next_date: "2026-12-01" }));
  l.car_log.push(rec("car_log", { car_id: car.id, type: "paper", title: "Insurance", date: "2026-11-20", next_date: "2027-11-20" }));
  l.car_log.push(rec("car_log", { car_id: car.id, type: "service", title: "Oil change", date: "2026-09-01", next_date: "2026-12-10" }));
  l.thing.push(rec("thing", { name: "Laptop", warranty_until: "2026-12-20" }));
  l.thing.push(rec("thing", { name: "Gone phone", warranty_until: "2026-12-21", gone: true }));

  const items = calendarItems(l, "2026-12-01", "2026-12-31");
  const titles = items.map((i) => i.title);

  it("collects every kind in the range, in day order", () => {
    expect(titles).toEqual(["Report", "Dentist", "Bins", "Sam's birthday", "Oil change due", "Laptop warranty ends"]);
  });
  it("leaves out what is done, outside the range, undated, renewed or gone", () => {
    expect(titles).not.toContain("Outside");
    expect(titles).not.toContain("Old");
    expect(titles).not.toContain("No date");
    expect(titles).not.toContain("Finished");
    expect(titles).not.toContain("Insurance expires");
    expect(titles).not.toContain("Gone phone warranty ends");
  });
  it("shows done things when asked", () => {
    const all = calendarItems(l, "2026-12-01", "2026-12-31", { showDone: true }).map((i) => i.title);
    expect(all).toContain("Finished");
    expect(all).toContain("Old");
  });
  it("says who and how old on yearly dates", () => {
    const b = items.find((i) => i.kind === "date")!;
    expect(b.date).toBe("2026-12-05");
    expect(b.detail).toBe("Sam · turns 36");
    expect(b.movable).toBe(false);
  });
  it("puts a 29 February on the 28th in other years", () => {
    expect(calendarItems(l, "2027-02-01", "2027-02-28").find((i) => i.title === "Leap day")?.date).toBe("2027-02-28");
    expect(yearlyOn(2028, 2, 29)).toBe("2028-02-29");
  });
  it("gives the event's place and person", () => {
    expect(items.find((i) => i.title === "Dentist")).toMatchObject({ time: "16:30", detail: "Clinic · Sam", movable: true });
    expect(items.find((i) => i.title === "Bins")).toMatchObject({ time: "19:05", date: "2026-12-03" });
  });
  it("shows a paper that expires in the range", () => {
    const papers = calendarItems(l, "2027-11-01", "2027-11-30");
    expect(papers.map((p) => p.title)).toEqual(["Insurance expires"]);
    expect(papers[0].detail).toBe("Corolla");
  });
  it("groups by day", () => {
    const g = groupByDay(items);
    expect(g.get("2026-12-01")?.map((i) => i.title)).toEqual(["Report"]);
    expect([...g.keys()]).toEqual(["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-05", "2026-12-10", "2026-12-20"]);
  });
});

describe("ordering", () => {
  it("puts untimed things first, then by time", () => {
    const l = lists();
    l.todo.push(rec("todo", { title: "Late", due: "2026-12-01", time: "18:00", done: false }));
    l.todo.push(rec("todo", { title: "Early", due: "2026-12-01", time: "08:00", done: false }));
    l.todo.push(rec("todo", { title: "All day", due: "2026-12-01", done: false }));
    expect(calendarItems(l, "2026-12-01", "2026-12-01").sort(byWhen).map((i) => i.title)).toEqual(["All day", "Early", "Late"]);
  });
});

describe("grids", () => {
  it("a month is six weeks from the week's first day", () => {
    const mon = monthMatrix("2026-11", 1);
    expect(mon).toHaveLength(42);
    expect(mon[0]).toBe("2026-10-26");
    expect(mon[6]).toBe("2026-11-01");
    expect(monthMatrix("2026-11", 0)[0]).toBe("2026-11-01");
  });
  it("a week starts on the right day", () => {
    expect(weekOf("2026-11-26", 1)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
    expect(weekOf("2026-11-26", 0)[0]).toBe("2026-11-22");
  });
  it("months add across years", () => {
    expect(addMonthsTo("2026-11", 2)).toBe("2027-01");
    expect(addMonthsTo("2026-01", -1)).toBe("2025-12");
  });
  it("minutes and times go both ways", () => {
    expect(minutesOf("09:45")).toBe(585);
    expect(timeOf(585)).toBe("09:45");
  });
});

describe("moving", () => {
  const l = lists();
  l.event.push(rec("event", { title: "Call", date: "2026-12-02", time: "10:00" }));
  l.todo.push(rec("todo", { title: "Task", due: "2026-12-02", done: false }));
  l.reminder.push(rec("reminder", { text: "Ping", at: new Date(2026, 11, 2, 7, 30).getTime(), done: false }));
  l.date.push(rec("date", { title: "Birthday", kind: "birthday", month: 12, day: 2, remind: [] }));
  const items = calendarItems(l, "2026-12-01", "2026-12-31");
  const by = (t: string) => items.find((i) => i.title === t)!;
  it("moves each kind to another day the way it stores its day", () => {
    expect(moveTo(by("Call"), "2026-12-09")?.change).toEqual({ date: "2026-12-09" });
    expect(moveTo(by("Task"), "2026-12-09")?.change).toEqual({ due: "2026-12-09" });
    expect(moveTo(by("Ping"), "2026-12-09")?.change).toEqual({ at: new Date(2026, 11, 9, 7, 30).getTime() });
    expect(moveTo(by("Birthday"), "2026-12-09")).toBeNull();
  });
  it("moves to another time", () => {
    expect(retime(by("Call"), "2026-12-03", "14:15")?.change).toEqual({ date: "2026-12-03", time: "14:15" });
    expect(retime(by("Task"), "2026-12-03", "08:00")?.change).toEqual({ due: "2026-12-03", time: "08:00" });
    expect(retime(by("Ping"), "2026-12-03", "08:00")?.change).toEqual({ at: new Date(2026, 11, 3, 8, 0).getTime() });
  });
});
