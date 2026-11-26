// Escape closes the top-most thing that's open (a menu over a drawer over a page), and only it.
// Each overlay joins the stack while it is open.
import { useEffect, useRef } from "react";

type Entry = { id: number; fn: () => void };
const stack: Entry[] = [];
let n = 0;

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !stack.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      stack[stack.length - 1].fn();
    },
    true,
  );
}

export const layerOpen = () => stack.length > 0;

export function useEscape(fn: () => void, active: boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const entry = { id: ++n, fn: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.findIndex((x) => x.id === entry.id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
