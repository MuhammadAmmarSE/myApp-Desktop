// Settings: how Redline looks (six themes, the background, motion, density, text size), you (your
// name, your currency), reminders (notifications, quiet hours), how it starts (at login, in the
// tray, the Quick capture shortcut), the assistant (on or off, what it's connected to), your
// account and the devices signed in, your data (sync, export, import), and about.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  AudioLines,
  Bell,
  Bot,
  Brain,
  Check,
  CircleAlert,
  CircleCheck,
  Cloud,
  Database,
  Download,
  Gauge,
  HardDriveDownload,
  Info,
  Keyboard,
  Laptop,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Play,
  Power,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Sun,
  Upload,
  User as UserIcon,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { hush, loadVoices, loadVoiceStatus, speak, useSpeaking, useVoiceServer, type Voice } from "@/lib/speech";
import { CURRENCIES, THEMES, type Theme } from "@myapp/core";
import type { AppInfo, Prefs } from "@shared/ipc";
import { Button, Card, confirmDialog, Field, Input, Kbd, Segmented, Select, Switch, Tag, TimeField, toast } from "@/components/ui";
import { BrandMark } from "@/components/shell/BrandMark";
import { WALLPAPERS, wallpaperUrl } from "@/components/shell/Background";
import { useSettings, type Background } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { useOperator, type Connection } from "@/store/operator";
import { syncNow, useSync } from "@/store/sync";
import { useList, useRecords } from "@/store/records";
import { useUI } from "@/store/ui";
import { api } from "@/lib/api";
import { bridge, isMac } from "@/lib/bridge";
import { describeAccelerator, toAccelerator } from "@/lib/accelerator";
import { useGpu } from "@/lib/effects";
import { exportAll, importRecords, readBackup } from "@/lib/exporter";
import { setQuery, useQuery } from "@/lib/router";
import { ago, plural } from "@/lib/format";
import { rise } from "@/theme/motion";

type SectionId = "appearance" | "you" | "reminders" | "startup" | "assistant" | "memory" | "account" | "data" | "about";
const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "you", label: "You", icon: UserIcon },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "startup", label: "Startup & shortcut", icon: Power },
  { id: "assistant", label: "Assistant", icon: Bot },
  { id: "memory", label: "What it remembers", icon: Brain },
  { id: "account", label: "Account & devices", icon: ShieldCheck },
  { id: "data", label: "Your data", icon: Database },
  { id: "about", label: "About", icon: Info },
];

function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    void bridge.prefs.get().then(setPrefs);
    return bridge.on("prefs", setPrefs);
  }, []);
  const change = async (patch: Partial<Prefs>) => {
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    const r = await bridge.prefs.set(patch);
    setPrefs(r.prefs);
    if (r.error) toast.error(r.error);
    return !r.error;
  };
  return { prefs, change };
}

