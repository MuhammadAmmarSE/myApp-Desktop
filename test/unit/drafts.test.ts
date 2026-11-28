// What's written in a chat box and not sent: kept per chat while you're elsewhere, the words kept
// on disk too, forgotten once sent or emptied; and the photo editor's crop box arithmetic.
import { beforeEach, describe, expect, it, vi } from "vitest";

const disk = { meta: {} as Record<string, string> };
vi.mock("@/lib/bridge", () => ({
  isMac: () => false,
  bridge: {
    app: { platform: "linux" },
    db: {
      load: async () => ({ records: [], meta: { ...disk.meta } }),
      put: async () => {},
      markClean: async () => {},
      setMeta: async (k: string, v: string) => void (disk.meta[k] = v),
    },
  },
}));

const { useRecords } = await import("@/store/records");
const { useDrafts, hasDraft } = await import("@/store/drafts");
const { boxFromDrag, dragBox, handleAt, isWhole, boxInPixels, MIN_BOX } = await import("@/lib/photoEdit");

const photo = (id: string) => ({ id, uri: "data:x", data: "data:x", width: 10, height: 10 });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("chat drafts", () => {
  beforeEach(async () => {
    disk.meta = {};
    useDrafts.setState({ drafts: {}, loaded: false });
    await useRecords.getState().load();
  });

  it("keeps each chat's words, photos and files apart", () => {
    const d = useDrafts.getState();
    d.set("new", { text: "Add my sister's birthday" });
    d.set("chat:7", { text: "And the one after", photos: [photo("p1")], files: [{ id: "f1", name: "a.pdf", size: 3, data: "AAA" }] });
    expect(useDrafts.getState().get("new").text).toBe("Add my sister's birthday");
    const seven = useDrafts.getState().get("chat:7");
    expect(seven.text).toBe("And the one after");
    expect(seven.photos.map((p) => p.id)).toEqual(["p1"]);
    expect(seven.files.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(useDrafts.getState().get("chat:8").text).toBe("");
    expect(hasDraft("chat:7")).toBe(true);
  });

  it("forgets a chat's draft once it's sent or emptied", () => {
    const d = useDrafts.getState();
    d.set("chat:1", { text: "hello" });
    d.clear("chat:1");
    expect(hasDraft("chat:1")).toBe(false);
    d.set("chat:2", { text: "hi", photos: [photo("p")] });
    d.set("chat:2", { text: "", photos: [] });
    expect(useDrafts.getState().drafts["chat:2"]).toBeUndefined();
  });

  it("writes only the words to disk, and reads them back after a restart", async () => {
    useDrafts.getState().set("chat:3", { text: "Half a thought", photos: [photo("big")] });
    await wait(450);
    const saved = JSON.parse(disk.meta.drafts);
    expect(saved["chat:3"].text).toBe("Half a thought");
    expect(JSON.stringify(saved)).not.toContain("data:x");
    // a restart: a fresh store reads the words back; the photo was only kept while open
    useDrafts.setState({ drafts: {}, loaded: false });
    await useRecords.getState().load();
    const back = useDrafts.getState().get("chat:3");
    expect(back.text).toBe("Half a thought");
    expect(back.photos).toEqual([]);
  });

  it("keeps no more than sixty, dropping the oldest", () => {
    for (let i = 0; i < 65; i++) useDrafts.getState().set(`chat:${i}`, { text: `t${i}` });
    const keys = Object.keys(useDrafts.getState().drafts);
    expect(keys.length).toBe(60);
    expect(keys).not.toContain("chat:0");
    expect(keys).toContain("chat:64");
  });
});

describe("the photo editor's crop box", () => {
  it("a drag in any direction makes a box inside the picture", () => {
    expect(boxFromDrag({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, w: expect.closeTo(0.6), h: expect.closeTo(0.8) });
    const out = boxFromDrag({ x: -0.5, y: 0.5 }, { x: 1.5, y: 0.6 });
    expect(out.x).toBe(0);
    expect(out.w).toBe(1);
  });
  it("is never smaller than the minimum, so a click doesn't make it vanish", () => {
    const b = boxFromDrag({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
    expect(b.w).toBe(MIN_BOX);
    expect(b.h).toBe(MIN_BOX);
  });
  it("moves whole, staying inside", () => {
    expect(dragBox({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, "move", 0.9, 0.9)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });
  it("a corner pulls only its own sides, and can't cross the opposite one", () => {
    const b = dragBox({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, "se", 0.1, 0.2);
    expect(b.x).toBe(0.2);
    expect(b.w).toBeCloseTo(0.5);
    expect(b.h).toBeCloseTo(0.6);
    const c = dragBox({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, "nw", 0.9, 0.9);
    expect(c.w).toBeCloseTo(MIN_BOX);
    expect(c.x + c.w).toBeCloseTo(0.6);
  });
  it("knows a corner from the inside from outside", () => {
    const b = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
    const r = { x: 0.02, y: 0.02 };
    expect(handleAt(b, { x: 0.21, y: 0.19 }, r)).toBe("nw");
    expect(handleAt(b, { x: 0.6, y: 0.6 }, r)).toBe("se");
    expect(handleAt(b, { x: 0.4, y: 0.4 }, r)).toBe("move");
    expect(handleAt(b, { x: 0.9, y: 0.9 }, r)).toBeNull();
  });
  it("the whole picture is no crop, and a box becomes whole pixels", () => {
    expect(isWhole({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(isWhole({ x: 0.1, y: 0, w: 0.9, h: 1 })).toBe(false);
    expect(boxInPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 }, 800, 600)).toEqual({ x: 200, y: 300, w: 400, h: 300 });
  });
});
