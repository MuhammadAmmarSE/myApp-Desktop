// Things you bought with someone's money but noted as your own spending (before they gave it, or
// before the hisaab was made): tick them and they move onto the hisaab, off your spending. Shows
// what will be left with you (or what they'd owe you) before you save. The same as the phone's.
import { useMemo, useState } from "react";
import clsx from "clsx";
import { History } from "lucide-react";
import { fundAfter, fundCandidates, fundSummary, isoDate, type Rec } from "@myapp/core";
import { Button, Checkbox, Dialog, Empty, Tag, toast } from "@/components/ui";
import { moveOntoFund } from "@/lib/funds";
import { useList } from "@/store/records";
import { useSettings } from "@/store/settings";
import { dayWord, money } from "@/lib/format";

export function FundAttachDialog({ open, onClose, fund }: { open: boolean; onClose: () => void; fund: Rec<"fund"> }) {
  const money$ = useList("money");
  const items = useList("item");
  const currency = useSettings((s) => s.currency);
  const [picked, setPicked] = useState<string[]>([]);
  // nothing ticked each time it opens
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPicked([]);
  }
  const today = isoDate();
  const list = useMemo(() => fundCandidates(fund, money$, { today }), [fund, money$, today]);
  const s = useMemo(() => fundSummary(fund, money$, items), [fund, money$, items]);
  const cur = fund.data.currency || currency;
  const who = fund.data.from || "them";
  const chosen = list.filter((x) => picked.includes(x.rec.id));
  const total = chosen.reduce((n, x) => n + (Number(x.rec.data.amount) || 0), 0);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.concat(id)));
  // yesterday's groceries for money given today: one click ticks them all
  const recent = list.filter((x) => x.recent).map((x) => x.rec.id);
  const allRecent = recent.length > 0 && recent.every((id) => picked.includes(id));
  const save = () => {
    if (!chosen.length) return;
    const undo = moveOntoFund(
      fund.id,
      chosen.map((x) => x.rec.id),
    );
    onClose();
    toast.undo(`${chosen.length === 1 ? "1 thing" : `${chosen.length} things`} put on ${who}'s hisaab`, undo);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Put on ${who}'s hisaab`}
      description={`Paid for with ${who}'s money but noted as yours? Tick it: it comes off your spending and off what ${who} gave.`}
      icon={History}
      width={520}
      footer={
        <>
          <div className="mr-auto min-w-0 text-[12.5px] text-text2" data-testid="attach-after">
            {chosen.length ? `${money(total, cur)} from ${who}'s money: ${fundAfter(fund, s, total, currency)}` : ""}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!chosen.length}>
            {chosen.length ? `Put ${chosen.length} on ${who}'s hisaab` : "Tick what you bought with it"}
          </Button>
        </>
      }
    >
      {list.length ? (
        <>
          {recent.length > 1 && !allRecent && (
            <div className="mb-2 flex justify-end">
              <Button size="xs" variant="ghost" onClick={() => setPicked((p) => Array.from(new Set(p.concat(recent))))}>
                Tick the {recent.length} recent {fund.data.purpose ? fund.data.purpose.toLowerCase() : "ones"}
              </Button>
            </div>
          )}
          <div className="-mx-1 flex max-h-[360px] flex-col overflow-y-auto" data-testid="attach-list">
            {list.map((x) => {
              const d = x.rec.data;
              const on = picked.includes(x.rec.id);
              const name = d.note || d.category;
              return (
                <div
                  key={x.rec.id}
                  role="presentation"
                  onClick={() => toggle(x.rec.id)}
                  className={clsx("flex cursor-pointer items-center gap-3 rounded-[10px] px-2 py-2", on ? "bg-accent-soft" : "hover:bg-hover")}
                >
                  <Checkbox checked={on} onChange={() => toggle(x.rec.id)} label={`${name}, ${money(d.amount, d.currency || cur)}, ${dayWord(d.date)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{name}</div>
                    <div className="truncate text-[11.5px] text-text3">{[dayWord(d.date), d.note ? d.category : ""].filter(Boolean).join(" · ")}</div>
                  </div>
                  {x.likely && <Tag>{fund.data.purpose || d.category}</Tag>}
                  <span className="whitespace-nowrap text-[13px] font-medium tnum">{money(d.amount, d.currency || cur)}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <Empty compact icon={History} title="Nothing to put on it" body={`Nothing of yours from the two weeks before ${who} gave it until today.`} />
      )}
    </Dialog>
  );
}