export default function Settings() {
  const q = useQuery();
  const section: SectionId = (SECTIONS.find((s) => s.id === q.get("section"))?.id as SectionId) || "appearance";
  return (
    <div className="flex h-full" data-testid="settings">
      <aside className="w-[232px] shrink-0 border-r border-line px-3 py-6">
        <h1 className="mb-3 px-2.5 font-display text-[22px] font-semibold tracking-[-0.02em]">Settings</h1>
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => setQuery({ section: s.id === "appearance" ? null : s.id })} aria-current={section === s.id ? "page" : undefined} data-section={s.id} className={clsx("relative flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] transition-colors", section === s.id ? "font-medium text-accent-text" : "text-text2 hover:bg-hover hover:text-text")}>
              {section === s.id && <motion.span layoutId="settings-pill" className="absolute inset-0 rounded-[9px] bg-accent-soft" transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }} />}
              <s.icon size={16} className="relative" />
              <span className="relative">{s.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto px-10 pb-16 pt-6">
        <div className="mx-auto max-w-[820px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {section === "appearance" && <Appearance />}
              {section === "you" && <You />}
              {section === "reminders" && <Reminders />}
              {section === "startup" && <Startup />}
              {section === "assistant" && <AssistantSettings />}
              {section === "memory" && <Memory />}
              {section === "account" && <Account />}
              {section === "data" && <Data />}
              {section === "about" && <About />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

const Title = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="mb-5">
    <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em]">{title}</h2>
    {sub && <p className="mt-0.5 text-[13.5px] text-text2">{sub}</p>}
  </div>
);
function Row({ title, sub, children, icon: Icon }: { title: string; sub?: React.ReactNode; children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-3.5 last:border-0">
      {Icon && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface2 text-text2 hairline">
          <Icon size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{title}</div>
        {sub && <div className="text-[12.5px] text-text3">{sub}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ---------------- appearance ----------------
function ThemeCard({ t, on, onPick }: { t: Theme; on: boolean; onPick: () => void }) {
  const c = t.colors;
  return (
    <button type="button" onClick={onPick} aria-pressed={on} data-theme-card={t.id} className={clsx("group relative block w-full overflow-hidden rounded-[14px] text-left transition-transform hover:-translate-y-0.5", on ? "shadow-[0_0_0_2px_var(--c-accent),var(--shadow-glow)]" : "hairline")}>
      <div className="relative h-[92px] p-3" style={{ background: `radial-gradient(120% 90% at 100% 0%, ${c.bg2}, ${c.bg})` }}>
        <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-60 blur-2xl" style={{ background: c.accent }} />
        <div className="relative flex gap-1.5">
          <div className="h-14 w-10 rounded-[6px]" style={{ background: c.surface, boxShadow: `inset 0 0 0 1px ${c.line}` }} />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-3/4 rounded-full" style={{ background: c.text, opacity: 0.85 }} />
            <div className="h-2 w-1/2 rounded-full" style={{ background: c.text2, opacity: 0.6 }} />
            <div className="mt-auto flex gap-1">
              <div className="h-4 w-10 rounded-[5px]" style={{ background: `linear-gradient(135deg, ${c.accent}, ${c.accent2})` }} />
              <div className="h-4 w-6 rounded-[5px]" style={{ background: c.surface2, boxShadow: `inset 0 0 0 1px ${c.line}` }} />
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-surface px-3 py-2">
        <span className="h-3 w-3 rounded-full" style={{ background: c.accent }} />
        <span className="flex-1 text-[13px] font-medium">{t.name}</span>
        {t.mode === "light" ? <Sun size={13} className="text-text3" /> : <Moon size={13} className="text-text3" />}
        {on && <Check size={14} className="text-accent-text" />}
      </div>
    </button>
  );
}

// what the Effects setting means right now, in words
function effectsSub(effects: "auto" | "full" | "light", gpu: "hardware" | "software") {
  if (effects === "light") return "No blur behind the glass and still wallpapers: smoother on slower computers";
  if (effects === "full") return "Blur behind the glass and wallpapers that move with the pointer";
  return gpu === "software" ? "Auto: light, because this computer is drawing without its graphics card" : "Auto: full, the graphics card is drawing";
}

function Appearance() {
  const s = useSettings();
  const gpu = useGpu();
  const { prefs, change } = usePrefs();
  const backs: { id: Background; name: string }[] = [{ id: "aurora", name: "Aurora" }, ...WALLPAPERS.map((w) => ({ id: w.id as Background, name: w.name })), { id: "none", name: "Plain" }];
  return (
    <>
      <Title title="Appearance" sub="The same six themes as the phone. Changes show straight away." />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3">
        {THEMES.map((t, i) => (
          <motion.div key={t.id} {...rise(i)}>
            <ThemeCard t={t} on={s.themeId === t.id} onPick={() => s.set({ themeId: t.id })} />
          </motion.div>
        ))}
      </div>
      <div className="mb-2 text-[13px] font-semibold">Background</div>
      <div className="mb-8 grid grid-cols-3 gap-3 md:grid-cols-6">
        {backs.map((b) => {
          const on = s.background === b.id;
          const img = b.id !== "aurora" && b.id !== "none" ? wallpaperUrl(b.id, s.themeId, "back") : null;
          return (
            <button key={b.id} type="button" onClick={() => s.set({ background: b.id })} aria-pressed={on} data-bg={b.id} className={clsx("block w-full overflow-hidden rounded-[12px] text-left transition-transform hover:-translate-y-0.5", on ? "shadow-[0_0_0_2px_var(--c-accent)]" : "hairline")}>
              <div className="relative h-16 overflow-hidden bg-bg">
                {img ? (
                  <img src={img} alt="" className="h-full w-full object-cover" />
                ) : b.id === "aurora" ? (
                  <div className="h-full w-full" style={{ background: "radial-gradient(60% 80% at 20% 20%, var(--au1), transparent), radial-gradient(60% 80% at 80% 30%, var(--au2), transparent), radial-gradient(70% 70% at 50% 100%, var(--au3), transparent), var(--c-bg)" }} />
                ) : (
                  <div className="h-full w-full bg-bg" />
                )}
              </div>
              <div className="flex items-center justify-between bg-surface px-2.5 py-1.5 text-[12px] font-medium">
                {b.name}
                {on && <Check size={13} className="text-accent-text" />}
              </div>
            </button>
          );
        })}
      </div>
      <Card>
        <Row title="Motion" sub="Calm takes out the movement that isn't needed" icon={Sparkles}>
          <Segmented size="sm" value={s.motion} onChange={(v) => s.set({ motion: v })} options={[{ value: "full", label: "Full" }, { value: "reduced", label: "Calm" }]} />
        </Row>
        <Row title="Effects" sub={effectsSub(s.effects, gpu)} icon={Gauge}>
          <div data-testid="effects" data-gpu={gpu}>
            <Segmented size="sm" value={s.effects} onChange={(v) => s.set({ effects: v })} options={[{ value: "auto", label: "Auto" }, { value: "full", label: "Full" }, { value: "light", label: "Light" }]} />
          </div>
        </Row>
        <Row title="Density" sub="How much fits in lists" icon={Monitor}>
          <Segmented size="sm" value={s.density} onChange={(v) => s.set({ density: v })} options={[{ value: "comfortable", label: "Roomy" }, { value: "compact", label: "Compact" }]} />
        </Row>
        <Row title="Sidebar" sub="Names and icons, or icons only" icon={Laptop}>
          <Segmented size="sm" value={s.sidebar} onChange={(v) => s.set({ sidebar: v })} options={[{ value: "full", label: "Full" }, { value: "icons", label: "Icons" }]} />
        </Row>
        <Row title="Text size" sub={`${Math.round((prefs?.zoom || 1) * 100)}% · ${isMac() ? "⌘" : "Ctrl"} + and − change it anywhere`} icon={Monitor}>
          <div className="flex items-center gap-1">
            {[0.9, 1, 1.1, 1.2].map((z) => (
              <Button key={z} size="sm" variant={Math.abs((prefs?.zoom || 1) - z) < 0.01 ? "primary" : "ghost"} onClick={() => (change({ zoom: z }), bridge.win.setZoom(z))}>
                {Math.round(z * 100)}%
              </Button>
            ))}
          </div>
        </Row>
        <Row title="Weeks start on" icon={Sun}>
          <Segmented size="sm" value={String(s.weekStart) as "0" | "1"} onChange={(v) => s.set({ weekStart: Number(v) as 0 | 1 })} options={[{ value: "1", label: "Monday" }, { value: "0", label: "Sunday" }]} />
        </Row>
      </Card>
    </>
  );
}

// ---------------- you ----------------
function You() {
  const s = useSettings();
  const user = useAuth((x) => x.user);
  const [name, setName] = useState(s.name || user?.name || "");
  return (
    <>
      <Title title="You" sub="How Redline greets you, and the money it adds up." />
      <Card>
        <Field label="What to call you" hint="On Today's greeting">
          <Input value={name} onChange={setName} onBlur={() => s.set({ name: name.trim() })} placeholder={user?.name || "Your name"} />
        </Field>
        <div className="mt-4">
          <Field label="Your currency" hint="Money is added up in it; entries in other currencies are listed but not mixed in">
            <Select<string> value={s.currency} onChange={(v) => s.set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Field>
        </div>
      </Card>
    </>
  );
}

// ---------------- reminders ----------------
function Reminders() {
  const { prefs, change } = usePrefs();
  if (!prefs) return null;
  return (
    <>
      <Title title="Reminders" sub="Reminders, birthdays, papers and warranties ring here as notifications — even with the window closed, while Redline is in the tray." />
      <Card>
        <Row title="Show notifications" sub="From Redline, on this computer" icon={Bell}>
          <Switch checked={prefs.notifications} onChange={(v) => void change({ notifications: v })} label="Show notifications" />
        </Row>
        <Row title="Quiet hours" sub={prefs.quietHours ? `Held from ${prefs.quietFrom} to ${prefs.quietTo}, then shown` : "Reminders ring whenever they're due"} icon={Moon}>
          <Switch checked={prefs.quietHours} onChange={(v) => void change({ quietHours: v })} label="Quiet hours" />
        </Row>
        <AnimatePresence initial={false}>
          {prefs.quietHours && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-2 gap-3 py-3">
                <Field label="From">
                  <TimeField value={prefs.quietFrom} onChange={(t) => t && void change({ quietFrom: t })} />
                </Field>
                <Field label="Until">
                  <TimeField value={prefs.quietTo} onChange={(t) => t && void change({ quietTo: t })} />
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <Row title="Try it" sub="Shows a notification now, so you can see how they look" icon={Sparkles}>
          <Button size="sm" onClick={async () => ((await bridge.reminders.test()) ? toast.success("Sent") : toast.error("Notifications can't be shown on this computer"))}>
            Send a test
          </Button>
        </Row>
      </Card>
    </>
  );
}

// ---------------- startup & shortcut ----------------
function Startup() {
  const { prefs, change } = usePrefs();
  const [recording, setRecording] = useState(false);
  const mac = isMac();
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRecording(false);
      const acc = toAccelerator(e, mac);
      if (!acc) return;
      setRecording(false);
      void change({ quickShortcut: acc }).then((ok) => ok && toast.success(`Quick capture: ${describeAccelerator(acc, mac)}`));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);
  if (!prefs) return null;
  return (
    <>
      <Title title="Startup & shortcut" sub="Keep Redline running in the tray so reminders ring and Quick capture is a keystroke away." />
      <Card>
        <Row title="Open at login" sub="Starts when you sign in to this computer" icon={Power}>
          <Switch checked={prefs.startAtLogin} onChange={(v) => void change({ startAtLogin: v })} label="Open at login" />
        </Row>
        <Row title="Start in the tray" sub="At login, without opening the window" icon={Laptop}>
          <Switch checked={prefs.startHidden} disabled={!prefs.startAtLogin} onChange={(v) => void change({ startHidden: v })} label="Start in the tray" />
        </Row>
        <Row title="Closing keeps it in the tray" sub="So reminders still ring. Quit from the tray or the menu." icon={Monitor}>
          <Switch checked={prefs.closeToTray} onChange={(v) => void change({ closeToTray: v })} label="Close to the tray" />
        </Row>
        <Row title="Quick capture, from any app" sub={recording ? "Press the keys you want — Esc to keep the old ones" : "A small window to tell Redline something without leaving what you're doing"} icon={Keyboard}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setRecording(true)} className={clsx("h-8 min-w-[150px] rounded-[9px] px-3 text-[13px] font-medium transition-shadow", recording ? "animate-pulse bg-accent-soft text-accent-text shadow-[inset_0_0_0_1px_var(--c-accent)]" : "bg-surface2 hairline hover:bg-hover")} data-testid="shortcut">
              {recording ? "Press keys…" : describeAccelerator(prefs.quickShortcut, mac)}
            </button>
            <Button size="sm" variant="ghost" onClick={() => bridge.quick.open()}>
              Try it
            </Button>
          </div>
        </Row>
      </Card>
      <Button className="mt-4" variant="ghost" icon={Keyboard} onClick={() => useUI.getState().setShortcuts(true)}>
        Every keyboard shortcut
      </Button>
    </>
  );
}

// ---------------- the assistant ----------------
const CONN: { key: "server" | "deepseek" | "elevenlabs" | "github" | "godaddy" | "claude" | "firebase"; label: string; what: string }[] = [
  { key: "server", label: "Server", what: "Runs commands on your server" },
  { key: "deepseek", label: "DeepSeek", what: "The AI that plans each step" },
  { key: "elevenlabs", label: "ElevenLabs", what: "The voice that reads answers" },
  { key: "github", label: "GitHub", what: "Repos, issues, secrets" },
  { key: "claude", label: "Claude Code", what: "Coding work in your repos" },
  { key: "firebase", label: "Firebase", what: "Hosting and projects" },
  { key: "godaddy", label: "DNS", what: "Domain records (GoDaddy)" },
];
// what the assistant keeps in mind about you: it proposes these in a chat (kept only if you save
// them); here you read them, add your own, change one, or forget it
function Memory() {
  const all = useList("memory");
  const list = useMemo(() => all.slice().sort((a, b) => b.updated_at - a.updated_at), [all]);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!text.trim()) return;
    useRecords.getState().create("memory", { text: text.trim(), topic: topic.trim() || undefined });
    setText("");
    setTopic("");
    toast.success("It will keep that in mind");
  };
  const save = (id: string) => {
    if (draft.trim()) useRecords.getState().update<"memory">(id, { text: draft.trim() });
    setEditing(null);
  };
  const forget = (id: string) => {
    const rec = useRecords.getState().byId[id];
    if (!rec) return;
    useRecords.getState().remove(id);
    toast.undo("Forgotten", () => useRecords.getState().restore(rec));
  };
  return (
    <>
      <Title title="What it remembers" sub="The assistant keeps these in mind when it answers you. Tell it about yourself in a chat and it offers to remember; or add something here." />
      <Card className="mb-5" data-testid="memory-add">
        <div className="flex flex-col gap-2.5">
          <Input value={text} onChange={setText} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="e.g. I work from home on Fridays" aria-label="Something to remember" />
          <div className="flex gap-2">
            <div className="flex-1">
              <Input value={topic} onChange={setTopic} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="About: work, family, food… (optional)" aria-label="About" />
            </div>
            <Button variant="primary" onClick={add} disabled={!text.trim()}>
              Remember
            </Button>
          </div>
        </div>
      </Card>
      {list.length ? (
        <Card>
          {list.map((m) => (
            <div key={m.id} className="group flex items-center gap-3 border-b border-line py-3 last:border-0" data-memory={m.id}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface2 text-text2 hairline">
                <Brain size={16} />
              </span>
              <div className="min-w-0 flex-1">
                {editing === m.id ? (
                  <Input value={draft} onChange={setDraft} autoFocus onKeyDown={(e) => (e.key === "Enter" ? save(m.id) : e.key === "Escape" ? setEditing(null) : undefined)} onBlur={() => save(m.id)} aria-label="What it remembers" />
                ) : (
                  <button type="button" className="block w-full text-left" onClick={() => (setEditing(m.id), setDraft(m.data.text))}>
                    <div className="text-[13.5px]">{m.data.text}</div>
                    {m.data.topic && <div className="text-[12px] text-text3">About {m.data.topic}</div>}
                  </button>
                )}
              </div>
              <Button size="xs" variant="ghost" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => forget(m.id)}>
                Forget
              </Button>
            </div>
          ))}
        </Card>
      ) : (
        <div className="text-[13px] text-text3">Nothing yet.</div>
      )}
    </>
  );
}

// the natural voice on your server (ElevenLabs): on or off here, which voice, and hearing it
function VoiceRows() {
  const voice = useVoiceServer();
  const naturalVoice = useSettings((s) => s.naturalVoice);
  const voiceId = useSettings((s) => s.voiceId);
  const set = useSettings((s) => s.set);
  const speaking = useSpeaking((s) => s.speaking);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [voicesError, setVoicesError] = useState("");
  useEffect(() => {
    void loadVoiceStatus(true);
  }, []);
  const on = voice.state === "on";
  useEffect(() => {
    if (!on || !naturalVoice || voices) return;
    loadVoices()
      .then((d) => setVoices(d.voices))
      .catch((e) => setVoicesError(e?.message || "Couldn't load the voices."));
  }, [on, naturalVoice, voices]);
  useEffect(() => () => hush(), []);
  const left = voice.usage && voice.usage.limit ? Math.max(0, voice.usage.limit - voice.usage.used) : null;
  const chosen = voiceId || voice.defaultVoice || "";
  return (
    <>
      <Row
        title="Natural voice"
        sub={
          on
            ? left !== null
              ? `ElevenLabs on your server · ${left.toLocaleString("en-US")} characters left this month`
              : "ElevenLabs on your server"
            : voice.state === "unknown"
              ? "Checking your server…"
              : voice.message || "Not set up on your server (ELEVENLABS_API_KEY)"
        }
        icon={AudioLines}
      >
        <Switch checked={on && naturalVoice} disabled={!on} onChange={(v) => set({ naturalVoice: v })} label="Natural voice" />
      </Row>
      {on && naturalVoice ? (
        <Row title="The voice" sub={voicesError || "Reads answers on this computer"} icon={Volume2}>
          <div className="flex items-center gap-2">
            {voices ? (
              <Select
                value={chosen}
                onChange={(v) => set({ voiceId: v === voice.defaultVoice ? "" : v })}
                options={voices.map((v) => ({ value: v.id, label: v.id === voice.defaultVoice ? `${v.name} (server's default)` : v.name, hint: [v.gender, v.accent].filter(Boolean).join(" · ") }))}
                size="sm"
                width={220}
                label="The voice"
              />
            ) : null}
            <Button size="sm" variant="ghost" icon={speaking ? Square : Play} onClick={() => (speaking ? hush() : speak("Hi! This is how I'll read your answers. Aap Urdu mein bhi baat kar sakte hain.", { voiceId: chosen }))}>
              {speaking ? "Stop" : "Hear it"}
            </Button>
          </div>
        </Row>
      ) : null}
    </>
  );
}

function AssistantSettings() {
  const op = useOperator();
  const voice = useVoiceServer();
  const naturalVoice = useSettings((s) => s.naturalVoice);
  const readAloud = useSettings((s) => s.readAloud);
  const set = useSettings((s) => s.set);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void op.loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const conns = op.status?.connections;
  return (
    <>
      <Title title="Assistant" sub="The AI on your server that does things for you. Risky steps always wait for your yes." />
      <Card className="mb-5">
        <Row title="Let it take tasks" sub={op.availability === "ready" ? "On" : op.availability === "paused" ? "You switched it off" : op.message || "Not available on your server"} icon={Bot}>
          <Switch
            checked={op.availability === "ready"}
            disabled={busy || !(op.availability === "ready" || op.availability === "paused")}
            onChange={async (v) => {
              setBusy(true);
              try {
                await op.setEnabled(v);
              } catch (e: any) {
                toast.error(e.message || "Couldn't change that.");
              } finally {
                setBusy(false);
              }
            }}
            label="Let it take tasks"
          />
        </Row>
        <Row title="Read answers aloud" sub={voice.state === "on" && naturalVoice ? "In your ElevenLabs voice" : "With this computer's voice"} icon={Sparkles}>
          <Switch checked={readAloud} onChange={(v) => set({ readAloud: v })} label="Read answers aloud" />
        </Row>
        <VoiceRows />
        <Row title="Approving a step" sub={isMac() ? "Touch ID, or your password" : "Your account password, checked by your server"} icon={ShieldCheck}>
          <Tag tone="success">Always asked</Tag>
        </Row>
        {op.status && (
          <Row title="Time to answer" sub="A question nobody answers in time is treated as no" icon={Bell}>
            <span className="text-[13px] text-text2">{op.status.approval_minutes} min</span>
          </Row>
        )}
      </Card>
      <div className="mb-2 flex items-center">
        <span className="mr-auto text-[13px] font-semibold">Connections</span>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void op.loadStatus(true)}>
          Check again
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {CONN.map((c) => {
          const x: Connection | undefined = conns?.[c.key];
          return (
            <div key={c.key} className="flex items-start gap-3 rounded-[12px] p-3 glass hairline">
              {x ? x.ok ? <CircleCheck size={18} className="mt-0.5 text-success" /> : <CircleAlert size={18} className="mt-0.5 text-warn" /> : <CircleAlert size={18} className="mt-0.5 text-text3" />}
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium">{c.label}</div>
                <div className="text-[12px] text-text3">{x?.message || c.what}</div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[12.5px] text-text3">Keys for these live only in your server's .env — never in this app. The steps are in docs/OPERATOR.md of myapp-backend.</p>
    </>
  );
}

// ---------------- account & devices ----------------
type Device = { id: number; name: string; platform: string; created_at: number; last_seen_at: number; current: boolean };
function Account() {
  const auth = useAuth();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const load = async () => {
    try {
      const r = await api<{ devices: Device[] }>("GET", "/auth/devices");
      setDevices(r.devices);
    } catch {
      setDevices([]);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const signOutDevice = async (d: Device) => {
    if (!(await confirmDialog({ title: `Sign out ${d.name || "that device"}?`, body: "It will have to sign in again to see your things.", confirm: "Sign out", danger: true }))) return;
    try {
      await api("POST", `/auth/devices/${d.id}/sign-out`, {});
      toast.success("Signed out");
      void load();
    } catch (e: any) {
      toast.error(e.message || "Couldn't sign it out.");
    }
  };
  return (
    <>
      <Title title="Account & devices" />
      <Card className="mb-5">
        <Row title={auth.user?.name || "Signed in"} sub={auth.user?.email} icon={UserIcon}>
          <Button
            icon={LogOut}
            onClick={async () => {
              if (await confirmDialog({ title: "Sign out of this computer?", body: "What's here is kept on your server; changes not yet sent are sent first.", confirm: "Sign out" })) {
                await syncNow();
                await auth.signOut();
              }
            }}
          >
            Sign out
          </Button>
        </Row>
        <Row title="Server" sub={auth.server} icon={Cloud}>
          <span />
        </Row>
        <Row title="How you stay signed in" sub={auth.storage === "encrypted" ? "In this computer's encrypted key store" : "In a file only your account on this computer can read (no encrypted store here)"} icon={ShieldCheck}>
          <Tag tone={auth.storage === "encrypted" ? "success" : "warn"}>{auth.storage === "encrypted" ? "Encrypted" : "File"}</Tag>
        </Row>
      </Card>
      <div className="mb-2 text-[13px] font-semibold">Signed in on</div>
      <Card pad={false}>
        {devices === null ? (
          <div className="p-4 text-[13px] text-text3">Looking…</div>
        ) : devices.length ? (
          devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              {/android|ios|phone/i.test(d.platform) ? <Smartphone size={17} className="text-text3" /> : <Laptop size={17} className="text-text3" />}
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium">
                  {d.name || d.platform} {d.current && <Tag tone="accent">This computer</Tag>}
                </div>
                <div className="text-[12px] text-text3">
                  Last seen {ago(d.last_seen_at)} · signed in {ago(d.created_at)}
                </div>
              </div>
              {!d.current && (
                <Button size="sm" variant="ghost" onClick={() => void signOutDevice(d)}>
                  Sign out
                </Button>
              )}
            </div>
          ))
        ) : (
          <div className="p-4 text-[13px] text-text3">Couldn't load the list.</div>
        )}
      </Card>
    </>
  );
}

// ---------------- your data ----------------
function Data() {
  const sync = useSync();
  const dirty = useRecords((s) => s.dirtyCount);
  const counts = useRecords((s) => s.lists);
  const total = useMemo(() => Object.values(counts).reduce((n, l) => n + l.length, 0), [counts]);
  const lastSync = Number(useRecords((s) => s.meta.last_sync) || 0) || sync.lastAt;
  const doImport = async () => {
    const f = await bridge.files.openText({ filters: [{ name: "Redline backup", extensions: ["json"] }] });
    if (!f) return;
    const b = readBackup(f.text);
    if (b.error) return toast.error(b.error);
    if (!(await confirmDialog({ title: `Import ${plural(b.records.length, "record")}?`, body: "Records newer than the ones here are taken and sent to your server; older ones are skipped. Nothing is deleted.", confirm: "Import" }))) return;
    const r = importRecords(b.records);
    toast.success(`${r.added} added, ${r.updated} updated, ${r.skipped} skipped`);
    void syncNow();
  };
  return (
    <>
      <Title title="Your data" sub="Kept on this computer and on your server, in step with your phone." />
      <Card className="mb-5">
        <Row title={sync.syncing ? "Syncing…" : sync.offline ? "Offline" : sync.error ? "Couldn't sync" : "In sync"} sub={sync.error || (lastSync ? `Last synced ${ago(lastSync)}${dirty ? ` · ${plural(dirty, "change")} waiting` : ""}` : "Not synced yet")} icon={Cloud}>
          <Button icon={RefreshCw} loading={sync.syncing} onClick={() => void syncNow()} kbd={`${isMac() ? "⌘" : "Ctrl"} R`}>
            Sync now
          </Button>
        </Row>
        <Row title="On this computer" sub={`${plural(total, "thing")}: ${counts.todo.length} to-dos, ${counts.note.length} notes, ${counts.money.length} money entries…`} icon={HardDriveDownload}>
          <span />
        </Row>
      </Card>
      <Card>
        <Row title="Export everything" sub="A JSON file of all your records, to keep or to move" icon={Download}>
          <Button icon={Download} onClick={() => void exportAll()}>
            Export
          </Button>
        </Row>
        <Row title="Import a backup" sub="Reads an export back in; newer records win, nothing is deleted" icon={Upload}>
          <Button icon={Upload} onClick={() => void doImport()}>
            Import
          </Button>
        </Row>
      </Card>
    </>
  );
}

// ---------------- about ----------------
function About() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void bridge.app.info().then(setInfo);
  }, []);
  return (
    <>
      <Title title="About" />
      <Card strong className="mb-5 flex items-center gap-5">
        <BrandMark size={64} />
        <div>
          <div className="font-display text-[24px] font-semibold tracking-[-0.02em]">Redline</div>
          <div className="text-[13px] text-text2">Your day, your money, your people — and an assistant for your server.</div>
          {info && (
            <div className="mt-1 text-[12px] text-text3">
              Version {info.version} · Electron {info.electron} · {info.platform} {info.arch}
            </div>
          )}
        </div>
      </Card>
      <Card>
        <Row title="Keyboard shortcuts" sub="Every one in one place" icon={Keyboard}>
          <Button size="sm" onClick={() => useUI.getState().setShortcuts(true)}>
            Show <Kbd>{isMac() ? "⌘" : "Ctrl"} /</Kbd>
          </Button>
        </Row>
        <Row title="Your phone" sub="The same account on the Redline Android app keeps everything in step" icon={Smartphone}>
          <span />
        </Row>
      </Card>
    </>
  );
}
