// One motion language, the phone's: short, eased, no bounce. Entrances rise a few pixels and fade.
import type { Transition, Variants } from "motion/react";

export const ease = {
  standard: [0.2, 0, 0, 1] as const,
  out: [0, 0, 0.2, 1] as const,
  in: [0.4, 0, 1, 1] as const,
};
export const dur = { fast: 0.16, base: 0.24, slow: 0.34 };

export const glide: Transition = { duration: dur.base, ease: ease.standard };
export const quick: Transition = { duration: dur.fast, ease: ease.standard };

// staggered list/card entrance, capped so long lists don't drag
export const rise = (i = 0, step = 0.035): { initial: any; animate: any; transition: Transition } => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: dur.slow, ease: ease.out, delay: Math.min(i, 10) * step },
});

export const page: Variants = {
  initial: { opacity: 0, y: 6 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.26, ease: ease.out } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14, ease: ease.in } },
};

export const pop: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 6 },
  enter: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: ease.out } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.13, ease: ease.in } },
};
