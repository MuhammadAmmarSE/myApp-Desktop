// My things: what you own and when its warranty ends — the phone, the fridge, the laptop — with
// where and when it was bought, the receipt number and serial (one click copies them), and a bar
// that shows how much of the warranty is left. Things you sold or gave away stay on record, out of
// the way.
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Archive, ArchiveRestore, Armchair, Copy, Hammer, Laptop, LayoutGrid, Package, Pencil, Plus, Refrigerator, Rows3, Search, ShieldAlert, ShieldCheck, Smartphone, Trash2, Tv, Watch, Wallet, type LucideIcon } from "lucide-react";
import { daysBetween, isoDate, thingsSummary, THING_CATEGORIES, warrantyLeft, warrantyStatus, type Rec } from "@myapp/core";
import { Button, Card, Chip, Empty, IconButton, Input, Segmented, Stat, Tag, toast, useContextMenu } from "@/components/ui";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { removeThing } from "@/lib/things";
import { useListNav } from "@/lib/listNav";
import { bridge } from "@/lib/bridge";
import { money, shortDate } from "@/lib/format";
import { rise } from "@/theme/motion";

const ICON: Record<string, LucideIcon> = { Phone: Smartphone, Laptop, Electronics: Tv, Appliance: Refrigerator, Furniture: Armchair, Watch, Tools: Hammer, Other: Package };
const TONE = { covered: "var(--c-success)", ending: "var(--c-warn)", ended: "var(--c-text3)", none: "var(--c-text3)" } as const;

// how much of the warranty is gone, 0..1 (null without dates)
const used = (t: Rec<"thing">, today: string) => {
  const a = t.data.bought_on;
  const b = t.data.warranty_until;
  if (!a || !b) return null;
  const total = daysBetween(a, b);
  return total > 0 ? Math.min(1, Math.max(0, daysBetween(a, today) / total)) : 1;
};

