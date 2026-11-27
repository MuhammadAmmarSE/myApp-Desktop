// Interests' editors, in the drawer: an interest (with a weekly goal), practice on it, a word to
// remember, a game, book or show, and something for the wishlist. The same fields as the phone's.
import { isoDate, MEDIA_STATUSES, MEDIA_TYPES, minutesInWords, type InterestData, type MediaData, type PracticeData, type Rec, type WishData, type WordData } from "@myapp/core";
import { toast } from "@/components/ui";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { removeInterest } from "@/lib/interests";
import { FieldsForm, type FieldSpec, type Values } from "./FieldsForm";

type P = { rec: Rec<any> | null; preset?: Record<string, any>; close: () => void };

export const MEDIA_WORD: Record<string, string> = { game: "Game", book: "Book", show: "Show", movie: "Movie", course: "Course", other: "Other" };
const STATUS_WORD: Record<string, string> = { want: "Want to", doing: "Playing / reading / watching", done: "Finished", dropped: "Gave up" };
export function statusShort(s: string, type: string): string {
  if (s === "doing") return type === "game" ? "Playing" : type === "book" ? "Reading" : type === "course" ? "Doing" : "Watching";
  if (s === "want") return type === "game" ? "Want to play" : type === "book" ? "Want to read" : type === "course" ? "Want to do" : "Want to watch";
  return s === "done" ? "Finished" : s === "dropped" ? "Gave up" : s;
}

const removeOne = (rec: Rec, name: string) => {
  useRecords.getState().remove(rec.id);
  toast.undo(`${name} removed`, () => useRecords.getState().restore(rec));
};

export function InterestForm({ rec, preset, close }: P) {
  const fields: FieldSpec[] = [
    { key: "name", type: "text", placeholder: "What you're into, e.g. Arabic, guitar, gym", required: "Name it", big: true, focus: true },
    { key: "goal_min", type: "minutes", label: "Weekly goal", quick: [60, 120, 180, 300, 420], hint: (v) => (typeof v.goal_min === "number" && v.goal_min > 0 ? `${minutesInWords(v.goal_min)} a week` : "No goal: clear it to leave it out.") },
    { key: "notes", type: "text", label: "Notes", placeholder: "Where you're at, what's next (optional)", multiline: true },
    ...(rec ? [{ key: "archived", type: "toggle", title: "Put it away", sub: "Not doing it now: kept, out of the way." } as FieldSpec] : []),
  ];
  return (
    <FieldsForm
      fields={fields}
      initial={(rec?.data || { goal_min: 120, ...preset }) as Values}
      close={close}
      onSave={(d) => {
        if (rec) useRecords.getState().update<"interest">(rec.id, d as InterestData);
        else useRecords.getState().create("interest", d as InterestData);
        toast.success(rec ? "Saved" : `${d.name} added`);
      }}
      onDelete={
        rec
          ? () => {
              toast.undo(`${rec.data.name} removed`, removeInterest(rec));
              close();
            }
          : undefined
      }
      deleteLabel="Remove"
    />
  );
}

export function PracticeForm({ rec, preset, close }: P) {
  const interests = useList("interest");
  const fields: FieldSpec[] = [
    { key: "minutes", type: "minutes", label: "How long", quick: [10, 15, 20, 30, 45, 60], required: "Say how long" },
    { key: "interest_id", type: "pick", label: "On", none: "Nothing in particular", half: true, options: interests.filter((i) => !i.data.archived || i.id === rec?.data.interest_id).map((i) => ({ id: i.id, name: i.data.name })) },
    { key: "date", type: "day", label: "When", clearable: false, half: true },
    { key: "note", type: "text", label: "What you did", placeholder: "Optional" },
  ];
  return (
    <FieldsForm
      fields={fields}
      initial={(rec?.data || { date: isoDate(), minutes: 30, ...preset }) as Values}
      close={close}
      saveLabel={rec ? "Save" : "Log practice"}
      onSave={(d) => {
        const data = { ...d, date: (d.date as string) || isoDate(), minutes: Number(d.minutes) || 0 } as PracticeData;
        if (rec) useRecords.getState().update<"practice">(rec.id, data);
        else useRecords.getState().create("practice", data);
        toast.success(`${minutesInWords(data.minutes)} logged`);
      }}
      onDelete={rec ? () => (removeOne(rec, `${minutesInWords(rec.data.minutes)} of practice`), close()) : undefined}
      deleteLabel="Remove"
    />
  );
}

