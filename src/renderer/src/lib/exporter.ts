// Your data, out and in. Export writes every record as JSON (the same shape the server keeps, so
// it can be read back), or Money as a CSV for a spreadsheet. Import reads such a JSON back: records
// that are newer than the copy here are taken, and they sync to the server like any other change.
import type { Rec } from "@myapp/core";
import { isoDate } from "@myapp/core";
import { bridge } from "./bridge";
import { useRecords } from "@/store/records";
import { toast } from "@/components/ui/Toast";

export function exportJson(): string {
  const recs = Object.values(useRecords.getState().byId)
    .filter((r) => !r.deleted)
    .map(({ dirty: _d, ...r }) => r);
  return JSON.stringify({ app: "redline", version: 1, exported_at: new Date().toISOString(), records: recs }, null, 2);
}

export async function exportAll() {
  const path = await bridge.files.saveText({ name: `redline-${isoDate()}.json`, text: exportJson(), filters: [{ name: "Redline backup", extensions: ["json"] }] });
  if (path) toast.success("Saved your data", { action: undefined });
  return path;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function moneyCsv(rows: Rec<"money">[]): string {
  const head = ["date", "type", "amount", "currency", "category", "note", "account", "recurring"];
  const lines = rows
    .slice()
    .sort((a, b) => a.data.date.localeCompare(b.data.date))
    .map((r) => [r.data.date, r.data.type, r.data.amount, r.data.currency, r.data.category, r.data.note || "", r.data.account || "", r.data.recurring || ""].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\n");
}

export async function exportMoneyCsv(rows: Rec<"money">[], label: string) {
  const path = await bridge.files.saveText({ name: `redline-money-${label}.csv`, text: moneyCsv(rows), filters: [{ name: "CSV", extensions: ["csv"] }] });
  if (path) toast.success(`Saved ${rows.length} entr${rows.length === 1 ? "y" : "ies"}`);
}

// a parsed backup: which records are new, which are newer than here, which are older
export function readBackup(text: string): { records: Rec[]; error?: string } {
  try {
    const j = JSON.parse(text);
    const list = Array.isArray(j) ? j : Array.isArray(j?.records) ? j.records : null;
    if (!list) return { records: [], error: "That file isn't a Redline backup." };
    const ok = list.filter((r: any) => r && typeof r.id === "string" && typeof r.kind === "string" && r.data && typeof r.data === "object" && typeof r.updated_at === "number");
    return { records: ok.map((r: any) => ({ id: r.id, kind: r.kind, data: r.data, created_at: Number(r.created_at) || r.updated_at, updated_at: r.updated_at, deleted: r.deleted ? 1 : 0 })) };
  } catch {
    return { records: [], error: "That file couldn't be read." };
  }
}

export function importRecords(records: Rec[]): { added: number; updated: number; skipped: number } {
  const s = useRecords.getState();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const take: Rec[] = [];
  for (const r of records) {
    const cur = s.byId[r.id];
    if (!cur) added++;
    else if (r.updated_at > cur.updated_at) updated++;
    else {
      skipped++;
      continue;
    }
    take.push(r);
  }
  // taken as local changes, so they go to the server too
  for (const r of take) {
    const cur = useRecords.getState().byId[r.id];
    if (!cur) useRecords.getState().restore({ ...r, updated_at: Math.max(r.updated_at, Date.now()) });
    else useRecords.getState().update(r.id, () => r.data as any);
  }
  return { added, updated, skipped };
}
