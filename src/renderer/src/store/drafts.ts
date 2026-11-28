// What you've written to the assistant but not sent yet, one per chat box: the new-chat box on the
// assistant's home ("new") and each conversation ("chat:<id>"). Leaving the page and coming back
// finds it where you left it. The words are also kept on this computer (the records' meta), so they
// survive a restart; photos and files are kept while Redline is open (they can be many megabytes).
import { create } from "zustand";
import type { Photo } from "@/lib/images";
import type { Attachment } from "@/lib/attachments";
import { useRecords } from "./records";

export type Draft = { text: string; photos: Photo[]; files: Attachment[]; spoken: boolean };
const EMPTY: Draft = { text: "", photos: [], files: [], spoken: false };
const MAX_KEPT = 60; // the oldest drafts go once there are more than this
const META = "drafts";

type State = {
  drafts: Record<string, Draft & { at: number }>;
  loaded: boolean;
  load: () => void;
  get: (key: string) => Draft;
  set: (key: string, patch: Partial<Draft>) => void;
  clear: (key: string) => void;
};

let timer: ReturnType<typeof setTimeout> | null = null;
// only the words are written down (debounced)
const persist = (drafts: State["drafts"]) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const words: Record<string, { text: string; at: number }> = {};
    for (const [k, d] of Object.entries(drafts)) if (d.text.trim()) words[k] = { text: d.text, at: d.at };
    useRecords.getState().setMeta(META, JSON.stringify(words));
  }, 400);
};

const isEmpty = (d: Draft) => !d.text.trim() && !d.photos.length && !d.files.length;

export const useDrafts = create<State>((set, get) => ({
  drafts: {},
  loaded: false,
  load: () => {
    // the saved words are read once the records' meta is (until then, only what's typed now)
    if (get().loaded || !useRecords.getState().ready) return;
    let saved: Record<string, { text?: unknown; at?: unknown }> = {};
    try {
      saved = JSON.parse(useRecords.getState().meta[META] || "{}") || {};
    } catch {
      saved = {};
    }
    const drafts: State["drafts"] = {};
    for (const [k, v] of Object.entries(saved)) if (v && typeof v.text === "string" && v.text) drafts[k] = { ...EMPTY, text: v.text.slice(0, 20000), at: Number(v.at) || 0 };
    // anything typed before the saved words were read wins
    set({ drafts: { ...drafts, ...get().drafts }, loaded: true });
  },
  get: (key) => {
    if (!get().loaded) get().load();
    const d = get().drafts[key];
    return d ? { text: d.text, photos: d.photos, files: d.files, spoken: d.spoken } : EMPTY;
  },
  set: (key, patch) => {
    get().load();
    const cur = get().drafts[key] || { ...EMPTY, at: 0 };
    const next = { ...cur, ...patch, at: Date.now() };
    const drafts = { ...get().drafts };
    if (isEmpty(next)) delete drafts[key];
    else drafts[key] = next;
    const keys = Object.keys(drafts);
    if (keys.length > MAX_KEPT) {
      keys.sort((a, b) => drafts[a].at - drafts[b].at);
      for (const k of keys.slice(0, keys.length - MAX_KEPT)) delete drafts[k];
    }
    set({ drafts });
    if (get().loaded) persist(drafts);
  },
  clear: (key) => {
    if (!get().drafts[key]) return;
    const drafts = { ...get().drafts };
    delete drafts[key];
    set({ drafts });
    if (get().loaded) persist(drafts);
  },
}));

// whether a chat has something waiting in its box (for a mark in the list of chats)
export const hasDraft = (key: string) => {
  const d = useDrafts.getState().drafts[key];
  return !!d && !isEmpty(d);
};
