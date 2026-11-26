// Saved: the bits of text you copy again and again — account numbers, addresses, a car's chassis
// number, a message you send often. Click one to copy it (or Enter on the chosen one); pinned and
// most-used come first. Paste what's on the clipboard to keep it.
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { ArrowUpDown, Bookmark, Check, ClipboardPaste, Copy, Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import type { Rec } from "@myapp/core";
import { Button, Chip, Empty, IconButton, Input, Menu, Tag, toast, useContextMenu } from "@/components/ui";
import { useList, useRecords } from "@/store/records";
import { edit } from "@/store/ui";
import { useListNav } from "@/lib/listNav";
import { bridge } from "@/lib/bridge";
import { ago } from "@/lib/format";
import { rise } from "@/theme/motion";

type Sort = "used" | "recent" | "az";
// numbers and codes read better in a fixed-width face
const looksLikeCode = (t: string) => t.length <= 80 && !/\s{2,}/.test(t) && /\d/.test(t) && (t.match(/[A-Za-z]/g) || []).length < t.length * 0.7 && !t.includes("\n");

export function copyClip(c: Rec<"clip">) {
  bridge.clipboard.write(c.data.text);
  useRecords.getState().update<"clip">(c.id, (d) => ({ ...d, uses: (d.uses || 0) + 1 }));
  toast.success(`Copied ${c.data.title ? `“${c.data.title.slice(0, 40)}”` : ""}`.trim());
}

export default function Saved() {
  const clips = useList("clip");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("used");
  const [flash, setFlash] = useState<string | null>(null);
  const ctx = useContextMenu();

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clips) for (const g of c.data.tags || []) m.set(g, (m.get(g) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [clips]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const by: Record<Sort, (a: Rec<"clip">, b: Rec<"clip">) => number> = {
      used: (a, b) => (b.data.uses || 0) - (a.data.uses || 0) || b.updated_at - a.updated_at,
      recent: (a, b) => b.updated_at - a.updated_at,
      az: (a, b) => (a.data.title || a.data.text).localeCompare(b.data.title || b.data.text),
    };
    return clips
      .filter((c) => (!tag || (c.data.tags || []).includes(tag)) && words.every((w) => `${c.data.title || ""}\n${c.data.text}\n${(c.data.tags || []).join(" ")}`.toLowerCase().includes(w)))
      .sort((a, b) => Number(!!b.data.pinned) - Number(!!a.data.pinned) || by[sort](a, b));
  }, [clips, q, tag, sort]);

  const copy = (c: Rec<"clip">) => {
    copyClip(c);
    setFlash(c.id);
    setTimeout(() => setFlash((f) => (f === c.id ? null : f)), 1100);
  };
  const remove = (list: Rec<"clip">[]) => {
    const before = list.map((c) => useRecords.getState().byId[c.id]).filter(Boolean);
    for (const c of list) useRecords.getState().remove(c.id);
    toast(list.length === 1 ? "Deleted" : `Deleted ${list.length}`, { action: { label: "Undo", run: () => before.forEach((b) => useRecords.getState().restore(b)) } });
  };
  const nav = useListNav(shown, {
    selector: (id) => `[data-clip="${id}"]`,
    onOpen: copy,
    onDelete: remove,
    onNew: () => edit("clip"),
  });
  const paste = async () => {
    const text = (await bridge.clipboard.read()).trim();
    if (!text) return toast("The clipboard has no text");
    edit("clip", null, { text });
  };

  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-6" data-testid="saved">
      <div className="mx-auto max-w-[1320px]">
        <motion.header {...rise(0)} className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">Copy in one click</div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">Saved</h1>
          </div>
          <div className="w-[260px]">
            <Input icon={Search} value={q} onChange={setQ} placeholder="Search saved text" size="sm" aria-label="Search saved text" />
          </div>
          <Menu
            trigger={(open) => (
              <Button size="sm" variant="ghost" icon={ArrowUpDown} onClick={open}>
                {{ used: "Most used", recent: "Recent", az: "A to Z" }[sort]}
              </Button>
            )}
            items={[
              { label: "Most used", checked: sort === "used", onSelect: () => setSort("used") },
              { label: "Recent", checked: sort === "recent", onSelect: () => setSort("recent") },
              { label: "A to Z", checked: sort === "az", onSelect: () => setSort("az") },
            ]}
          />
          <Button size="sm" icon={ClipboardPaste} onClick={paste}>
            Paste as new
          </Button>
          <Button size="sm" variant="primary" icon={Plus} onClick={() => edit("clip")} kbd="N">
            New
          </Button>
        </motion.header>

        {tags.length > 0 && (
          <motion.div {...rise(1)} className="mb-4 flex flex-wrap gap-1.5">
            <Chip active={!tag} onClick={() => setTag(null)}>
              All
            </Chip>
            {tags.map(([g, n]) => (
              <Chip key={g} active={tag === g} count={n} onClick={() => setTag(tag === g ? null : g)}>
                #{g}
              </Chip>
            ))}
          </motion.div>
        )}

        {shown.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="clip-grid">
            <AnimatePresence initial={false}>
              {shown.map((c, i) => {
                const code = looksLikeCode(c.data.text);
                const copied = flash === c.id;
                return (
                  <motion.div
                    key={c.id}
                    layout="position"
                    data-clip={c.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.24, delay: Math.min(i, 12) * 0.02 }}
                    onClick={(e) => (e.ctrlKey || e.metaKey || e.shiftKey ? nav.click(c, e) : (nav.setActive(c.id), copy(c)))}
                    onContextMenu={(e) =>
                      ctx(e, [
                        { label: "Copy", icon: Copy, kbd: "Enter", onSelect: () => copy(c) },
                        { label: "Edit", icon: Pencil, onSelect: () => edit("clip", c) },
                        { label: c.data.pinned ? "Unpin" : "Pin to the top", icon: c.data.pinned ? PinOff : Pin, onSelect: () => useRecords.getState().update<"clip">(c.id, { pinned: !c.data.pinned }) },
                        { type: "separator" },
                        { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove([c]) },
                      ])
                    }
                    className={clsx(
                      "group relative flex min-h-[124px] cursor-pointer flex-col rounded-[16px] p-4 glass transition-[box-shadow,transform] hover:-translate-y-0.5",
                      copied ? "shadow-[inset_0_0_0_1.5px_var(--c-success),0_12px_32px_-18px_var(--c-success)]" : nav.selected.has(c.id) || nav.active === c.id ? "shadow-[inset_0_0_0_1.5px_var(--c-accent)]" : "hairline hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-accent)_40%,var(--c-line)),var(--shadow-card)]",
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      {c.data.pinned && <Pin size={12} className="shrink-0 text-accent-text" />}
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{c.data.title || (code ? "Saved text" : c.data.text.split("\n")[0])}</span>
                      <IconButton icon={Pencil} label="Edit" size="xs" className="opacity-0 group-hover:opacity-100" onClick={(e) => (e.stopPropagation(), edit("clip", c))} />
                    </div>
                    <div className={clsx("selectable line-clamp-4 flex-1 whitespace-pre-wrap break-words text-[13px] text-text2", code && "font-mono text-[13.5px] tracking-wide text-text")}>{c.data.text}</div>
                    <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-text3">
                      {(c.data.tags || []).slice(0, 3).map((g) => (
                        <Tag key={g}>#{g}</Tag>
                      ))}
                      <span className="ml-auto">{c.data.uses ? `Copied ${c.data.uses}×` : ago(c.updated_at)}</span>
                      <span className={clsx("ml-2 inline-flex items-center gap-1 font-medium transition-colors", copied ? "text-success" : "text-accent-text opacity-0 group-hover:opacity-100")}>
                        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <Empty
            icon={Bookmark}
            title={q || tag ? "Nothing matches" : "Nothing saved yet"}
            body={q || tag ? "Try other words." : "Keep the text you copy often here: an account number, an address, a message you send a lot."}
            action={
              !q && !tag ? (
                <div className="flex gap-2">
                  <Button variant="primary" icon={Plus} onClick={() => edit("clip")}>
                    Save some text
                  </Button>
                  <Button icon={ClipboardPaste} onClick={paste}>
                    Paste from the clipboard
                  </Button>
                </div>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
