// What Capture and Quick capture share: asking the server to sort out plain words, and how each
// proposed action is shown. The server cleans what the AI says; it is cleaned again here
// (core's cleanActions), shown, and only what you keep is saved.
import { BellRing, Bookmark, CalendarDays, Cake, CheckSquare, NotebookPen, ShoppingCart, Wallet, type LucideIcon } from "lucide-react";
import { cleanActions, dayWord, isoDate, isoTime, money, monthDay, time12, WEEKDAYS_LONG, type Action, type ActionType, type PersonRef } from "@myapp/core";
import { api } from "./api";

export const ACTION_ICON: Record<ActionType, LucideIcon> = { todo: CheckSquare, item: ShoppingCart, event: CalendarDays, reminder: BellRing, money: Wallet, note: NotebookPen, clip: Bookmark, date: Cake };
export const ACTION_AREA: Record<ActionType, string> = { todo: "To-do", item: "List", event: "Calendar", reminder: "Reminder", money: "Money", note: "Note", clip: "Saved", date: "Date" };
export const EXAMPLES = [
  "Wife: milk, eggs and bread on the way home",
  "Kal ammi ko doctor le jana hai 11 baje",
  "Pay electricity bill by Friday, paid 1,200 for fuel today",
  "Meeting with Bilal Monday 3pm at his office",
  "Save my car's chassis no: NZE161-0123456",
  "What can you do for me?",
];

// the words a card shows, and which field the title edits
export function describe(a: Action, currency: string): { title: string; edit: string; detail: string } {
  switch (a.type) {
    case "todo":
      return { title: a.title, edit: "title", detail: [a.due ? dayWord(a.due) : "No date", a.time ? time12(a.time) : "", a.priority === "high" ? "High priority" : ""].filter(Boolean).join(" · ") };
    case "item":
      return { title: a.qty ? `${a.name} (${a.qty})` : a.name, edit: "name", detail: `${a.list === "grocery" ? "Grocery" : "Shopping"} · ${a.mode === "online" ? "order online" : a.today ? "buy today" : "buy later"}` };
    case "event":
      return { title: a.title, edit: "title", detail: [dayWord(a.date), a.time ? time12(a.time) : "", a.place || ""].filter(Boolean).join(" · ") };
    case "reminder":
      return { title: a.text, edit: "text", detail: `${dayWord(a.date)} at ${time12(a.time)}` };
    case "money":
      return { title: a.note || a.category, edit: "note", detail: `${a.money_type === "income" ? "Earned" : "Spent"} ${money(a.amount, currency)} · ${a.category} · ${dayWord(a.date)}` };
    case "note":
      return { title: a.title, edit: "title", detail: a.body.slice(0, 120) };
    case "clip":
      return { title: a.title || a.text, edit: a.title ? "title" : "text", detail: a.tags.length ? a.tags.map((t) => `#${t}`).join(" ") : "Saved text" };
    case "date":
      return { title: a.title, edit: "title", detail: [monthDay(a.month, a.day), a.year ? String(a.year) : "", a.person ? `for ${a.person}` : "", "every year"].filter(Boolean).join(" · ") };
  }
}

export type CaptureResult = { summary: string; reply: string; assistant: boolean; actions: Action[] };

export async function sortOut(text: string, ctx: { currency: string; people: PersonRef[] }): Promise<CaptureResult> {
  const now = new Date();
  const r = await api<{ summary?: string; reply?: string; assistant?: boolean; actions?: Action[] }>(
    "POST",
    "/ai/capture",
    { text, context: { today: isoDate(now), time: isoTime(now), weekday: WEEKDAYS_LONG[now.getDay()], currency: ctx.currency, people: ctx.people.map((p) => ({ name: p.name, relation: p.relation })) } },
    { timeoutMs: 60000 },
  );
  return {
    actions: cleanActions(r.actions, { today: isoDate(now) }),
    summary: typeof r.summary === "string" ? r.summary : "",
    reply: typeof r.reply === "string" ? r.reply.trim() : "",
    assistant: r.assistant === true,
  };
}

// what you typed, kept so it can be run again (newest first, no repeats)
export const remember = (list: string[], text: string, max = 8) => [text, ...list.filter((t) => t !== text)].slice(0, max);