export function WordForm({ rec, preset, close }: P) {
  const interests = useList("interest");
  const fields: FieldSpec[] = [
    { key: "term", type: "text", placeholder: "The word or phrase", required: "Type the word", big: true, focus: true },
    { key: "meaning", type: "text", label: "Means", placeholder: "What it means", required: "Say what it means" },
    { key: "say", type: "text", label: "Sounds like", placeholder: "Optional", half: true },
    { key: "interest_id", type: "pick", label: "Language or subject", none: "None", half: true, options: interests.filter((i) => !i.data.archived || i.id === rec?.data.interest_id).map((i) => ({ id: i.id, name: i.data.name })) },
    { key: "example", type: "text", label: "In a sentence", placeholder: "Optional", multiline: true },
  ];
  return (
    <FieldsForm
      fields={fields}
      initial={(rec?.data || { ...preset }) as Values}
      close={close}
      onSave={(d) => {
        if (rec) useRecords.getState().update<"word">(rec.id, d as Partial<WordData>);
        else useRecords.getState().create("word", { box: 0, due: isoDate(), ...d } as WordData);
        toast.success(rec ? "Word saved" : "Word added");
      }}
      onDelete={rec ? () => (removeOne(rec, rec.data.term), close()) : undefined}
      deleteLabel="Remove"
    />
  );
}

export function MediaForm({ rec, preset, close }: P) {
  const fields: FieldSpec[] = [
    { key: "name", type: "text", placeholder: "Name", required: "Type its name", big: true, focus: true },
    { key: "type", type: "chips", label: "What it is", options: MEDIA_TYPES.map((t) => [t, MEDIA_WORD[t]]) },
    { key: "status", type: "chips", label: "Where you are", options: MEDIA_STATUSES.map((s) => [s, STATUS_WORD[s]]) },
    { key: "platform", type: "text", label: "Where", placeholder: "PlayStation, Netflix, Kindle…", half: true },
    { key: "progress", type: "text", label: "Up to", placeholder: "Season 2 ep 4, page 120", half: true, show: (v) => v.status === "doing" || v.status === "dropped" },
    { key: "rating", type: "stars", label: "Your rating", show: (v) => v.status === "done" || v.status === "dropped" || !!v.rating },
    { key: "notes", type: "text", label: "Notes", placeholder: "Optional", multiline: true },
  ];
  return (
    <FieldsForm
      fields={fields}
      initial={(rec?.data || { type: "game", status: "want", ...preset }) as Values}
      close={close}
      onSave={(d) => {
        const was = rec?.data.status;
        const extra: Partial<MediaData> = {};
        if (d.status === "doing" && was !== "doing" && !rec?.data.started_on) extra.started_on = isoDate();
        if (d.status === "done" && was !== "done") extra.finished_on = isoDate();
        const data = { ...d, ...extra } as MediaData;
        if (rec) useRecords.getState().update<"media">(rec.id, data);
        else useRecords.getState().create("media", data);
        toast.success(rec ? "Saved" : `${data.name} added`);
      }}
      onDelete={rec ? () => (removeOne(rec, rec.data.name), close()) : undefined}
      deleteLabel="Remove"
    />
  );
}

export function WishForm({ rec, preset, close }: P) {
  const currency = useSettings((s) => s.currency);
  const fields: FieldSpec[] = [
    { key: "name", type: "text", placeholder: "What you'd like, e.g. a new keyboard", required: "Say what it is", big: true, focus: true },
    { key: "price", type: "number", label: `About how much (${currency})` },
    {
      key: "priority",
      type: "chips",
      label: "How much you want it",
      options: [
        ["high", "A lot"],
        ["normal", "Some"],
        ["low", "One day"],
      ],
    },
    { key: "link", type: "text", label: "Link", placeholder: "Where to buy it (optional)", mono: true },
    { key: "notes", type: "text", label: "Notes", placeholder: "Colour, size, model (optional)", multiline: true },
  ];
  return (
    <FieldsForm
      fields={fields}
      initial={(rec?.data || { priority: "normal", ...preset }) as Values}
      close={close}
      onSave={(d) => {
        if (rec) useRecords.getState().update<"wish">(rec.id, d as Partial<WishData>);
        else useRecords.getState().create("wish", d as WishData);
        toast.success(rec ? "Saved" : "Added to your wishlist");
      }}
      onDelete={rec ? () => (removeOne(rec, rec.data.name), close()) : undefined}
      deleteLabel="Remove"
    />
  );
}
