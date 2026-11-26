// Buttons. Primary is the theme's accent with a soft glow; secondary sits on the surface; ghost is
// just text until you point at it. Every button answers the press at once (it dips a little).
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { Tooltip } from "./Overlay";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle" | "outline";
type Size = "xs" | "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none transition-[background-color,box-shadow,color,transform,opacity,border-color] duration-150 ease-[var(--ease-standard)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2";

const variants: Record<Variant, string> = {
  primary: "text-on-accent accent-grad shadow-[0_1px_0_0_rgb(255_255_255/0.22)_inset,0_6px_18px_-8px_var(--c-glow)] hover:brightness-110 hover:shadow-[0_1px_0_0_rgb(255_255_255/0.25)_inset,0_10px_26px_-8px_var(--c-glow)]",
  secondary: "bg-surface2 text-text hairline hover:bg-[color-mix(in_srgb,var(--c-surface2)_80%,var(--c-text)_8%)]",
  outline: "bg-transparent text-text hairline hover:bg-hover",
  ghost: "bg-transparent text-text2 hover:bg-hover hover:text-text",
  subtle: "bg-accent-soft text-accent-text hover:brightness-125",
  danger: "bg-[color-mix(in_srgb,var(--c-danger)_14%,transparent)] text-danger hover:bg-[color-mix(in_srgb,var(--c-danger)_22%,transparent)]",
};
const sizes: Record<Size, string> = {
  xs: "h-6 px-2 text-[12px] rounded-[7px] gap-1",
  sm: "h-7 px-2.5 text-[12.5px] rounded-[8px] gap-1.5",
  md: "h-8 px-3.5 text-[13px] rounded-[9px]",
  lg: "h-10 px-5 text-[14px] rounded-[11px]",
};
const iconSize: Record<Size, number> = { xs: 13, sm: 14, md: 15, lg: 17 };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  kbd?: string;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, iconRight: IconRight, loading, kbd, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={clsx(base, variants[variant], sizes[size], block && "w-full", className)} {...rest}>
      {loading ? <Spin size={iconSize[size]} /> : Icon ? <Icon size={iconSize[size]} strokeWidth={2} className="shrink-0" /> : null}
      {children != null && <span className={clsx(loading && !Icon && "opacity-90")}>{children}</span>}
      {IconRight && <IconRight size={iconSize[size]} strokeWidth={2} className="shrink-0 opacity-80" />}
      {kbd && <kbd className={clsx("ml-0.5 rounded px-1 font-sans text-[10.5px] leading-4 opacity-70", variant === "primary" ? "bg-black/15" : "bg-hover")}>{kbd}</kbd>}
    </button>
  );
});

export const Spin = ({ size = 15, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={clsx("shrink-0 animate-[spin_0.8s_linear_infinite]", className)} aria-hidden>
    <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.6" />
    <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string; // said by screen readers and shown as a tooltip
  size?: Size;
  variant?: "ghost" | "secondary" | "subtle" | "danger" | "primary";
  active?: boolean;
  tip?: ReactNode | false;
  kbd?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = "md", variant = "ghost", active, tip, kbd, className, type = "button", ...rest },
  ref,
) {
  const dim = { xs: "h-6 w-6 rounded-[7px]", sm: "h-7 w-7 rounded-[8px]", md: "h-8 w-8 rounded-[9px]", lg: "h-10 w-10 rounded-[11px]" }[size];
  const btn = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active}
      className={clsx(base, variants[variant], dim, "px-0", active && variant === "ghost" && "bg-hover text-text", className)}
      {...rest}
    >
      <Icon size={iconSize[size] + 1} strokeWidth={2} />
    </button>
  );
  if (tip === false) return btn;
  return (
    <Tooltip label={tip ?? label} kbd={kbd}>
      {btn}
    </Tooltip>
  );
});
