// Notes: your notes on the left (pinned first, search, tags), the open note on the right in
// markdown — write, see it as it will read, or both side by side. Ctrl/⌘ B I K for bold, italic
// and links; lists carry on when you press Enter; checkboxes tick from the preview. Notes save as
// you type. Open a .md or .txt file (or drop one on the list) to make it a note, and save any note
// out as a .md file.
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  CheckSquare,
  Code,
  Columns2,
  Copy,
  Download,
  Eye,
  FileUp,
  Hash,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  NotebookPen,
  PenLine,
  Pin,
  PinOff,
  Plus,
  Quote,
  Search,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cleanTags, type Rec } from "@myapp/core";
import { Button, Chip, Empty, IconButton, Input, Kbd, Menu, Segmented, Tag, toast, Tooltip, useContextMenu } from "@/components/ui";
import { useList, useRecords } from "@/store/records";
import { navigate } from "@/lib/router";
import { INBOX, isInbox, sendToAi } from "@/lib/inbox";
import { useListNav } from "@/lib/listNav";
import { bridge, isMac, modKey } from "@/lib/bridge";
import { ago, readingTime } from "@/lib/format";
import { continueList, link, prefixLines, snippet, taskCount, toggleTask, wrap, type Edit } from "@/lib/markdown";
import { rise } from "@/theme/motion";

type Mode = "write" | "split" | "read";

