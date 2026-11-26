// The record store and sync, with the main process and the server played by stand-ins: what is
// saved on disk, what is sent, and who wins when the same record changed in two places.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rec } from "@myapp/core";

const disk = { put: [] as any[], clean: [] as any[], meta: {} as Record<string, string> };
const server = { records: new Map<string, Rec & { seq: number }>(), seq: 0, fail: false };
const reply = (data: unknown) => Promise.resolve({ ok: true, data });

vi.mock("@/lib/bridge", () => ({
  isMac: () => false,
  bridge: {
    app: { platform: "linux" },
    db: {
      load: async () => ({ records: [], meta: {} }),
      put: async (recs: any[]) => void disk.put.push(...recs),
      markClean: async (list: any[]) => void disk.clean.push(...list),
      setMeta: async (k: string, v: string) => void (disk.meta[k] = v),
    },
    auth: { session: async () => ({ signedIn: true, server: "http://test", user: null, storage: "encrypted" }) },
    api: {
      request: (method: string, path: string, body: any) => {
        if (server.fail) return Promise.resolve({ ok: false, code: "NETWORK", message: "No connection" });
        if (method === "POST" && path === "/sync") {
          const accepted: string[] = [];
          const conflicts: Rec[] = [];
          for (const r of body.records) {
            const cur = server.records.get(r.id);
            if (cur && cur.updated_at > r.updated_at) conflicts.push(cur);
            else {
              server.records.set(r.id, { ...r, seq: ++server.seq });
              accepted.push(r.id);
            }
          }
          return reply({ accepted, rejected: [], conflicts });
        }
        if (method === "GET" && path.startsWith("/sync?since=")) {
          const since = Number(path.split("=")[1]);
          const recs = [...server.records.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
          return reply({ records: recs.map(({ seq: _s, ...r }) => r), cursor: recs.length ? recs[recs.length - 1].seq : since, more: false });
        }
        return Promise.resolve({ ok: false, code: "NOT_FOUND", message: "no" });
      },
    },
  },
}));

const { useRecords, dirtyRecords } = await import("@/store/records");
const { syncNow, useSync } = await import("@/store/sync");
const { useAuth } = await import("@/store/auth");
const { saveThing, removeThing } = await import("@/lib/things");

beforeEach(() => {
  useRecords.getState().reset();
  useRecords.setState({ meta: {} });
  disk.put = [];
  disk.clean = [];
  disk.meta = {};
  server.records.clear();
  server.seq = 0;
  server.fail = false;
  useAuth.setState({ status: "signed-in" });
});

describe("the record store", () => {
  it("creates, changes, removes and restores, saving each step", () => {
    const s = useRecords.getState();
    const t = s.create("todo", { title: "Milk", done: false });
    expect(useRecords.getState().lists.todo.map((r) => r.data.title)).toEqual(["Milk"]);
    expect(disk.put.at(-1)).toMatchObject({ id: t.id, dirty: 1, deleted: 0 });

    s.update<"todo">(t.id, { done: true });
    const after = useRecords.getState().byId[t.id];
    expect(after.data).toMatchObject({ title: "Milk", done: true });
    expect(after.updated_at).toBeGreaterThan(t.updated_at);

    s.remove(t.id);
    expect(useRecords.getState().lists.todo).toEqual([]);
    expect(useRecords.getState().byId[t.id].deleted).toBe(1);

    s.restore(t);
    expect(useRecords.getState().lists.todo).toHaveLength(1);
    expect(useRecords.getState().dirtyCount).toBe(1);
  });

  it("takes a newer copy from elsewhere but keeps an unsent newer edit here", () => {
    const s = useRecords.getState();
    const t = s.create("todo", { title: "Here", done: false });
    const local = useRecords.getState().byId[t.id];
    s.applyRemote([{ ...t, data: { title: "Older there", done: false }, updated_at: local.updated_at - 5 } as Rec]);
    expect(useRecords.getState().byId[t.id].data).toMatchObject({ title: "Here" });
    s.applyRemote([{ ...t, data: { title: "Newer there", done: false }, updated_at: local.updated_at + 5 } as Rec]);
    expect(useRecords.getState().byId[t.id]).toMatchObject({ data: { title: "Newer there" }, dirty: 0 });
  });

  it("marks clean only the copy that was sent", () => {
    const s = useRecords.getState();
    const t = s.create("note", { title: "A", body: "", tags: [] });
    const sent = useRecords.getState().byId[t.id].updated_at;
    s.update<"note">(t.id, { title: "B" });
    s.markClean([{ id: t.id, updated_at: sent }]);
    expect(useRecords.getState().byId[t.id].dirty).toBe(1);
    s.markClean([{ id: t.id, updated_at: useRecords.getState().byId[t.id].updated_at }]);
    expect(useRecords.getState().byId[t.id].dirty).toBe(0);
  });
});

describe("sync", () => {
  it("sends what changed, then fetches what changed elsewhere", async () => {
    const s = useRecords.getState();
    s.create("todo", { title: "From the desktop", done: false });
    // the phone saved something meanwhile
    server.records.set("phone-1", { id: "phone-1", kind: "item", data: { name: "Bread", list: "grocery", mode: "store", today: true, done: false }, created_at: 1, updated_at: 1, deleted: 0, seq: ++server.seq });
    expect(await syncNow()).toBe(true);
    expect(dirtyRecords()).toEqual([]);
    expect([...server.records.values()].map((r) => r.kind).sort()).toEqual(["item", "todo"]);
    expect(useRecords.getState().lists.item.map((r) => r.data.name)).toEqual(["Bread"]);
    expect(Number(useRecords.getState().meta.cursor)).toBe(server.seq);
    expect(disk.meta.cursor).toBe(String(server.seq));
  });

  it("takes the server's copy when it is newer", async () => {
    const s = useRecords.getState();
    const t = s.create("todo", { title: "Mine", done: false });
    server.records.set(t.id, { ...(t as Rec), data: { title: "Edited on the phone", done: true }, updated_at: Date.now() + 60000, seq: ++server.seq });
    await syncNow();
    expect(useRecords.getState().byId[t.id]).toMatchObject({ data: { title: "Edited on the phone", done: true }, dirty: 0 });
  });

  it("keeps changes to send later when offline", async () => {
    useRecords.getState().create("todo", { title: "Offline", done: false });
    server.fail = true;
    expect(await syncNow()).toBe(false);
    expect(useSync.getState().offline).toBe(true);
    expect(dirtyRecords()).toHaveLength(1);
    server.fail = false;
    expect(await syncNow()).toBe(true);
    expect(dirtyRecords()).toHaveLength(0);
    expect(useSync.getState().offline).toBe(false);
  });

  it("does nothing when signed out", async () => {
    useAuth.setState({ status: "signed-out" });
    useRecords.getState().create("todo", { title: "x", done: false });
    expect(await syncNow()).toBe(false);
    expect(server.records.size).toBe(0);
  });
});

describe("my things and money", () => {
  it("saves the price in Money and keeps the two in step", () => {
    const id = saveThing(null, { name: "Laptop", category: "Laptop", price: 1500, bought_on: "2026-11-01", shop: "Tech Store" }, true);
    const thing = useRecords.getState().byId[id] as Rec<"thing">;
    const money = useRecords.getState().byId[thing.data.money_id!] as Rec<"money">;
    expect(money.data).toMatchObject({ type: "expense", amount: 1500, category: "Gadgets", note: "Laptop · Tech Store", date: "2026-11-01" });

    saveThing(thing, { ...thing.data, price: 1400 }, true);
    expect((useRecords.getState().byId[money.id] as Rec<"money">).data.amount).toBe(1400);

    const later = useRecords.getState().byId[id] as Rec<"thing">;
    saveThing(later, later.data, false);
    expect(useRecords.getState().byId[money.id].deleted).toBe(1);
    expect((useRecords.getState().byId[id] as Rec<"thing">).data.money_id).toBeNull();
  });

  it("removing a thing removes its expense, and undo brings both back", () => {
    const id = saveThing(null, { name: "Fridge", category: "Appliance", price: 900 }, true);
    const thing = useRecords.getState().byId[id] as Rec<"thing">;
    const undo = removeThing(thing);
    expect(useRecords.getState().lists.thing).toHaveLength(0);
    expect(useRecords.getState().lists.money).toHaveLength(0);
    undo();
    expect(useRecords.getState().lists.thing).toHaveLength(1);
    expect(useRecords.getState().lists.money.map((m) => m.data.category)).toEqual(["Home"]);
  });
});
