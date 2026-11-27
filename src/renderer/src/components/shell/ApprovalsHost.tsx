// Watches for the assistant's questions while Redline runs. When one comes in: a card in the
// corner of any page (not on the chat it belongs to, which shows it already) and, if the window
// isn't in front, a notification. A report from one of your Claude sessions is announced the same
// way: a toast you can open, and a notification when the window is in the background.
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Fingerprint } from "lucide-react";
import { reportStatusWords } from "@myapp/core";
import { toast } from "@/components/ui";
import { useOperator, watchApprovals } from "@/store/operator";
import { navigate, useLocation } from "@/lib/router";
import { bridge } from "@/lib/bridge";
import { ease } from "@/theme/motion";

export function ApprovalsHost() {
  const approvals = useOperator((s) => s.approvals);
  const { path } = useLocation();
  const told = useRef(new Set<number>());
  useEffect(() => watchApprovals(), []);
  useEffect(() => {
    for (const a of approvals) {
      if (told.current.has(a.id)) continue;
      told.current.add(a.id);
      void bridge.notify({ title: "The assistant needs your yes", body: a.summary, url: `/assistant/${a.conversation_id}` });
    }
  }, [approvals]);
  // a Claude session reported back: say so, unless that chat is open (it shows it there)
  const news = useOperator((s) => s.reportNews);
  const toldReport = useRef(0); // the newest report already announced
  useEffect(() => {
    const r = news[news.length - 1];
    if (!r || r.id <= toldReport.current) return;
    toldReport.current = r.id;
    const chat = r.run_id ? `/assistant/${r.run_id}` : null;
    const title = `Claude · ${r.session}: ${reportStatusWords(r.status)}`;
    void bridge.notify({ title, body: r.summary, url: chat || "/assistant" });
    if (chat && path === chat) return;
    const text = `${title}. ${r.summary}`;
    toast(text.length > 160 ? `${text.slice(0, 159)}…` : text, { tone: r.status === "failed" ? "error" : r.status === "done" ? "success" : "info", ...(chat ? { action: { label: "Open", run: () => navigate(chat) } } : {}), ms: 9000 });
    // path is read, not watched: moving to another page doesn't announce it again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news]);
  const first = approvals[0];
  const here = first && path === `/assistant/${first.conversation_id}`;
  return (
    <AnimatePresence>
      {first && !here && (
        <motion.button
          key="approval"
          type="button"
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.14 } }}
          transition={{ duration: 0.26, ease: ease.out }}
          onClick={() => navigate(`/assistant/${first.conversation_id}`)}
          className="fixed right-4 z-[90] flex w-[360px] items-center gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--c-accent)_60%,var(--c-line))] bg-surface p-3 text-left shadow-[var(--shadow-pop),0_0_0_4px_color-mix(in_srgb,var(--c-accent)_12%,transparent)]"
          style={{ top: "calc(var(--titlebar-h) + 12px)" }}
          aria-label={`The assistant needs your yes: ${first.summary}`}
        >
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full accent-grad text-on-accent">
            <span className="absolute inset-0 rounded-full accent-grad" style={{ opacity: 0, animation: "pulse-ring 1.8s var(--ease-out) 8" }} />
            <Fingerprint size={17} className="relative" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">{approvals.length > 1 ? `${approvals.length} questions are waiting for you` : "The assistant needs your yes"}</span>
            <span className="block truncate text-[12px] text-text2">{first.summary}</span>
          </span>
          <ArrowRight size={16} className="shrink-0 text-accent-text" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