export default function Notes({ params }: { params: Record<string, string> }) {
  const notes = useList("note");
  const id = params.id || null;
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const ctx = useContextMenu();
  // the editor keeps its place when a new note gets its id
  const current = useRef<string | null>(id === "new" ? null : id);
  const [editorKey, setEditorKey] = useState(id || "none");
  useEffect(() => {
    if (id !== "new" && id === current.current) return;
    current.current = id === "new" ? null : id;
    setEditorKey(id === "new" ? `new-${Date.now()}` : id || "none");
  }, [id]);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) for (const g of n.data.tags || []) m.set(g, (m.get(g) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [notes]);

  const waiting = useMemo(() => notes.filter(isInbox).sort((a, b) => a.created_at - b.created_at), [notes]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return notes
      .filter((n) => (!tag || (n.data.tags || []).includes(tag)) && words.every((w) => `${n.data.title}\n${n.data.body}\n${(n.data.tags || []).join(" ")}`.toLowerCase().includes(w)))
      .sort((a, b) => Number(!!b.data.pinned) - Number(!!a.data.pinned) || b.updated_at - a.updated_at);
  }, [notes, q, tag]);

  const nav = useListNav(shown, {
    selector: (i) => `[data-note="${i}"]`,
    onOpen: (n) => navigate(`/notes/${n.id}`),
    onDelete: (l) => l.forEach((n) => removeNote(n)),
    onNew: () => navigate("/notes/new"),
  });

  const removeNote = (n: Rec<"note">) => {
    const before = useRecords.getState().byId[n.id];
    useRecords.getState().remove(n.id);
    if (id === n.id) navigate("/notes", { replace: true });
    toast(`Deleted "${(n.data.title || "Untitled").slice(0, 40)}"`, { action: { label: "Undo", run: () => before && useRecords.getState().restore(before) } });
  };
  // the rows get the same two functions every time, so saving the note you're writing redraws only
  // its own row; the functions act on the page's latest state
  const rowMenu = (n: Rec<"note">, e: React.MouseEvent) =>
    ctx(e, [
      { label: n.data.pinned ? "Unpin" : "Pin to the top", icon: n.data.pinned ? PinOff : Pin, onSelect: () => useRecords.getState().update<"note">(n.id, { pinned: !n.data.pinned }) },
      { label: "Copy the text", icon: Copy, onSelect: () => (bridge.clipboard.write(`${n.data.title}\n\n${n.data.body}`.trim()), toast("Copied")) },
      { label: "Send to AI", icon: Sparkles, onSelect: () => sendToAi([n]) },
      { type: "separator" },
      { label: "Delete", icon: Trash2, danger: true, onSelect: () => removeNote(n) },
    ]);
  const latest = useRef({ click: nav.click, menu: rowMenu });
  latest.current = { click: nav.click, menu: rowMenu };
  const onRowClick = useCallback((n: Rec<"note">, e: React.MouseEvent) => latest.current.click(n, e), []);
  const onRowMenu = useCallback((n: Rec<"note">, e: React.MouseEvent) => latest.current.menu(n, e), []);

  const importText = (name: string, text: string) => {
    const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const title = (heading || name.replace(/\.(md|markdown|txt)$/i, "")).slice(0, 120);
    const body = heading ? text.replace(/^#\s+.+\n?/m, "").replace(/^\n+/, "") : text;
    const rec = useRecords.getState().create("note", { title, body, tags: [], pinned: false });
    navigate(`/notes/${rec.id}`);
    return rec;
  };
  const openFile = async () => {
    const f = await bridge.files.openText({ filters: [{ name: "Text and markdown", extensions: ["md", "markdown", "txt"] }] });
    if (!f) return;
    importText(f.name, f.text);
    toast.success(`Opened ${f.name} as a note`);
  };

  return (
    <div className="flex h-full" data-testid="notes">
      {/* the list */}
      <aside
        className={clsx("relative flex w-[320px] shrink-0 flex-col border-r border-line transition-colors", dropping && "bg-accent-soft/40")}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDropping(false);
          const files = [...e.dataTransfer.files].filter((f) => /\.(md|markdown|txt)$/i.test(f.name) && f.size < 2_000_000);
          if (!files.length) return toast("Drop .md or .txt files to make notes of them");
          for (const f of files) importText(f.name, await f.text());
          toast.success(files.length === 1 ? `Added ${files[0].name}` : `Added ${files.length} notes`);
        }}
      >
        <div className="px-4 pb-3 pt-6">
          <div className="mb-3 flex items-center gap-2">
            <h1 className="mr-auto font-display text-[22px] font-semibold tracking-[-0.02em]">Notes</h1>
            <IconButton icon={FileUp} label="Open a .md or .txt file" onClick={openFile} />
            <Button variant="primary" size="sm" icon={Plus} onClick={() => navigate("/notes/new")} kbd="N">
              New
            </Button>
          </div>
          <Input icon={Search} value={q} onChange={setQ} placeholder="Search notes" size="sm" aria-label="Search notes" />
          {waiting.length > 0 && (
            <div className="mt-2.5 flex items-center gap-2.5 rounded-[12px] bg-accent-soft/60 px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--c-glow)]" data-testid="inbox-banner">
              <Sparkles size={16} className="shrink-0 text-accent-text" />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium">{waiting.length === 1 ? "A note is waiting for the AI" : `${waiting.length} notes are waiting for the AI`}</div>
                <div className="text-[11.5px] text-text3">Saved while the server was offline</div>
              </div>
              <Button size="sm" variant="primary" onClick={() => sendToAi(waiting)}>
                Send
              </Button>
            </div>
          )}
          {tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {tags.map(([g, n]) => (
                <Chip key={g} active={tag === g} count={n} onClick={() => setTag(tag === g ? null : g)}>
                  #{g}
                </Chip>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          {shown.length ? (
            <AnimatePresence initial={false}>
              {shown.map((n, i) => (
                <NoteRow key={n.id} n={n} index={i} open={n.id === id} selected={nav.selected.has(n.id)} active={nav.active === n.id} onRowClick={onRowClick} onRowMenu={onRowMenu} />
              ))}
            </AnimatePresence>
          ) : (
            <Empty compact icon={NotebookPen} title={q || tag ? "No notes match" : "No notes yet"} body={q || tag ? "Try other words." : "Write your first one, or drop a .md file here."} />
          )}
        </div>
        <AnimatePresence>
          {dropping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-3 grid place-items-center rounded-[14px] border-2 border-dashed border-accent text-[13px] font-medium text-accent-text">
              Drop to add as notes
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* the open note */}
      <main className="min-w-0 flex-1">
        {id ? (
          <NoteEditor
            key={editorKey}
            id={id === "new" ? null : id}
            onCreated={(newId) => {
              current.current = newId;
              navigate(`/notes/${newId}`, { replace: true });
            }}
            onDelete={removeNote}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <motion.div {...rise(1)}>
              <Empty
                icon={NotebookPen}
                title={notes.length ? "Pick a note" : "Write something down"}
                body={notes.length ? `Choose one on the left, or start a new one with N.` : "Notes are markdown: lists, checkboxes, headings and links. They reach your phone on the next sync."}
                action={
                  <div className="flex gap-2">
                    <Button variant="primary" icon={Plus} onClick={() => navigate("/notes/new")}>
                      New note
                    </Button>
                    <Button icon={FileUp} onClick={openFile}>
                      Open a file
                    </Button>
                  </div>
                }
              />
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------- the editor ----------------
const TOOLS: { icon: LucideIcon; label: string; kbd?: string; run: (t: string, s: { start: number; end: number }) => Edit }[] = [
  { icon: Bold, label: "Bold", kbd: "B", run: (t, s) => wrap(t, s, "**", "**", "bold") },
  { icon: Italic, label: "Italic", kbd: "I", run: (t, s) => wrap(t, s, "_", "_", "italic") },
  { icon: Heading2, label: "Heading", run: (t, s) => prefixLines(t, s, "## ") },
  { icon: List, label: "List", run: (t, s) => prefixLines(t, s, "- ") },
  { icon: ListOrdered, label: "Numbered list", run: (t, s) => prefixLines(t, s, "1. ") },
  { icon: CheckSquare, label: "Checklist", run: (t, s) => prefixLines(t, s, "- [ ] ") },
  { icon: Quote, label: "Quote", run: (t, s) => prefixLines(t, s, "> ") },
  { icon: Code, label: "Code", run: (t, s) => wrap(t, s, "`", "`", "code") },
  { icon: Link2, label: "Link", kbd: "K", run: (t, s) => link(t, s) },
];

// One note in the list. It redraws only when its own note changes (or it's opened, chosen or
// moved to), not every time the note being written is saved.
const NoteRow = memo(function NoteRow({ n, index, open, selected, active, onRowClick, onRowMenu }: { n: Rec<"note">; index: number; open: boolean; selected: boolean; active: boolean; onRowClick: (n: Rec<"note">, e: React.MouseEvent) => void; onRowMenu: (n: Rec<"note">, e: React.MouseEvent) => void }) {
  const tc = useMemo(() => taskCount(n.data.body), [n.data.body]);
  const text = useMemo(() => snippet(n.data.body), [n.data.body]);
  return (
    <motion.button
      layout="position"
      type="button"
      data-note={n.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 12) * 0.015 }}
      onClick={(e) => onRowClick(n, e)}
      onContextMenu={(e) => onRowMenu(n, e)}
      className={clsx("mb-0.5 block w-full rounded-[11px] px-3 py-2.5 text-left transition-colors", open ? "bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-accent)_35%,transparent)]" : selected ? "bg-accent-soft/50" : active ? "bg-hover" : "hover:bg-hover")}
    >
      <div className="flex items-center gap-1.5">
        {n.data.pinned && <Pin size={12} className="shrink-0 text-accent-text" />}
        <span className={clsx("truncate text-[13.5px] font-semibold", !n.data.title && "text-text3")}>{n.data.title || "Untitled"}</span>
        <span className="ml-auto shrink-0 text-[11px] text-text3">{ago(n.updated_at)}</span>
      </div>
      <div className="mt-0.5 line-clamp-2 text-[12.5px] text-text2">{text || <span className="text-text3">Nothing written yet</span>}</div>
      {(tc.total > 0 || (n.data.tags || []).length > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {tc.total > 0 && (
            <Tag tone={tc.done === tc.total ? "success" : "default"}>
              <CheckSquare size={10} /> {tc.done}/{tc.total}
            </Tag>
          )}
          {(n.data.tags || []).slice(0, 3).map((g) => (
            <Tag key={g}>#{g}</Tag>
          ))}
        </div>
      )}
    </motion.button>
  );
});

function NoteEditor({ id, onCreated, onDelete }: { id: string | null; onCreated: (id: string) => void; onDelete: (n: Rec<"note">) => void }) {
  const rec = useRecords((s) => (id ? (s.byId[id] as Rec<"note"> | undefined) : undefined));
  const [title, setTitle] = useState(rec?.data.title || "");
  const [body, setBody] = useState(rec?.data.body || "");
  const [tagText, setTagText] = useState((rec?.data.tags || []).join(", "));
  const [pinned, setPinned] = useState(!!rec?.data.pinned);
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem("redline.noteMode") as Mode) || "write");
  const recId = useRef<string | null>(id);
  const saved = useRef(JSON.stringify(rec ? { t: rec.data.title, b: rec.data.body, g: rec.data.tags || [], p: !!rec.data.pinned } : null));
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) titleRef.current?.focus();
  }, [id]);
  useEffect(() => localStorage.setItem("redline.noteMode", mode), [mode]);

  // a change from the phone while this note is open, and nothing is waiting to save here
  useEffect(() => {
    if (!rec || pending.current) return;
    const now = JSON.stringify({ t: rec.data.title, b: rec.data.body, g: rec.data.tags || [], p: !!rec.data.pinned });
    if (now === saved.current) return;
    saved.current = now;
    setTitle(rec.data.title);
    setBody(rec.data.body);
    setTagText((rec.data.tags || []).join(", "));
    setPinned(!!rec.data.pinned);
  }, [rec]);

  const save = () => {
    pending.current = null;
    const tags = cleanTags(tagText);
    const snap = JSON.stringify({ t: title, b: body, g: tags, p: pinned });
    if (snap === saved.current) return;
    const s = useRecords.getState();
    if (!recId.current) {
      if (!title.trim() && !body.trim()) return;
      const r = s.create("note", { title: title.trim(), body, tags, pinned });
      recId.current = r.id;
      saved.current = snap;
      onCreated(r.id);
      return;
    }
    if (!s.byId[recId.current]) return; // deleted meanwhile
    s.update<"note">(recId.current, { title: title.trim(), body, tags, pinned });
    saved.current = snap;
  };
  const saveNow = useRef(save);
  saveNow.current = save;
  // hand the note to the AI: saved first, so it's sent as it reads now
  const inbox = cleanTags(tagText).includes(INBOX);
  const hasText = !!(title.trim() || body.trim());
  const toAi = () => {
    if (pending.current) clearTimeout(pending.current);
    saveNow.current();
    const r = recId.current ? (useRecords.getState().byId[recId.current] as Rec<"note"> | undefined) : undefined;
    if (r) sendToAi([r]);
  };
  useEffect(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => saveNow.current(), 450);
    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, tagText, pinned]);
  // and when leaving the note
  useEffect(
    () => () => {
      if (pending.current) {
        clearTimeout(pending.current);
        saveNow.current();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const apply = (e: Edit) => {
    setBody(e.text);
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(e.sel.start, e.sel.end);
    });
  };
  const tool = (run: (t: string, s: { start: number; end: number }) => Edit) => {
    const el = area.current;
    if (!el) return;
    if (mode === "read") setMode("write");
    apply(run(body, { start: el.selectionStart, end: el.selectionEnd }));
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const sel = { start: el.selectionStart, end: el.selectionEnd };
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (mod && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      const t = TOOLS.find((x) => x.kbd?.toLowerCase() === k);
      if (t) {
        e.preventDefault();
        apply(t.run(body, sel));
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !mod) {
      const c = continueList(body, sel);
      if (c) {
        e.preventDefault();
        apply(c);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      apply({ text: body.slice(0, sel.start) + "  " + body.slice(sel.end), sel: { start: sel.start + 2, end: sel.start + 2 } });
    }
  };

  // the toolbar's buttons get one function that stays the same, so typing doesn't redraw them
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const onTool = useCallback((run: (t: string, s: { start: number; end: number }) => Edit) => toolRef.current(run), []);
  // the preview follows the text a moment behind: reading a long note as markdown on every key held
  // the typing back; React draws it as soon as there's a gap (and not at all while it's hidden)
  const shown = useDeferredValue(mode === "write" ? "" : body);
  const rt = readingTime(`${title} ${body}`);
  const tc = taskCount(body);
  const preview = useMemo(() => {
    let taskN = -1;
    return (
    <div className="prose-redline px-10 py-6" data-testid="note-preview">
      {shown.trim() ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  if (href) void bridge.app.openExternal(href);
                }}
              >
                {children}
              </a>
            ),
            input: ({ checked, type }) => {
              if (type !== "checkbox") return null;
              const n = ++taskN;
              return <input type="checkbox" checked={!!checked} onChange={() => setBody((b) => toggleTask(b, n))} aria-label={checked ? "Untick" : "Tick"} />;
            },
          }}
        >
          {shown}
        </ReactMarkdown>
      ) : (
        <p className="text-text3">Nothing to show yet.</p>
      )}
    </div>
    );
  }, [shown]);

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex items-center gap-1 border-b border-line px-6 py-2">
        <ToolButtons onTool={onTool} />
        <div className="flex-1" />
        <Segmented<Mode>
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "write", label: "Write", icon: PenLine },
            { value: "split", label: "Both", icon: Columns2 },
            { value: "read", label: "Read", icon: Eye },
          ]}
        />
        <Tooltip label="Send to AI: put what it says in the right place">
          <IconButton icon={Sparkles} label="Send to AI" size="sm" onClick={toAi} disabled={!hasText} tip={false} />
        </Tooltip>
        <Tooltip label={pinned ? "Unpin" : "Pin to the top"}>
          <IconButton icon={pinned ? PinOff : Pin} label={pinned ? "Unpin" : "Pin"} active={pinned} size="sm" onClick={() => setPinned((p) => !p)} tip={false} />
        </Tooltip>
        <Menu
          trigger={(open) => <IconButton icon={MoreHorizontal} label="More" size="sm" onClick={open} />}
          items={[
            { label: "Copy the text", icon: Copy, onSelect: () => (bridge.clipboard.write(`${title}\n\n${body}`.trim()), toast("Copied")) },
            {
              label: "Save as a .md file",
              icon: Download,
              onSelect: async () => {
                const p = await bridge.files.saveText({ name: `${(title || "Note").replace(/[\\/:*?"<>|]/g, "-")}.md`, text: `# ${title || "Note"}\n\n${body}\n`, filters: [{ name: "Markdown", extensions: ["md"] }] });
                if (p) toast.success("Saved");
              },
            },
            { type: "separator" },
            { label: "Delete", icon: Trash2, danger: true, disabled: !recId.current, onSelect: () => rec && onDelete(rec) },
          ]}
        />
      </div>

      <div className={clsx("min-h-0 flex-1", mode === "split" ? "grid grid-cols-2" : "flex flex-col")}>
        {mode !== "read" && (
          <div className={clsx("min-h-0 overflow-y-auto", mode === "split" && "border-r border-line")}>
            <div className="mx-auto max-w-[820px] px-10 pb-10 pt-7">
              {inbox && hasText && (
                <div className="mb-5 flex items-center gap-3 rounded-[14px] bg-accent-soft/60 px-4 py-3 shadow-[inset_0_0_0_1px_var(--c-glow)]" data-testid="note-inbox">
                  <Sparkles size={18} className="shrink-0 text-accent-text" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold">Waiting for the AI</div>
                    <div className="text-[12.5px] text-text2">{"Saved while the server couldn't be reached. Send it now and it goes where it belongs: Money, to-dos, reminders… This note is removed once that's saved."}</div>
                  </div>
                  <Button variant="primary" icon={Sparkles} onClick={toAi}>
                    Send to AI
                  </Button>
                </div>
              )}
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "ArrowDown") {
                    e.preventDefault();
                    area.current?.focus();
                  }
                }}
                placeholder="Title"
                aria-label="Title"
                data-testid="note-title"
                className="w-full bg-transparent font-display text-[28px] font-semibold tracking-[-0.02em] outline-none placeholder:text-text3"
              />
              <TextArea value={body} onChange={setBody} onKeyDown={onKey} areaRef={area} />
            </div>
          </div>
        )}
        {mode !== "write" && (
          <div className="min-h-0 overflow-y-auto">
            {mode === "read" && <h1 className="mx-auto max-w-[820px] px-10 pt-7 font-display text-[28px] font-semibold tracking-[-0.02em]">{title || "Untitled"}</h1>}
            <div className={clsx(mode === "read" && "mx-auto max-w-[820px]")}>{preview}</div>
          </div>
        )}
      </div>

      {/* tags and what it holds */}
      <div className="flex items-center gap-3 border-t border-line px-6 py-2 text-[12px] text-text3">
        <Hash size={13} />
        <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Tags, separated by commas" aria-label="Tags" className="h-7 w-[280px] bg-transparent text-text2 outline-none placeholder:text-text3" />
        <div className="flex-1" />
        {tc.total > 0 && (
          <span>
            {tc.done} of {tc.total} ticked
          </span>
        )}
        <span className="tnum">
          {rt.words} word{rt.words === 1 ? "" : "s"} · {rt.minutes} min read
        </span>
        <span>{recId.current ? (rec ? `Saved · ${ago(rec.updated_at)}` : "Saving…") : "Not saved yet"}</span>
        <span className="hidden xl:inline">
          <Kbd>{modKey()} B</Kbd> <Kbd>{modKey()} I</Kbd> <Kbd>{modKey()} K</Kbd>
        </span>
      </div>
    </div>
  );
}

// bold, italic, lists and the rest: drawn once, not on every key
const ToolButtons = memo(function ToolButtons({ onTool }: { onTool: (run: (t: string, s: { start: number; end: number }) => Edit) => void }) {
  return (
    <>
      {TOOLS.map((t) => (
        <IconButton key={t.label} icon={t.icon} label={t.label} kbd={t.kbd ? `${modKey()} ${t.kbd}` : undefined} size="sm" onClick={() => onTool(t.run)} />
      ))}
    </>
  );
});

// a body field that grows with what's written, so the page scrolls as one
function TextArea({ value, onChange, onKeyDown, areaRef }: { value: string; onChange: (v: string) => void; onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; areaRef: React.RefObject<HTMLTextAreaElement | null> }) {
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(320, el.scrollHeight)}px`;
  }, [value, areaRef]);
  return (
    <textarea
      ref={areaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={"Write anything. Markdown works:\n\n- a list\n- [ ] something to tick\n**bold**, _italic_, [a link](https://)"}
      aria-label="Note"
      data-testid="note-body"
      spellCheck
      className="mt-3 w-full resize-none bg-transparent text-[15px] leading-[1.7] text-text outline-none placeholder:text-text3"
    />
  );
}
