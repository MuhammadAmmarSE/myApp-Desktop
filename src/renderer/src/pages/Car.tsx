// My car: the car at a glance (the odometer, km per litre, what it costs), what needs doing —
// papers that expire, a service that's due — with Renew one click away, how fuel economy and the
// running costs move over the year, and the full log of fill-ups, services and papers. Costs are
// in Money too, as Fuel or Car.
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { AlertTriangle, CarFront, Droplets, FileCheck2, Fuel, Gauge, Pencil, Plus, Receipt, RefreshCw, Route, Trash2, Wrench, type LucideIcon } from "lucide-react";
import { carSpend, currentPapers, fuelEconomy, isoDate, latestOdometer, paperStatus, serviceDue, type CarLogType, type Rec } from "@myapp/core";
import { Button, Card, CardTitle, Empty, IconButton, ProgressRing, Segmented, Stat, Tag, toast, useContextMenu } from "@/components/ui";
import { ColumnChart, Legend, LineChart } from "@/components/charts";
import { useList } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { economySeries, logTitle, monthlyCarSpend, removeCar, removeCarLog } from "@/lib/car";
import { shiftMonth } from "@/lib/money";
import { confirmDialog } from "@/components/ui";
import { useListNav } from "@/lib/listNav";
import { dayWord, money, MONTHS_SHORT, shortDate } from "@/lib/format";
import { rise } from "@/theme/motion";

type Tab = CarLogType | "all";
const ICON: Record<string, LucideIcon> = { fuel: Fuel, service: Wrench, paper: FileCheck2 };
const km = (n: number) => `${Math.round(n).toLocaleString()} km`;
const inDays = (d: number) => (d === 0 ? "today" : d === 1 ? "tomorrow" : d === -1 ? "yesterday" : d < 0 ? `${-d} days ago` : `in ${d} days`);

