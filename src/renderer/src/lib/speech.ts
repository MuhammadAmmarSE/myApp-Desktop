// Reading answers aloud: in your ElevenLabs voice through your server when it has one (the key stays
// on the server; this computer sends it the text and gets audio back), otherwise with this
// computer's own voices. Markdown marks are taken out first so they aren't read as symbols.
import { create } from "zustand";
import { api, ApiError } from "./api";
import { useSettings } from "@/store/settings";

export interface Voice {
  id: string;
  name: string;
  category: string;
  gender: string;
  accent: string;
  age: string;
  description: string;
  preview_url: string;
}

// whether your server has the natural voice (checked now and then, not before every answer).
// listen: it can write down what you say (talking to the assistant needs it on this computer)
type VoiceServer = { state: "unknown" | "on" | "off" | "old"; listen: boolean; message: string; defaultVoice: string | null; checkedAt: number; usage: { used: number; limit: number } | null };
export const useVoiceServer = create<VoiceServer>(() => ({ state: "unknown", listen: false, message: "", defaultVoice: null, checkedAt: 0, usage: null }));
export async function loadVoiceStatus(withUsage = false) {
  try {
    const d = await api<{ listen: boolean; speak: boolean; voice_id?: string | null; message?: string; usage?: { used: number; limit: number } | null }>("GET", `/voice/status${withUsage ? "?usage=1" : ""}`, undefined, { timeoutMs: 8000 });
    useVoiceServer.setState({ state: d.speak ? "on" : "off", listen: !!d.listen, message: d.message || "", defaultVoice: d.voice_id || null, checkedAt: Date.now(), ...(withUsage ? { usage: d.usage || null } : {}) });
  } catch (e) {
    // an older server has no /voice; offline keeps what was known
    if (e instanceof ApiError && e.status === 404) useVoiceServer.setState({ state: "old", message: "Your server needs an update for the natural voice.", checkedAt: Date.now() });
  }
  return useVoiceServer.getState().state;
}
export const loadVoices = () => api<{ voices: Voice[]; default_voice_id: string | null }>("GET", "/voice/voices", undefined, { timeoutMs: 20000 });

async function natural() {
  if (!useSettings.getState().naturalVoice) return false;
  const v = useVoiceServer.getState();
  if (v.state !== "unknown" && Date.now() - v.checkedAt < 10 * 60000) return v.state === "on";
  return (await loadVoiceStatus()) === "on";
}

// whether your server can write down what you say: checked in the last ten minutes, or asked now
export async function listenReady(): Promise<{ ok: true } | { ok: false; message: string }> {
  const v = useVoiceServer.getState();
  const state = v.state !== "unknown" && Date.now() - v.checkedAt < 10 * 60000 ? v.state : await loadVoiceStatus();
  if (state === "on" && useVoiceServer.getState().listen) return { ok: true };
  if (state === "old") return { ok: false, message: "Your server needs an update before you can talk to it. Update myapp-backend on it and restart it." };
  if (state === "unknown") return { ok: false, message: "Can't reach your server right now. Talking goes through it." };
  return { ok: false, message: "Talking goes through your server's natural voice: put an ElevenLabs key (ELEVENLABS_API_KEY) in its .env and restart it." };
}

// whether something is being read aloud (for a Stop button); finished: when the last answer was
// read to its end (Stop doesn't count), so a conversation can listen for your reply
export const useSpeaking = create<{ speaking: boolean; finished: number }>(() => ({ speaking: false, finished: 0 }));

