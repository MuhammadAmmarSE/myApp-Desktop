// What the assistant is told about "now" with each request: your date, time and time zone, so
// "tomorrow" and "at 5" mean what you mean, and your currency, so amounts are in it.
import { isoDate } from "@myapp/core";
import { WEEKDAYS_LONG } from "@/lib/format";
import { useSettings } from "@/store/settings";
import { useOperator } from "@/store/operator";
import { api, ApiError } from "./api";
import { useVoiceServer } from "./speech";

export const requestContext = () => {
  const d = new Date();
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    tz = "";
  }
  return { today: isoDate(d), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, weekday: WEEKDAYS_LONG[d.getDay()], tz, currency: useSettings.getState().currency };
};

// your server's natural voice is on and wanted, and its assistant takes this
const liveVoice = (feature: string) => !!useOperator.getState().status?.features?.includes(feature) && useSettings.getState().naturalVoice && useVoiceServer.getState().state === "on";

// a spoken request: when the answer will be read aloud here (read), the server reads it line by
// line as it's written, in the voice you chose, instead of this computer waiting for all of it
export const spokenContext = (read: boolean) => {
  const live = read && liveVoice("speech");
  return { ...requestContext(), spoken: true, ...(live ? { speech: true, voice_id: useSettings.getState().voiceId || undefined } : {}) };
};

// a recording can go straight to the assistant (it writes it down and starts at once)
export const voiceInOn = () => liveVoice("voice_in") && useVoiceServer.getState().listen;

// A recording sent to the assistant (/operator/runs/voice for a new chat, or a chat's /voice): what
// came back, or { fallback } when this server can't take recordings (write it down and send the
// words instead), or the error to show
export async function sendSpoken<T>(path: string, audio: { base64: string; type: string }, read: boolean): Promise<{ data: T } | { fallback: true } | { error: string }> {
  const { listenLang, urduScript } = useSettings.getState();
  try {
    const data = await api<T>("POST", path, { audio: audio.base64, type: audio.type, language: listenLang === "auto" ? undefined : listenLang, script: urduScript, context: spokenContext(read) }, { timeoutMs: 60000 });
    return { data };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && e.code !== "NO_SPEECH") return { fallback: true };
    return { error: e instanceof ApiError ? e.message : "Couldn't send that." };
  }
}
