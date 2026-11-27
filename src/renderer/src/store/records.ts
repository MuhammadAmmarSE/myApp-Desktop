// Every record, in memory (a personal app's data fits easily) and on disk (the main process keeps
// the file). Screens read lists by kind; every change is saved locally first, then synced. The same
// rules as the phone's store: a newer copy from the server wins, an unsent newer edit here stays.
import { create } from "zustand";
import { KINDS, type Kind, type KindData, type Rec } from "@myapp/core";
import type { StoredRec } from "@shared/ipc";
import { bridge } from "@/lib/bridge";
import { newId } from "@/lib/ids";

export type Stored = Rec & { dirty: 0 | 1 };
type Lists = { [K in Kind]: Rec<K>[] };
export const EMPTY_LISTS = (): Lists => Object.fromEntries(KINDS.map((k) => [k, []])) as unknown as Lists;

type State = {
  ready: boolean;
  byId: Record<string, Stored>;
  lists: Lists;
  dirtyCount: number;
  meta: Record<string, string>;
  load: () => Promise<void>;
  create: <K extends Kind>(kind: K, data: KindData[K]) => Rec<K>;
  update: <K extends Kind>(id: string, change: Partial<KindData[K]> | ((d: KindData[K]) => KindData[K])) => void;
  remove: (id: string) => void;
  restore: (rec: Rec) => void;
  applyRemote: (recs: Rec[]) => void;
  markClean: (list: { id: string; updated_at: number }[]) => void;
  setMeta: (key: string, value: string) => void;
  reset: () => void;
};

const rebuild = (byId: Record<string, Stored>, kinds?: Set<Kind>, prev?: Lists): Lists => {
  const lists = prev ? { ...prev } : EMPTY_LISTS();
  const touched = kinds || new Set(Object.keys(lists) as Kind[]);
  for (const k of touched) if (k in lists) (lists as any)[k] = [];
  for (const r of Object.values(byId)) if (!r.deleted && touched.has(r.kind) && r.kind in lists) (lists[r.kind] as Rec[]).push(r);
  return lists;
};
const countDirty = (byId: Record<string, Stored>) => Object.values(byId).reduce((n, r) => n + (r.dirty ? 1 : 0), 0);

const changeListeners = new Set<() => void>();
export const onLocalChange = (fn: () => void) => {
  changeListeners.add(fn);
  return () => {
    changeListeners.delete(fn);
  };
};
const changed = () => changeListeners.forEach((fn) => fn());

export const useRecords = create<State>((set, get) => {
  const save = (recs: Stored[]) => {
    const byId = { ...get().byId };
    for (const r of recs) byId[r.id] = r;
    const kinds = new Set(recs.map((r) => r.kind));
    set({ byId, lists: rebuild(byId, kinds, get().lists), dirtyCount: countDirty(byId) });
    void bridge.db.put(recs as unknown as StoredRec[]);
  };
  return {
    ready: false,
    byId: {},
    lists: EMPTY_LISTS(),
    dirtyCount: 0,
    meta: {},
    load: async () => {
      const { records, meta } = await bridge.db.load();
      const byId: Record<string, Stored> = {};
      for (const r of records) byId[r.id] = r as unknown as Stored;
      set({ byId, lists: rebuild(byId), dirtyCount: countDirty(byId), meta, ready: true });
    },
    create: (kind, data) => {
      const now = Date.now();
      const rec = { id: newId(), kind, data, created_at: now, updated_at: now, deleted: 0, dirty: 1 } as Stored;
      save([rec]);
      changed();
      return rec as unknown as Rec<typeof kind>;
    },
    update: (id, change) => {
      const cur = get().byId[id];
      if (!cur) return;
      const data = typeof change === "function" ? (change as any)(cur.data) : { ...cur.data, ...change };
      save([{ ...cur, data, updated_at: Math.max(Date.now(), cur.updated_at + 1), dirty: 1 }]);
      changed();
    },
    remove: (id) => {
      const cur = get().byId[id];
      if (!cur) return;
      save([{ ...cur, deleted: 1, updated_at: Math.max(Date.now(), cur.updated_at + 1), dirty: 1 }]);
      changed();
    },
    restore: (rec) => {
      const cur = get().byId[rec.id];
      save([{ ...(rec as Stored), deleted: 0, updated_at: Math.max(Date.now(), (cur?.updated_at || 0) + 1), dirty: 1 }]);
      changed();
    },
    applyRemote: (recs) => {
      const byId = get().byId;
      const take: Stored[] = [];
      for (const r of recs) {
        const cur = byId[r.id];
        if (cur && cur.dirty && cur.updated_at > r.updated_at) continue;
        if (cur && !cur.dirty && cur.updated_at === r.updated_at && cur.deleted === r.deleted) continue;
        take.push({ ...r, dirty: 0 } as Stored);
      }
      if (take.length) save(take);
    },
    markClean: (list) => {
      const byId = { ...get().byId };
      let n = 0;
      for (const r of list) {
        const cur = byId[r.id];
        if (cur && cur.dirty && cur.updated_at === r.updated_at) {
          byId[r.id] = { ...cur, dirty: 0 };
          n++;
        }
      }
      if (n) set({ byId, dirtyCount: countDirty(byId) });
      void bridge.db.markClean(list);
    },
    setMeta: (key, value) => {
      set({ meta: { ...get().meta, [key]: value } });
      void bridge.db.setMeta(key, value);
    },
    reset: () => set({ byId: {}, lists: EMPTY_LISTS(), dirtyCount: 0 }),
  };
});

export const dirtyRecords = () => Object.values(useRecords.getState().byId).filter((r) => r.dirty);
export const useList = <K extends Kind>(kind: K): Rec<K>[] => useRecords((s) => s.lists[kind]) as Rec<K>[];
