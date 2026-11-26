// The records and the small facts that go with them (the sync cursor, the screens' settings),
// kept in one file in the user's data folder. The screens hold them in memory; every change is
// sent here and written back within a moment.
import path from "path";
import { app } from "electron";
import type { StoredRec } from "@shared/ipc";
import { JsonFile } from "./jsonfile";

type Data = { v: 1; records: Record<string, StoredRec>; meta: Record<string, string> };
let file: JsonFile<Data> | null = null;

const data = () => {
  if (!file) file = new JsonFile<Data>(path.join(app.getPath("userData"), "records.json"), { v: 1, records: {}, meta: {} }, 400);
  const d = file.get();
  if (!d.records) d.records = {};
  if (!d.meta) d.meta = {};
  return file;
};

const okRec = (r: any): r is StoredRec =>
  r && typeof r.id === "string" && r.id.length <= 64 && typeof r.kind === "string" && typeof r.updated_at === "number" && typeof r.created_at === "number" && r.data && typeof r.data === "object";

export function loadRecords() {
  const d = data().get();
  return { records: Object.values(d.records), meta: { ...d.meta } };
}

export function putRecords(recs: StoredRec[]) {
  if (!Array.isArray(recs)) return;
  data().update((d) => {
    const records = { ...d.records };
    for (const r of recs) if (okRec(r)) records[r.id] = { ...r, deleted: r.deleted ? 1 : 0, dirty: r.dirty ? 1 : 0 };
    return { ...d, records };
  });
}

export function markClean(list: { id: string; updated_at: number }[]) {
  if (!Array.isArray(list)) return;
  data().update((d) => {
    const records = { ...d.records };
    for (const x of list) {
      const cur = records[x?.id];
      if (cur && cur.dirty && cur.updated_at === x.updated_at) records[x.id] = { ...cur, dirty: 0 };
    }
    return { ...d, records };
  });
}

export function setMeta(key: string, value: string) {
  if (typeof key !== "string" || key.length > 80) return;
  data().update((d) => ({ ...d, meta: { ...d.meta, [key]: String(value) } }));
}

export function getMeta(key: string): string | undefined {
  return data().get().meta[key];
}

// a different account signed in, or sign-out: start from an empty copy (keep the screens' settings)
export function wipeRecords() {
  data().update((d) => {
    const meta: Record<string, string> = {};
    if (d.meta.settings) meta.settings = d.meta.settings;
    return { v: 1, records: {}, meta };
  });
  return data().flush();
}

export const flushRecords = () => file?.flushSync();
