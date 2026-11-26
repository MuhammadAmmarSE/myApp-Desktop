// The page's frame: a header with the title and the page's actions, cards, section titles and
// stat tiles. Pages are built from these so every page lines up the same way.
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { CountUp } from "./Motion";
import { ease } from "@/theme/motion";

export function Page({ children, className, width = "wide", flush }: { children: ReactNode; className?: string; width?: "narrow" | "normal" | "wide" | "full"; flush?: boolean }) {
  const max = { narrow: "max-w-[760px]", normal: "max-w-[1040px]", wide: "max-w-[1320px]", full: "max-w-none" }[width];
  return (
    <div className={clsx("h-full overflow-y-auto", flush ? "" : "px-8 pb-12 pt-6", className)}>
      <div className={clsx("mx-auto w-full", max)}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, icon: Icon, actions, children, eyebrow }: { title: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <motion.header initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: ease.out }} className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {Icon && (
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-line bg-surface2 text-accent-text shadow-[var(--shadow-card)]">
              <Icon size={21} strokeWidth={1.9} />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <div className="mb-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">{eyebrow}</div>}
            <h1 className="truncate font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-text">{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-[13.5px] text-text2">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </motion.header>
  );
}

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { pad?: boolean; interactive?: boolean; strong?: boolean }>(function Card({ className, pad = true, interactive, strong, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={clsx(
        "rounded-[16px] border border-line shadow-[var(--shadow-card)]",
        strong ? "glass-strong" : "glass",
        pad && "p-5",
        interactive && "transition-[border-color,box-shadow,transform] duration-200 hover:border-[color-mix(in_srgb,var(--c-text3)_55%,var(--c-line))] hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.5)]",
        className,
      )}
      {...rest}
    />
  );
});

export function CardTitle({ title, icon: Icon, action, sub, className }: { title: ReactNode; icon?: LucideIcon; action?: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-3.5 flex items-center gap-2.5", className)}>
      {Icon && <Icon size={16} strokeWidth={2} className="shrink-0 text-accent-text" />}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[13.5px] font-semibold text-text">{title}</h3>
        {sub && <p className="truncate text-[12px] text-text3">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, count, action, className }: { children: ReactNode; count?: number; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-2 mt-6 flex items-center gap-2 px-1 first:mt-0", className)}>
      <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text3">{children}</h4>
      {count != null && <span className="text-[11.5px] font-medium text-text3 tnum">{count}</span>}
      <div className="flex-1" />
      {action}
    </div>
  );
}

export function Stat({ label, value, format, icon: Icon, tone, sub, className, onClick }: { label: string; value: number; format?: (n: number) => string; icon?: LucideIcon; tone?: string; sub?: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <Card pad={false} interactive={!!onClick} onClick={onClick} className={clsx("flex flex-col gap-2 p-4", onClick && "cursor-default", className)}>
      <div className="flex items-center gap-2 text-[12px] font-medium text-text2">
        {Icon && (
          <span className="grid h-6 w-6 place-items-center rounded-[7px]" style={{ background: `color-mix(in srgb, ${tone || "var(--c-accent)"} 16%, transparent)`, color: tone || "var(--c-accentText)" }}>
            <Icon size={14} />
          </span>
        )}
        {label}
      </div>
      <div className="font-display text-[24px] font-semibold leading-none tracking-[-0.02em] text-text">
        <CountUp value={value} format={format} />
      </div>
      {sub && <div className="text-[12px] text-text3">{sub}</div>}
    </Card>
  );
}

// a column you can scroll on its own (lists beside an editor)
export function Pane({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("flex min-h-0 flex-col", className)} {...rest}>
      {children}
    </div>
  );
}
