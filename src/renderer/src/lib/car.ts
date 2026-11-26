// Saving and removing My car's log. A fill-up, a service or a renewed paper that cost something is
// also an expense in Money (Fuel, or Car), linked by money_id: changing the cost changes the
// expense, clearing it or removing the entry removes the expense, and Undo brings both back.
import { currentPapers, isoDate, latestOdometer, paperStatus, serviceDue, type CarLogData, type MoneyData, type Rec } from "@myapp/core";
import { useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";

const CATEGORY: Record<string, string> = { fuel: "Fuel", service: "Car", paper: "Car" };

export const logTitle = (d: CarLogData) => (d.type === "fuel" ? "Fuel" : d.title || (d.type === "paper" ? "Papers" : "Service"));

const noteOf = (d: CarLogData, carName: string) => `${logTitle(d)}${d.type === "fuel" && d.litres ? ` · ${d.litres} L` : ""}${carName ? ` · ${carName}` : ""}`;

export function saveCarLog(rec: Rec<"car_log"> | null, data: CarLogData, carName: string): string {
  const s = useRecords.getState();
  const amount = data.amount && data.amount > 0 ? Math.round(data.amount * 100) / 100 : null;
  let money_id = rec?.data.money_id ?? null;
  const linked = money_id ? (s.byId[money_id] as Rec<"money"> | undefined) : undefined;
  const live = linked && !linked.deleted;
  if (amount) {
    const m: MoneyData = {
      type: "expense",
      amount,
      currency: live ? linked.data.currency : useSettings.getState().currency,
      category: CATEGORY[data.type] || "Car",
      note: noteOf(data, carName),
      date: data.date,
      account: live ? linked.data.account : "cash",
      recurring: null,
    };
    if (live) s.update<"money">(money_id!, m);
    else money_id = s.create("money", m).id;
  } else if (live) {
    s.remove(money_id!);
    money_id = null;
  }
  const full: CarLogData = { ...data, amount, money_id };
  if (rec) {
    s.update<"car_log">(rec.id, full);
    return rec.id;
  }
  return s.create("car_log", full).id;
}

// remove an entry (and its expense); returns what puts both back
export function removeCarLog(rec: Rec<"car_log">): () => void {
  const s = useRecords.getState();
  const money = rec.data.money_id ? (s.byId[rec.data.money_id] as Rec<"money"> | undefined) : undefined;
  s.remove(rec.id);
  if (money && !money.deleted) s.remove(money.id);
  return () => {
    useRecords.getState().restore(rec);
    if (money && !money.deleted) useRecords.getState().restore(money);
  };
}

// remove a car with its whole log and the expenses it saved
export function removeCar(car: Rec<"car">): () => void {
  const s = useRecords.getState();
  const logs = s.lists.car_log.filter((l) => l.data.car_id === car.id);
  const undo = logs.map(removeCarLog);
  s.remove(car.id);
  return () => {
    useRecords.getState().restore(car);
    for (const u of undo) u();
  };
}

// What needs doing on the car soon, for other screens (More): papers expired or expiring within a
// month, and a service due within two weeks or 500 km. Soonest first; `words` is a short line.
export type CarHeadsUp = { what: string; car: string; days: number | null; km: number | null; words: string };
export function carHeadsUp(cars: Rec<"car">[], logs: Rec<"car_log">[], today = isoDate()): CarHeadsUp[] {
  const out: CarHeadsUp[] = [];
  const when = (d: number) => (d < 0 ? "expired" : d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d}d`);
  for (const car of cars) {
    const mine = logs.filter((l) => l.data.car_id === car.id);
    for (const p of currentPapers(mine)) {
      const s = paperStatus(p.data, today);
      if ((s.state === "expired" || s.state === "soon") && s.days != null) out.push({ what: p.data.title || "Papers", car: car.data.name, days: s.days, km: null, words: `${p.data.title || "Papers"} ${when(s.days)}` });
    }
    const sv = serviceDue(mine, latestOdometer(car.data, mine), today);
    if (sv?.due) {
      const byKm = sv.km != null && sv.km <= 500 && (sv.days == null || sv.days > 14);
      const words = byKm ? (sv.km! <= 0 ? `Service ${(-sv.km!).toLocaleString()} km over` : `Service in ${sv.km!.toLocaleString()} km`) : `Service ${sv.days! < 0 ? "overdue" : when(sv.days!)}`;
      out.push({ what: "Service", car: car.data.name, days: byKm ? null : sv.days, km: sv.km, words });
    }
  }
  return out.sort((a, b) => (a.days ?? 7) - (b.days ?? 7));
}

// Km per litre between each pair of full fills, in order: the line on the fuel chart.
export function economySeries(logs: Rec<"car_log">[]): { date: string; kmPerLitre: number }[] {
  const fuel = logs.filter((l) => l.data.type === "fuel" && (l.data.odometer || 0) > 0 && (l.data.litres || 0) > 0).sort((a, b) => (a.data.odometer || 0) - (b.data.odometer || 0));
  const out: { date: string; kmPerLitre: number }[] = [];
  let start: Rec<"car_log"> | null = null;
  let litres = 0;
  for (const f of fuel) {
    if (!start) {
      if (f.data.full) start = f;
      continue;
    }
    litres += f.data.litres || 0;
    if (f.data.full) {
      const km = (f.data.odometer || 0) - (start.data.odometer || 0);
      if (km > 0 && litres > 0) out.push({ date: f.data.date, kmPerLitre: Math.round((km / litres) * 10) / 10 });
      start = f;
      litres = 0;
    }
  }
  return out;
}

// what the car cost each month for the last n months: fuel, and everything else
export function monthlyCarSpend(logs: Rec<"car_log">[], months: string[]): { month: string; fuel: number; other: number }[] {
  return months.map((m) => {
    let fuel = 0;
    let other = 0;
    for (const l of logs) {
      if (l.data.date.slice(0, 7) !== m || !(l.data.amount && l.data.amount > 0)) continue;
      if (l.data.type === "fuel") fuel += l.data.amount;
      else other += l.data.amount;
    }
    return { month: m, fuel, other };
  });
}
