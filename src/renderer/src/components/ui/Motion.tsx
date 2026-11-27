// Numbers and rings that move to their value instead of jumping: a total counting up, a ring
// filling. With calm motion on they simply show the value.
import { useEffect, useRef, useState } from "react";
import { animate, motion } from "motion/react";
import { useReduced } from "@/theme";
import { ease } from "@/theme/motion";

export function useCountUp(value: number, ms = 700) {
  const reduced = useReduced();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const c = animate(from.current, value, { duration: ms / 1000, ease: ease.out, onUpdate: (v) => setShown(v) });
    from.current = value;
    return () => c.stop();
  }, [value, ms, reduced]);
  return shown;
}

export function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const v = useCountUp(value);
  return <span className={`tnum ${className || ""}`}>{format(v)}</span>;
}

export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  track = "var(--c-line)",
  color = "url(#ring-grad)",
  children,
  className,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  track?: string;
  color?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const reduced = useReduced();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={`relative grid shrink-0 place-items-center ${className || ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--c-accent2)" />
            <stop offset="100%" stopColor="var(--c-accent)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduced ? c * (1 - v) : c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: reduced ? 0 : 0.9, ease: ease.out }}
          style={{ filter: v > 0 ? "drop-shadow(0 0 6px var(--c-glow))" : undefined }}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}

// a soft pulse behind something that is live (the next thing, a running task): a few beats when it
// appears, then still. An endless one keeps the window redrawing for as long as it's on screen.
export const Pulse = ({ color = "var(--c-accent)", size = 8, beats = 4 }: { color?: string; size?: number; beats?: number }) => (
  <span className="relative inline-flex" style={{ width: size, height: size }}>
    <span className="absolute inset-0 rounded-full" style={{ background: color, opacity: 0, animation: `pulse-ring 1.8s var(--ease-out) ${beats}` }} />
    <span className="relative rounded-full" style={{ width: size, height: size, background: color }} />
  </span>
);
