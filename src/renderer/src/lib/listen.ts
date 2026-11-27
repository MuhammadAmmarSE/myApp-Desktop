// Talking to Redline on this computer. The microphone is recorded here (sound only; the main
// process allows nothing else), it stops by itself once you've spoken and gone quiet
// (voiceActivity.ts), and your server writes down what you said with ElevenLabs Scribe, which
// understands English and Urdu. The recording goes to your server through the main process like
// every other call; the ElevenLabs key never leaves the server.
import { useEffect, useId, useRef, useState } from "react";
import { create } from "zustand";
import { api, ApiError } from "./api";
import { bridge } from "./bridge";
import { hush, listenReady } from "./speech";
import { createDetector, dbfs, meterLevel, type Detector } from "./voiceActivity";
import { useSettings } from "@/store/settings";

// several screens can hold a microphone button; only one listens at a time
let owner: string | null = null;
// who is listening or being written down right now (the talk shortcut stops that one)
export const useHearing = create<{ who: string | null }>(() => ({ who: null }));

const MIN_SEND_MS = 600; // stopped sooner than this by hand: nothing worth sending

const blockedMessage = () =>
  bridge.app.platform === "darwin"
    ? "Allow the microphone for Redline in System Settings → Privacy & Security → Microphone."
    : bridge.app.platform === "win32"
      ? "Allow the microphone for desktop apps in Windows Settings → Privacy & security → Microphone."
      : "Redline couldn't use the microphone.";

const asBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(new Error("Couldn't read the recording."));
    r.readAsDataURL(blob);
  });

type Rec = {
  stream: MediaStream;
  ctx: AudioContext;
  recorder: MediaRecorder;
  chunks: Blob[];
  type: string;
  timer: ReturnType<typeof setInterval>;
  started: number;
  detector: Detector;
  finishing: boolean;
};

const release = (r: Rec) => {
  clearInterval(r.timer);
  for (const t of r.stream.getTracks()) t.stop();
  void r.ctx.close().catch(() => {});
};

// state: "listening" while recording, "writing" while your server writes it down.
// level: 0..1 loudness of the microphone, for a meter (read it in an animation frame, not render).
// onFinal gets what you said.
export function useListen(onFinal: (text: string) => void) {
  const me = useId();
  const [state, setState] = useState<"idle" | "listening" | "writing">("idle");
  const [error, setError] = useState("");
  const level = useRef(0);
  const rec = useRef<Rec | null>(null);
  const latest = useRef(onFinal);
  useEffect(() => {
    latest.current = onFinal;
  }, [onFinal]);
  useEffect(() => {
    if (state !== "idle") useHearing.setState({ who: me });
    else if (useHearing.getState().who === me) useHearing.setState({ who: null });
  }, [state, me]);

  const finish = async (send: boolean, why?: string) => {
    const r = rec.current;
    if (!r || r.finishing) return;
    r.finishing = true;
    clearInterval(r.timer);
    const blob = await new Promise<Blob>((resolve) => {
      r.recorder.onstop = () => resolve(new Blob(r.chunks, { type: r.type }));
      try {
        r.recorder.stop();
      } catch {
        resolve(new Blob(r.chunks, { type: r.type }));
      }
    });
    release(r);
    rec.current = null;
    if (owner === me) owner = null;
    level.current = 0;
    if (why) setError(why);
    if (!send || !blob.size || Date.now() - r.started < MIN_SEND_MS) return setState("idle");
    setState("writing");
    try {
      const { listenLang, urduScript } = useSettings.getState();
      const audio = await asBase64(blob);
      const said = await api<{ text: string }>("POST", "/voice/transcribe", { audio, type: r.type.split(";")[0], language: listenLang === "auto" ? undefined : listenLang, script: urduScript }, { timeoutMs: 60000 });
      const text = String(said.text || "").trim();
      if (text) latest.current(text);
      else setError("Didn't catch that. Try again.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't write down what you said. Try again.");
    } finally {
      setState("idle");
    }
  };

  // quiet: listening for a reply nobody asked for, so silence isn't an error
  const start = async (opts: { quiet?: boolean } = {}) => {
    if (owner || rec.current || state === "writing") return;
    setError("");
    owner = me; // held while it gets ready, so two buttons can't both start
    const fail = (message: string) => {
      if (owner === me) owner = null;
      setError(message);
    };
    const ready = await listenReady();
    if (!ready.ok) return fail(ready.message);
    if ((await bridge.mic.access()) !== "granted") return fail(blockedMessage());
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e: any) {
      const name = e?.name || "";
      return fail(name === "NotFoundError" || name === "OverconstrainedError" ? "No microphone found. Plug one in and try again." : name === "NotReadableError" ? "The microphone is busy in another app." : blockedMessage());
    }
    if (owner !== me) {
      // stopped while it was getting ready
      for (const t of stream.getTracks()) t.stop();
      return;
    }
    hush(); // an answer being read aloud stops when you talk
    const type = typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    let ctx: AudioContext;
    let recorder: MediaRecorder;
    try {
      ctx = new AudioContext();
      void ctx.resume().catch(() => {});
      const meter = ctx.createAnalyser();
      meter.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(meter);
      recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 32000 });
      const samples = new Float32Array(meter.fftSize);
      const started = Date.now();
      const r: Rec = {
        stream,
        ctx,
        recorder,
        chunks: [],
        type,
        started,
        detector: createDetector(started),
        finishing: false,
        timer: setInterval(() => {
          meter.getFloatTimeDomainData(samples);
          const db = dbfs(samples);
          level.current = meterLevel(db);
          const v = r.detector.feed(db, Date.now());
          if (v === "done" || v === "longest") void finish(true);
          else if (v === "nothing") void finish(false, opts.quiet ? undefined : "Didn't hear anything. Click the microphone and talk.");
        }, 100),
      };
      recorder.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
      recorder.start(250);
      rec.current = r;
    } catch {
      for (const t of stream.getTracks()) t.stop();
      return fail("The microphone couldn't start.");
    }
    setState("listening");
  };
  // (stopped while it was still getting ready: it doesn't start)
  const stop = () => (!rec.current && owner === me ? void (owner = null) : void finish(true));
  const cancel = () => (!rec.current && owner === me ? void (owner = null) : void finish(false));

  // the screen goes while it's listening: let the microphone go, send nothing
  useEffect(
    () => () => {
      const r = rec.current;
      if (r) {
        r.finishing = true;
        try {
          r.recorder.stop();
        } catch {
          /* already stopped */
        }
        release(r);
        rec.current = null;
      }
      if (owner === me) owner = null;
      if (useHearing.getState().who === me) useHearing.setState({ who: null });
    },
    [me],
  );

  return { state, listening: state === "listening", writing: state === "writing", error, setError, level, start, stop, cancel, toggle: () => (state === "listening" ? stop() : state === "idle" ? void start() : undefined) };
}
