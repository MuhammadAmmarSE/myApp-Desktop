// Notes that wait for the AI: when the server can't be reached, Capture keeps what you wrote as a
// note tagged "inbox". Sending one (or all of them) to the AI opens Capture with its words and sorts
// them out straight away; once what it found is saved, the inbox notes it came from are removed
// (Undo brings them back and takes the new records away). The phone's lib/inbox.ts does the same.
import type { NoteData, Rec } from "@myapp/core";
import { useRecords } from "@/store/records";
import { navigate } from "./router";

export const INBOX = "inbox";
export const isInbox = (n: { data: NoteData }) => (n.data.tags || []).includes(INBOX);

// the words to send: the body, with the title in front when it isn't just the body's first line
export function noteText(d: NoteData): string {
  const t = (d.title || "").trim();
  const b = (d.body || "").trim();
  if (!b) return t;
  return !t || b.startsWith(t) ? b : `${t}\n${b}`;
}

export function sendToAi(notes: Rec<"note">[]) {
  const text = notes
    .map((n) => noteText(n.data))
    .filter(Boolean)
    .join("\n");
  if (!text) return;
  navigate(`/capture?${new URLSearchParams({ text, go: "1", notes: notes.map((n) => n.id).join(",") }).toString()}`);
}

// not needed after all: the waiting notes among `ids` are deleted; gives what brings them back
export function dropNotes(ids: string[]): { removed: number; undo: () => void } {
  return doneWithNotes(ids, []);
}
export const dropWord = (n: number) => (n === 1 ? "Deleted the note" : `Deleted ${n} notes`);

// after saving what the AI found: the inbox notes among `ids` go; gives what undoes it all
export function doneWithNotes(ids: string[], created: string[]): { removed: number; undo: () => void } {
  const s = useRecords.getState();
  const gone: Rec[] = [];
  for (const id of ids) {
    const n = s.byId[id] as Rec<"note"> | undefined;
    if (n && !n.deleted && n.kind === "note" && isInbox(n)) {
      s.remove(n.id);
      gone.push(n);
    }
  }
  return {
    removed: gone.length,
    undo: () => {
      const st = useRecords.getState();
      for (const id of created) st.remove(id);
      for (const n of gone) st.restore(n);
    },
  };
}
