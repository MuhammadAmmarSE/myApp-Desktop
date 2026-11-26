import { describe, expect, it } from "vitest";
import { continueList, link, prefixLines, snippet, taskCount, toggleTask, wrap } from "@/lib/markdown";

describe("wrap", () => {
  it("wraps the selection and selects the inside", () => {
    expect(wrap("say hello", { start: 4, end: 9 }, "**")).toEqual({ text: "say **hello**", sel: { start: 6, end: 11 } });
  });
  it("unwraps when already wrapped", () => {
    expect(wrap("say **hello**", { start: 6, end: 11 }, "**")).toEqual({ text: "say hello", sel: { start: 4, end: 9 } });
  });
  it("puts a placeholder when nothing is selected", () => {
    expect(wrap("a ", { start: 2, end: 2 }, "_")).toEqual({ text: "a _text_", sel: { start: 3, end: 7 } });
  });
});

describe("link", () => {
  it("turns words into a link and selects the address", () => {
    const e = link("see docs", { start: 4, end: 8 });
    expect(e.text).toBe("see [docs](https://)");
    expect(e.text.slice(e.sel.start, e.sel.end)).toBe("https://");
  });
  it("turns an address into a link and selects the words", () => {
    const e = link("https://example.com", { start: 0, end: 19 });
    expect(e.text).toBe("[link](https://example.com)");
    expect(e.text.slice(e.sel.start, e.sel.end)).toBe("link");
  });
});

describe("prefixLines", () => {
  it("adds and removes a prefix on every selected line", () => {
    const on = prefixLines("milk\neggs", { start: 0, end: 9 }, "- ");
    expect(on.text).toBe("- milk\n- eggs");
    expect(prefixLines(on.text, { start: 0, end: on.text.length }, "- ").text).toBe("milk\neggs");
  });
  it("numbers lines", () => {
    expect(prefixLines("a\nb\nc", { start: 0, end: 5 }, "1. ").text).toBe("1. a\n2. b\n3. c");
  });
  it("swaps one kind of line start for another", () => {
    expect(prefixLines("- milk", { start: 0, end: 6 }, "- [ ] ").text).toBe("- [ ] milk");
    expect(prefixLines("# Title", { start: 0, end: 7 }, "## ").text).toBe("## Title");
  });
});

describe("continueList", () => {
  it("carries bullets, numbers and checkboxes on", () => {
    expect(continueList("- milk", { start: 6, end: 6 })).toEqual({ text: "- milk\n- ", sel: { start: 9, end: 9 } });
    expect(continueList("1. eggs", { start: 7, end: 7 })?.text).toBe("1. eggs\n2. ");
    expect(continueList("- [x] done", { start: 10, end: 10 })?.text).toBe("- [x] done\n- [ ] ");
    expect(continueList("  - nested", { start: 10, end: 10 })?.text).toBe("  - nested\n  - ");
  });
  it("ends the list on an empty item", () => {
    expect(continueList("- milk\n- ", { start: 9, end: 9 })).toEqual({ text: "- milk\n", sel: { start: 7, end: 7 } });
  });
  it("does nothing outside a list or with a selection", () => {
    expect(continueList("plain", { start: 5, end: 5 })).toBeNull();
    expect(continueList("- milk", { start: 2, end: 6 })).toBeNull();
  });
});

describe("tasks", () => {
  const body = "- [ ] one\n- [x] two\ntext\n  * [ ] three";
  it("ticks the nth checkbox", () => {
    expect(toggleTask(body, 0)).toBe("- [x] one\n- [x] two\ntext\n  * [ ] three");
    expect(toggleTask(body, 1)).toBe("- [ ] one\n- [ ] two\ntext\n  * [ ] three");
    expect(toggleTask(body, 2)).toBe("- [ ] one\n- [x] two\ntext\n  * [x] three");
  });
  it("counts them", () => {
    expect(taskCount(body)).toEqual({ total: 3, done: 1 });
    expect(taskCount("nothing")).toEqual({ total: 0, done: 0 });
  });
});

describe("snippet", () => {
  it("joins the real lines without markdown", () => {
    expect(snippet("## Packing\n\n- [x] Passport\n- **Charger**\n[docs](https://x.y)")).toBe("Packing · Passport · Charger · docs");
  });
  it("cuts long text", () => {
    const s = snippet("a".repeat(300), 20);
    expect(s).toHaveLength(20);
    expect(s.endsWith("…")).toBe(true);
  });
});
