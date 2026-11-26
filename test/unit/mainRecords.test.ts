// The main process's copy on disk: atomic writes, a broken file set aside, wiping on sign-out.
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import type { StoredRec } from "../../src/shared/ipc";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redline-unit-"));
vi.mock("electron", () => ({ app: { getPath: () => dir } }));

const { JsonFile } = await import("../../src/main/jsonfile");
const records = await import("../../src/main/records");

const rec = (id: string): StoredRec => ({ id, kind: "todo", data: { title: id, done: false }, created_at: 1, updated_at: 2, deleted: 0, dirty: 1 });

describe("JsonFile", () => {
  it("writes atomically and reads back", async () => {
    const f = path.join(dir, "a.json");
    const j = new JsonFile(f, { n: 0 }, 5);
    j.set({ n: 1 });
    j.update((v) => ({ n: v.n + 1 }));
    await j.flush();
    expect(JSON.parse(fs.readFileSync(f, "utf8"))).toEqual({ n: 2 });
    expect(new JsonFile(f, { n: 0 }).get()).toEqual({ n: 2 });
    expect(fs.readdirSync(dir).filter((x) => x.includes(".tmp"))).toEqual([]);
  });
  it("sets a broken file aside and starts fresh", () => {
    const f = path.join(dir, "broken.json");
    fs.writeFileSync(f, "{not json");
    const j = new JsonFile(f, { fresh: true });
    expect(j.get()).toEqual({ fresh: true });
    expect(fs.readdirSync(dir).some((x) => x.startsWith("broken.json.broken-"))).toBe(true);
  });
});

describe("records on disk", () => {
  it("keeps good records, refuses bad ones, and marks sent ones clean", async () => {
    records.putRecords([rec("one"), rec("two"), { id: 5 } as never, { ...rec("three"), data: null } as never]);
    records.markClean([{ id: "one", updated_at: 2 }, { id: "two", updated_at: 99 }]);
    records.setMeta("cursor", "12");
    records.setMeta("settings", '{"themeId":"carbon"}');
    const { records: list, meta } = records.loadRecords();
    expect(list.map((r) => [r.id, r.dirty])).toEqual([
      ["one", 0],
      ["two", 1],
    ]);
    expect(meta).toEqual({ cursor: "12", settings: '{"themeId":"carbon"}' });
    records.flushRecords();
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "records.json"), "utf8"));
    expect(Object.keys(onDisk.records)).toEqual(["one", "two"]);
  });
  it("wipes records but keeps this computer's settings", async () => {
    await records.wipeRecords();
    const { records: list, meta } = records.loadRecords();
    expect(list).toEqual([]);
    expect(meta).toEqual({ settings: '{"themeId":"carbon"}' });
  });
});
