// The planet: Redline's face. It sits still when idle, breathes while you type, its ring speeds up
// while the AI thinks, draws a tick when something is saved, and turns red when it can't help.
// Drawn in SVG from the theme's orb colours, so it matches every theme; still with calm motion.
//
// Nothing here runs on its own: the moons' clock stops once they have come to rest, and every
// movement waits while the window is behind another one (lib/activity.ts). An SVG animates on the
// main thread, frame by frame, and redraws the glass over it, so an orb that never stops makes
// the whole window work all the time.
import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useReduced } from "@/theme";
import { useWindowActive } from "@/lib/activity";

export type OrbState = "idle" | "listening" | "thinking" | "done" | "error";

// seconds per turn of the moons; 0 = they slow to a stop
const SPIN: Record<OrbState, number> = { idle: 0, listening: 22, thinking: 3.2, done: 30, error: 0 };

export function Orb({ size = 220, state = "idle", className }: { size?: number; state?: OrbState; className?: string }) {
  const id = useId().replace(/:/g, "");
  const reduced = useReduced();
  const err = state === "error";
  const core = err ? "var(--c-danger)" : "var(--orb-core)";
  const rim = err ? "var(--c-danger)" : "var(--orb-rim)";
  const light = err ? "#ffd6d6" : "var(--orb-light)";
  // drawn small (beside "Working on it"), a 1-unit line would be a fifth of a pixel and vanish:
  // the ring, its streak and the moons keep a width you can see, and there are fewer moons
  const px = 200 / size; // drawing units in one screen pixel
  const small = size < 90;
  const line = (units: number, minPx: number) => Math.max(units, minPx * px);
  const dots = Array.from({ length: small ? 6 : 14 }, (_, i) => i);
  const windowActive = useWindowActive();
  const live = !reduced && windowActive;
  // breathing and drifting: only while it listens or thinks
  const moving = live && (state === "listening" || state === "thinking");
  // one clock for the moons: the speed eases toward the state's, so they never jump, and the clock
  // stops asking for frames once they have come to rest
  const angle = useMotionValue(0);
  const speed = useRef(0);
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const delta = Math.min(64, t - last);
      last = t;
      const target = SPIN[state] ? (Math.PI * 2) / SPIN[state] / 1000 : 0;
      speed.current += (target - speed.current) * Math.min(1, delta / 400);
      if (!target && Math.abs(speed.current) < 2e-6) {
        speed.current = 0;
        raf = 0;
        return;
      }
      angle.set(angle.get() + speed.current * delta);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [live, state, angle]);
  return (
    <div className={className} style={{ width: size, height: size, position: "relative" }} role="img" aria-label={`Redline is ${state === "idle" ? "ready" : state}`} data-orb={state}>
      {/* the light it casts */}
      <motion.div
        aria-hidden
        className="absolute inset-[-18%] rounded-full"
        style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${core} 45%, transparent), transparent 70%)`, filter: "blur(18px)" }}
        animate={!moving ? { opacity: state === "idle" ? 0.5 : 0.6, scale: 1 } : { opacity: state === "thinking" ? [0.55, 0.95, 0.55] : [0.6, 0.85, 0.6], scale: state === "thinking" ? [0.96, 1.06, 0.96] : [1, 1.03, 1] }}
        transition={moving ? { duration: state === "thinking" ? 1.4 : 4.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.6, ease: "easeOut" }}
      />
      <motion.svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className="relative overflow-visible"
        animate={reduced ? undefined : { y: moving ? [0, -4, 0] : 0, scale: state === "listening" ? 1.03 : state === "done" ? 1.04 : 1 }}
        transition={{ y: moving ? { duration: 6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.6, ease: "easeOut" }, scale: { duration: 0.4, ease: [0.2, 0, 0, 1] } }}
      >
        <defs>
          <radialGradient id={`${id}-body`} cx="36%" cy="32%" r="78%">
            <stop offset="0%" stopColor={light} stopOpacity="0.95" />
            <stop offset="28%" stopColor={rim} />
            <stop offset="62%" stopColor={core} />
            <stop offset="100%" stopColor="#000" stopOpacity="0.9" />
          </radialGradient>
          <radialGradient id={`${id}-shade`} cx="70%" cy="78%" r="70%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-band`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <circle cx="100" cy="100" r="58" />
          </clipPath>
          <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        {/* back half of the ring, behind the planet */}
        <g transform="rotate(-18 100 100)">
          <ellipse cx="100" cy="100" rx="92" ry="24" fill="none" stroke={rim} strokeOpacity={small ? 0.4 : 0.22} strokeWidth={line(1.2, 1)} />
        </g>

        {/* the planet */}
        <circle cx="100" cy="100" r="62" fill={rim} opacity="0.35" filter={`url(#${id}-soft)`} />
        <circle cx="100" cy="100" r="58" fill={`url(#${id}-body)`} />
        <g clipPath={`url(#${id}-clip)`}>
          {/* drifting cloud bands */}
          <motion.g animate={moving ? { x: [-30, 30] } : undefined} transition={moving ? { duration: 18, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } : undefined}>
            <ellipse cx="90" cy="84" rx="80" ry="7" fill={`url(#${id}-band)`} transform="rotate(-14 100 100)" />
            <ellipse cx="110" cy="112" rx="90" ry="5" fill={`url(#${id}-band)`} transform="rotate(-14 100 100)" />
            <ellipse cx="96" cy="132" rx="70" ry="4" fill={`url(#${id}-band)`} transform="rotate(-14 100 100)" opacity="0.7" />
          </motion.g>
          <circle cx="100" cy="100" r="58" fill={`url(#${id}-shade)`} />
        </g>
        {/* a thin bright edge, lit from the top left */}
        <circle cx="100" cy="100" r="57.4" fill="none" stroke={light} strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="120 400" strokeDashoffset="-260" />

        {/* front half of the ring, with its moons going round */}
        <g transform="rotate(-18 100 100)">
          <path d="M 8 100 A 92 24 0 0 0 192 100" fill="none" stroke={rim} strokeOpacity={small ? 0.8 : 0.55} strokeWidth={line(1.4, 1.2)} />
          {dots.map((i) => (
            <Moon key={i} i={i} n={dots.length} angle={angle} color={i % 4 === 0 && !small ? light : "var(--orb-particles)"} minR={small ? 1 * px : 0} />
          ))}
          {/* the streak going round while it thinks: the planet's own colour with a light core, so
              it shows on a light page as well as a dark one */}
          {state === "thinking" &&
            live &&
            [
              { stroke: core, width: line(3.2, 2.4), opacity: 0.95 },
              { stroke: light, width: line(1.4, 1), opacity: 0.9 },
            ].map((s, i) => (
              <motion.ellipse
                key={i}
                cx="100"
                cy="100"
                rx="92"
                ry="24"
                fill="none"
                stroke={s.stroke}
                strokeWidth={s.width}
                strokeLinecap="round"
                strokeDasharray="70 510"
                initial={{ strokeDashoffset: 0, opacity: 0 }}
                animate={{ strokeDashoffset: -580, opacity: s.opacity }}
                transition={{ strokeDashoffset: { duration: 1.1, repeat: Infinity, ease: "linear" }, opacity: { duration: 0.3 } }}
              />
            ))}
        </g>

        {/* the tick when something was saved */}
        <AnimatePresence>
          {state === "done" && (
            <motion.path
              key="tick"
              d="M78 101 L94 116 L124 86"
              fill="none"
              stroke="#fff"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
              style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,.35))" }}
            />
          )}
        </AnimatePresence>
      </motion.svg>
    </div>
  );
}

// One moon on the ring. Moons in front of the planet are bright; behind it they fade.
function Moon({ i, n, angle, color, minR = 0 }: { i: number; n: number; angle: MotionValue<number>; color: string; minR?: number }) {
  const start = (i / n) * Math.PI * 2;
  const r = Math.max(minR, 1.4 + (i % 3) * 0.55);
  const cx = useTransform(angle, (a) => 100 + Math.cos(a + start) * 92);
  const cy = useTransform(angle, (a) => 100 + Math.sin(a + start) * 24);
  const opacity = useTransform(angle, (a) => (Math.sin(a + start) > 0 ? 0.95 : 0.22));
  return <motion.circle r={r} fill={color} cx={cx} cy={cy} style={{ opacity }} />;
}
