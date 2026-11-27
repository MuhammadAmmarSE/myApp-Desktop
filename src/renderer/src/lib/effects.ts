// Full or light effects. Light takes out what costs the most to draw: the blur behind the glass and
// the wallpaper's depth (two full-window layers moving with the pointer). On Auto, light is used
// when Chromium is drawing without the graphics card (its driver blocked, a remote desktop, a
// virtual machine): there every blurred redraw is done by the CPU, and that is where the app felt
// slow. The setting can also be forced either way in Settings > Appearance.
import { useSyncExternalStore } from "react";
import { bridge } from "@/lib/bridge";
import { useSettings } from "@/store/settings";

type Gpu = "hardware" | "software";
let gpu: Gpu = "hardware";
let asked = false;
const listeners = new Set<() => void>();

function ask() {
  if (asked) return;
  asked = true;
  void bridge.app
    .info()
    .then((info) => {
      const next: Gpu = info?.gpu === "software" ? "software" : "hardware";
      if (next === gpu) return;
      gpu = next;
      listeners.forEach((fn) => fn());
    })
    .catch(() => undefined);
}

export function useGpu(): Gpu {
  return useSyncExternalStore(
    (fn) => {
      ask();
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => gpu,
    () => "hardware",
  );
}

export const isLight = (effects: "auto" | "full" | "light", g: Gpu) => effects === "light" || (effects === "auto" && g === "software");

export function useLightEffects() {
  const effects = useSettings((s) => s.effects);
  return isLight(effects, useGpu());
}
