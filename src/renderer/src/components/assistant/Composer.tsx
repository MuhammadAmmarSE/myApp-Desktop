// Where you write to the assistant. Enter sends, Shift+Enter starts a new line. Photos come by
// pasting, dropping them on the box, or the picture button (up to four, shrunk before they go up);
// files (a PDF, a Word or Excel file, anything) by dropping them or the paperclip. Or talk: the
// microphone (or the talk shortcut) listens until you go quiet and it goes out at once (straight to
// the assistant as a recording, where the page takes it: onVoice), unless "Let me check first" is
// on: then what you said waits in the box.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { ArrowUp, FileText, ImagePlus, Paperclip, X } from "lucide-react";
import { IconButton, Kbd, Spin, toast } from "@/components/ui";
import { MAX_PHOTOS, photosFromFiles, shrinkDataUrl, type Photo } from "@/lib/images";
import { bridge } from "@/lib/bridge";
import { attachmentId, attachmentsFromFiles, fileSize, MAX_FILES, MAX_TOTAL_BYTES, type Attachment } from "@/lib/attachments";
import { useOperator } from "@/store/operator";
import { useSettings } from "@/store/settings";
import { useListen, type SendRecording } from "@/lib/listen";
import { useTalkKeys, useTalkTarget } from "@/lib/talk";
import { MicButton, MicLevel } from "./Voice";