export default function CarPage() {
  const cars = useList("car");
  const allLogs = useList("car_log");
  const currency = useSettings((s) => s.currency);
  const [chosen, setChosen] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const ctx = useContextMenu();
  const today = isoDate();

  const sorted = useMemo(() => [...cars].sort((a, b) => a.created_at - b.created_at), [cars]);
  const car = sorted.find((x) => x.id === chosen) || sorted[0] || null;
  const logs = useMemo(() => (car ? allLogs.filter((l) => l.data.car_id === car.id).sort((a, b) => b.data.date.localeCompare(a.data.date) || b.created_at - a.created_at) : []), [allLogs, car]);
  const odo = latestOdometer(car?.data, logs);
  const eco = useMemo(() => fuelEconomy(logs), [logs]);
  const thisMonth = useMemo(() => carSpend(logs, `${today.slice(0, 7)}-01`), [logs, today]);
  const thisYear = useMemo(() => carSpend(logs, `${today.slice(0, 4)}-01-01`), [logs, today]);
  const papers = useMemo(() => currentPapers(logs), [logs]);
  const service = useMemo(() => serviceDue(logs, odo, today), [logs, odo, today]);
  const attention = papers.map((p) => ({ p, s: paperStatus(p.data, today) })).filter((x) => x.s.state === "expired" || x.s.state === "soon");
  const series = useMemo(() => economySeries(logs), [logs]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(today.slice(0, 7), i - 11)), [today]);
  const spend = useMemo(() => monthlyCarSpend(logs, months), [logs, months]);
  const shown = tab === "all" ? logs : logs.filter((l) => l.data.type === tab);
  const counts: Record<Tab, number> = { all: logs.length, fuel: 0, service: 0, paper: 0 };
  for (const l of logs) if (l.data.type in counts) counts[l.data.type as CarLogType]++;

  const nav = useListNav(shown, {
    selector: (id) => `[data-log="${id}"]`,
    onOpen: (l) => edit("car_log", l),
    onDelete: (l) => l.forEach(removeLog),
    onNew: () => car && edit("car_log", null, { car_id: car.id, type: tab === "all" ? "fuel" : tab }),
  });
  function removeLog(l: Rec<"car_log">) {
    const undo = removeCarLog(l);
    toast(`${logTitle(l.data)} removed${l.data.money_id ? " (and from Money)" : ""}`, { action: { label: "Undo", run: undo } });
  }
  const deleteCar = async () => {
    if (!car) return;
    const n = logs.length;
    if (!(await confirmDialog({ title: `Remove ${car.data.name}?`, body: n ? `Its ${n} log entr${n === 1 ? "y" : "ies"} and the expenses they saved in Money go too. You can undo straight after.` : "You can undo straight after.", confirm: "Remove", danger: true }))) return;
    const undo = removeCar(car);
    setChosen(null);
    toast(`${car.data.name} removed`, { action: { label: "Undo", run: undo } });
  };

  if (!car) {
    return (
      <div className="grid h-full place-items-center px-8">
        <motion.div {...rise(0)} className="max-w-[460px]">
          <Empty
            icon={CarFront}
            title="Add your car"
            body="Fill-ups, services and papers in one place — km per litre worked out for you, and a reminder before insurance or registration runs out."
            action={
              <Button variant="primary" size="lg" icon={Plus} onClick={() => edit("car")}>
                Add your car
              </Button>
            }
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-6" data-testid="car">
      <div className="mx-auto max-w-[1320px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">Fuel, service, papers</div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">My car</h1>
          </div>
          {sorted.length > 1 && <Segmented size="sm" value={car.id} onChange={setChosen} options={sorted.map((c) => ({ value: c.id, label: c.data.name }))} />}
          <Button icon={Plus} onClick={() => edit("car")}>
            Another car
          </Button>
          <Button variant="primary" icon={Fuel} onClick={() => edit("car_log", null, { car_id: car.id, type: "fuel" })}>
            Add fuel
          </Button>
        </motion.header>

        {/* the car */}
        <motion.div {...rise(1)}>
          <Card strong className="relative mb-5 overflow-hidden">
            <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full accent-grad opacity-15 blur-3xl" />
            <div className="relative flex flex-wrap items-center gap-6">
              <div className="grid h-16 w-16 place-items-center rounded-[18px] accent-grad text-on-accent shadow-[var(--shadow-glow)]">
                <CarFront size={30} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em]">{car.data.name}</h2>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-text2">
                  {car.data.plate && <span className="rounded-[6px] bg-surface2 px-2 py-0.5 font-mono text-[12.5px] font-semibold tracking-wider text-text hairline">{car.data.plate}</span>}
                  {car.data.model && <span>{car.data.model}</span>}
                  {car.data.fuel && <Tag>{car.data.fuel}</Tag>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[12px] text-text3">On the clock</div>
                <div className="font-display text-[30px] font-semibold leading-none tracking-[-0.02em] tnum" data-testid="odometer">
                  {odo ? Math.round(odo).toLocaleString() : "—"}
                  <span className="ml-1 text-[15px] font-medium text-text3">km</span>
                </div>
              </div>
              <div className="flex gap-1">
                <IconButton icon={Pencil} label="Edit the car" onClick={() => edit("car", car)} />
                <IconButton icon={Trash2} label="Remove the car" onClick={deleteCar} />
              </div>
            </div>
          </Card>
        </motion.div>

        <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <motion.div {...rise(2)}>
            <Stat label="Km per litre" icon={Droplets} value={eco.kmPerLitre || 0} format={(n) => (eco.kmPerLitre ? n.toFixed(1) : "—")} sub={eco.kmPerLitre ? `Over ${km(eco.km)} between full fills` : "Two full fills with readings work it out"} />
          </motion.div>
          <motion.div {...rise(3)}>
            <Stat label="Cost per km" icon={Route} value={eco.costPerKm || 0} format={(n) => (eco.costPerKm ? money(n, currency) : "—")} sub="Fuel only" />
          </motion.div>
          <motion.div {...rise(4)}>
            <Stat label="This month" icon={Receipt} value={thisMonth.total} format={(n) => money(Math.round(n), currency)} sub={`${money(Math.round(thisMonth.fuel), currency)} on fuel`} />
          </motion.div>
          <motion.div {...rise(5)}>
            <Stat label={`In ${today.slice(0, 4)}`} icon={Gauge} value={thisYear.total} format={(n) => money(Math.round(n), currency)} sub={`${money(Math.round(thisYear.fuel), currency)} on fuel`} />
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
          <div className="flex min-w-0 flex-col gap-5">
            {/* what needs doing */}
            {(attention.length > 0 || service?.due) && (
              <motion.div {...rise(5)}>
                <Card className="border-[color-mix(in_srgb,var(--c-warn)_45%,var(--c-line))]">
                  <CardTitle title="Needs doing" icon={AlertTriangle} />
                  <div className="flex flex-col gap-2">
                    {attention.map(({ p, s }) => (
                      <div key={p.id} className="flex items-center gap-3 rounded-[11px] bg-surface2 p-3 hairline">
                        <FileCheck2 size={17} className={s.state === "expired" ? "text-danger" : "text-warn"} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium">{p.data.title || "Papers"}</div>
                          <div className={clsx("text-[12px]", s.state === "expired" ? "text-danger" : "text-warn")}>{s.state === "expired" ? `Expired ${inDays(s.days!)}` : `Expires ${inDays(s.days!)}`}</div>
                        </div>
                        <Button size="sm" variant="primary" icon={RefreshCw} onClick={() => edit("car_log", null, { car_id: car.id, type: "paper", renew: p })}>
                          Renew
                        </Button>
                      </div>
                    ))}
                    {service?.due && (
                      <div className="flex items-center gap-3 rounded-[11px] bg-surface2 p-3 hairline">
                        <Wrench size={17} className="text-warn" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium">{service.log.data.title || "Service"} due</div>
                          <div className="text-[12px] text-warn">{[service.days != null ? (service.days < 0 ? `${-service.days} days overdue` : inDays(service.days)) : "", service.km != null ? (service.km <= 0 ? `${km(-service.km)} over` : `in ${km(service.km)}`) : ""].filter(Boolean).join(" · ")}</div>
                        </div>
                        <Button size="sm" variant="primary" icon={Wrench} onClick={() => edit("car_log", null, { car_id: car.id, type: "service", title: service.log.data.title })}>
                          Log it done
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}

            {/* fuel economy and costs */}
            <motion.div {...rise(6)}>
              <Card>
                <CardTitle title="Km per litre, fill by fill" icon={Droplets} sub={series.length ? `${series.length} measured` : undefined} />
                {series.length >= 2 ? (
                  <LineChart label="Km per litre between full fills" points={series.map((s, i) => ({ x: i + 1, values: { kml: s.kmPerLitre } }))} series={[{ key: "kml", name: "Km per litre", color: "var(--viz-2)" }]} format={(n) => `${n.toFixed(1)} km/L`} xLabel={(x) => shortDate(series[x - 1].date, today)} height={200} />
                ) : (
                  <Empty compact icon={Droplets} title="Not enough fills yet" body="Fill to full twice with the odometer reading and the line starts." />
                )}
              </Card>
            </motion.div>
            <motion.div {...rise(7)}>
              <Card>
                <CardTitle title="What it cost, month by month" icon={Receipt} action={<Legend series={[{ key: "fuel", name: "Fuel", color: "var(--viz-1)" }, { key: "other", name: "Service & papers", color: "var(--viz-2)" }]} />} />
                {spend.some((s) => s.fuel || s.other) ? (
                  <ColumnChart label="Car costs each month" data={spend.map((s) => ({ key: s.month, label: MONTHS_SHORT[Number(s.month.slice(5)) - 1], values: { fuel: s.fuel, other: s.other } }))} series={[{ key: "fuel", name: "Fuel", color: "var(--viz-1)" }, { key: "other", name: "Service & papers", color: "var(--viz-2)" }]} format={(n) => money(Math.round(n), currency)} highlight={today.slice(0, 7)} height={200} />
                ) : (
                  <Empty compact icon={Receipt} title="No costs yet" />
                )}
              </Card>
            </motion.div>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            {/* papers */}
            <motion.div {...rise(6)}>
              <Card>
                <CardTitle title="Papers" icon={FileCheck2} action={<IconButton icon={Plus} label="Add papers" size="sm" onClick={() => edit("car_log", null, { car_id: car.id, type: "paper" })} />} />
                {papers.length ? (
                  <div className="grid grid-cols-2 gap-2">
                    {papers.map((p) => {
                      const s = paperStatus(p.data, today);
                      const tone = s.state === "expired" ? "var(--c-danger)" : s.state === "soon" ? "var(--c-warn)" : "var(--c-success)";
                      return (
                        <button key={p.id} type="button" onClick={() => edit("car_log", p)} className="flex items-center gap-3 rounded-[12px] bg-surface2 p-3 text-left hairline hover:bg-hover">
                          <ProgressRing value={s.days == null ? 1 : Math.max(0, Math.min(1, s.days / 365))} size={40} stroke={4} color={tone}>
                            <FileCheck2 size={14} style={{ color: tone }} />
                          </ProgressRing>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium">{p.data.title || "Papers"}</div>
                            <div className="truncate text-[11.5px]" style={{ color: s.state === "ok" ? "var(--c-text3)" : tone }}>
                              {s.state === "none" ? "No end date" : s.state === "expired" ? "Expired" : `Until ${shortDate(p.data.next_date!, today)}`}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Empty compact icon={FileCheck2} title="No papers yet" body="Insurance, registration, token tax — with a reminder before each runs out." />
                )}
              </Card>
            </motion.div>

            {/* the log */}
            <motion.div {...rise(7)}>
              <Card pad={false}>
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                  <span className="mr-auto text-[14px] font-semibold">Log</span>
                  <Segmented<Tab>
                    size="sm"
                    value={tab}
                    onChange={setTab}
                    options={[
                      { value: "all", label: "All", count: counts.all },
                      { value: "fuel", label: "Fuel", count: counts.fuel },
                      { value: "service", label: "Service", count: counts.service },
                      { value: "paper", label: "Papers", count: counts.paper },
                    ]}
                  />
                </div>
                {shown.length ? (
                  <div className="max-h-[520px] overflow-y-auto p-1.5" data-testid="car-log">
                    <AnimatePresence initial={false}>
                      {shown.map((l) => {
                        const Icon = ICON[l.data.type] || Wrench;
                        return (
                          <motion.div
                            key={l.id}
                            layout="position"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            data-log={l.id}
                            onClick={(e) => nav.click(l, e)}
                            onContextMenu={(e) =>
                              ctx(e, [
                                { label: "Edit", icon: Pencil, onSelect: () => edit("car_log", l) },
                                ...(l.data.type === "paper" ? [{ label: "Renew", icon: RefreshCw, onSelect: () => edit("car_log", null, { car_id: car.id, type: "paper", renew: l }) }] : []),
                                { type: "separator" as const },
                                { label: "Remove", icon: Trash2, danger: true, onSelect: () => removeLog(l) },
                              ])
                            }
                            className={clsx("flex items-center gap-3 rounded-[10px] px-2.5 py-2", nav.active === l.id ? "bg-hover" : "hover:bg-hover")}
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-surface2 text-text2 hairline">
                              <Icon size={15} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-medium">{logTitle(l.data)}</div>
                              <div className="truncate text-[11.5px] text-text3">
                                {[dayWord(l.data.date, today), l.data.litres ? `${l.data.litres} L${l.data.full ? " · full" : ""}` : "", l.data.odometer ? km(l.data.odometer) : "", l.data.type === "paper" && l.data.next_date ? `until ${shortDate(l.data.next_date, today)}` : ""].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                            {l.data.amount ? <span className="text-[13px] font-medium tnum">{money(l.data.amount, currency)}</span> : null}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                ) : (
                  <Empty compact icon={Fuel} title="Nothing logged" body="Press N to add a fill-up." />
                )}
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
