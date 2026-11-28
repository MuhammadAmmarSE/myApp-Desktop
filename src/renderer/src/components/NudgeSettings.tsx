// Settings → Nudges: whether Redline brings things up, which kinds, quiet hours, how many a day (four
// at most), whether they ring, and whether the assistant's own reminders are saved without asking.
// Per computer, like the rest of the settings.
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Bot, Gauge, ListFilter, Moon, Volume2, type LucideIcon } from "lucide-react";
import { NUDGE_CAP_MAX, NUDGE_CATEGORIES, NUDGE_CATEGORY_WORD, type NudgeSettings as Settings } from "@myapp/core";
import { Button, Card, Chip, Field, Segmented, Switch, TimeField } from "@/components/ui";
import { useNudges } from "@/lib/nudges";
import { navigate } from "@/lib/router";
import { useSettings } from "@/store/settings";

function Row({ title, sub, icon: Icon, children }: { title: string; sub?: React.ReactNode; icon: LucideIcon; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-3.5 last:border-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface2 text-text2 hairline">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{title}</div>
        {sub && <div className="text-[12.5px] text-text3">{sub}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

const CAPS = Array.from({ length: NUDGE_CAP_MAX }, (_, i) => String(i + 1)) as string[];

export function NudgeSettings() {
  const n = useSettings((s) => s.nudges);
  const setAll = useSettings((s) => s.set);
  const { due, later, past } = useNudges();
  const set = (patch: Partial<Settings>) => setAll({ nudges: { ...n, ...patch } });
  const waiting = due.length + later.length;
  return (
    <div data-testid="nudge-settings">
      <div className="mb-5">
        <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em]">Nudges</h2>
        <p className="mt-0.5 text-[13.5px] text-text2">Redline checks when it starts and every little while: a to-do past its day, the evening before a plan, a birthday a few days off, an open hisaab, a loan past its day, spending ahead of last month. One comes up on Today, and rings if you like.</p>
      </div>
      <Card className="mb-5">
        <Row title="Nudges and their history" sub={waiting ? `${waiting} waiting${past.length ? ` · ${past.length} in the history` : ""}` : past.length ? `${past.length} in the history` : "Nothing waiting"} icon={BellRing}>
          <Button size="sm" onClick={() => navigate("/nudges")}>
            Open
          </Button>
        </Row>
        <Row title="Bring things up" sub={n.on ? "Redline makes nudges by itself" : "Only the reminders you or the assistant set"} icon={Gauge}>
          <Switch checked={n.on} onChange={(v) => set({ on: v })} label="Bring things up" />
        </Row>
        <Row title="Ring when one comes up" sub="A notification at its time, counted in the day's limit" icon={Volume2}>
          <Switch checked={n.notify} onChange={(v) => set({ notify: v })} label="Ring when one comes up" />
        </Row>
        <Row title="At most a day" sub={n.cap === 1 ? "1 nudge" : `${n.cap} nudges`} icon={ListFilter}>
          <Segmented size="sm" value={String(n.cap)} onChange={(v) => set({ cap: Number(v) })} options={CAPS.map((c) => ({ value: c, label: c }))} />
        </Row>
        <Row title="Quiet hours" sub={n.quiet ? `Nothing comes up or rings from ${n.quiet.from} to ${n.quiet.to}; it waits till then` : "They come up whenever they're due"} icon={Moon}>
          <Switch checked={!!n.quiet} onChange={(v) => set({ quiet: v ? { from: "22:00", to: "08:00" } : null })} label="Quiet hours" />
        </Row>
        <AnimatePresence initial={false}>
          {n.quiet && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-2 gap-3 py-3">
                <Field label="From">
                  <TimeField value={n.quiet.from} onChange={(t) => t && n.quiet && t !== n.quiet.to && set({ quiet: { ...n.quiet, from: t } })} />
                </Field>
                <Field label="Until">
                  <TimeField value={n.quiet.to} onChange={(t) => t && n.quiet && t !== n.quiet.from && set({ quiet: { ...n.quiet, to: t } })} />
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <Row title="Reminders the assistant sets" sub="When you ask it to remind you, or it offers to bring something up" icon={Bot}>
          <Segmented size="sm" value={n.self ? "self" : "ask"} onChange={(v) => set({ self: v === "self" })} options={[{ value: "ask", label: "Ask me first" }, { value: "self", label: "Save by itself" }]} />
        </Row>
      </Card>
      <Card>
        <Field label="About" hint="Click one to switch it off or on.">
          <div className="flex flex-wrap gap-1.5" data-testid="nudge-categories">
            {NUDGE_CATEGORIES.map((cat) => (
              <span key={cat} title={NUDGE_CATEGORY_WORD[cat].hint}>
                <Chip active={n.categories[cat]} onClick={() => set({ categories: { ...n.categories, [cat]: !n.categories[cat] } })}>
                  {NUDGE_CATEGORY_WORD[cat].name}
                </Chip>
              </span>
            ))}
          </div>
        </Field>
        <p className="mt-3 text-[12.5px] text-text3">A nudge never holds a password or a key, and never comes up twice about the same thing.</p>
      </Card>
    </div>
  );
}
