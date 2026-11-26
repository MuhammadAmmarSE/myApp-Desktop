// What is open on top of the page: the search palette, the shortcuts sheet, and the editor drawer
// (one at a time: opening another replaces it).
import { create } from "zustand";
import type { Rec } from "@myapp/core";

export type EditKind = "todo" | "item" | "money" | "event" | "reminder" | "clip" | "date" | "person" | "thing" | "car" | "car_log";
export type Editing = { kind: EditKind; rec?: Rec | null; preset?: Record<string, any>; n: number };

type UI = {
  palette: boolean;
  paletteQuery: string;
  shortcuts: boolean;
  editing: Editing | null;
  openPalette: (q?: string) => void;
  closePalette: () => void;
  edit: (kind: EditKind, rec?: Rec | null, preset?: Record<string, any>) => void;
  closeEditor: () => void;
  setShortcuts: (v: boolean) => void;
};

let n = 0;
export const useUI = create<UI>((set) => ({
  palette: false,
  paletteQuery: "",
  shortcuts: false,
  editing: null,
  openPalette: (q = "") => set({ palette: true, paletteQuery: q }),
  closePalette: () => set({ palette: false }),
  edit: (kind, rec, preset) => set({ editing: { kind, rec: rec ?? null, preset, n: ++n }, palette: false }),
  closeEditor: () => set({ editing: null }),
  setShortcuts: (v) => set({ shortcuts: v }),
}));

export const edit = (kind: EditKind, rec?: Rec | null, preset?: Record<string, any>) => useUI.getState().edit(kind, rec, preset);
