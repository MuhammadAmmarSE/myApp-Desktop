// The pieces for talking: the microphone button, the meter that shows it hears you, and the line
// that says what's happening. Used by the assistant's message box and Capture.
import { useEffect, useRef, type MutableRefObject } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { Mic, Square } from "lucide-react";
import { Spin, Tooltip } from "@/components/ui";

// how loud the microphone is, as five bars; it follows the sound only while it's on screen
export function MicLevel({ level, className }: { level: MutableRefObject<number>; className?: string }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const shape = [0.55, 0.85, 1, 0.8, 0.6];
    const tick = () => {
      const l = level.current;
      bars.current.forEach((b, i) => {
        if (b) b.style.transform = `scaleY(${Math.max(0.18, Math.min(1, l * shape[i] * 1.25))})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level]);
  return (
    <span className={clsx("flex h-4 items-center gap-[3px]", className)} aria-hidden data-testid="mic-level">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className="h-full w-[3px] origin-center rounded-full bg-accent transition-transform duration-100 ease-out"
          style={{ transform: "scaleY(0.18)" }}
        />
      ))}
    </span>
  );
}

// the microphone: click to talk, click again to stop (it also stops by itself when you're done)
export function MicButton({ state, onClick, size = 36, shortcut }: { state: "idle" | "listening" | "writing"; onClick: () => void; size?: number; shortcut?: string }) {
  const listening = state === "listening";
  const label = listening ? "Stop and send what I said" : state === "writing" ? "Writing down what you said" : "Talk";
  return (
    <Tooltip label={label} kbd={state === "idle" ? shortcut : undefined}>
      <button
        type="button"
        onClick={onClick}
        disabled={state === "writing"}
        aria-label={label}
        aria-pressed={listening}
        data-testid="mic"
        data-state={state}
        style={{ width: size, height: size }}
        className={clsx(
          "relative grid shrink-0 place-items-center rounded-full transition-[background-color,color,box-shadow] duration-150",
          listening ? "accent-grad text-on-accent shadow-[var(--shadow-glow)]" : "text-text2 hover:bg-hover hover:text-text",
          state === "writing" && "text-accent-text",
        )}
      >
        {listening && <motion.span className="absolute inset-0 rounded-full shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-accent)_30%,transparent)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
        {state === "writing" ? <Spin size={16} /> : listening ? <Square size={13} fill="currentColor" strokeWidth={0} /> : <Mic size={18} strokeWidth={2} />}
      </button>
    </Tooltip>
  );
}
