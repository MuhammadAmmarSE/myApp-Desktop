// Lists: groceries and shopping, side by side — buy today, order online, and a later shop. Each
// column has its own add line (commas add several), items drag between columns, and Regulars (the
// things you buy often) go back on today's list in one click. "Copy the list" gives you today's
// list as text, to send to whoever is going to the shop.
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Check, ClipboardCopy, Globe, Plus, Repeat2, RotateCcw, ShoppingBasket, ShoppingCart, Store, Trash2, type LucideIcon } from "lucide-react";
import type { ItemData, Rec } from "@myapp/core";
import { Button, Card, CardTitle, Chip, Empty, IconButton, Segmented, Tag, toast, useContextMenu } from "@/components/ui";
import { BulkBar } from "@/components/BulkBar";
import { ItemRow } from "@/components/rows";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { useListNav } from "@/lib/listNav";
import { useNow } from "@/lib/clock";
import { bridge } from "@/lib/bridge";
import { ago, money, plural } from "@/lib/format";
import { rise } from "@/theme/motion";

type Col = "today" | "online" | "later";
const COLS: { id: Col; title: string; icon: LucideIcon; hint: string; placeholder: string }[] = [
  { id: "today", title: "Buy today", icon: Store, hint: "On the next trip to the shop", placeholder: "Add to buy today…" },
  { id: "online", title: "Order online", icon: Globe, hint: "With a link, if you have one", placeholder: "Add to order…" },
  { id: "later", title: "Later", icon: ShoppingBasket, hint: "For another shop", placeholder: "Add for later…" },
];

const colOf = (i: Rec<"item">): Col => (i.data.mode === "online" ? "online" : i.data.today ? "today" : "later");
const placeOf = (c: Col): Pick<ItemData, "mode" | "today"> => (c === "online" ? { mode: "online", today: false } : { mode: "store", today: c === "today" });

// today's list as words, by list: "Grocery: milk (2), eggs · Shopping: batteries"
export function listText(items: Rec<"item">[]) {
  const by = (l: ItemData["list"]) => items.filter((i) => i.data.list === l).map((i) => (i.data.qty ? `${i.data.name} (${i.data.qty})` : i.data.name));
  const parts = [
    ["Grocery", by("grocery")],
    ["Shopping", by("shopping")],
  ].filter(([, l]) => (l as string[]).length) as [string, string[]][];
  return parts.map(([t, l]) => `${t}:\n${l.map((x) => `• ${x}`).join("\n")}`).join("\n\n");
}

