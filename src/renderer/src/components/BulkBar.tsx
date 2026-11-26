// The bar that rises when several rows are chosen: how many, what you can do to all of them, and
// a way to let go. It floats over the bottom of the page.
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Kbd } from "@/components/ui";
import { ease } from "@/theme/motion";

export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {count > 1 && (
        <motion.div
          role="toolbar"
          aria-label={`${count} chosen`}
          initial={{ opacity: 0, y: 24, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 16, x: "-50%", transition: { duration: 0.14, ease: ease.in } }}
          transition={{ duration: 0.24, ease: ease.out }}
          className="fixed bottom-6 left-1/2 z-[90] flex items-center gap-1.5 rounded-[14px] border border-line px-2 py-1.5 glass-strong shadow-[var(--shadow-pop)]"
          data-testid="bulk-bar"
        >
          <span className="px-2 text-[13px] font-semibold tnum">{count} chosen</span>
          <span className="mx-1 h-5 w-px bg-line" />
          {children}
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" onClick={onClear} className="flex h-8 items-center gap-1.5 rounded-[9px] px-2 text-[12.5px] text-text2 hover:bg-hover hover:text-text">
            <X size={14} /> <Kbd>Esc</Kbd>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
