// Files sent in a conversation: named, with Save (fetched from the server, then saved where you
// choose through the main process).
import { useState } from "react";
import { Download, FileArchive, FileImage, FileSpreadsheet, FileText, File as FileIcon, Presentation } from "lucide-react";
import type { TimelineFile } from "@myapp/core";
import { Spin, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { bridge } from "@/lib/bridge";
import { fileSize } from "@/lib/attachments";

// an icon for what a file is, from its kind or its name
function KindIcon({ f }: { f: TimelineFile }) {
  const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] || "").toLowerCase();
  if (f.kind === "xlsx" || ["xlsx", "xls", "csv", "tsv", "ods"].includes(ext)) return <FileSpreadsheet size={16} />;
  if (f.kind === "pptx" || ["pptx", "ppt", "key", "odp"].includes(ext)) return <Presentation size={16} />;
  if (f.kind === "image") return <FileImage size={16} />;
  if (["zip", "rar", "7z", "gz", "tar", "apk"].includes(ext)) return <FileArchive size={16} />;
  if (["pdf", "docx", "text"].includes(f.kind)) return <FileText size={16} />;
  return <FileIcon size={16} />;
}

export function SentFiles({ runId, files }: { runId: number; files: TimelineFile[] }) {
  const [saving, setSaving] = useState<number | null>(null);
  const save = async (f: TimelineFile) => {
    setSaving(f.id);
    try {
      const r = await api<{ file: { name: string; data: string } }>("GET", `/operator/runs/${runId}/files/${f.id}`, undefined, { timeoutMs: 60000 });
      const where = await bridge.files.saveFile({ name: r.file.name, data: r.file.data });
      if (where) toast.success(`Saved ${r.file.name}`);
    } catch (e: any) {
      toast.error(e?.message || `Couldn't save “${f.name}”.`);
    } finally {
      setSaving(null);
    }
  };
  return (
    <div className="flex flex-col items-end gap-1.5">
      {files.map((f) => (
        <div key={f.id} className="flex max-w-[320px] items-center gap-2.5 rounded-[12px] glass py-2 pl-2.5 pr-1.5 hairline" data-testid="sent-file">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-accent-soft text-accent-text">
            <KindIcon f={f} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-text">{f.name}</span>
            <span className="block text-[11px] text-text3">{[f.pages ? `${f.pages} page${f.pages === 1 ? "" : "s"}` : "", f.bytes ? fileSize(f.bytes) : ""].filter(Boolean).join(" · ")}</span>
          </span>
          <button type="button" aria-label={`Save ${f.name}`} onClick={() => void save(f)} disabled={saving === f.id} className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-text2 hover:bg-hover hover:text-text disabled:opacity-60">
            {saving === f.id ? <Spin size={14} /> : <Download size={15} />}
          </button>
        </div>
      ))}
    </div>
  );
}
