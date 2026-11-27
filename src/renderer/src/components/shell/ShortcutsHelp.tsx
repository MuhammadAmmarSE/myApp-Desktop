// Every keyboard shortcut on one sheet (Ctrl/⌘ /).
import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import type { Prefs } from "@shared/ipc";
import { Dialog, Kbd } from "@/components/ui";
import { SHORTCUTS } from "@/lib/keys";
import { bridge, isMac } from "@/lib/bridge";
import { describeAccelerator } from "@/lib/accelerator";
import { useUI } from "@/store/ui";

export function ShortcutsHelp() {
  const open = useUI((s) => s.shortcuts);
  const set = useUI((s) => s.setShortcuts);
  // the global ones as set in Settings (one turned off isn't listed)
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    if (!open) return;
    void bridge.prefs.get().then(setPrefs);
  }, [open]);
  const keysOf = (acc: string) => describeAccelerator(acc, isMac()).replace(/ \+ /g, " ");
  const list = SHORTCUTS()
    .map((s) => (s.global && prefs ? { ...s, keys: keysOf(s.global === "quick" ? prefs.quickShortcut : prefs.talkShortcut) } : s))
    .filter((s) => s.keys);
  const groups = Array.from(new Set(list.map((s) => s.group)));
  return (
    <Dialog open={open} onClose={() => set(false)} width={760} icon={Keyboard} title="Keyboard shortcuts" description="Redline is quick with the keyboard. Quick capture works even when Redline isn't in front.">
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        {groups.map((g) => (
          <section key={g}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text3">{g}</h3>
            <div className="flex flex-col">
              {list
                .filter((s) => s.group === g)
                .map((s) => (
                  <div key={s.keys + s.what} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
                    <span className="text-[13px] text-text2">{s.what}</span>
                    <span className="flex shrink-0 gap-1">
                      {s.keys.split(" ").map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
