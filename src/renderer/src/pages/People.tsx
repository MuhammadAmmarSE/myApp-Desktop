// People & dates: the people you keep things about — who they are, their number, the things to
// remember (sizes, likes, gift ideas) — and the days that matter: birthdays, anniversaries, and
// other dates. What's coming up runs across the top with a countdown; pick a person to see their
// days, what's planned with them, and everything you noted.
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Cake, CalendarDays, CalendarHeart, Copy, Gift, Heart, Pencil, Phone, Plus, Search, StickyNote, Trash2, UserRound, Users } from "lucide-react";
import { daysBetween, isoDate, nextOccurrence, yearsAt, type Rec, type Relation } from "@myapp/core";
import { Button, Card, CardTitle, Chip, Empty, IconButton, Input, ProgressRing, Tag, toast, useContextMenu } from "@/components/ui";
import { relationLabel } from "@/components/forms/Editors";
import { useList, useRecords } from "@/store/records";
import { edit } from "@/store/ui";
import { useListNav } from "@/lib/listNav";
import { setQuery, useQuery } from "@/lib/router";
import { bridge } from "@/lib/bridge";
import { dayWord, initials, monthDay, time12 } from "@/lib/format";
import { rise } from "@/theme/motion";

const GROUPS: { id: string; label: string; has: (r: Relation) => boolean }[] = [
  { id: "all", label: "Everyone", has: () => true },
  { id: "family", label: "Family", has: (r) => ["me", "wife", "husband", "son", "daughter", "parent", "sibling", "family"].includes(r) },
  { id: "friends", label: "Friends", has: (r) => r === "friend" },
  { id: "work", label: "Work", has: (r) => r === "work" },
  { id: "other", label: "Other", has: (r) => r === "other" },
];
const HUES = ["var(--c-accent)", "var(--c-info)", "var(--c-success)", "var(--c-warn)", "var(--c-accent2)"];
const hueOf = (name: string) => HUES[[...name].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % HUES.length];

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const hue = hueOf(name);
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-semibold" style={{ width: size, height: size, fontSize: size * 0.36, background: `color-mix(in srgb, ${hue} 20%, var(--c-surface2))`, color: hue, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} 35%, transparent)` }} aria-hidden>
      {initials(name)}
    </span>
  );
}

