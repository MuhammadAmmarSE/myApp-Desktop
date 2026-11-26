// One answer from the assistant, in markdown, with what you'd want to do with it: copy it, keep it
// in Saved, or hear it read out.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "motion/react";
import { Bookmark, Copy, Sparkles, Volume2 } from "lucide-react";
import { IconButton, toast } from "@/components/ui";
import { useRecords } from "@/store/records";
import { bridge } from "@/lib/bridge";
import { speak } from "@/lib/speech";

const firstLine = (t: string) =>
  t
    .split("\n")
    .map((l) => l.replace(/^[#>*\-\s]+/, "").trim())
    .find(Boolean)
    ?.slice(0, 60) || "From the assistant";

export function Reply({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="group flex max-w-[86%] gap-3" data-reply>
      <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] accent-grad text-on-accent shadow-[var(--shadow-glow)]">
        <Sparkles size={15} />
      </span>
      <div className="min-w-0">
        <div className="rounded-[16px] rounded-tl-[6px] border border-line bg-surface px-4 py-3">
          <div className="prose-redline !text-[14px]">
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
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
        </div>
        <div className="mt-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <IconButton icon={Copy} label="Copy" size="xs" onClick={() => (bridge.clipboard.write(text), toast("Copied"))} />
          <IconButton
            icon={Bookmark}
            label="Keep in Saved"
            size="xs"
            onClick={() => {
              useRecords.getState().create("clip", { title: firstLine(text), text, tags: ["assistant"] });
              toast.success("Kept in Saved");
            }}
          />
          <IconButton icon={Volume2} label="Read it aloud" size="xs" onClick={() => speak(text)} />
        </div>
      </div>
    </motion.div>
  );
}
