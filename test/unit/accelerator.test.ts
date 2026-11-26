import { describe, expect, it } from "vitest";
import { describeAccelerator, toAccelerator } from "@/lib/accelerator";

const key = (over: Partial<{ key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }>) => ({ key: "", code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over });

describe("toAccelerator", () => {
  it("records Ctrl Shift Space off a Mac and Cmd Shift Space on one", () => {
    expect(toAccelerator(key({ key: " ", code: "Space", ctrlKey: true, shiftKey: true }), false)).toBe("CommandOrControl+Shift+Space");
    expect(toAccelerator(key({ key: " ", code: "Space", metaKey: true, shiftKey: true }), true)).toBe("CommandOrControl+Shift+Space");
  });
  it("uses the physical letter, whatever the layout types", () => {
    expect(toAccelerator(key({ key: "ä", code: "KeyA", ctrlKey: true, altKey: true }), false)).toBe("CommandOrControl+Alt+A");
    expect(toAccelerator(key({ key: "!", code: "Digit1", ctrlKey: true, shiftKey: true }), false)).toBe("CommandOrControl+Shift+1");
  });
  it("waits while only modifiers are down", () => {
    expect(toAccelerator(key({ key: "Control", code: "ControlLeft", ctrlKey: true }), false)).toBeNull();
  });
  it("refuses a key with no real modifier, but allows function keys", () => {
    expect(toAccelerator(key({ key: "a", code: "KeyA" }), false)).toBeNull();
    expect(toAccelerator(key({ key: "A", code: "KeyA", shiftKey: true }), false)).toBeNull();
    expect(toAccelerator(key({ key: "F9", code: "F9" }), false)).toBe("F9");
  });
  it("names the Windows key and Mac control", () => {
    expect(toAccelerator(key({ key: "j", code: "KeyJ", metaKey: true }), false)).toBe("Super+J");
    expect(toAccelerator(key({ key: "j", code: "KeyJ", metaKey: true, ctrlKey: true }), true)).toBe("CommandOrControl+Control+J");
  });
});

describe("describeAccelerator", () => {
  it("reads the way each keyboard is labelled", () => {
    expect(describeAccelerator("CommandOrControl+Shift+Space", false)).toBe("Ctrl + Shift + Space");
    expect(describeAccelerator("CommandOrControl+Shift+Space", true)).toBe("⌘ ⇧ Space");
    expect(describeAccelerator("Alt+Super+K", false)).toBe("Alt + Win + K");
  });
});
