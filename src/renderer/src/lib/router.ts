// A small router on the URL's hash (#/todos?x=1): the app is one page, and a hash survives a
// reload and works with file:// in a built app. `navigate` pushes, `replace` swaps.
import { useSyncExternalStore } from "react";

export type Route = { path: string; query: URLSearchParams; params: Record<string, string> };

const read = () => {
  const h = window.location.hash.replace(/^#/, "") || "/";
  const [path, qs = ""] = h.split("?");
  return { path: path || "/", qs };
};

let snapshot = read();
let key = `${snapshot.path}?${snapshot.qs}`;
const listeners = new Set<() => void>();
const emit = () => {
  const next = read();
  const k = `${next.path}?${next.qs}`;
  if (k !== key) {
    key = k;
    snapshot = next;
  }
  listeners.forEach((l) => l());
};
if (typeof window !== "undefined") window.addEventListener("hashchange", emit);

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = `#${to.startsWith("/") ? to : `/${to}`}`;
  if (window.location.hash === target) return;
  if (opts.replace) {
    history.replaceState(null, "", target);
    emit();
  } else window.location.hash = target;
}
export const back = () => history.back();

export function useLocation() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
}

// "/notes/:id" against "/notes/abc" -> { id: "abc" }
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function useQuery() {
  const loc = useLocation();
  return new URLSearchParams(loc.qs);
}

// change the query without a new history entry (filters, tabs)
export function setQuery(patch: Record<string, string | null | undefined>) {
  const { path, qs } = read();
  const q = new URLSearchParams(qs);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  navigate(`${path}${s ? `?${s}` : ""}`, { replace: true });
}