type DateInfo = { rec: Rec<"date">; next: string; days: number; years: number | null };
const describeDate = (d: DateInfo) => {
  const k = d.rec.data.kind;
  if (k === "birthday" && d.years != null && d.years > 0) return `Turns ${d.years}`;
  if (k === "anniversary" && d.years) return `${d.years} years`;
  return k === "birthday" ? "Birthday" : k === "anniversary" ? "Anniversary" : "Every year";
};
const whenWord = (days: number) => (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`);

export default function People() {
  const q = useQuery();
  const people = useList("person");
  const dates = useList("date");
  const events = useList("event");
  const today = isoDate();
  const [group, setGroup] = useState("all");
  const [text, setText] = useState("");
  const ctx = useContextMenu();
  const chosen = q.get("id");

  const info = useMemo<DateInfo[]>(
    () =>
      dates
        .map((rec) => {
          const next = nextOccurrence(rec.data.month, rec.data.day, today);
          return { rec, next, days: daysBetween(today, next), years: yearsAt(rec.data.year, next) };
        })
        .sort((a, b) => a.days - b.days),
    [dates, today],
  );
  const coming = info.filter((d) => d.days <= 60);
  const nextFor = useMemo(() => {
    const m = new Map<string, DateInfo>();
    for (const d of info) if (d.rec.data.person_id && !m.has(d.rec.data.person_id)) m.set(d.rec.data.person_id, d);
    return m;
  }, [info]);
  const names = useMemo(() => new Map(people.map((p) => [p.id, p.data.name])), [people]);

  const shown = useMemo(() => {
    const g = GROUPS.find((x) => x.id === group)!;
    const w = text.toLowerCase().trim();
    return people
      .filter((p) => g.has(p.data.relation) && (!w || `${p.data.name} ${p.data.phone || ""} ${p.data.notes || ""} ${(p.data.details || []).map((x) => `${x.label} ${x.value}`).join(" ")}`.toLowerCase().includes(w)))
      .sort((a, b) => Number(b.data.relation === "me") - Number(a.data.relation === "me") || a.data.name.localeCompare(b.data.name));
  }, [people, group, text]);
  const person = chosen ? (people.find((p) => p.id === chosen) as Rec<"person"> | undefined) : shown[0];

  const nav = useListNav(shown, {
    selector: (id) => `[data-person="${id}"]`,
    onOpen: (p) => setQuery({ id: p.id }),
    onNew: () => edit("person"),
  });

  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-6" data-testid="people">
      <div className="mx-auto max-w-[1320px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">The people you remember things about</div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">People & dates</h1>
          </div>
          <Button icon={Cake} onClick={() => edit("date")}>
            Add a date
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => edit("person")} kbd="N">
            Add a person
          </Button>
        </motion.header>

        {/* what's coming up */}
        <motion.section {...rise(1)} className="mb-6">
          {coming.length ? (
            <div className="flex gap-3 overflow-x-auto pb-2" data-testid="coming-up">
              {coming.slice(0, 12).map((d, i) => {
                const who = d.rec.data.person_id ? names.get(d.rec.data.person_id) : "";
                const soon = d.days <= 7;
                return (
                  <motion.button
                    key={d.rec.id}
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.03 }}
                    onClick={() => (d.rec.data.person_id ? setQuery({ id: d.rec.data.person_id }) : edit("date", d.rec))}
                    onContextMenu={(e) => ctx(e, [{ label: "Edit the date", icon: Pencil, onSelect: () => edit("date", d.rec) }])}
                    className={clsx("flex w-[228px] shrink-0 items-center gap-3 rounded-[16px] p-3.5 text-left glass transition-transform hover:-translate-y-0.5", soon ? "shadow-[inset_0_0_0_1px_var(--c-glow)]" : "hairline")}
                  >
                    <ProgressRing value={1 - Math.min(d.days, 60) / 60} size={52} stroke={5} color={soon ? "var(--c-accent)" : "var(--c-text3)"}>
                      <span className="text-center leading-none">
                        <span className="block font-display text-[15px] font-semibold tnum">{d.days}</span>
                        <span className="text-[8.5px] uppercase text-text3">{d.days === 1 ? "day" : "days"}</span>
                      </span>
                    </ProgressRing>
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold">{d.rec.data.title}</div>
                      <div className="truncate text-[12px] text-text2">{[describeDate(d), who].filter(Boolean).join(" · ")}</div>
                      <div className={clsx("text-[11.5px]", d.days === 0 ? "font-semibold text-accent-text" : "text-text3")}>
                        {whenWord(d.days)} · {monthDay(d.rec.data.month, d.rec.data.day)}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          ) : (
            <Card className="!py-4">
              <div className="flex items-center gap-3 text-[13px] text-text2">
                <CalendarHeart size={18} className="text-accent-text" /> Nothing in the next two months. Add birthdays and anniversaries and they count down here.
              </div>
            </Card>
          )}
        </motion.section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* the people */}
          <motion.div {...rise(2)}>
            <Card pad={false} className="flex max-h-[calc(100vh-280px)] min-h-[420px] flex-col">
              <div className="border-b border-line p-3">
                <Input icon={Search} value={text} onChange={setText} placeholder="Search people and notes" size="sm" aria-label="Search people" />
                <div className="mt-2 flex flex-wrap gap-1">
                  {GROUPS.map((g) => (
                    <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>
                      {g.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {shown.length ? (
                  shown.map((p) => {
                    const nx = nextFor.get(p.id);
                    const on = person?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        data-person={p.id}
                        onClick={(e) => nav.click(p, e)}
                        onContextMenu={(e) =>
                          ctx(e, [
                            { label: "Edit", icon: Pencil, onSelect: () => edit("person", p) },
                            { label: "Add a date for them", icon: Cake, onSelect: () => edit("date", null, { person_id: p.id, title: `${p.data.name}'s birthday`, kind: "birthday" }) },
                            ...(p.data.phone ? [{ label: "Copy the number", icon: Copy, onSelect: () => (bridge.clipboard.write(p.data.phone!), toast("Copied")) }] : []),
                            { type: "separator" as const },
                            { label: "Remove", icon: Trash2, danger: true, onSelect: () => removePerson(p) },
                          ])
                        }
                        className={clsx("flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2 text-left transition-colors", on ? "bg-accent-soft" : nav.active === p.id ? "bg-hover" : "hover:bg-hover")}
                      >
                        <Avatar name={p.data.name} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-medium">{p.data.name}</div>
                          <div className="truncate text-[11.5px] text-text3">{relationLabel(p.data.relation)}</div>
                        </div>
                        {nx && nx.days <= 30 && <Tag tone={nx.days <= 7 ? "accent" : "default"}>{nx.days === 0 ? "Today" : `${nx.days}d`}</Tag>}
                      </button>
                    );
                  })
                ) : (
                  <Empty compact icon={Users} title={people.length ? "Nobody matches" : "Nobody yet"} body={people.length ? "Try another word or group." : "Add the people you want to remember things about."} />
                )}
              </div>
            </Card>
          </motion.div>

          {/* the chosen person */}
          <motion.div {...rise(3)} className="min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              {person ? (
                <motion.div key={person.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
                  <PersonCard p={person} info={info.filter((d) => d.rec.data.person_id === person.id)} events={events.filter((e) => e.data.person_id === person.id)} today={today} />
                </motion.div>
              ) : (
                <Card>
                  <Empty icon={UserRound} title="Pick someone" body="Or add the first person." />
                </Card>
              )}
            </AnimatePresence>
            {/* dates that belong to nobody in particular */}
            {info.some((d) => !d.rec.data.person_id) && (
              <Card className="mt-5">
                <CardTitle title="Other dates" icon={CalendarHeart} />
                <div className="-mx-2 grid grid-cols-1 md:grid-cols-2">
                  {info
                    .filter((d) => !d.rec.data.person_id)
                    .map((d) => (
                      <DateRow key={d.rec.id} d={d} />
                    ))}
                </div>
              </Card>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function removePerson(p: Rec<"person">) {
  const before = useRecords.getState().byId[p.id];
  useRecords.getState().remove(p.id);
  toast(`${p.data.name} removed`, { action: { label: "Undo", run: () => before && useRecords.getState().restore(before) } });
}

function DateRow({ d }: { d: DateInfo }) {
  const Icon = d.rec.data.kind === "birthday" ? Cake : d.rec.data.kind === "anniversary" ? Heart : CalendarHeart;
  return (
    <button type="button" onClick={() => edit("date", d.rec)} className="flex items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-hover">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-text">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{d.rec.data.title}</div>
        <div className="truncate text-[11.5px] text-text3">
          {monthDay(d.rec.data.month, d.rec.data.day)}
          {d.rec.data.year ? ` ${d.rec.data.year}` : ""} · {describeDate(d)}
        </div>
      </div>
      <span className={clsx("text-[12px] tnum", d.days <= 7 ? "font-semibold text-accent-text" : "text-text3")}>{whenWord(d.days)}</span>
    </button>
  );
}

function PersonCard({ p, info, events, today }: { p: Rec<"person">; info: DateInfo[]; events: Rec<"event">[]; today: string }) {
  const upcomingEvents = events.filter((e) => e.data.date >= today).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const past = events.filter((e) => e.data.date < today).sort((a, b) => b.data.date.localeCompare(a.data.date)).slice(0, 3);
  const details = p.data.details || [];
  return (
    <div className="flex flex-col gap-5" data-testid="person-card">
      <Card strong className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-20 blur-3xl" style={{ background: hueOf(p.data.name) }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <Avatar name={p.data.name} size={64} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[24px] font-semibold tracking-[-0.02em]">{p.data.name}</h2>
            <div className="text-[13px] text-text2">{relationLabel(p.data.relation)}</div>
          </div>
          <div className="flex gap-2">
            {p.data.phone && (
              <>
                <Button icon={Copy} onClick={() => (bridge.clipboard.write(p.data.phone!), toast("Number copied"))}>
                  {p.data.phone}
                </Button>
                <IconButton icon={Phone} label="Call (opens your phone app)" variant="secondary" onClick={() => void bridge.app.openExternal(`tel:${p.data.phone!.replace(/[^\d+]/g, "")}`)} />
              </>
            )}
            <Button icon={Pencil} onClick={() => edit("person", p)}>
              Edit
            </Button>
          </div>
        </div>
        {p.data.notes && <p className="selectable relative mt-4 whitespace-pre-wrap rounded-[12px] bg-surface2 p-3 text-[13.5px] text-text2 hairline">{p.data.notes}</p>}
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardTitle title="Their days" icon={Cake} action={<IconButton icon={Plus} label="Add a date for them" size="sm" onClick={() => edit("date", null, { person_id: p.id, title: `${p.data.name}'s birthday`, kind: "birthday" })} />} />
          {info.length ? (
            <div className="-mx-2 flex flex-col">
              {info.map((d) => (
                <DateRow key={d.rec.id} d={d} />
              ))}
            </div>
          ) : (
            <Empty compact icon={Cake} title="No dates yet" body="A birthday or an anniversary counts down on Today and here." />
          )}
        </Card>

        <Card>
          <CardTitle title="Things to remember" icon={Gift} action={<IconButton icon={Pencil} label="Change them" size="sm" onClick={() => edit("person", p)} />} />
          {details.length ? (
            <div className="grid grid-cols-2 gap-2">
              {details.map((x, i) => (
                <button key={i} type="button" onClick={() => (bridge.clipboard.write(x.value), toast(`Copied ${x.label.toLowerCase()}`))} className="rounded-[11px] bg-surface2 p-3 text-left hairline transition-colors hover:bg-hover" title="Click to copy">
                  <div className="text-[11.5px] text-text3">{x.label}</div>
                  <div className="selectable mt-0.5 truncate text-[13.5px] font-medium">{x.value}</div>
                </button>
              ))}
            </div>
          ) : (
            <Empty compact icon={StickyNote} title="Nothing noted" body="Sizes, favourite things, gift ideas, allergies." />
          )}
        </Card>
      </div>

      <Card>
        <CardTitle title="Plans with them" icon={CalendarDays} action={<IconButton icon={Plus} label="Plan something" size="sm" onClick={() => edit("event", null, { person_id: p.id, date: today })} />} />
        {upcomingEvents.length || past.length ? (
          <div className="-mx-2 flex flex-col">
            {[...upcomingEvents, ...past].map((e) => (
              <button key={e.id} type="button" onClick={() => edit("event", e)} className={clsx("flex items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-hover", e.data.date < today && "opacity-60")}>
                <CalendarDays size={15} className="shrink-0 text-info" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{e.data.title}</span>
                <span className="text-[12px] text-text3">
                  {dayWord(e.data.date, today)}
                  {e.data.time ? ` · ${time12(e.data.time)}` : ""}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Empty compact icon={CalendarDays} title="Nothing planned" />
        )}
      </Card>
    </div>
  );
}
