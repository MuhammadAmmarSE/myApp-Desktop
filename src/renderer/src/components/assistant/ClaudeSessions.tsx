// Settings → Assistant → Claude sessions: your Claude Code sessions on claude.ai that the assistant
// can send work to ("tell the website session to add a contact page"). Anthropic has no way for an
// app to list them, so you give each one once: its link and a name. Claude's answers, and any
// approval it asks for, are in the session itself (claude.ai or the Claude app).
import { useEffect, useState } from "react";
import { Bot, ExternalLink, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { parseClaudeSession } from "@myapp/core";
import { Button, Card, Field, IconButton, Input, Menu, SkeletonRows, toast } from "@/components/ui";
import { claudeSessionsOn, editClaudeSession, forgetClaudeSession, listClaudeSessions, saveClaudeSession, useOperator, type SavedClaudeSession } from "@/store/operator";
import { bridge } from "@/lib/bridge";
import { ago } from "@/lib/format";

const openInClaude = (url: string) => void bridge.app.openExternal(url);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function ClaudeSessions() {
  const on = useOperator((s) => (s.availability === "ready" || s.availability === "paused") && claudeSessionsOn(s.status));
  const [list, setList] = useState<SavedClaudeSession[] | null>(null);
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", note: "" });

  const load = () =>
    listClaudeSessions().then(setList, (e: Error) => {
      setList([]);
      toast.error(e.message || "Couldn't load your Claude sessions.");
    });
  useEffect(() => {
    if (on) void load();
  }, [on]);
  if (!on) return null;

  const id = parseClaudeSession(link);
  const taken = (n: string, except?: number) => (list || []).some((s) => s.id !== except && s.name.toLowerCase() === clean(n).toLowerCase());
  const canAdd = !!id && !!clean(name) && !taken(name) && !busy;
  const add = async () => {
    if (!canAdd || !id) return;
    setBusy(true);
    try {
      await saveClaudeSession({ session: id, name: clean(name), note: clean(note) });
      toast.success(`Saved “${clean(name)}”: ask the assistant to send it work`);
      setLink("");
      setName("");
      setNote("");
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't save it.");
    } finally {
      setBusy(false);
    }
  };
  const saveEdit = async (s: SavedClaudeSession) => {
    const n = clean(draft.name);
    if (!n || taken(n, s.id)) return toast.error(n ? "You already have a session with that name." : "Give it a name.");
    try {
      await editClaudeSession(s.id, { name: n, note: clean(draft.note) });
      setEditing(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't save it.");
    }
  };
  const forget = async (s: SavedClaudeSession) => {
    try {
      await forgetClaudeSession(s.id);
    } catch (e) {
      return toast.error((e as Error).message || "Couldn't forget it.");
    }
    setList((l) => (l || []).filter((x) => x.id !== s.id));
    toast.undo(`Forgot “${s.name}”`, () => void saveClaudeSession({ session: s.session_id, name: s.name, note: s.note }).then(load, (e: Error) => toast.error(e.message || "Couldn't put it back.")));
  };

  const linkHint = !link.trim()
    ? "Copy it from the address bar of the session on claude.ai/code, or Share → Copy link in the Claude app."
    : id
      ? "That's a Claude session."
      : "That isn't a Claude session link (it looks like claude.ai/code/session_…).";
  return (
    <section className="mt-6" data-testid="claude-sessions">
      <div className="mb-1 text-[13px] font-semibold">Claude sessions</div>
      <p className="mb-3 text-[12.5px] text-text3">
        {"Your Claude Code sessions on claude.ai. Give each one once and the assistant can send it work by name. Claude's answers, and anything it asks you to approve, are in the session on claude.ai or the Claude app."}
      </p>
      <Card className="mb-3">
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Field label="Its link" hint={linkHint}>
            <Input value={link} onChange={setLink} placeholder="https://claude.ai/code/session_…" aria-label="The session's link" invalid={!!link.trim() && !id} spellCheck={false} />
          </Field>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Field label="Its name" className="sm:w-[38%]" hint={taken(name) ? "You already have a session with that name." : undefined}>
              <Input value={name} onChange={setName} placeholder="e.g. website" aria-label="Its name" invalid={taken(name)} />
            </Field>
            <Field label="What it works on (optional)" className="flex-1">
              <Input value={note} onChange={setNote} placeholder="e.g. the shop's website repo" aria-label="What it works on" />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" icon={Plus} disabled={!canAdd}>
              Add session
            </Button>
          </div>
        </form>
      </Card>
      {list === null ? (
        <SkeletonRows rows={2} />
      ) : list.length ? (
        <Card>
          {list.map((s) => (
            <div key={s.id} className="group flex items-center gap-3 border-b border-line py-3 last:border-0" data-claude-session={s.name}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface2 text-accent-text hairline">
                <Bot size={16} />
              </span>
              {editing === s.id ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                  <Input value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} autoFocus aria-label="New name" onKeyDown={(e) => (e.key === "Enter" ? void saveEdit(s) : e.key === "Escape" ? setEditing(null) : undefined)} />
                  <Input
                    value={draft.note}
                    onChange={(v) => setDraft((d) => ({ ...d, note: v }))}
                    placeholder="What it works on"
                    aria-label="New note"
                    onKeyDown={(e) => (e.key === "Enter" ? void saveEdit(s) : e.key === "Escape" ? setEditing(null) : undefined)}
                  />
                  <Button size="sm" variant="primary" onClick={() => void saveEdit(s)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openInClaude(s.url)} title={s.url}>
                    <div className="truncate text-[13.5px] font-medium">{s.name}</div>
                    <div className="truncate text-[12px] text-text3">{[s.note, s.last_sent_at ? `sent ${ago(s.last_sent_at)}` : "nothing sent yet"].filter(Boolean).join(" · ")}</div>
                  </button>
                  <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openInClaude(s.url)}>
                    Open in Claude
                  </Button>
                  <Menu
                    trigger={(open) => <IconButton icon={MoreHorizontal} label={`More for ${s.name}`} onClick={open} />}
                    items={[
                      { label: "Rename or change its note", icon: Pencil, onSelect: () => (setEditing(s.id), setDraft({ name: s.name, note: s.note })) },
                      { label: "Forget it here", icon: Trash2, danger: true, onSelect: () => void forget(s) },
                    ]}
                  />
                </>
              )}
            </div>
          ))}
        </Card>
      ) : (
        <div className="text-[13px] text-text3">None yet. Paste a session's link above.</div>
      )}
    </section>
  );
}
