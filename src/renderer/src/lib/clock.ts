// The current time. `now()` for event handlers; `useNow()` for screens, which re-render so
// "today", "late" and "in 5 min" stay true when Redline is left open past midnight.
import { useEffect, useState } from "react";

export const now = () => Date.now();

export function useNow(everyMs = 60000) {
  const [t, setT] = useState(now);
  useEffect(() => {
    // line the ticks up with the minute, so a clock on screen changes when the real one does
    const first = everyMs >= 60000 ? 60000 - (Date.now() % 60000) + 50 : everyMs;
    let id: ReturnType<typeof setInterval> | null = null;
    const t0 = setTimeout(() => {
      setT(now());
      id = setInterval(() => setT(now()), everyMs);
    }, first);
    return () => {
      clearTimeout(t0);
      if (id) clearInterval(id);
    };
  }, [everyMs]);
  return t;
}
