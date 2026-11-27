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

// whether your server has the natural voice (checked now and then, not before every answer)
type VoiceServer = { state: "unknown" | "on" | "off" | "old"; message: string; defaultVoice: string | null; checkedAt: number; usage: { used: number; limit: number } | null };
export const useVoiceServer = create<VoiceServer>(() => ({ state: "unknown", message: "", defaultVoice: null, checkedAt: 0, usage: null }));
export async function loadVoiceStatus(withUsage = false) {
  try {
    const d = await api<{ listen: boolean; speak: boolean; voice_id?: string | null; message?: string; usage?: { used: number; limit: number } | null }>("GET", `/voice/status${withUsage ? "?usage=1" : ""}`, undefined, { timeoutMs: 8000 });
    useVoiceServer.setState({ state: d.speak ? "on" : "off", message: d.message || "", defaultVoice: d.voice_id || null, checkedAt: Date.now(), ...(withUsage ? { usage: d.usage || null } : {}) });
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

// whether something is being read aloud (for a Stop button)
export const useSpeaking = create<{ speaking: boolean }>(() => ({ speaking: false }));

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

function play(src: string, my: number) {
  stopAudio();
  const a = new Audio(src);
  audio = a;
  const over = () => {
    if (audio === a) audio = null;
    if (my === turn) useSpeaking.setState({ speaking: false });
  };
  a.onended = over;
  a.onerror = over;
  useSpeaking.setState({ speaking: true });
  a.play().catch(over);
}

function computerVoice(plain: string, my: number) {
  const s = window.speechSynthesis;
  if (!s) return false;
  const u = new SpeechSynthesisUtterance(plain.slice(0, 4000));
  const over = () => {
    if (my === turn) useSpeaking.setState({ speaking: false });
  };
  u.onend = over;
  u.onerror = over;
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

export const hush = () => {
  turn++;
  stopAudio();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* nothing to stop */
  }
  useSpeaking.setState({ speaking: false });
};