export default function Lists() {
  const items = useList("item");
  const currency = useSettings((s) => s.currency);
  const nowMs = useNow();
  const [which, setWhich] = useState<ItemData["list"]>("grocery");
  const [showBought, setShowBought] = useState(false);

  const open = useMemo(() => items.filter((i) => !i.data.done).sort((a, b) => a.data.name.localeCompare(b.data.name)), [items]);
  const cols = useMemo(() => Object.fromEntries(COLS.map((c) => [c.id, open.filter((i) => colOf(i) === c.id)])) as Record<Col, Rec<"item">[]>, [open]);
  const ordered = useMemo(() => COLS.flatMap((c) => [...cols[c.id].filter((i) => i.data.list === "grocery"), ...cols[c.id].filter((i) => i.data.list === "shopping")]), [cols]);
  const regulars = useMemo(() => items.filter((i) => i.data.regular).sort((a, b) => a.data.name.localeCompare(b.data.name)), [items]);
  const bought = useMemo(() => items.filter((i) => i.data.done && nowMs - (i.data.done_at || 0) < 7 * 86400000).sort((a, b) => (b.data.done_at || 0) - (a.data.done_at || 0)), [items, nowMs]);
  const spent = bought.reduce((n, i) => n + (i.data.price || 0), 0);

  const toggle = (it: Rec<"item">) => {
    const s = useRecords.getState();
    const before = s.byId[it.id];
    // bought with someone else's money: what it cost goes on their hisaab, so ask
    const fund = it.data.fund_id ? s.byId[it.data.fund_id] : undefined;
    if (!it.data.done && fund && !fund.deleted && !it.data.money_id) return edit("item", it, { buying: true });
    if (it.data.done && it.data.money_id) {
      // not bought after all: what it cost comes back out of Money (or the hisaab) too
      const m = s.byId[it.data.money_id];
      s.update<"item">(it.id, { done: false, done_at: null, money_id: null, price: null });
      if (m && !m.deleted) {
        s.remove(m.id);
        toast(`${it.data.name}: not bought, its cost taken back out`, {
          action: {
            label: "Undo",
            run: () => {
              const st = useRecords.getState();
              st.restore(m);
              if (before) st.restore(before);
            },
          },
        });
      }
      return;
    }
    s.update<"item">(it.id, { done: !it.data.done, done_at: it.data.done ? null : Date.now() });
    if (!it.data.done) toast(`Bought ${it.data.name}`, { action: { label: "Undo", run: () => before && useRecords.getState().restore(before) }, ms: 3500 });
  };
  const remove = (list: Rec<"item">[]) => {
    const s = useRecords.getState();
    const before = list.map((i) => s.byId[i.id]).filter(Boolean);
    for (const i of list) s.remove(i.id);
    nav.clear();
    toast(list.length === 1 ? `Deleted ${list[0].data.name.slice(0, 40)}` : `Deleted ${list.length}`, { action: { label: "Undo", run: () => before.forEach((b) => useRecords.getState().restore(b)) } });
  };
  const moveTo = (list: Rec<"item">[], c: Col) => {
    const s = useRecords.getState();
    for (const i of list) if (colOf(i) !== c || i.data.done) s.update<"item">(i.id, { ...placeOf(c), done: false, done_at: null });
    nav.clear();
  };
  const backToToday = (it: Rec<"item">) => {
    if (!it.data.done && it.data.today && it.data.mode === "store") return toast(`${it.data.name} is already on today's list`);
    useRecords.getState().update<"item">(it.id, { done: false, today: true, mode: "store", done_at: null, money_id: null, price: null });
    toast.success(`${it.data.name} added to today`);
  };

  const nav = useListNav(ordered, {
    selector: (id) => `[data-item="${id}"]`,
    onOpen: (i) => edit("item", i),
    onToggle: (l) => (l.length === 1 ? toggle(l[0]) : (l.forEach((i) => useRecords.getState().update<"item">(i.id, { done: true, done_at: Date.now() })), nav.clear(), toast(`Bought ${l.length}`))),
    onDelete: remove,
  });
  const sel = ordered.filter((i) => nav.selected.has(i.id));

  const copyToday = () => {
    const list = cols.today;
    if (!list.length) return toast("Nothing on today's list");
    bridge.clipboard.write(listText(list));
    toast.success(`Copied ${plural(list.length, "item")}`);
  };

  return (
    <div className="h-full overflow-y-auto px-8 pb-24 pt-6" data-testid="lists">
      <div className="mx-auto max-w-[1320px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">Groceries & shopping</div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">Lists</h1>
          </div>
          <span className="text-[12px] text-text3">New items go on the</span>
          <Segmented
            size="sm"
            value={which}
            onChange={setWhich}
            options={[
              { value: "grocery", label: "Grocery", icon: ShoppingBasket },
              { value: "shopping", label: "Shopping", icon: ShoppingCart },
            ]}
          />
          <Button icon={ClipboardCopy} onClick={copyToday}>
            Copy today's list
          </Button>
        </motion.header>

        {/* regulars: back on today's list in one click */}
        <motion.div {...rise(1)} className="mb-5">
          <Card className="!py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-text2">
                <Repeat2 size={15} /> Regulars
              </span>
              {regulars.length ? (
                regulars.map((r) => {
                  const on = !r.data.done && r.data.today && r.data.mode === "store";
                  return (
                    <Chip key={r.id} active={on} icon={on ? Check : Plus} onClick={() => (on ? edit("item", r) : backToToday(r))}>
                      {r.data.name}
                    </Chip>
                  );
                })
              ) : (
                <span className="text-[12.5px] text-text3">Things you buy often (milk, bread, tea) — mark one "I buy this often" and it lives here.</span>
              )}
            </div>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {COLS.map((c, ci) => (
            <Column key={c.id} col={c} items={cols[c.id]} which={which} index={ci} nav={nav} onToggle={toggle} onDrop={(id) => {
              const it = useRecords.getState().byId[id] as Rec<"item"> | undefined;
              if (it && colOf(it) !== c.id) moveTo([it], c.id);
            }} />
          ))}
        </div>

        {/* bought this week */}
        {bought.length > 0 && (
          <motion.section {...rise(5)} className="mt-6">
            <Card>
              <CardTitle
                title="Bought this week"
                icon={Check}
                sub={`${plural(bought.length, "item")}${spent ? ` · ${money(spent, currency)} noted` : ""}`}
                action={
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setShowBought((v) => !v)}>
                      {showBought ? "Hide" : "Show"}
                    </Button>
                    {showBought && (
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(bought.filter((b) => !b.data.regular))}>
                        Clear
                      </Button>
                    )}
                  </div>
                }
              />
              <AnimatePresence initial={false}>
                {showBought && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="-mx-2 grid grid-cols-1 md:grid-cols-2">
                      {bought.map((b) => (
                        <div key={b.id} className="group flex items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-hover">
                          <button type="button" aria-label="Not bought" onClick={() => toggle(b)} className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-accent text-on-accent">
                            <Check size={12} strokeWidth={3} />
                          </button>
                          <button type="button" onClick={() => edit("item", b)} className="min-w-0 flex-1 truncate text-left text-[13px] text-text3 line-through">
                            {b.data.name}
                          </button>
                          <span className="text-[11.5px] text-text3">{ago(b.data.done_at || b.updated_at)}</span>
                          {b.data.money_id && <Tag tone="success">{b.data.fund_id ? "on a hisaab" : "in Money"}</Tag>}
                          <IconButton icon={RotateCcw} label="Put it back on the list" size="xs" className="opacity-0 group-hover:opacity-100" onClick={() => toggle(b)} />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.section>
        )}
      </div>

      <BulkBar count={sel.length} onClear={nav.clear}>
        <Button size="sm" variant="ghost" icon={Check} onClick={() => (sel.forEach((i) => useRecords.getState().update<"item">(i.id, { done: true, done_at: Date.now() })), nav.clear(), toast(`Bought ${sel.length}`))}>
          Bought
        </Button>
        {COLS.map((c) => (
          <Button key={c.id} size="sm" variant="ghost" icon={c.icon} onClick={() => moveTo(sel, c.id)}>
            {c.title.replace("Buy ", "").replace("Order ", "")}
          </Button>
        ))}
        <Button size="sm" variant="ghost" icon={Trash2} className="text-danger" onClick={() => remove(sel)}>
          Delete
        </Button>
      </BulkBar>
    </div>
  );
}

function Column({ col, items, which, index, nav, onToggle, onDrop }: { col: (typeof COLS)[number]; items: Rec<"item">[]; which: ItemData["list"]; index: number; nav: ReturnType<typeof useListNav<Rec<"item">>>; onToggle: (i: Rec<"item">) => void; onDrop: (id: string) => void }) {
  const [text, setText] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ctx = useContextMenu();
  const groups = (["grocery", "shopping"] as const).map((l) => ({ list: l, items: items.filter((i) => i.data.list === l) })).filter((g) => g.items.length);
  const add = () => {
    const names = text
      .split(/,|\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return;
    const s = useRecords.getState();
    for (const name of names) s.create("item", { name, list: which, ...placeOf(col.id), done: false });
    setText("");
    toast.success(names.length === 1 ? `Added ${names[0]}` : `Added ${names.length} items`);
  };
  return (
    <motion.div
      {...rise(index + 2)}
      data-column={col.id}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/redline-item")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDrop(e.dataTransfer.getData("text/redline-item"));
      }}
      className={clsx("flex min-h-[320px] flex-col rounded-[16px] p-3 glass hairline transition-shadow", over && "shadow-[inset_0_0_0_2px_var(--c-accent)]")}
    >
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent-soft text-accent-text">
          <col.icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">{col.title}</div>
          <div className="text-[11.5px] text-text3">{col.hint}</div>
        </div>
        <span className="font-display text-[18px] font-semibold text-text3 tnum">{items.length || ""}</span>
      </div>
      <div className="mb-2 flex items-center gap-1.5 rounded-[10px] bg-surface2 px-2.5 hairline focus-within:shadow-[inset_0_0_0_1px_var(--c-accent)]">
        <Plus size={15} className="text-text3" />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={col.placeholder}
          aria-label={`${col.title}: new item`}
          className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text3"
          data-testid={`add-${col.id}`}
        />
      </div>
      {groups.length ? (
        groups.map((g) => (
          <div key={g.list} className="mb-1">
            <div className="px-2 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text3">{g.list === "grocery" ? "Grocery" : "Shopping"}</div>
            <AnimatePresence initial={false}>
              {g.items.map((i, n) => (
                <div key={i.id} onContextMenu={(e) => e.stopPropagation()}>
                  <ItemRow i={i} index={n} draggable active={nav.active === i.id} selected={nav.selected.has(i.id)} onClick={(e) => nav.click(i, e)} onToggle={() => onToggle(i)} />
                </div>
              ))}
            </AnimatePresence>
          </div>
        ))
      ) : (
        <Empty compact icon={col.icon} title="Nothing here" body={col.id === "today" ? "Type above — commas add several at once." : "Drag something here, or type above."} />
      )}
      <div className="flex-1" onContextMenu={(e) => ctx(e, [{ label: "Add an item here", icon: Plus, onSelect: () => input.current?.focus() }])} />
    </motion.div>
  );
}
