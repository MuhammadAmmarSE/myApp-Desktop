// Interests: what you practise and how it's going (minutes against a weekly goal, days in a row,
// twelve weeks as a heat map), words to remember (flashcards that come back less often the better
// you know them), the games, books and shows you're into, and a wishlist. Getting something on the
// wishlist can save it in Money and My things at once, with Undo.
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Film,
  Flame,
  Gamepad2,
  Gift,
  GraduationCap,
  Languages,
  Package,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Tv,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { addDays, dueWords, isoDate, last7Days, minutesInWords, parseDate, practiceStreak, practiceThisWeek, wordProgress, type Rec } from "@myapp/core";
import { Button, Card, CardTitle, Chip, Empty, Input, Menu, ProgressRing, Segmented, Stat, Tag, toast, useContextMenu } from "@/components/ui";
import { WordReview } from "@/components/WordReview";
import { BulkBar } from "@/components/BulkBar";
import { MEDIA_WORD, statusShort } from "@/components/forms/InterestEditors";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { edit } from "@/store/ui";
import { gotWish, practiceGrid, removeInterest, splitWord } from "@/lib/interests";
import { minutesShort } from "@/lib/work";
import { useListNav } from "@/lib/listNav";
import { usePageKeys } from "@/lib/keys";
import { setQuery, useQuery } from "@/lib/router";
import { bridge } from "@/lib/bridge";
import { money, shortDate, WEEKDAYS_SHORT } from "@/lib/format";
import { rise } from "@/theme/motion";

type Tab = "practice" | "words" | "media" | "wishlist";
const TABS: Tab[] = ["practice", "words", "media", "wishlist"];
const LABEL: Record<Tab, string> = { practice: "Practice", words: "Words", media: "Games, books & shows", wishlist: "Wishlist" };
const TAB_ICON: Record<Tab, LucideIcon> = { practice: Timer, words: Languages, media: Gamepad2, wishlist: Gift };
const MEDIA_ICON: Record<string, LucideIcon> = { game: Gamepad2, book: BookOpen, show: Tv, movie: Film, course: GraduationCap };
type MediaView = "doing" | "want" | "done" | "dropped";
const PRIORITY = { high: 0, normal: 1, low: 2 } as const;
const PRIORITY_WORD = { high: "Want a lot", normal: "", low: "One day" } as const;
const STARTERS = ["Arabic", "Guitar", "Gym", "Reading", "Coding", "Drawing"];
const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
const has = (text: string, w: string[]) => w.every((x) => text.toLowerCase().includes(x));
const link = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

// heat-map shades by minutes in a day, from the theme's accent
const shade = (m: number) =>
  m <= 0 ? "var(--viz-grid)" : m < 15 ? "color-mix(in srgb, var(--c-accent) 28%, transparent)" : m < 30 ? "color-mix(in srgb, var(--c-accent) 50%, transparent)" : m < 60 ? "color-mix(in srgb, var(--c-accent) 75%, transparent)" : "var(--c-accent)";

// the box that adds words: "word = meaning" and Enter. It owns what's typed, so typing redraws only it.
function QuickWord({ interestId }: { interestId: string | null }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const add = () => {
    const pair = splitWord(text);
    if (!pair) {
      if (text.trim()) edit("word", null, { term: text.trim(), interest_id: interestId });
      else edit("word", null, { interest_id: interestId });
      setText("");
      return;
    }
    useRecords.getState().create("word", { term: pair[0], meaning: pair[1], interest_id: interestId, box: 0, due: isoDate() });
    toast(`${pair[0]} added`);
    setText("");
    ref.current?.focus();
  };
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Input ref={ref} icon={Plus} value={text} onChange={setText} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder="word = meaning, then Enter" aria-label="New word, as word = meaning" data-testid="quick-word" />
      </div>
      <Button onClick={add}>Add</Button>
    </div>
  );
}

