// Nudges on this computer: the app's own check makes each one once (with no server at all), ends
// the ones whose reason has gone, and what rings keeps to quiet hours and the day's limit, across a
// restart. (Which nudges exist and their wording are core's, tested there.)
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; kind: string; data: any; created_at: number; updated_at: number; deleted: number; dirty: number };
const disk = { records: [] as Row[], meta: {} as Record<string, string> };
const put = vi.fn(async (recs: Row[]) => {
  for (const r of recs) {
    const i = disk.records.findIndex((x) => x.id === r.id);
    if (i >= 0) disk.records[i] = r;
    else disk.records.push(r);
  }
});
vi.mock("@/lib/bridge", () => ({
  isMac: () => false,
  bridge: {
    app: { platform: "linux" },
    db: {
      load: async () => ({ records: disk.records.map((r) => ({ ...r })), meta: { ...disk.meta } }),
      put: (recs: Row[]) => put(recs),
      markClean: async () => {},
      setMeta: async (k: string, v: string) => void (disk.meta[k] = v),
    },
    reminders: { schedule: async () => {} },
  },
}));
vi.mock("@/lib/router", () => ({ navigate: () => {} }));

const { useRecords } = await import("@/store/records");
const { useSettings } = await import("@/store/settings");
const { runNudgeCheck, nudgeDone, nudgeSnooze } = await import("@/lib/nudges");
const { nudgeAlertList } = await import("@/lib/alerts");
const { DEFAULT_NUDGE_SETTINGS } = await import("@myapp/core");

// Saturday 28 November 2026, 11:00 here
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const NOW = at(28, 11);
const todo = (id: string, title: string, due: string, extra: Record<string, unknown> = {}): Row => ({ id, kind: "todo", data: { title, due, done: false, ...extra }, created_at: at(20, 9), updated_at: at(20, 9), deleted: 0, dirty: 0 });

const nudges = () => useRecords.getState().lists.nudge;
const restart = async () => {
  useRecords.setState({ ready: false } as any);
  await useRecords.getState().load();
  useSettings.getState().load();
};

describe("the app's own check", () => {
  beforeEach(async () => {
    disk.records = [todo("tod_gym_0001", "Renew the gym membership", "2026-11-26", { priority: "high" }), todo("tod_mail_0001", "Post the letters", "2026-11-28")];
    disk.meta = {};
    put.mockClear();
    await restart();
    useSettings.getState().set({ nudges: { ...DEFAULT_NUDGE_SETTINGS, quiet: { from: "22:00", to: "08:00" } } });
  });

  it("makes a nudge for a to-do past its day, saved here to send later (no server needed)", () => {
    expect(runNudgeCheck(NOW)).toBeGreaterThan(0);
    const late = nudges().find((n) => n.data.related_ids?.includes("tod_gym_0001"));
    expect(late).toBeTruthy();
    expect(late!.data.created_by).toBe("app");
    expect(late!.data.text).toMatch(/Renew the gym membership/);
    // written to this computer's copy, marked to go to the server when it can
    const saved = disk.records.find((r) => r.id === late!.id);
    expect(saved?.dirty).toBe(1);
  });

  it("makes it once: checking again, or after a restart, adds nothing", async () => {
    runNudgeCheck(NOW);
    const first = nudges().length;
    expect(runNudgeCheck(NOW + 60000)).toBe(0);
    await restart();
    expect(runNudgeCheck(NOW + 120000)).toBe(0);
    expect(nudges().length).toBe(first);
  });

  it("the same nudge has the same id on every device, so two computers never double it", async () => {
    runNudgeCheck(NOW);
    const ids = nudges().map((n) => n.id).sort();
    // another computer, same records, its own empty copy of the nudges
    disk.records = disk.records.filter((r) => r.kind !== "nudge");
    await restart();
    runNudgeCheck(NOW + 5 * 60000);
    expect(nudges().map((n) => n.id).sort()).toEqual(ids);
  });

  it("a nudge whose reason has gone (the to-do was done) is marked done", () => {
    runNudgeCheck(NOW);
    const late = nudges().find((n) => n.data.related_ids?.includes("tod_gym_0001"))!;
    useRecords.getState().update<"todo">("tod_gym_0001", { done: true, done_at: NOW });
    runNudgeCheck(NOW + 60000);
    const after = useRecords.getState().byId[late.id] as any;
    expect(after.data.status).toBe("done");
  });

  it("switched off, it makes none", () => {
    useSettings.getState().set({ nudges: { ...useSettings.getState().nudges, on: false } });
    expect(runNudgeCheck(NOW)).toBe(0);
    expect(nudges().length).toBe(0);
  });
});

