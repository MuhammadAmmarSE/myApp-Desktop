// Pieces every editor uses: the footer (Delete · Cancel · Save, Ctrl/⌘ Enter saves), quick-pick
// chip rows, a tags field and the "remind me" chips.
import { useEffect, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cleanTags } from "@myapp/core";
import { Button, Chip, Input } from "@/components/ui";
import { isMac } from "@/lib/bridge";

export function useSaveKey(save: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (isMac() ? e.metaKey : e.ctrlKey)) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, enabled]);
}

// `why` says what is still missing while Save can't be pressed ("Pick a category")
export function FormFooter({ onSave, onCancel, onDelete, ok = true, saveLabel = "Save", extra, deleteLabel = "Delete", why }: { onSave: () => void; onCancel: () => void; onDelete?: () => void; ok?: boolean; saveLabel?: string; extra?: ReactNode; deleteLabel?: string; why?: string }) {
  useSaveKey(onSave, ok);
  return (
    <>
      {onDelete && (
        <Button variant="danger" icon={Trash2} onClick={onDelete}>
          {deleteLabel}
        </Button>
      )}
      {extra}
      <div className="flex-1" />
      {!ok && why && (
        <span className="mr-1 text-[12px] text-text3" data-testid="form-why">
          {why}
        </span>
      )}
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button variant="primary" disabled={!ok} onClick={onSave} kbd={isMac() ? "⌘↵" : "Ctrl↵"}>
        {saveLabel}
      </Button>
    </>
  );
}

export function ChipRow<T>({ options, value, onChange, allowNone }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; allowNone?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Chip key={String(o.value)} active={o.value === value} onClick={() => onChange(allowNone && o.value === value ? (null as T) : o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

export function TagsInput({ value, onChange, placeholder = "Add tags, separated by commas" }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(", "));
  return <Input value={text} onChange={(v) => setText(v)} onBlur={() => onChange(cleanTags(text))} placeholder={placeholder} aria-label="Tags" />;
}

export function RemindChips({ value, onChange, options }: { value: number[]; onChange: (v: number[]) => void; options: { n: number; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.n);
        return (
          <Chip key={o.n} active={on} onClick={() => onChange(on ? value.filter((x) => x !== o.n) : [...value, o.n].sort((a, b) => b - a))}>
            {o.label}
          </Chip>
        );
      })}
    </div>
  );
}

export const Row2 = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-3">{children}</div>;
