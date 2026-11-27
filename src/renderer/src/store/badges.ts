// The small counts beside the pages: what is late, what is for today, questions waiting.
import { useMemo } from "react";
import { isoDate, nextOccurrence, daysBetween } from "@myapp/core";
import { useRecords } from "./records";
import { useOperator } from "./operator";
import { carHeadsUp } from "@/lib/car";
import { warrantyHeadsUp } from "@/lib/things";
import type { BadgeKey } from "@/lib/nav";

export function useBadges(today = isoDate()): Record<BadgeKey, { n: number; tone: "accent" | "danger" | "muted" }> {
  // only the lists the counts are made from: a note or a money entry changing doesn't count again
  // (or redraw the sidebar)
  const todo = useRecords((s) => s.lists.todo);
  const event = useRecords((s) => s.lists.event);
  const item = useRecords((s) => s.lists.item);
  const date = useRecords((s) => s.lists.date);
  const car = useRecords((s) => s.lists.car);
  const carLog = useRecords((s) => s.lists.car_log);
  const thing = useRecords((s) => s.lists.thing);
  const approvals = useOperator((s) => s.approvals.length);
  return useMemo(() => {
    const open = todo.filter((t) => !t.data.done);
    const overdue = open.filter((t) => t.data.due && t.data.due < today).length;
    const dueToday = open.filter((t) => t.data.due === today).length;
    const events = event.filter((e) => e.data.date === today).length;
    const buy = item.filter((i) => !i.data.done && i.data.today && i.data.mode === "store").length;
    const dates = date.filter((d) => daysBetween(today, nextOccurrence(d.data.month, d.data.day, today)) <= 7).length;
    const carN = carHeadsUp(car, carLog, today).length;
    const things = warrantyHeadsUp(thing, today) ? 1 : 0;
    return {
      today: { n: dueToday + events, tone: "muted" },
      overdue: { n: overdue || dueToday, tone: overdue ? "danger" : "muted" },
      buy: { n: buy, tone: "muted" },
      dates: { n: dates, tone: "accent" },
      car: { n: carN, tone: "danger" },
      things: { n: things, tone: "accent" },
      approvals: { n: approvals, tone: "danger" },
    };
  }, [todo, event, item, date, car, carLog, thing, approvals, today]);
}
