// The small counts beside the pages: what is late, what is for today, questions waiting.
import { useMemo } from "react";
import { isoDate, nextOccurrence, daysBetween } from "@myapp/core";
import { useRecords } from "./records";
import { useOperator } from "./operator";
import { carHeadsUp } from "@/lib/car";
import { warrantyHeadsUp } from "@/lib/things";
import type { BadgeKey } from "@/lib/nav";

export function useBadges(today = isoDate()): Record<BadgeKey, { n: number; tone: "accent" | "danger" | "muted" }> {
  const lists = useRecords((s) => s.lists);
  const approvals = useOperator((s) => s.approvals.length);
  return useMemo(() => {
    const open = lists.todo.filter((t) => !t.data.done);
    const overdue = open.filter((t) => t.data.due && t.data.due < today).length;
    const dueToday = open.filter((t) => t.data.due === today).length;
    const events = lists.event.filter((e) => e.data.date === today).length;
    const buy = lists.item.filter((i) => !i.data.done && i.data.today && i.data.mode === "store").length;
    const dates = lists.date.filter((d) => daysBetween(today, nextOccurrence(d.data.month, d.data.day, today)) <= 7).length;
    const car = carHeadsUp(lists.car, lists.car_log, today).length;
    const things = warrantyHeadsUp(lists.thing, today) ? 1 : 0;
    return {
      today: { n: dueToday + events, tone: "muted" },
      overdue: { n: overdue || dueToday, tone: overdue ? "danger" : "muted" },
      buy: { n: buy, tone: "muted" },
      dates: { n: dates, tone: "accent" },
      car: { n: car, tone: "danger" },
      things: { n: things, tone: "accent" },
      approvals: { n: approvals, tone: "danger" },
    };
  }, [lists, approvals, today]);
}
