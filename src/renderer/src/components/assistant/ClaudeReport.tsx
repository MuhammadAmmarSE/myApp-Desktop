// One of your Claude sessions on claude.ai reported back: what it says it did (or what it needs
// from you), with the way to its session and its pull request. It is Claude's own words, shown as
// they came; nothing acts on it by itself.
import { motion } from "motion/react";
import clsx from "clsx";
import { Bot, ExternalLink, GitPullRequest } from "lucide-react";
import { reportStatusWords, type ClaudeReport } from "@myapp/core";
import { Button, Tag } from "@/components/ui";
import { bridge } from "@/lib/bridge";
import { ago } from "@/lib/format";

const TONE = { done: "success", needs_you: "accent", working: "default", failed: "danger" } as const;
const open = (url: string) => void bridge.app.openExternal(url);

export function ClaudeReportCard({ report }: { report: ClaudeReport }) {
  const needsYou = report.status === "needs_you";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={clsx("flex flex-col gap-2.5 rounded-[14px] p-3.5 glass", needsYou ? "shadow-[inset_0_0_0_1px_var(--c-accent)]" : "hairline")}
      data-claude-report={report.status}
      aria-label={`Claude, ${report.session}: ${reportStatusWords(report.status)}. ${report.summary}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-surface2 text-accent-text hairline">
          <Bot size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">{`Claude · ${report.session}`}</span>
          <span className="block text-[12px] text-text3">{`Reported back ${ago(report.at)}`}</span>
        </span>
        <Tag tone={TONE[report.status]}>{reportStatusWords(report.status)}</Tag>
      </div>
      <p className="selectable whitespace-pre-wrap text-[13.5px] text-text">{report.summary}</p>
      {(report.sessionUrl || report.pullRequest) && (
        <div className="flex flex-wrap gap-2">
          {report.sessionUrl && (
            <Button size="xs" variant="secondary" icon={ExternalLink} onClick={() => open(report.sessionUrl)}>
              {needsYou ? "Answer in Claude" : "Open in Claude"}
            </Button>
          )}
          {report.pullRequest && (
            <Button size="xs" variant="secondary" icon={GitPullRequest} onClick={() => open(report.pullRequest!)}>
              Pull request
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
