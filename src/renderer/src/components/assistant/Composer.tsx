// Where you write to the assistant. Enter sends, Shift+Enter starts a new line. Photos come by
// pasting, dropping them on the box, or the paperclip (up to four, shrunk before they go up).
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { ArrowUp, ImagePlus, X } from "lucide-react";
import { IconButton, Kbd, Spin, toast } from "@/components/ui";
import { MAX_PHOTOS, photosFromFiles, shrinkDataUrl, type Photo } from "@/lib/images";
import { bridge } from "@/lib/bridge";

export function Composer({ placeholder, onSend, busy, initial, autoFocus, big }: { placeholder: string; onSend: (text: string, photos: Photo[]) => Promise<boolean | void> | void; busy?: boolean; initial?: string; autoFocus?: boolean; big?: boolean }) {
  const [text, setText] = useState(initial || "");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

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

  const addFiles = async (files: FileList | File[]) => {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return toast(`Up to ${MAX_PHOTOS} photos at a time`);
    setReading(true);
    try {
      const got = await photosFromFiles(files, room);
      if (!got.length) toast("Only pictures can be sent");
      setPhotos((p) => [...p, ...got].slice(0, MAX_PHOTOS));
    } catch (e: any) {
      toast.error(e.message || "That picture couldn't be read.");
    } finally {
      setReading(false);
    }
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

  const send = async () => {
    const t = text.trim();
    if ((!t && !photos.length) || busy || reading) return;
    const r = await onSend(t, photos);
    if (r !== false) {
      setText("");
      setPhotos([]);
    }
  };

  return (
    <div
      className={clsx("relative rounded-[16px] glass-strong transition-shadow", over ? "shadow-[inset_0_0_0_2px_var(--c-accent)]" : "hairline focus-within:shadow-[inset_0_0_0_1px_var(--c-accent),0_0_0_3px_color-mix(in_srgb,var(--c-accent)_18%,transparent)]")}
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
        {(photos.length > 0 || reading) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex gap-2 px-3 pt-3">
              {photos.map((p, i) => (
                <div key={p.id} className="group relative">
                  <img src={p.uri} alt={p.name || `Photo ${i + 1}`} className="h-16 w-16 rounded-[10px] object-cover hairline" />
                  <button type="button" aria-label="Remove the photo" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-surface text-text2 opacity-0 shadow-[var(--shadow-pop)] group-hover:opacity-100">
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
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-end gap-2 p-2.5">
        <IconButton icon={ImagePlus} label="Add photos" onClick={pick} className="mb-0.5" />
        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
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
          disabled={busy || reading || (!text.trim() && !photos.length)}
          className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[11px] accent-grad text-on-accent shadow-[var(--shadow-glow)] transition-[opacity,transform] hover:scale-[1.04] active:scale-95 disabled:scale-100 disabled:opacity-40"
          data-testid="send"
        >
          {busy ? <Spin size={16} /> : <ArrowUp size={18} strokeWidth={2.4} />}
        </button>
      </div>
      <div className="flex items-center gap-3 px-4 pb-2 text-[11px] text-text3">
        <span>
          <Kbd>↵</Kbd> send · <Kbd>⇧ ↵</Kbd> new line
        </span>
        <span className="ml-auto">Paste or drop photos</span>
      </div>
    </div>
  );
}
