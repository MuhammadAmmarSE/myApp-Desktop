// Nudges on the computer, the same as on the phone: the app's own check (core's planNudges) runs when
// Redline starts, when the window comes back to the front, every ten minutes, and a moment after
// records change (here or from another device). What it decides is saved through the store like any
// change: new nudges with createOnce (the same id on every device, so they never double up) and the
// ones whose reason has gone marked done. The rest is what a nudge's buttons do, and where Open goes.
import { useMemo } from "react";
import { dueNudges, isoDate, laterNudges, nudgeAfter, nudgeDuplicate, pastNudges, planNudges, snoozeTimes, type NudgeData, type Rec } from "@myapp/core";
import { onLocalChange, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { useNow } from "@/lib/clock";
import { navigate } from "@/lib/router";

type Nudge = Rec<"nudge">;

let timer: ReturnType<typeof setTimeout> | null = null;
let lastRun = 0;

// one check now: make what's due, end what's done; returns how many it made
export function runNudgeCheck(now = Date.now()): number {
  const st = useRecords.getState();
  if (!st.ready) return 0;
  const s = useSettings.getState();
  const all = Object.values(st.byId) as unknown as Rec[];
  const plan = planNudges(
    {
      records: all.filter((r) => !r.deleted && r.kind !== "nudge"),
      nudges: all.filter((r) => r.kind === "nudge") as unknown as Nudge[],
      get: (id) => st.byId[id] as unknown as Rec | undefined,
      currency: s.currency,
    },
    now,
    s.nudges,
  );
  for (const r of plan.resolve) useRecords.getState().update<"nudge">(r.id, () => r.data);
  let made = 0;
  for (const c of plan.create) if (useRecords.getState().createOnce(c.id, "nudge", c.data, c.at)) made++;
  lastRun = now;
  return made;
}

const soon = (ms: number) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    try {
      runNudgeCheck();
    } catch {
      // a check that fails is tried again on the next change; it never stops the app
    }
  }, ms);
};

let started = false;
export function startNudges() {
  if (started) return;
  started = true;
  soon(1500);
  onLocalChange(() => soon(2500));
  let last = useRecords.getState().byId;
  useRecords.subscribe((st) => {
    if (st.byId !== last) {
      last = st.byId;
      soon(3000);
    }
  });
  let lastNudges = useSettings.getState().nudges;
  useSettings.subscribe((st) => {
    if (st.nudges !== lastNudges) {
      lastNudges = st.nudges;
      soon(500);
    }
  });
  window.addEventListener("focus", () => {
    if (Date.now() - lastRun > 60000) soon(800);
  });
  setInterval(() => soon(0), 10 * 60000);
}

// ---------- what the buttons do ----------

const put = (rec: Nudge, data: NudgeData) => {
  const was = rec.data;
  useRecords.getState().update<"nudge">(rec.id, () => data);
  return () => useRecords.getState().update<"nudge">(rec.id, () => was);
};

export const nudgeDone = (rec: Nudge) => put(rec, nudgeAfter(rec.data, "done", Date.now()));
export const nudgeDismiss = (rec: Nudge) => put(rec, nudgeAfter(rec.data, "dismiss", Date.now()));
export function nudgeSnooze(rec: Nudge, until: "hour" | "tomorrow") {
  const t = snoozeTimes(Date.now(), useSettings.getState().nudges);
  return put(rec, nudgeAfter(rec.data, { snooze: until === "hour" ? t.hour : t.tomorrow }, Date.now()));
}
// shown on screen: it has been seen (once)
export function nudgeSeen(rec: Nudge) {
  if (rec.data.status === "pending") useRecords.getState().update<"nudge">(rec.id, (d) => nudgeAfter(d, "seen", Date.now()));
}
// the history (done, dismissed, no longer needed) goes; gives what brings it back
export function clearNudgeHistory(): () => void {
  const st = useRecords.getState();
  const gone = pastNudges(st.lists.nudge);
  for (const n of gone) st.remove(n.id);
  return () => {
    for (const n of gone) useRecords.getState().restore(n);
  };
}

// a nudge the assistant proposed: why it shouldn't be saved (it repeats one), or ""
export const nudgeRepeats = (data: { text: string; related_ids?: string[] }) => nudgeDuplicate(data, useRecords.getState().lists.nudge, Date.now());

// ---------- open the record it's about ----------

export function relatedOf(rec: Nudge): Rec | null {
  const byId = useRecords.getState().byId;
  for (const id of rec.data.related_ids || []) {
    const r = byId[id] as unknown as Rec | undefined;
    if (r && !r.deleted) return r;
  }
  return null;
}

const ROUTE: Partial<Record<string, (r: Rec) => string>> = {
  todo: () => "/todos",
  item: () => "/lists",
  event: () => "/calendar",
  date: () => "/people",
  reminder: () => "/todos",
  person: () => "/people",
  money: () => "/money",
  fund: (r) => `/funds/${r.id}`,
  owed: (r) => `/owed/${r.id}`,
  pot: (r) => `/pots/${r.id}`,
  note: (r) => `/notes/${r.id}`,
  car: () => "/car",
  car_log: () => "/car",
  thing: () => "/things",
  project: (r) => `/work/${r.id}`,
  client: () => "/work",
  server: () => "/work?tab=servers",
  domain: () => "/work?tab=domains",
  memory: () => "/settings?section=memory",
};

// where Open goes: the record's own page (or its list), Money for a money nudge
export function openTarget(rec: Nudge): string | null {
  const r = relatedOf(rec);
  if (r) return (ROUTE[r.kind] || (() => null))(r) || null;
  if (rec.data.category === "money") return "/money";
  return null;
}
export function openNudge(rec: Nudge) {
  const to = openTarget(rec);
  if (to) navigate(to);
}

// ---------- for screens ----------

export function useNudges() {
  const all = useRecords((s) => s.lists.nudge);
  const settings = useSettings((s) => s.nudges);
  const now = useNow(60000);
  return useMemo(() => ({ due: dueNudges(all, now, settings), later: laterNudges(all, now, settings), past: pastNudges(all), today: isoDate(new Date(now)), now, settings }), [all, now, settings]);
}