// autoListen: start listening as soon as it's shown (the talk shortcut opened it). listenNow: a
// new value listens again, quietly (your reply, after an answer was read aloud).
export function Composer({
  placeholder,
  onSend,
  busy,
  initial,
  autoFocus,
  big,
  autoListen,
  listenNow,
  onVoice,
}: {
  placeholder: string;
  onSend: (text: string, photos: Photo[], files: Attachment[], byVoice: boolean) => Promise<boolean | void> | void;
  busy?: boolean;
  initial?: string;
  autoFocus?: boolean;
  big?: boolean;
  autoListen?: boolean;
  listenNow?: number;
  onVoice?: SendRecording;
}) {
  const [text, setText] = useState(initial || "");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  // an older server ignores files: they're offered only when it says it takes them
  const filesOk = useOperator((s) => !!s.status?.features?.includes("files"));
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const autoSend = useSettings((s) => s.voiceAutoSend);
  const [spoken, setSpoken] = useState(false); // what's in the box came from the microphone
  const voice = useListen(
    (said) => {
      // "send right away": what you said goes as it is (with anything already in the box)
      if (autoSend && !busy) return void sendNow(text.trim() ? `${text.trim()} ${said}` : said, true);
      setText((t) => (t.trim() ? `${t.trim()} ${said}` : said));
      setSpoken(true);
      area.current?.focus();
    },
    { send: autoSend && onVoice && !photos.length && !files.length && !text.trim() ? onVoice : undefined },
  );
  const talkKeys = useTalkKeys();
  useTalkTarget(voice.toggle);

  useEffect(() => {
    if (autoFocus) area.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (initial) setText(initial);
  }, [initial]);
  // grow with the text, up to a point
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(big ? 260 : 200, Math.max(big ? 72 : 44, el.scrollHeight))}px`;
  }, [text, big]);

  const tooBig = (skipped: string[]) => skipped.length && toast.error(`${skipped.length === 1 ? `“${skipped[0]}” is` : `${skipped.length} files are`} too big. Files can be up to 10 MB, 20 MB together.`);
  // dropped or pasted: pictures go as photos, anything else as a file
  const addFiles = async (list: FileList | File[]) => {
    const all = Array.from(list);
    const pictures = all.filter((f) => f.type.startsWith("image/"));
    const others = all.filter((f) => !f.type.startsWith("image/"));
    setReading(true);
    try {
      if (pictures.length) {
        const room = MAX_PHOTOS - photos.length;
        if (room <= 0) toast(`Up to ${MAX_PHOTOS} photos at a time`);
        else {
          const got = await photosFromFiles(pictures, room);
          setPhotos((p) => [...p, ...got].slice(0, MAX_PHOTOS));
        }
      }
      if (others.length) {
        if (!filesOk) toast("Your server needs an update to take files: update myapp-backend on it and restart it.");
        else if (files.length >= MAX_FILES) toast(`Up to ${MAX_FILES} files at a time`);
        else {
          const got = await attachmentsFromFiles(others, MAX_FILES - files.length, MAX_TOTAL_BYTES - files.reduce((n, f) => n + f.size, 0));
          setFiles((f) => [...f, ...got.files].slice(0, MAX_FILES));
          tooBig(got.skipped);
        }
      }
    } catch (e: any) {
      toast.error(e.message || "That couldn't be read.");
    } finally {
      setReading(false);
    }
  };
  const pickFiles = async () => {
    if (!filesOk) return toast("Your server needs an update to take files: update myapp-backend on it and restart it.");
    if (files.length >= MAX_FILES) return toast(`Up to ${MAX_FILES} files at a time`);
    const got = await bridge.files.pickFiles(MAX_FILES - files.length, MAX_TOTAL_BYTES - files.reduce((n, f) => n + f.size, 0));
    setFiles((f) => [...f, ...got.files.map((x) => ({ id: attachmentId(), name: x.name, size: x.size, data: x.data }))].slice(0, MAX_FILES));
    tooBig(got.skipped);
  };
  const pick = async () => {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return toast(`Up to ${MAX_PHOTOS} photos at a time`);
    const picked = await bridge.files.pickImages(room);
    if (!picked.length) return;
    setReading(true);
    try {
      const got = await Promise.all(picked.map((p) => shrinkDataUrl(p.data, p.name)));
      setPhotos((p) => [...p, ...got].slice(0, MAX_PHOTOS));
    } finally {
      setReading(false);
    }
  };

  const send = () => sendNow(text, spoken);
  async function sendNow(said: string, byVoice: boolean) {
    const t = said.trim();
    if ((!t && !photos.length && !files.length) || busy || reading || voice.listening) return;
    const r = await onSend(t, photos, files, byVoice);
    if (r !== false) {
      setText("");
      setSpoken(false);
      setPhotos([]);
      setFiles([]);
    }
  }
  // opened by the talk shortcut: listen straight away
  const opened = useRef(false);
  useEffect(() => {
    if (!autoListen || opened.current) return;
    opened.current = true;
    void voice.start();
  }, [autoListen, voice]);
  // your turn again, after an answer was read aloud
  const lastTurn = useRef(listenNow || 0);
  useEffect(() => {
    if (!listenNow || listenNow === lastTurn.current) return;
    lastTurn.current = listenNow;
    if (voice.state === "idle" && !text.trim()) void voice.start({ quiet: true });
  }, [listenNow, voice, text]);
  // Esc while listening: stop without sending
  useEffect(() => {
    if (!voice.listening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation(); // not closing anything else as well
      voice.cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [voice]);
  const hearing = voice.state !== "idle";

  return (
    <div>
      <div
        data-testid="composer-box"
        className={clsx(
          "relative rounded-[16px] glass-strong transition-shadow",
          over ? "shadow-[inset_0_0_0_2px_var(--c-accent)]" : "hairline focus-within:shadow-[inset_0_0_0_1px_var(--c-accent),0_0_0_3px_color-mix(in_srgb,var(--c-accent)_18%,transparent)]",
        )}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <AnimatePresence initial={false}>
          {(photos.length > 0 || files.length > 0 || reading) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex gap-2 px-3 pt-3">
                {photos.map((p, i) => (
                  <div key={p.id} className="group relative">
                    <img src={p.uri} alt={p.name || `Photo ${i + 1}`} className="h-16 w-16 rounded-[10px] object-cover hairline" />
                    <button
                      type="button"
                      aria-label="Remove the photo"
                      onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-surface text-text2 opacity-0 shadow-[var(--shadow-pop)] group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {reading && (
                  <div className="grid h-16 w-16 place-items-center rounded-[10px] bg-surface2 hairline">
                    <Spin />
                  </div>
                )}
              </div>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pt-2">
                  {files.map((f) => (
                    <div key={f.id} className="group flex max-w-[260px] items-center gap-2.5 rounded-[10px] bg-surface2 py-2 pl-2.5 pr-2 hairline" data-testid="attached-file">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-accent-soft text-accent-text">
                        <FileText size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text">{f.name}</span>
                        <span className="block text-[11px] text-text3">{fileSize(f.size)}</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-text3 hover:bg-surface hover:text-text"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-end gap-2 p-2.5">
          <IconButton icon={ImagePlus} label="Add photos" onClick={pick} className="mb-0.5" disabled={hearing} />
          <IconButton icon={Paperclip} label="Attach files" onClick={() => void pickFiles()} className="mb-0.5 -ml-1.5" disabled={hearing} />
          <div className="mb-0.5 -ml-1">
            <MicButton state={voice.state} onClick={voice.toggle} size={32} shortcut={talkKeys} />
          </div>
          {hearing && (
            <div className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-[14px] text-accent-text" data-testid="hearing" aria-live="polite">
              {voice.listening ? <MicLevel level={voice.level} /> : <Spin size={14} />}
              <span className="truncate">{voice.listening ? "Listening… it sends when you stop talking" : "Writing down what you said…"}</span>
              {voice.listening && (
                <button type="button" onClick={voice.cancel} className="ml-auto shrink-0 rounded-[7px] px-2 py-0.5 text-[12px] text-text3 hover:bg-hover hover:text-text">
                  Cancel <Kbd>Esc</Kbd>
                </button>
              )}
            </div>
          )}
          <textarea
            ref={area}
            value={text}
            hidden={hearing}
            onChange={(e) => (setText(e.target.value), setSpoken(false))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            onPaste={(e) => {
              const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
              if (files.length) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            placeholder={placeholder}
            aria-label="Message to the assistant"
            data-testid="composer"
            rows={1}
            className={clsx("min-w-0 flex-1 resize-none bg-transparent py-2 leading-relaxed text-text outline-none placeholder:text-text3", big ? "text-[15px]" : "text-[14px]")}
          />
          <button
            type="button"
            aria-label="Send"
            onClick={() => void send()}
            disabled={busy || reading || hearing || (!text.trim() && !photos.length && !files.length)}
            className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[11px] accent-grad text-on-accent shadow-[var(--shadow-glow)] transition-[opacity,transform] hover:scale-[1.04] active:scale-95 disabled:scale-100 disabled:opacity-40"
            data-testid="send"
          >
            {busy ? <Spin size={16} /> : <ArrowUp size={18} strokeWidth={2.4} />}
          </button>
        </div>
        {/* how to send, and where photos and files go */}
        <div className="flex h-6 items-center gap-3 px-4 pb-2 text-[11px] text-text3">
          <span>
            <Kbd>↵</Kbd> send · <Kbd>⇧ ↵</Kbd> new line
            {talkKeys ? (
              <>
                {" "}
                · <Kbd>{talkKeys}</Kbd> talk
              </>
            ) : null}
          </span>
          <span className="ml-auto">Paste photos, or drop photos and files</span>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {voice.error && (
          <motion.p key="voice-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 text-center text-[12.5px] text-warn" role="alert" data-testid="voice-error">
            {voice.error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