describe("what rings", () => {
  const assistantNudge = (id: string, text: string, due: number, priority = "normal"): Row => ({
    id,
    kind: "nudge",
    data: { text, kind: "reminder", due_at: due, priority, status: "pending", related_ids: [], created_by: "assistant", category: "assistant" },
    created_at: at(27, 9),
    updated_at: at(27, 9),
    deleted: 0,
    dirty: 0,
  });

  beforeEach(async () => {
    disk.records = [];
    disk.meta = {};
    await restart();
    useSettings.getState().set({ nudges: { ...DEFAULT_NUDGE_SETTINGS, quiet: { from: "22:00", to: "08:00" }, cap: 2 } });
  });

  it("at its time, and one due in quiet hours waits till they end", async () => {
    disk.records = [assistantNudge("ndg_a_0001", "Call the bank", at(28, 15)), assistantNudge("ndg_b_0001", "Take the medicine", at(28, 23))];
    await restart();
    const list = nudgeAlertList(NOW);
    const bank = list.find((a) => a.body === "Call the bank")!;
    const med = list.find((a) => a.body === "Take the medicine")!;
    expect(bank.at).toBe(at(28, 15));
    expect(med.at).toBe(at(29, 8));
  });

  it("never more than the day's limit, counted across a restart; one already rung never rings again", async () => {
    disk.records = [assistantNudge("ndg_a_0001", "One", at(28, 12)), assistantNudge("ndg_b_0001", "Two", at(28, 13)), assistantNudge("ndg_c_0001", "Three", at(28, 14))];
    await restart();
    expect(nudgeAlertList(NOW).map((a) => a.body)).toEqual(["One", "Two"]);
    // the first two ring; Redline restarts in the afternoon
    await restart();
    expect(nudgeAlertList(at(28, 16)).map((a) => a.body)).toEqual([]);
    // the next day the limit starts again (Three's time has long passed, so it isn't rung late)
    expect(nudgeAlertList(at(29, 9)).length).toBe(0);
  });

  it("done or snoozed follows: a done one doesn't ring, a snoozed one rings at its new time", async () => {
    disk.records = [assistantNudge("ndg_a_0001", "Water the plants", at(28, 15)), assistantNudge("ndg_b_0001", "Pay the rent", at(28, 16))];
    await restart();
    nudgeDone(useRecords.getState().byId["ndg_a_0001"] as any);
    const undo = nudgeSnooze(useRecords.getState().byId["ndg_b_0001"] as any, "tomorrow");
    const list = nudgeAlertList(NOW);
    expect(list.map((a) => a.body)).toEqual(["Pay the rent"]);
    expect(list[0].at).toBeGreaterThan(at(29, 7));
    undo();
    expect((useRecords.getState().byId["ndg_b_0001"] as any).data.status).toBe("pending");
  });

  it("nothing rings when ringing is off, and a password never reaches the notification", async () => {
    disk.records = [assistantNudge("ndg_a_0001", "Log in with password hunter22", at(28, 15))];
    await restart();
    const [a] = nudgeAlertList(NOW);
    expect(a.body).not.toContain("hunter22");
    useSettings.getState().set({ nudges: { ...useSettings.getState().nudges, notify: false } });
    await restart();
    expect(useSettings.getState().nudges.notify).toBe(false);
    expect(nudgeAlertList(NOW)).toEqual([]);
  });
});
