// Waiting and empty states: skeletons that hold the page's shape, three soft dots for "working",
// and an empty state with a small drawing and the one thing to do next.
import type { ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { ease } from "@/theme/motion";

export const Skeleton = ({ className, style }: { className?: string; style?: React.CSSProperties }) => <div className={clsx("skeleton rounded-md", className)} style={style} />;

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-2", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <Skeleton className="h-5 w-5 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5" style={{ width: `${70 - ((i * 13) % 35)}%` }} />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Working({ label = "Working", className }: { label?: string; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 text-[13px] text-text2", className)} role="status">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent" style={{ animation: `dots 1.1s ${i * 0.14}s infinite ease-in-out` }} />
        ))}
      </span>
      {label}
    </span>
  );
}

// a quiet drawing behind the empty state's icon: rings that echo the logo's shape
function EmptyArt({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="relative grid h-[112px] w-[112px] place-items-center">
      <svg viewBox="0 0 112 112" className="absolute inset-0" aria-hidden>
        <defs>
          <radialGradient id="empty-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--c-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--c-accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="56" cy="56" r="54" fill="url(#empty-glow)" />
        <circle cx="56" cy="56" r="42" fill="none" stroke="var(--c-line)" strokeDasharray="2 5" />
        <circle cx="56" cy="56" r="30" fill="none" stroke="var(--c-line)" />
        <motion.circle cx="56" cy="14" r="2.5" fill="var(--c-accent)" animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} style={{ originX: "56px", originY: "56px" }} />
      </svg>
      <div className="relative grid h-14 w-14 place-items-center rounded-[18px] border border-line bg-surface2 text-accent-text shadow-[var(--shadow-card)]">
        <Icon size={24} strokeWidth={1.8} />
      </div>
    </div>
  );
}

export function Empty({ icon, title, body, action, className, compact }: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: ease.out }}
      className={clsx("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-8" : "gap-3 py-16", className)}
    >
      {compact ? (
        <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-surface2 text-text3 hairline">{(() => { const I = icon; return <I size={20} />; })()}</div>
      ) : (
        <EmptyArt icon={icon} />
      )}
      <div className="max-w-[340px]">
        <h3 className={clsx("font-display font-semibold text-text", compact ? "text-[14px]" : "text-[16px]")}>{title}</h3>
        {body && <p className="mt-1 text-[13px] leading-relaxed text-text2">{body}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </motion.div>
  );
}