// a word's place among the six boxes, as dots
function Boxes({ box }: { box: number }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={`Known ${box} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="h-1.5 w-3 rounded-full" style={{ background: n <= box ? (box >= 4 ? "var(--c-success)" : "var(--c-accent)") : "var(--viz-grid)" }} />
      ))}
    </span>
  );
}

export default function Interests() {
  const q = useQuery();
  const tab: Tab = TABS.includes(q.get("tab") as Tab) ? (q.get("tab") as Tab) : "practice";
  const interests = useList("interest");
  const practice = useList("practice");
  const allWords = useList("word");
  const media = useList("media");
  const wishes = useList("wish");
  const currency = useSettings((s) => s.currency);
  const today = isoDate();
  const ctx = useContextMenu();
  const [text, setText] = useState("");
  const [lang, setLang] = useState<string | null>(null);
  const [view, setView] = useState<MediaView>("doing");
  const [showGot, setShowGot] = useState(false);
  const [showAway, setShowAway] = useState(false);
  const [review, setReview] = useState<{ interest: string | null } | null>(null);
  const w = words(text);

  const active = useMemo(() => interests.filter((i) => !i.data.archived).sort((a, b) => a.created_at - b.created_at), [interests]);
  const away = useMemo(() => interests.filter((i) => i.data.archived), [interests]);
  const names = useMemo(() => new Map(interests.map((i) => [i.id, i.data.name])), [interests]);
  const due = useMemo(() => dueWords(allWords, today), [allWords, today]);
  const weekTotal = practiceThisWeek(practice, today);
  const goalTotal = active.reduce((n, i) => n + (i.data.goal_min || 0), 0);
  const bestStreak = active.reduce((n, i) => Math.max(n, practiceStreak(practice, today, i.id)), 0);
  const grid = useMemo(() => practiceGrid(practice, today, 16), [practice, today]);
  const recent = useMemo(() => [...practice].sort((a, b) => b.data.date.localeCompare(a.data.date) || b.created_at - a.created_at).slice(0, 8), [practice]);
  const openWishes = wishes.filter((x) => !x.data.got);
  const wishTotal = openWishes.reduce((n, x) => n + (x.data.price || 0), 0);

  // ----- actions -----
  const logQuick = (i: Rec<"interest">, m: number) => {
    const r = useRecords.getState().create("practice", { interest_id: i.id, date: today, minutes: m });
    toast(`${m} min of ${i.data.name}`, { action: { label: "Undo", run: () => useRecords.getState().remove(r.id) } });
  };
  const toggleAway = (i: Rec<"interest">) => {
    useRecords.getState().update<"interest">(i.id, { archived: !i.data.archived || undefined });
    toast(i.data.archived ? `${i.data.name} is back` : `${i.data.name} put away`, { action: { label: "Undo", run: () => useRecords.getState().update<"interest">(i.id, { archived: i.data.archived }) } });
  };
  const removeOne = (r: Rec, name: string) => {
    useRecords.getState().remove(r.id);
    toast.undo(`${name} removed`, () => useRecords.getState().restore(r));
  };
  const removeWords = (list: Rec<"word">[]) => {
    for (const x of list) useRecords.getState().remove(x.id);
    toast.undo(list.length === 1 ? `${list[0].data.term} removed` : `${list.length} words removed`, () => list.forEach((x) => useRecords.getState().restore(x)));
  };
  const setStatus = (m: Rec<"media">, status: string) => {
    const before = { status: m.data.status, started_on: m.data.started_on ?? null, finished_on: m.data.finished_on ?? null };
    useRecords.getState().update<"media">(m.id, { status, ...(status === "doing" && !m.data.started_on ? { started_on: today } : {}), ...(status === "done" ? { finished_on: today } : {}) });
    toast(`${m.data.name}: ${statusShort(status, m.data.type).toLowerCase()}`, { action: { label: "Undo", run: () => useRecords.getState().update<"media">(m.id, before) } });
  };
  const got = (x: Rec<"wish">, opts: { money: boolean; thing: boolean }) => {
    const undo = gotWish(x, opts, today);
    const also = [opts.money && x.data.price ? "Money" : "", opts.thing ? "My things" : ""].filter(Boolean).join(" and ");
    toast(`Got ${x.data.name}${also ? `, saved in ${also}` : ""}`, { action: { label: "Undo", run: undo } });
  };

  const interestMenu = (i: Rec<"interest">) => [
    { label: "Log practice", icon: Timer, onSelect: () => edit("practice", null, { interest_id: i.id }) },
    { label: "Add a word", icon: Languages, onSelect: () => edit("word", null, { interest_id: i.id }) },
    { label: "Edit", icon: Pencil, onSelect: () => edit("interest", i) },
    { label: i.data.archived ? "Back to it" : "Put it away", icon: i.data.archived ? ArchiveRestore : Archive, onSelect: () => toggleAway(i) },
    { type: "separator" as const },
    { label: "Remove with its practice", icon: Trash2, danger: true, onSelect: () => toast.undo(`${i.data.name} removed`, removeInterest(i)) },
  ];
  const wordMenu = (x: Rec<"word">) => [
    { label: "Edit", icon: Pencil, onSelect: () => edit("word", x) },
    { label: "Learn it again", icon: RotateCcw, onSelect: () => useRecords.getState().update<"word">(x.id, { box: 0, due: today }) },
    { type: "separator" as const },
    { label: "Remove", icon: Trash2, danger: true, onSelect: () => removeWords([x]) },
  ];
  const mediaMenu = (m: Rec<"media">) => [
    { label: "Edit", icon: Pencil, onSelect: () => edit("media", m) },
    { type: "separator" as const },
    ...(["doing", "want", "done", "dropped"] as const)
      .filter((s) => s !== m.data.status)
      .map((s) => ({ label: statusShort(s, m.data.type), icon: s === "done" ? CheckCircle2 : s === "doing" ? Play : s === "dropped" ? Archive : Star, onSelect: () => setStatus(m, s) })),
    { type: "separator" as const },
    { label: "Remove", icon: Trash2, danger: true, onSelect: () => removeOne(m, m.data.name) },
  ];
  const wishMenu = (x: Rec<"wish">) => [
    { label: "Edit", icon: Pencil, onSelect: () => edit("wish", x) },
    ...(x.data.link ? [{ label: "Open the link", icon: ExternalLink, onSelect: () => void bridge.app.openExternal(link(x.data.link!)) }] : []),
    ...(x.data.got ? [{ label: "Don't have it yet", icon: RotateCcw, onSelect: () => useRecords.getState().update<"wish">(x.id, { got: undefined, got_on: null }) }] : []),
    { type: "separator" as const },
    { label: "Remove", icon: Trash2, danger: true, onSelect: () => removeOne(x, x.data.name) },
  ];

  // the words list, for the keyboard
  const wordList = useMemo(
    () =>
      allWords
        .filter((x) => (!lang || x.data.interest_id === lang) && has(`${x.data.term} ${x.data.meaning} ${x.data.say || ""} ${x.data.example || ""}`, w))
        .sort((a, b) => Number(!(!a.data.due || a.data.due <= today)) - Number(!(!b.data.due || b.data.due <= today)) || (a.data.box || 0) - (b.data.box || 0) || b.created_at - a.created_at),
    [allWords, lang, w, today],
  );
  const nav = useListNav(tab === "words" ? wordList : [], {
    selector: (id) => `[data-word="${id}"]`,
    onOpen: (x) => edit("word", x),
    onDelete: (l) => removeWords(l),
    onNew: () => addHere(),
  });
  function addHere() {
    edit(tab === "practice" ? "practice" : tab === "words" ? "word" : tab === "media" ? "media" : "wish", null, tab === "words" && lang ? { interest_id: lang } : undefined);
  }
  usePageKeys(
    (e) => {
      if (tab === "words" && (e.key === "r" || e.key === "R") && due.length) return (setReview({ interest: lang }), true);
      if (tab !== "words" && (e.key === "n" || e.key === "N")) return (addHere(), true);
    },
    [tab, lang, due.length],
  );

  const empty = !interests.length && !allWords.length && !media.length && !wishes.length && !practice.length;

  // ----- practice -----
  const interestCard = (i: Rec<"interest">, n: number) => {
    const week = practiceThisWeek(practice, today, i.id);
    const goal = i.data.goal_min || 0;
    const streak = practiceStreak(practice, today, i.id);
    const days = last7Days(practice, today, i.id);
    const top = Math.max(30, ...days);
    const wordsHere = allWords.filter((x) => x.data.interest_id === i.id);
    const dueHere = dueWords(wordsHere, today).length;
    return (
      <motion.div
        key={i.id}
        data-interest={i.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: Math.min(n, 10) * 0.03 }}
        onContextMenu={(e) => ctx(e, interestMenu(i))}
        className={clsx("flex flex-col gap-3 rounded-[16px] p-4 glass hairline", i.data.archived && "opacity-70")}
      >
        <div className="flex items-center gap-3">
          <ProgressRing value={goal ? week / goal : week ? 1 : 0} size={54} stroke={5} color={goal && week >= goal ? "var(--c-success)" : undefined}>
            <span className="text-[11px] font-semibold tnum">{goal ? `${Math.min(999, Math.round((week / goal) * 100))}%` : minutesShort(week)}</span>
          </ProgressRing>
          <button type="button" onClick={() => edit("interest", i)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-[15px] font-semibold">{i.data.name}</div>
            <div className="truncate text-[12px] text-text2">{goal ? `${minutesInWords(week)} of ${minutesInWords(goal)} this week` : week ? `${minutesInWords(week)} this week` : "Nothing this week yet"}</div>
          </button>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--c-warn)_16%,transparent)] px-2 py-0.5 text-[12px] font-semibold text-warn" title={`${streak} day${streak === 1 ? "" : "s"} in a row`}>
              <Flame size={13} /> {streak}
            </span>
          )}
        </div>
        <div className="flex h-11 items-end gap-1.5" aria-label={`Last 7 days: ${days.map((m) => `${m} min`).join(", ")}`}>
          {days.map((m, d) => (
            <div key={d} className="flex flex-1 flex-col items-center gap-1">
              <motion.div
                className="w-full max-w-[22px] rounded-[4px]"
                initial={{ height: 3 }}
                animate={{ height: Math.max(3, (m / top) * 28) }}
                transition={{ duration: 0.5, ease: [0, 0, 0.2, 1], delay: d * 0.02 }}
                style={{ background: m ? (d === 6 ? "var(--c-accent)" : "color-mix(in srgb, var(--c-accent) 45%, transparent)") : "var(--viz-grid)" }}
                title={`${m} min`}
              />
              <span className={clsx("text-[10px]", d === 6 ? "text-text" : "text-text3")}>{WEEKDAYS_SHORT[parseDate(addDays(today, d - 6)).getDay()].slice(0, 1)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[15, 30].map((m) => (
            <Button key={m} size="sm" className="flex-1" onClick={() => logQuick(i, m)}>
              +{m} min
            </Button>
          ))}
          <Button size="sm" className="flex-1" icon={Timer} onClick={() => edit("practice", null, { interest_id: i.id })}>
            Log…
          </Button>
          {dueHere > 0 && (
            <Button size="sm" variant="primary" icon={Play} onClick={() => setReview({ interest: i.id })} title={`${dueHere} words to go over`}>
              {dueHere}
            </Button>
          )}
        </div>
      </motion.div>
    );
  };

  const practiceTab = (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0">
        {active.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="interest-grid">
            {active.map(interestCard)}
          </div>
        ) : (
          <Card>
            <Empty
              icon={Sparkles}
              title="What are you into?"
              body="A language, an instrument, the gym, reading: log the minutes you put in, set a weekly goal, and keep a streak going."
              action={
                <div className="flex flex-wrap justify-center gap-1.5">
                  {STARTERS.map((s) => (
                    <Chip key={s} icon={Plus} onClick={() => edit("interest", null, { name: s })}>
                      {s}
                    </Chip>
                  ))}
                </div>
              }
            />
          </Card>
        )}
        {away.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            <Chip active={showAway} icon={Archive} count={away.length} onClick={() => setShowAway((x) => !x)} className="w-fit">
              Put away
            </Chip>
            {showAway && <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{away.map(interestCard)}</div>}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Card data-testid="heat-map">
          <CardTitle title="The last 16 weeks" icon={Flame} sub="Each square a day: the darker, the longer" />
          <div className="flex gap-[3px] overflow-x-auto pb-1" role="img" aria-label={`Practice over the last 16 weeks: ${grid.flat().filter((d) => d.minutes > 0).length} days with some`}>
            <div className="mr-1 flex flex-col gap-[3px] pt-px text-[9.5px] text-text3">
              {["M", "", "W", "", "F", "", ""].map((d, i) => (
                <span key={i} className="h-[14px] leading-[14px]">
                  {d}
                </span>
              ))}
            </div>
            {grid.map((col, c) => (
              <div key={c} className="flex flex-col gap-[3px]">
                {col.map((d) => (
                  <span
                    key={d.date}
                    className={clsx("h-[14px] w-[14px] rounded-[3px]", d.date === today && "ring-1 ring-[var(--c-text3)]")}
                    style={{ background: shade(d.minutes) }}
                    title={`${shortDate(d.date, today)}: ${d.minutes ? minutesInWords(d.minutes) : "nothing"}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[10.5px] text-text3">
            Less
            {[0, 10, 20, 45, 60].map((m) => (
              <span key={m} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: shade(m) }} />
            ))}
            More
          </div>
        </Card>
        <Card>
          <CardTitle title="Lately" icon={Timer} />
          {recent.length ? (
            <div className="-mx-2 flex flex-col">
              {recent.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-practice={p.id}
                  onClick={() => edit("practice", p)}
                  onContextMenu={(e) =>
                    ctx(e, [{ label: "Edit", icon: Pencil, onSelect: () => edit("practice", p) }, { type: "separator" }, { label: "Remove", icon: Trash2, danger: true, onSelect: () => removeOne(p, `${minutesInWords(p.data.minutes)} of practice`) }])
                  }
                  className="flex items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-hover"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-surface2 text-text2">
                    <Timer size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{p.data.interest_id ? names.get(p.data.interest_id) || "Practice" : "Practice"}</span>
                    <span className="block truncate text-[11.5px] text-text3">{[shortDate(p.data.date, today), p.data.note].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-[13px] font-semibold tnum">{minutesShort(p.data.minutes)}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty compact icon={Timer} title="Nothing logged yet" body="Use +15 or +30 on an interest, or Log practice." />
          )}
        </Card>
      </div>
    </div>
  );

  // ----- words -----
  const langs = active.filter((i) => allWords.some((x) => x.data.interest_id === i.id));
  const dueHere = lang ? dueWords(allWords, today, lang).length : due.length;
  const prog = wordProgress(lang ? allWords.filter((x) => x.data.interest_id === lang) : allWords);
  const chosenWords = tab === "words" ? nav.chosen() : [];
  const wordsTab = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardTitle title="Add words" icon={Languages} sub="Type the word, an equals sign and what it means. Each comes back as a flashcard: soon at first, then less often." />
          <QuickWord interestId={lang} />
          {langs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip active={!lang} onClick={() => setLang(null)} count={allWords.length}>
                All
              </Chip>
              {langs.map((i) => (
                <Chip key={i.id} active={lang === i.id} count={allWords.filter((x) => x.data.interest_id === i.id).length} onClick={() => setLang(lang === i.id ? null : i.id)}>
                  {i.data.name}
                </Chip>
              ))}
            </div>
          )}
        </Card>
        <Card className={clsx("flex flex-col justify-between gap-3", dueHere > 0 && "shadow-[inset_0_0_0_1px_var(--c-glow)]")} data-testid="review-card">
          <div className="flex items-center gap-3">
            <ProgressRing value={prog.total ? prog.known / prog.total : 0} size={54} stroke={5} color="var(--c-success)">
              <span className="text-[11px] font-semibold tnum">{prog.total ? `${Math.round((prog.known / prog.total) * 100)}%` : "—"}</span>
            </ProgressRing>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">{dueHere ? `${dueHere} to go over` : "Nothing to go over"}</div>
              <div className="text-[12px] text-text2">
                {prog.known} of {prog.total} known well
              </div>
            </div>
          </div>
          <Button variant="primary" icon={Play} disabled={!dueHere} onClick={() => setReview({ interest: lang })} kbd="R">
            Go over them
          </Button>
        </Card>
      </div>
      {wordList.length ? (
        <Card pad={false} data-testid="word-table">
          <table className="w-full text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.06em] text-text3">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Word</th>
                <th className="px-2 py-2.5 text-left font-semibold">Means</th>
                <th className="px-2 py-2.5 text-left font-semibold">Known</th>
                <th className="px-4 py-2.5 text-right font-semibold">Next</th>
              </tr>
            </thead>
            <tbody>
              {wordList.map((x) => {
                const now = !x.data.due || x.data.due <= today;
                return (
                  <tr
                    key={x.id}
                    data-word={x.id}
                    onClick={(e) => nav.click(x, e)}
                    onDoubleClick={() => edit("word", x)}
                    onContextMenu={(e) => ctx(e, wordMenu(x))}
                    className={clsx("cursor-pointer border-t border-line/60", nav.selected.has(x.id) ? "bg-accent-soft/50" : nav.active === x.id ? "bg-hover" : "hover:bg-hover")}
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium">{x.data.term}</div>
                      {x.data.say && <div className="text-[11.5px] text-text3">{x.data.say}</div>}
                    </td>
                    <td className="px-2 py-2 text-text2">{x.data.meaning}</td>
                    <td className="px-2 py-2">
                      <Boxes box={x.data.box || 0} />
                    </td>
                    <td className="px-4 py-2 text-right">{now ? <Tag tone="accent">Now</Tag> : <span className="text-text3">{shortDate(x.data.due!, today)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <Empty
            icon={Languages}
            title={allWords.length ? "Nothing matches" : "No words yet"}
            body={allWords.length ? "Change the search or the language." : "Add the words you're learning above. Each comes back when it's time to go over it again."}
          />
        </Card>
      )}
    </div>
  );

  // ----- games, books & shows -----
  const counts: Record<MediaView, number> = { doing: 0, want: 0, done: 0, dropped: 0 };
  for (const m of media) if (m.data.status in counts) counts[m.data.status as MediaView]++;
  const shownMedia = media
    .filter((m) => m.data.status === view && has(`${m.data.name} ${m.data.platform || ""} ${m.data.notes || ""} ${MEDIA_WORD[m.data.type] || ""}`, w))
    .sort((a, b) => (view === "done" ? (b.data.finished_on || "").localeCompare(a.data.finished_on || "") : b.updated_at - a.updated_at));
  const mediaTab = (
    <div className="flex flex-col gap-4">
      <Segmented<MediaView>
        value={view}
        onChange={setView}
        options={[
          { value: "doing", label: "On the go", count: counts.doing },
          { value: "want", label: "Want to", count: counts.want },
          { value: "done", label: "Finished", count: counts.done },
          { value: "dropped", label: "Gave up", count: counts.dropped },
        ]}
      />
      {shownMedia.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="media-grid">
          <AnimatePresence initial={false}>
            {shownMedia.map((m, i) => {
              const Icon = MEDIA_ICON[m.data.type] || Sparkles;
              return (
                <motion.div
                  key={m.id}
                  layout="position"
                  data-media={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.22, delay: Math.min(i, 12) * 0.02 }}
                  onClick={() => edit("media", m)}
                  onContextMenu={(e) => ctx(e, mediaMenu(m))}
                  className="group flex cursor-pointer flex-col gap-2.5 rounded-[16px] p-4 glass hairline transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent-text">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14.5px] font-semibold">{m.data.name}</div>
                      <div className="truncate text-[12px] text-text2">{[MEDIA_WORD[m.data.type], m.data.platform].filter(Boolean).join(" · ")}</div>
                    </div>
                  </div>
                  {m.data.progress && view !== "done" && <div className="text-[12.5px] text-text2">Up to {m.data.progress}</div>}
                  <div className="flex items-center gap-2 text-[11.5px] text-text3">
                    {m.data.rating ? (
                      <span className="inline-flex gap-px" aria-label={`${m.data.rating} of 5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} size={12} style={{ color: n <= m.data.rating! ? "var(--c-warn)" : "var(--c-text3)", fill: n <= m.data.rating! ? "var(--c-warn)" : "transparent" }} />
                        ))}
                      </span>
                    ) : null}
                    <span>{view === "done" && m.data.finished_on ? `Finished ${shortDate(m.data.finished_on, today)}` : view === "doing" && m.data.started_on ? `Since ${shortDate(m.data.started_on, today)}` : ""}</span>
                    <span className="flex-1" />
                    {view === "want" && (
                      <button type="button" onClick={(e) => (e.stopPropagation(), setStatus(m, "doing"))} className="rounded-[7px] px-2 py-0.5 font-medium text-text2 opacity-0 hover:bg-hover hover:text-text group-hover:opacity-100">
                        Start
                      </button>
                    )}
                    {view === "doing" && (
                      <button type="button" onClick={(e) => (e.stopPropagation(), setStatus(m, "done"))} className="rounded-[7px] px-2 py-0.5 font-medium text-text2 opacity-0 hover:bg-hover hover:text-text group-hover:opacity-100">
                        Finished
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <Card>
          <Empty
            icon={Gamepad2}
            title={media.length ? (text ? "Nothing matches" : "Nothing here") : "Games, books and shows"}
            body={media.length ? undefined : "What you're playing, reading or watching, how far you've got, and what you want to get to next. Rate them when you finish."}
            action={
              <Button icon={Plus} onClick={() => edit("media", null, { status: view })}>
                Add one
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );

  // ----- wishlist -----
  const shownWishes = wishes
    .filter((x) => !!x.data.got === showGot && has(`${x.data.name} ${x.data.notes || ""} ${x.data.link || ""}`, w))
    .sort((a, b) => (showGot ? (b.data.got_on || "").localeCompare(a.data.got_on || "") : PRIORITY[a.data.priority || "normal"] - PRIORITY[b.data.priority || "normal"] || b.created_at - a.created_at));
  const gotCount = wishes.filter((x) => x.data.got).length;
  const wishTab = (
    <div className="flex flex-col gap-3">
      {gotCount > 0 && (
        <Chip active={showGot} icon={CheckCircle2} count={gotCount} onClick={() => setShowGot((x) => !x)} className="w-fit">
          Got them
        </Chip>
      )}
      {shownWishes.length ? (
        <Card pad={false} data-testid="wish-list">
          {shownWishes.map((x, i) => (
            <div key={x.id} data-wish={x.id} onContextMenu={(e) => ctx(e, wishMenu(x))} className={clsx("group flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-line/60")}>
              <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-[11px]", x.data.priority === "high" ? "bg-[color-mix(in_srgb,var(--c-warn)_16%,transparent)] text-warn" : "bg-surface2 text-text2")}>
                <Gift size={16} />
              </span>
              <button type="button" onClick={() => edit("wish", x)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[14px] font-medium">{x.data.name}</div>
                <div className="truncate text-[12px] text-text3">{[x.data.got && x.data.got_on ? `Got ${shortDate(x.data.got_on, today)}` : PRIORITY_WORD[x.data.priority || "normal"], x.data.notes].filter(Boolean).join(" · ") || "—"}</div>
              </button>
              {x.data.link && (
                <button
                  type="button"
                  onClick={() => void bridge.app.openExternal(link(x.data.link!))}
                  aria-label="Open the link"
                  className="grid h-8 w-8 place-items-center rounded-md text-text3 opacity-0 hover:bg-hover hover:text-text group-hover:opacity-100"
                >
                  <ExternalLink size={14} />
                </button>
              )}
              {x.data.money_id && <Tag tone="success">in Money</Tag>}
              {x.data.thing_id && <Tag>in My things</Tag>}
              {x.data.price ? <span className="w-[90px] text-right text-[13px] font-semibold tnum">{money(x.data.price, currency)}</span> : <span className="w-[90px]" />}
              {!x.data.got && (
                <Menu
                  trigger={(open) => (
                    <Button size="sm" icon={ShoppingBag} onClick={open}>
                      Got it
                    </Button>
                  )}
                  items={[
                    ...(x.data.price ? [{ label: "Got it: save in Money and My things", icon: Wallet, onSelect: () => got(x, { money: true, thing: true }) }] : []),
                    ...(x.data.price ? [{ label: "Got it: save in Money", icon: Wallet, onSelect: () => got(x, { money: true, thing: false }) }] : []),
                    { label: "Got it: add to My things", icon: Package, onSelect: () => got(x, { money: false, thing: true }) },
                    { label: "Got it: just tick it off", icon: CheckCircle2, onSelect: () => got(x, { money: false, thing: false }) },
                  ]}
                />
              )}
            </div>
          ))}
        </Card>
      ) : (
        <Card>
          <Empty
            icon={Gift}
            title={wishes.length ? (text ? "Nothing matches" : showGot ? "Nothing got yet" : "Nothing on it") : "Your wishlist"}
            body={wishes.length ? undefined : "Things you'd like one day, about what they cost and where to buy them. When you get one, it can go into Money and My things at once."}
          />
        </Card>
      )}
    </div>
  );

  const tabCounts: Record<Tab, number> = { practice: active.length, words: due.length, media: counts.doing, wishlist: openWishes.length };

  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-6" data-testid="interests">
      <div className="mx-auto max-w-[1320px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">Practice, words, games & wishes</div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">Interests</h1>
          </div>
          <Button icon={Timer} onClick={() => edit("practice")}>
            Log practice
          </Button>
          <Menu
            trigger={(open) => (
              <Button variant="primary" icon={Plus} onClick={open} kbd="N">
                Add
              </Button>
            )}
            items={[
              { label: "New interest", icon: Sparkles, onSelect: () => edit("interest") },
              { label: "Add a word", icon: Languages, onSelect: () => edit("word", null, lang ? { interest_id: lang } : undefined) },
              { label: "Add a game, book or show", icon: Gamepad2, onSelect: () => edit("media") },
              { label: "Add to your wishlist", icon: Gift, onSelect: () => edit("wish") },
            ]}
          />
        </motion.header>

        {!empty && (
          <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <motion.div {...rise(1)}>
              <Stat className="h-full" label="This week" icon={Timer} value={weekTotal} format={(n) => (n ? minutesShort(n) : "0m")} sub={goalTotal ? `of ${minutesInWords(goalTotal)} you aimed for` : "No weekly goal set"} onClick={() => setQuery({ tab: null })} />
            </motion.div>
            <motion.div {...rise(2)}>
              <Stat className="h-full" label="Days in a row" icon={Flame} tone="var(--c-warn)" value={bestStreak} sub={bestStreak ? "Your best going right now" : "Practise today to start one"} />
            </motion.div>
            <motion.div {...rise(3)}>
              <Stat className="h-full" label="Words to go over" icon={Languages} value={due.length} sub={`${wordProgress(allWords).known} of ${allWords.length} known well`} onClick={due.length ? () => setReview({ interest: null }) : () => setQuery({ tab: "words" })} />
            </motion.div>
            <motion.div {...rise(4)}>
              <Stat className="h-full" label="Wishlist" icon={Gift} value={openWishes.length} sub={wishTotal ? `About ${money(Math.round(wishTotal), currency)} in all` : undefined} onClick={() => setQuery({ tab: "wishlist" })} />
            </motion.div>
          </div>
        )}

        {empty ? (
          <motion.div {...rise(2)}>
            <Card>
              <Empty
                icon={Sparkles}
                title="What are you into?"
                body="A language, an instrument, the gym, reading: log the minutes you put in and keep a streak going. Learn words with flashcards, keep track of games, books and shows, and keep a wishlist."
                action={
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {STARTERS.map((s) => (
                      <Chip key={s} icon={Plus} onClick={() => edit("interest", null, { name: s })}>
                        {s}
                      </Chip>
                    ))}
                  </div>
                }
              />
            </Card>
          </motion.div>
        ) : (
          <>
            <motion.div {...rise(5)} className="mb-4 flex flex-wrap items-center gap-2">
              <Segmented<Tab> value={tab} onChange={(t) => setQuery({ tab: t === "practice" ? null : t })} options={TABS.map((t) => ({ value: t, label: LABEL[t], icon: TAB_ICON[t], count: tabCounts[t] }))} />
              {tab !== "practice" && (
                <div className="w-[240px]">
                  <Input icon={Search} value={text} onChange={setText} size="sm" placeholder={`Search ${LABEL[tab].toLowerCase()}`} aria-label={`Search ${LABEL[tab].toLowerCase()}`} />
                </div>
              )}
              <div className="flex-1" />
              <Button size="sm" variant="ghost" icon={Plus} onClick={addHere}>
                {tab === "practice" ? "Log practice" : tab === "words" ? "Add a word" : tab === "media" ? "Add one" : "Add a wish"}
              </Button>
            </motion.div>
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0, 0, 0.2, 1] }}>
              {tab === "practice" ? practiceTab : tab === "words" ? wordsTab : tab === "media" ? mediaTab : wishTab}
            </motion.div>
          </>
        )}
      </div>

      <WordReview open={!!review} onClose={() => setReview(null)} interestId={review?.interest ?? null} title={review?.interest ? names.get(review.interest) || "Words" : "All words"} />
      <BulkBar count={chosenWords.length} onClear={nav.clear}>
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => (chosenWords.forEach((x) => useRecords.getState().update<"word">(x.id, { box: 0, due: today })), toast(`${chosenWords.length} words to learn again`), nav.clear())}>
          Learn again
        </Button>
        <Button size="sm" variant="ghost" icon={Trash2} className="text-danger" onClick={() => (removeWords(chosenWords), nav.clear())}>
          Remove
        </Button>
      </BulkBar>
    </div>
  );
}