export default function Things() {
  const things = useList("thing");
  const currency = useSettings((s) => s.currency);
  const today = isoDate();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [layout, setLayout] = useState<"grid" | "table">("grid");
  const ctx = useContextMenu();

  const sum = useMemo(() => thingsSummary(things, today), [things, today]);
  const goneCount = things.filter((t) => t.data.gone).length;
  const shown = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return things
      .filter((t) => !!t.data.gone === gone && (!cat || (t.data.category || "Other") === cat) && w.every((x) => `${t.data.name} ${t.data.brand || ""} ${t.data.shop || ""} ${t.data.serial || ""} ${t.data.receipt_no || ""} ${t.data.notes || ""}`.toLowerCase().includes(x)))
      .sort((a, b) => {
        const sa = warrantyStatus(a.data, today);
        const sb = warrantyStatus(b.data, today);
        const rank = (s: typeof sa) => (s.state === "ending" ? 0 : s.state === "covered" ? 1 : s.state === "none" ? 2 : 3);
        return rank(sa) - rank(sb) || (sa.days ?? 99999) - (sb.days ?? 99999) || a.data.name.localeCompare(b.data.name);
      });
  }, [things, q, cat, gone, today]);
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of things) if (!!t.data.gone === gone) m.set(t.data.category || "Other", (m.get(t.data.category || "Other") || 0) + 1);
    return THING_CATEGORIES.filter((c) => m.has(c)).map((c) => [c, m.get(c)!] as const);
  }, [things, gone]);

  const remove = (t: Rec<"thing">) => {
    const undo = removeThing(t);
    toast(`${t.data.name} removed${t.data.money_id ? " (and from Money)" : ""}`, { action: { label: "Undo", run: undo } });
  };
  const toggleGone = (t: Rec<"thing">) => {
    useRecords.getState().update<"thing">(t.id, { gone: !t.data.gone });
    toast(t.data.gone ? `${t.data.name} is back` : `${t.data.name} put away`, { action: { label: "Undo", run: () => useRecords.getState().update<"thing">(t.id, { gone: !!t.data.gone }) } });
  };
  const copy = (label: string, value: string) => {
    bridge.clipboard.write(value);
    toast(`${label} copied`);
  };
  const menu = (t: Rec<"thing">) => [
    { label: "Edit", icon: Pencil, onSelect: () => edit("thing", t) },
    ...(t.data.serial ? [{ label: "Copy the serial", icon: Copy, onSelect: () => copy("Serial", t.data.serial!) }] : []),
    ...(t.data.receipt_no ? [{ label: "Copy the receipt number", icon: Copy, onSelect: () => copy("Receipt number", t.data.receipt_no!) }] : []),
    { label: t.data.gone ? "I still have it" : "Sold or given away", icon: t.data.gone ? ArchiveRestore : Archive, onSelect: () => toggleGone(t) },
    { type: "separator" as const },
    { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(t) },
  ];
  const nav = useListNav(shown, { selector: (id) => `[data-thing="${id}"]`, onOpen: (t) => edit("thing", t), onDelete: (l) => l.forEach(remove), onNew: () => edit("thing") });

  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-6" data-testid="things">
      <div className="mx-auto max-w-[1320px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">Warranties & receipts</div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">My things</h1>
          </div>
          <Button variant="primary" icon={Plus} onClick={() => edit("thing")} kbd="N">
            Add a thing
          </Button>
        </motion.header>

        <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <motion.div {...rise(1)}>
            <Stat label="Things" icon={Package} value={sum.count} sub={goneCount ? `${goneCount} sold or given away` : undefined} />
          </motion.div>
          <motion.div {...rise(2)}>
            <Stat label="What they cost" icon={Wallet} value={sum.value} format={(n) => money(Math.round(n), currency)} />
          </motion.div>
          <motion.div {...rise(3)}>
            <Stat label="Under warranty" icon={ShieldCheck} tone="var(--c-success)" value={sum.covered} sub={sum.count ? `${Math.round((sum.covered / sum.count) * 100)}% of them` : undefined} />
          </motion.div>
          <motion.div {...rise(4)}>
            <Stat label="Ending this month" icon={ShieldAlert} tone="var(--c-warn)" value={sum.ending.length} sub={sum.ending[0] ? `${sum.ending[0].data.name} first` : "None"} onClick={sum.ending[0] ? () => edit("thing", sum.ending[0]) : undefined} />
          </motion.div>
        </div>

        <motion.div {...rise(5)} className="mb-4 flex flex-wrap items-center gap-2">
          <div className="w-[260px]">
            <Input icon={Search} value={q} onChange={setQ} size="sm" placeholder="Search name, serial, shop" aria-label="Search things" />
          </div>
          <div className="flex flex-wrap gap-1">
            <Chip active={!cat} onClick={() => setCat(null)}>
              All
            </Chip>
            {cats.map(([c, n]) => (
              <Chip key={c} active={cat === c} count={n} icon={ICON[c] || Package} onClick={() => setCat(cat === c ? null : c)}>
                {c}
              </Chip>
            ))}
          </div>
          <div className="flex-1" />
          {goneCount > 0 && (
            <Button size="sm" variant={gone ? "secondary" : "ghost"} icon={Archive} onClick={() => setGone((g) => !g)}>
              {gone ? "Back to what I have" : `Sold or given away (${goneCount})`}
            </Button>
          )}
          <Segmented
            size="sm"
            value={layout}
            onChange={setLayout}
            options={[
              { value: "grid", label: "Cards", icon: LayoutGrid },
              { value: "table", label: "Table", icon: Rows3 },
            ]}
          />
        </motion.div>

        {!shown.length ? (
          <Card>
            <Empty icon={Package} title={things.length ? "Nothing matches" : "Nothing here yet"} body={things.length ? "Change the search or the filters." : "Add what you own with its warranty, and you'll hear about it before the warranty ends."} />
          </Card>
        ) : layout === "grid" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="thing-grid">
            <AnimatePresence initial={false}>
              {shown.map((t, i) => {
                const w = warrantyStatus(t.data, today);
                const u = used(t, today);
                const Icon = ICON[t.data.category || "Other"] || Package;
                return (
                  <motion.div
                    key={t.id}
                    layout="position"
                    data-thing={t.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.02 }}
                    onClick={(e) => nav.click(t, e)}
                    onContextMenu={(e) => ctx(e, menu(t))}
                    className={clsx("group flex cursor-pointer flex-col gap-3 rounded-[16px] p-4 glass transition-[box-shadow,transform] hover:-translate-y-0.5", nav.active === t.id ? "shadow-[inset_0_0_0_1.5px_var(--c-accent)]" : "hairline hover:shadow-[var(--shadow-card)]", t.data.gone && "opacity-70")}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent-text">
                        <Icon size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-semibold">{t.data.name}</div>
                        <div className="truncate text-[12px] text-text2">{[t.data.brand, t.data.category].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      {t.data.price ? <span className="text-[13px] font-semibold tnum">{money(t.data.price, currency)}</span> : null}
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11.5px]">
                        <span className="inline-flex items-center gap-1 font-medium" style={{ color: TONE[w.state] }}>
                          {w.state === "ended" || w.state === "none" ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                          {w.state === "none" ? "No warranty noted" : w.state === "ended" ? "Warranty ended" : `${warrantyLeft(w.days!)} left`}
                        </span>
                        {t.data.warranty_until && <span className="text-text3">until {shortDate(t.data.warranty_until, today)}</span>}
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--viz-grid)]">
                        {u != null && <motion.div initial={{ width: 0 }} animate={{ width: `${(1 - u) * 100}%` }} transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }} className="h-full rounded-full" style={{ background: TONE[w.state] }} />}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-text3">
                      {t.data.bought_on && <span>Bought {shortDate(t.data.bought_on, today)}</span>}
                      {t.data.shop && <span>· {t.data.shop}</span>}
                      <span className="flex-1" />
                      {t.data.serial && (
                        <button type="button" onClick={(e) => (e.stopPropagation(), copy("Serial", t.data.serial!))} className="rounded-[6px] px-1.5 py-0.5 font-mono hover:bg-hover hover:text-text" title="Copy the serial">
                          S/N {t.data.serial.length > 14 ? `${t.data.serial.slice(0, 12)}…` : t.data.serial}
                        </button>
                      )}
                      {t.data.money_id && <Tag tone="success">in Money</Tag>}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <Card pad={false}>
            <table className="w-full text-[13px]">
              <thead className="text-[11px] uppercase tracking-[0.06em] text-text3">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Thing</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Bought</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Warranty</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Serial</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const w = warrantyStatus(t.data, today);
                  const Icon = ICON[t.data.category || "Other"] || Package;
                  return (
                    <tr key={t.id} data-thing={t.id} onClick={(e) => nav.click(t, e)} onContextMenu={(e) => ctx(e, menu(t))} className={clsx("border-t border-line/60", nav.active === t.id ? "bg-hover" : "hover:bg-hover")}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5">
                          <Icon size={15} className="text-text3" />
                          <span className="font-medium">{t.data.name}</span>
                          {t.data.brand && <span className="text-text3">{t.data.brand}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-text2">{t.data.bought_on ? shortDate(t.data.bought_on, today) : "—"}</td>
                      <td className="px-2 py-2" style={{ color: TONE[w.state] }}>
                        {w.state === "none" ? "—" : w.state === "ended" ? "Ended" : warrantyLeft(w.days!)}
                      </td>
                      <td className="px-2 py-2 font-mono text-[12px] text-text2">
                        {t.data.serial ? (
                          <span className="inline-flex items-center gap-1">
                            {t.data.serial}
                            <IconButton icon={Copy} label="Copy the serial" size="xs" onClick={(e) => (e.stopPropagation(), copy("Serial", t.data.serial!))} />
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tnum">{t.data.price ? money(t.data.price, currency) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
