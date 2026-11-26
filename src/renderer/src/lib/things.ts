// Saving and removing My things. A thing's price can also be an expense in Money (Gadgets, Home
// or Shopping, by its kind), linked by money_id like My car's log: changing the price changes the
// expense, taking it out of Money or removing the thing removes it, and Undo brings both back.
import { addDays, addMonths, isoDate, warrantyStatus, type MoneyData, type Rec, type ThingData } from "@myapp/core";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";

const SPENT_ON: Record<string, string> = { Phone: "Gadgets", Laptop: "Gadgets", Electronics: "Gadgets", Watch: "Gadgets", Appliance: "Home", Furniture: "Home", Tools: "Home" };

// the warranty's last day for one lasting `months` from the day it was bought
export const warrantyEnd = (bought: string, months: number) => addDays(addMonths(bought, months), -1);

export function saveThing(rec: Rec<"thing"> | null, data: ThingData, inMoney: boolean): string {
  const s = useRecords.getState();
  const price = data.price && data.price > 0 ? Math.round(data.price * 100) / 100 : null;
  let money_id = rec?.data.money_id ?? null;
  const linked = money_id ? (s.byId[money_id] as Rec<"money"> | undefined) : undefined;
  const live = linked && !linked.deleted;
  if (inMoney && price) {
    const m: MoneyData = {
      type: "expense",
      amount: price,
      currency: live ? linked.data.currency : useSettings.getState().currency,
      category: SPENT_ON[data.category || ""] || "Shopping",
      note: [data.name, data.shop].filter(Boolean).join(" · "),
      date: data.bought_on || isoDate(),
      account: live ? linked.data.account : "cash",
      recurring: null,
    };
    if (live) s.update<"money">(money_id!, m);
    else money_id = s.create("money", m).id;
  } else if (live) {
    s.remove(money_id!);
    money_id = null;
  } else money_id = null;
  const full: ThingData = { ...data, price, money_id };
  if (rec) {
    s.update<"thing">(rec.id, full);
    return rec.id;
  }
  return s.create("thing", full).id;
}

// remove a thing (and the expense it saved); returns what puts both back
export function removeThing(rec: Rec<"thing">): () => void {
  const s = useRecords.getState();
  const money = rec.data.money_id ? (s.byId[rec.data.money_id] as Rec<"money"> | undefined) : undefined;
  s.remove(rec.id);
  if (money && !money.deleted) s.remove(money.id);
  return () => {
    useRecords.getState().restore(rec);
    if (money && !money.deleted) useRecords.getState().restore(money);
  };
}

// for other screens (More): the warranty ending soonest, within a month
export function warrantyHeadsUp(things: Rec<"thing">[], today = isoDate()): { name: string; days: number } | null {
  let best: { name: string; days: number } | null = null;
  for (const t of things) {
    if (t.data.gone) continue;
    const w = warrantyStatus(t.data, today);
    if (w.state === "ending" && (!best || w.days! < best.days)) best = { name: t.data.name, days: w.days! };
  }
  return best;
}
