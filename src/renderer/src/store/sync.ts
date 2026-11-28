// Keeps this computer and your server in step: sends local changes, then fetches everything changed
// elsewhere (the phone) since the last time. Runs a moment after each change, when the window comes
// back to the front, and every minute.
import { create } from "zustand";
import type { Rec } from "@myapp/core";
import { api, ApiError } from "@/lib/api";
import { useRecords, dirtyRecords, onLocalChange } from "./records";
import { useAuth } from "./auth";

type SyncState = { syncing: boolean; lastAt: number | null; error: string; offline: boolean; pulled: number };
export const useSync = create<SyncState>(() => ({ syncing: false, lastAt: null, error: "", offline: false, pulled: 0 }));

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function syncNow(): Promise<boolean> {
  if (useAuth.getState().status !== "signed-in") return false;
  if (running) {
    again = true;
    return true;
  }
  running = true;
  useSync.setState({ syncing: true });
  let pulled = 0;
  try {
    let pending = dirtyRecords();
    // records of a kind the server doesn't know yet (it's older than this app): kept here and sent
    // again once it's updated, never marked as sent
    let waiting = 0;
    while (pending.length) {
      const batch = pending.slice(0, 200);
      pending = pending.slice(200);
      const sent = batch.map((r) => ({ id: r.id, updated_at: r.updated_at }));
      const res = await api<{ accepted: string[]; rejected: { id: string; reason: string }[]; conflicts: Rec[] }>("POST", "/sync", {
        records: batch.map(({ dirty: _d, ...r }) => r),
      });
      const later = res.rejected.filter((x) => /^unknown kind/i.test(x.reason || ""));
      waiting += later.length;
      const done = new Set([...res.accepted, ...res.rejected.filter((x) => !later.includes(x)).map((x) => x.id), ...res.conflicts.map((c) => c.id)]);
      useRecords.getState().markClean(sent.filter((s) => done.has(s.id)));
      if (res.conflicts.length) useRecords.getState().applyRemote(res.conflicts);
    }
    let cursor = Number(useRecords.getState().meta.cursor || 0);
    for (let page = 0; page < 200; page++) {
      const res = await api<{ records: Rec[]; cursor: number; more: boolean }>("GET", `/sync?since=${cursor}`);
      if (res.records.length) {
        pulled += res.records.length;
        useRecords.getState().applyRemote(res.records);
      }
      cursor = res.cursor;
      useRecords.getState().setMeta("cursor", String(cursor));
      if (!res.more) break;
    }
    const now = Date.now();
    useRecords.getState().setMeta("last_sync", String(now));
    useSync.setState({ lastAt: now, error: waiting ? (waiting === 1 ? "1 change waits for your server to be updated (myapp-backend) before it syncs." : `${waiting} changes wait for your server to be updated (myapp-backend) before they sync.`) : "", offline: false, pulled });
    return true;
  } catch (e) {
    const err = e as ApiError;
    useSync.setState({ error: err.code === "NETWORK" ? "" : err.message || "Couldn't sync.", offline: err.code === "NETWORK" });
    return false;
  } finally {
    running = false;
    useSync.setState({ syncing: false });
    if (again) {
      again = false;
      schedule(500);
    }
  }
}

export const schedule = (ms = 1500) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, ms);
};

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  const last = useRecords.getState().meta.last_sync;
  if (last) useSync.setState({ lastAt: Number(last) });
  onLocalChange(() => schedule());
  window.addEventListener("focus", () => schedule(200));
  window.addEventListener("online", () => schedule(200));
  setInterval(() => void syncNow(), 60000);
  useAuth.subscribe((s, prev) => {
    if (s.status === "signed-in" && prev.status !== "signed-in") schedule(100);
  });
  schedule(300);
}