const plainWords = (text: string) =>
  String(text || "")
    .replace(/```[\s\S]*?```/g, " (code) ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/[#>*_~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

let turn = 0; // a newer answer, or Stop, wins over one still on its way
let audio: HTMLAudioElement | null = null;

const stopAudio = () => {
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  audio.pause();
  audio = null;
};

// onEnd: what comes next (the next line of an answer) instead of it being over
function play(src: string, my: number, onEnd?: (ended: boolean) => void) {
  stopAudio();
  const a = new Audio(src);
  audio = a;
  const over = (ended: boolean) => () => {
    if (audio === a) audio = null;
    if (my !== turn) return;
    if (onEnd) onEnd(ended);
    else useSpeaking.setState(ended ? { speaking: false, finished: Date.now() } : { speaking: false });
  };
  a.onended = over(true);
  a.onerror = over(false);
  useSpeaking.setState({ speaking: true });
  a.play().catch(over(false));
}

function computerVoice(plain: string, my: number) {
  const s = window.speechSynthesis;
  if (!s) return false;
  const u = new SpeechSynthesisUtterance(plain.slice(0, 4000));
  const over = (ended: boolean) => () => {
    if (my === turn) useSpeaking.setState(ended ? { speaking: false, finished: Date.now() } : { speaking: false });
  };
  u.onend = over(true);
  u.onerror = over(false);
  useSpeaking.setState({ speaking: true });
  s.speak(u);
  return true;
}

// read an answer aloud; voiceId picks a voice just this once (trying one in Settings: the page
// fetches nothing itself, so a voice is heard through your server rather than from a sample URL)
export function speak(text: string, opts: { voiceId?: string } = {}) {
  const plain = plainWords(text);
  if (!plain) return false;
  const my = ++turn;
  stopAudio();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* nothing to stop */
  }
  void (async () => {
    if (await natural()) {
      useSpeaking.setState({ speaking: true });
      try {
        const voiceId = opts.voiceId ?? useSettings.getState().voiceId;
        const r = await api<{ audio: string; type: string }>("POST", "/voice/speak", { text: plain.slice(0, 4000), voice_id: voiceId || undefined, language: /[؀-ۿ]/.test(plain) ? "ur" : undefined }, { timeoutMs: 45000 });
        if (my !== turn) return;
        return play(`data:${r.type || "audio/mpeg"};base64,${r.audio}`, my);
      } catch (e) {
        if (my !== turn) return;
        // a voice that's gone from the account: back to the server's default
        if (e instanceof ApiError && e.code === "VOICE_NOT_FOUND") useSettings.getState().set({ voiceId: "" });
      }
    }
    if (my !== turn) return;
    if (!computerVoice(plain, my)) useSpeaking.setState({ speaking: false });
  })();
  return true;
}

// ---- an answer read aloud as it's written: the server names each line as soon as it's written
// ("speech" events) and makes its audio; lines play in order, the next fetched while one plays

type Line = { n: number; clip: string; text: string };
type Queued = { text: string; clip: string; audio?: Promise<string | null> };
let lines: { my: number; got: Map<number, Queued>; next: number; busy: boolean; closed: boolean } | null = null;

const linesOver = (my: number, ended: boolean) => {
  if (my !== turn) return;
  lines = null;
  useSpeaking.setState(ended ? { speaking: false, finished: Date.now() } : { speaking: false });
};

const fetchAhead = (q: NonNullable<typeof lines>) => {
  for (const n of [q.next, q.next + 1]) {
    const item = q.got.get(n);
    if (item && !item.audio)
      item.audio = api<{ audio: string; type: string }>("GET", `/voice/clip/${encodeURIComponent(item.clip)}`, undefined, { timeoutMs: 35000 })
        .then((r) => (r.audio ? `data:${r.type || "audio/mpeg"};base64,${r.audio}` : null))
        .catch(() => null);
  }
};

function nextLine() {
  const q = lines;
  if (!q || q.busy || q.my !== turn) return;
  const item = q.got.get(q.next);
  if (!item) {
    if (q.closed) linesOver(q.my, true);
    return;
  }
  q.busy = true;
  fetchAhead(q);
  void (item.audio as Promise<string | null>).then((src) => {
    if (lines !== q || q.my !== turn) return;
    const done = (ended: boolean) => {
      if (lines !== q) return;
      if (!ended) return linesOver(q.my, false);
      q.busy = false;
      q.got.delete(q.next);
      q.next++;
      nextLine();
    };
    if (src) return play(src, q.my, done);
    // the server couldn't make this one: this computer's voice reads it
    const s = window.speechSynthesis;
    if (!s) return done(true);
    const u = new SpeechSynthesisUtterance(item.text);
    u.onend = () => done(true);
    u.onerror = () => done(true);
    s.speak(u);
  });
}

// a line of the answer being read aloud as it's written: played in order
export function speakLine(line: Line) {
  if (!lines || lines.my !== turn) {
    const my = ++turn;
    stopAudio();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* nothing to stop */
    }
    lines = { my, got: new Map(), next: line.n, busy: false, closed: false };
  }
  const q = lines;
  if (q.got.has(line.n) || line.n < q.next) return;
  q.got.set(line.n, { text: line.text, clip: line.clip });
  fetchAhead(q);
  useSpeaking.setState({ speaking: true });
  nextLine();
}

// the answer is finished: once its last line has played, it's over (and it listens for a reply)
export function linesDone() {
  const q = lines;
  if (!q || q.my !== turn) return false;
  q.closed = true;
  if (!q.busy && !q.got.size) linesOver(q.my, true);
  return true;
}

export const hush = () => {
  turn++;
  lines = null;
  stopAudio();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* nothing to stop */
  }
  useSpeaking.setState({ speaking: false });
};
