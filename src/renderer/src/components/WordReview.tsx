// Going over words, one card at a time: Space (or a click) shows the meaning, → if you knew it, ←
// if you didn't. A word you knew comes back later each time; one you missed comes round again at
// the end of this go, and tomorrow. The words are taken once when it opens, so answering doesn't
// reshuffle them.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Check, PartyPopper, RotateCcw, X } from "lucide-react";
import { dueWords, isoDate, reviewWord, type Rec } from "@myapp/core";
import { Button, Dialog, Empty, Kbd } from "@/components/ui";
import { useRecords } from "@/store/records";
import { ease } from "@/theme/motion";
import { useReduced } from "@/theme";

function Session({ interestId, onClose }: { interestId: string | null; onClose: () => void }) {
  const reduced = useReduced();
  const today = isoDate();
  const [queue, setQueue] = useState<string[]>(() => dueWords(useRecords.getState().lists.word as Rec<"word">[], today, interestId).map((w) => w.id));
  const [missedOnce, setMissedOnce] = useState<string[]>([]);
  const [shown, setShown] = useState(false);
  const [tally, setTally] = useState({ knew: 0, missed: 0 });
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const word = useRecords((s) => (queue[0] ? (s.byId[queue[0]] as Rec<"word"> | undefined) : undefined));
  const total = tally.knew + tally.missed + queue.length;
  const gone = tally.knew + tally.missed;

  const answer = (knew: boolean) => {
    if (!word || leaving) return;
    useRecords.getState().update<"word">(word.id, reviewWord(word.data, knew, today));
    setTally((t) => (knew ? { ...t, knew: t.knew + 1 } : { ...t, missed: t.missed + 1 }));
    // a missed word comes round once more at the end of this go
    const again = !knew && !missedOnce.includes(word.id);
    if (again) setMissedOnce((m) => [...m, word.id]);
    setLeaving(knew ? 1 : -1);
    setTimeout(
      () => {
        setQueue((q) => (again ? [...q.slice(1), q[0]] : q.slice(1)));
        setShown(false);
        setLeaving(0);
      },
      reduced ? 0 : 160,
    );
  };

  // the dialog's own keys (a page's keys are off while it's open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!word) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!shown) setShown(true);
        else if (e.key === "Enter") answer(true);
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "k") {
        e.preventDefault();
        answer(true);
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "j") {
        e.preventDefault();
        answer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!word)
    return (
      <div className="px-6 py-8" data-testid="review-done">
        {gone ? (
          <Empty
            icon={PartyPopper}
            title="All done"
            body={`You went over ${gone} word${gone === 1 ? "" : "s"}: knew ${tally.knew}${tally.missed ? `, missed ${tally.missed} (they come back tomorrow)` : ""}.`}
            action={<Button onClick={onClose}>Close</Button>}
          />
        ) : (
          <Empty icon={Check} title="Nothing to go over" body="Every word is learnt for now. They come back as their time comes." action={<Button onClick={onClose}>Close</Button>} />
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-4 px-6 pb-5 pt-5" data-testid="review">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--viz-grid)]" aria-label={`${gone} of ${total} gone over`}>
          <motion.div className="h-full rounded-full bg-[var(--c-accent)]" initial={false} animate={{ width: `${Math.round((gone / Math.max(1, total)) * 100)}%` }} transition={{ duration: 0.3, ease: ease.out }} />
        </div>
        <span className="text-[12px] text-text3 tnum">
          {queue.length} to go{missedOnce.includes(word.id) ? " · again" : ""}
        </span>
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.button
          key={`${word.id}-${missedOnce.includes(word.id) ? 2 : 1}`}
          type="button"
          data-review-card
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? `${word.data.term}: ${word.data.meaning}` : `${word.data.term}. Click to see the meaning`}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, x: leaving * 60, rotate: leaving * 3 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.18, ease: ease.out }}
          className={clsx(
            "relative flex min-h-[230px] flex-col items-center justify-center gap-2 rounded-[18px] bg-surface2 p-6 text-center hairline",
            leaving === 1 && "shadow-[inset_0_0_0_1.5px_var(--c-success)]",
            leaving === -1 && "shadow-[inset_0_0_0_1.5px_var(--c-danger)]",
          )}
        >
          {!shown ? (
            <>
              <span className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]" data-testid="review-term">
                {word.data.term}
              </span>
              {word.data.say && <span className="text-[14px] text-text2">{word.data.say}</span>}
              <span className="absolute bottom-4 text-[12px] text-text3">
                <Kbd>Space</Kbd> shows the meaning
              </span>
            </>
          ) : (
            <>
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text3">{word.data.term}</span>
              <span className="font-display text-[24px] font-semibold leading-snug" data-testid="review-meaning">
                {word.data.meaning}
              </span>
              {word.data.example && <span className="text-[13.5px] italic text-text2">{word.data.example}</span>}
            </>
          )}
        </motion.button>
      </AnimatePresence>
      <div className="flex gap-2">
        <Button className="flex-1" icon={X} onClick={() => answer(false)} kbd="←">
          {"Didn't know"}
        </Button>
        {shown ? (
          <Button className="flex-1" variant="primary" icon={Check} onClick={() => answer(true)} kbd="→">
            Knew it
          </Button>
        ) : (
          <Button className="flex-1" variant="primary" icon={RotateCcw} onClick={() => setShown(true)} kbd="Space">
            Show
          </Button>
        )}
      </div>
    </div>
  );
}

export function WordReview({ open, onClose, interestId, title }: { open: boolean; onClose: () => void; interestId: string | null; title: string }) {
  // a new session each time it opens
  const [n, setN] = useState(0);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setN((x) => x + 1);
  }
  return (
    <Dialog open={open} onClose={onClose} width={520} bare initialFocus="[data-review-card]">
      <div className="flex items-center justify-between border-b border-line px-6 py-3.5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-text">{title}</div>
          <div className="font-display text-[16px] font-semibold">Go over words</div>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-text3 hover:bg-hover hover:text-text">
          <X size={17} />
        </button>
      </div>
      {open && <Session key={n} interestId={interestId} onClose={onClose} />}
    </Dialog>
  );
}
