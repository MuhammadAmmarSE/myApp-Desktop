// Nudges: what's waiting now (the most pressing first), what's coming later (snoozed, or not due
// yet), and the history (done, dismissed, no longer needed), which can be cleared. Each one can be
// done, snoozed, dismissed or opened; the controls are in Settings → Nudges.
import { motion } from "motion/react";
import { BellRing, Settings2, Trash2 } from "lucide-react";
import { Button, Card, CardTitle, Empty, Page, PageHeader, toast } from "@/components/ui";
import { NudgeCard, NudgeRow } from "@/components/NudgeCard";
import { clearNudgeHistory, useNudges } from "@/lib/nudges";
import { navigate } from "@/lib/router";
import { plural } from "@/lib/format";
import { rise } from "@/theme/motion";

export default function Nudges() {
  const { due, later, past, today, settings } = useNudges();
  const clear = () => {
    const n = past.length;
    toast.undo(`Cleared ${plural(n, "nudge")} from the history`, clearNudgeHistory());
  };
  const nothing = !due.length && !later.length && !past.length;
  return (
    <Page width="normal">
      <PageHeader
        eyebrow="The assistant"
        title="Nudges"
        icon={BellRing}
        subtitle={due.length ? `${plural(due.length, "nudge")} waiting` : later.length ? `${plural(later.length, "nudge")} coming up` : "Nothing waiting"}
        actions={
          <Button icon={Settings2} onClick={() => navigate("/settings?section=nudges")}>
            Nudge settings
          </Button>
        }
      />
      {nothing ? (
        <Card>
          <Empty
            icon={BellRing}
            title="Nothing to bring up"
            body={settings.on ? "When something needs you (a to-do past its day, a birthday coming, a loan past its day), it shows here and on Today." : "Nudges are off. Switch them on in Settings → Nudges."}
          />
        </Card>
      ) : null}
      {due.length ? (
        <motion.div {...rise(0)} className="mb-5 flex flex-col gap-3" data-testid="nudges-now">
          <NudgeCard nudge={due[0]} />
          {due.length > 1 && (
            <Card>
              <CardTitle title="Also waiting" sub={plural(due.length - 1, "more")} />
              {due.slice(1).map((n) => (
                <NudgeRow key={n.id} nudge={n} today={today} />
              ))}
            </Card>
          )}
        </motion.div>
      ) : null}
      {later.length ? (
        <motion.div {...rise(1)} className="mb-5" data-testid="nudges-later">
          <Card>
            <CardTitle title="Coming up" sub={plural(later.length, "nudge")} />
            {later.map((n) => (
              <NudgeRow key={n.id} nudge={n} today={today} />
            ))}
          </Card>
        </motion.div>
      ) : null}
      {past.length ? (
        <motion.div {...rise(2)} data-testid="nudges-history">
          <Card>
            <CardTitle
              title="History"
              sub="Clearing it doesn't bring any of them back up"
              action={
                <Button size="sm" variant="ghost" icon={Trash2} onClick={clear} data-testid="nudges-clear">
                  Clear
                </Button>
              }
            />
            {past.slice(0, 100).map((n) => (
              <NudgeRow key={n.id} nudge={n} today={today} past />
            ))}
          </Card>
        </motion.div>
      ) : null}
    </Page>
  );
}
