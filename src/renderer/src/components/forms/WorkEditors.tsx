// Work's editors, in the drawer: a project, a client, time or a payment on a project, a server, a
// domain. The same fields as the phone's sheets.
import { isoDate, minutesInWords, PROJECT_STATUSES, RENEW_REMIND, type ClientData, type DomainData, type ProjectData, type Rec, type ServerData, type WorkLogData } from "@myapp/core";
import { toast } from "@/components/ui";
import { useList, useRecords } from "@/store/records";
import { useSettings } from "@/store/settings";
import { removeProject, removeWorkLog, saveWorkLog } from "@/lib/work";
import { money } from "@/lib/format";
import { FieldsForm, type FieldSpec, type Values } from "./FieldsForm";
import { SwitchRow } from "./kit";

type P = { rec: Rec<any> | null; preset?: Record<string, any>; close: () => void };

const STATUS_WORD: Record<string, string> = { idea: "Idea", active: "Active", paused: "Paused", done: "Done" };
export const statusWord = (s: string) => STATUS_WORD[s] || s;

// remove with Undo in the toast
const removed = (name: string, undo: () => void) => toast.undo(`${name} removed`, undo);
const restoreOne = (rec: Rec) => () => useRecords.getState().restore(rec);

export function ProjectForm({ rec, preset, close }: P) {
  const clients = useList("client");
  const currency = useSettings((s) => s.currency);
  const today = isoDate();
  const fields: FieldSpec[] = [
    { key: "name", type: "text", placeholder: "Project name, e.g. Shop website", required: "Name the project", big: true, focus: true },
    { key: "status", type: "chips", label: "Where it's at", options: PROJECT_STATUSES.map((s) => [s, statusWord(s)]) },
    {
      key: "client_id",
      type: "pick",
      label: "For",
      none: "Myself",
      options: clients.filter((c) => !c.data.past || c.id === rec?.data.client_id).map((c) => ({ id: c.id, name: c.data.name })),
      // a client's usual rate fills in an empty hourly rate
      onPick: (id, v) => {
        const c = clients.find((x) => x.id === id);
        if (c?.data.rate && !v.rate) return { rate: c.data.rate, rate_unit: "hour" };
      },
    },
    {
      key: "rate_unit",
      type: "chips",
      label: "Paid",
      options: [
        ["hour", "By the hour"],
        ["fixed", "A fixed price"],
      ],
      clear: "Not paid / not yet",
    },
    { key: "rate", type: "number", label: `Hourly rate (${currency})`, show: (v) => v.rate_unit === "hour" },
    { key: "rate", type: "number", label: `Price for the whole job (${currency})`, show: (v) => v.rate_unit === "fixed" },
    { key: "start", type: "day", label: "Started", half: true },
    { key: "due", type: "day", label: "Due", placeholder: "No date", half: true },
    { key: "repo", type: "text", label: "Code", placeholder: "Repository, e.g. github.com/you/shop", mono: true, half: true },
    { key: "url", type: "text", label: "Live at", placeholder: "Website or app link", mono: true, half: true },
    { key: "notes", type: "text", label: "Notes", placeholder: "Optional", multiline: true },
  ];
  return (
    <FieldsForm
      fields={fields}
      initial={(rec?.data || { status: "active", start: today, rate_unit: "hour", ...preset }) as Values}
      close={close}
      onSave={(d) => {
        const data = { ...d, rate_unit: d.rate ? d.rate_unit : undefined, currency: rec?.data.currency || currency } as ProjectData;
        if (rec) useRecords.getState().update<"project">(rec.id, data);
        else useRecords.getState().create("project", data);
        toast.success(rec ? "Project saved" : "Project added");
      }}
      onDelete={rec ? () => (removed(rec.data.name, removeProject(rec)), close()) : undefined}
      deleteLabel="Remove"
    />
  );
}

export function ClientForm({ rec, close }: P) {
  const currency = useSettings((s) => s.currency);
  const fields: FieldSpec[] = [
    { key: "name", type: "text", placeholder: "Name", required: "Type their name", big: true, focus: true },
    { key: "company", type: "text", label: "Company", placeholder: "Optional" },
    { key: "phone", type: "text", label: "Phone", placeholder: "Optional", half: true },
    { key: "email", type: "text", label: "Email", placeholder: "Optional", half: true },
    { key: "rate", type: "number", label: `Usual hourly rate (${currency})`, hint: () => "Offered for their new projects." },
    { key: "notes", type: "text", label: "Notes", placeholder: "Optional", multiline: true },
    ...(rec ? [{ key: "past", type: "toggle", title: "A past client", sub: "No longer working together: kept, out of the way." } as FieldSpec] : []),
  ];
  return (
    <FieldsForm
      fields={fields}
      initial={(rec?.data || {}) as Values}
      close={close}
      onSave={(d) => {
        if (rec) useRecords.getState().update<"client">(rec.id, d as ClientData);
        else useRecords.getState().create("client", d as ClientData);
        toast.success(rec ? "Client saved" : "Client added");
      }}
      onDelete={rec ? () => (useRecords.getState().remove(rec.id), removed(rec.data.name, restoreOne(rec)), close()) : undefined}
      deleteLabel="Remove"
    />
  );
}

export function ServerForm({ rec, close }: P) {
  const currency = useSettings((s) => s.currency);
  const fields: FieldSpec[] = [
    { key: "name", type: "text", placeholder: "What you call it, e.g. Main VPS", required: "Name the server", big: true, focus: true },
    { key: "provider", type: "text", label: "Hosted by", placeholder: "e.g. Hetzner", half: true },
    { key: "os", type: "text", label: "System", placeholder: "e.g. Ubuntu 24.04", half: true },
    { key: "host", type: "text", label: "Address", placeholder: "IP or host name", mono: true, half: true },
    { key: "user", type: "text", label: "Log in as", placeholder: "e.g. root", mono: true, half: true },
    { key: "cost", type: "number", label: `Cost a month (${currency})`, half: true },
    { key: "renews_on", type: "day", label: "Next bill", placeholder: "Don't track", half: true },
    { key: "remind", type: "remind", label: "Remind me before the bill", days: [7, 1], show: (v) => !!v.renews_on },
    { key: "notes", type: "text", label: "What runs on it", placeholder: "Optional", multiline: true },
    ...(rec ? [{ key: "gone", type: "toggle", title: "Shut down", sub: "Kept for the record, out of the way." } as FieldSpec] : []),
  ];
  return (
    <FieldsForm
      fields={fields}
      initial={(rec?.data || { remind: [7] }) as Values}
      close={close}
      onSave={(d) => {
        if (rec) useRecords.getState().update<"server">(rec.id, d as ServerData);
        else useRecords.getState().create("server", d as ServerData);
        toast.success(rec ? "Server saved" : "Server added");
      }}
      onDelete={rec ? () => (useRecords.getState().remove(rec.id), removed(rec.data.name, restoreOne(rec)), close()) : undefined}
      deleteLabel="Remove"
    >
      {() => <p className="-mt-1 text-[12px] text-text3">Never put passwords or keys here. The assistant keeps those on your server.</p>}
    </FieldsForm>
  );
}

export function DomainForm({ rec, close }: P) {
  const currency = useSettings((s) => s.currency);
  const projects = useList("project");
  const servers = useList("server");
  const fields: FieldSpec[] = [
    { key: "name", type: "text", placeholder: "example.com", required: "Type the domain", big: true, focus: true, mono: true },
    { key: "registrar", type: "text", label: "Bought from", placeholder: "e.g. GoDaddy", half: true },
    { key: "expires_on", type: "day", label: "Expires", placeholder: "Don't know", half: true },
    { key: "auto_renew", type: "toggle", title: "Renews by itself", sub: "Auto-renew is on: no reminders." },
    { key: "remind", type: "remind", label: "Remind me before it expires", days: RENEW_REMIND, show: (v) => !!v.expires_on && !v.auto_renew },
    { key: "cost", type: "number", label: `Cost a year (${currency})` },
    { key: "project_id", type: "pick", label: "For project", none: "None", half: true, options: projects.filter((p) => p.data.status !== "done" || p.id === rec?.data.project_id).map((p) => ({ id: p.id, name: p.data.name })) },
    { key: "server_id", type: "pick", label: "Points at", none: "No server", half: true, options: servers.filter((s) => !s.data.gone || s.id === rec?.data.server_id).map((s) => ({ id: s.id, name: s.data.name })) },
    { key: "notes", type: "text", label: "Notes", placeholder: "DNS, email (optional)", multiline: true },
    ...(rec ? [{ key: "gone", type: "toggle", title: "Let it go", sub: "No longer yours: kept for the record, out of the way." } as FieldSpec] : []),
  ];
  return (
    <FieldsForm
      fields={fields}
      initial={(rec?.data || { remind: RENEW_REMIND }) as Values}
      close={close}
      onSave={(d) => {
        const data = { ...d, name: String(d.name || "").toLowerCase() } as DomainData;
        if (rec) useRecords.getState().update<"domain">(rec.id, data);
        else useRecords.getState().create("domain", data);
        toast.success(rec ? "Domain saved" : "Domain added");
      }}
      onDelete={rec ? () => (useRecords.getState().remove(rec.id), removed(rec.data.name, restoreOne(rec)), close()) : undefined}
      deleteLabel="Remove"
    />
  );
}

// Time spent on a project, or a payment for it (which can also go into Money as income).
export function WorkLogForm({ rec, preset, close }: P) {
  const projects = useList("project");
  const logs = useList("work_log");
  const currency = useSettings((s) => s.currency);
  const type: "time" | "payment" = rec?.data.type || preset?.type || "time";
  // a new entry goes on the project you logged to last (if it's still going), or the only one going
  const going = projects.filter((p) => p.data.status === "active" || p.data.status === "paused");
  const lastLog = logs.reduce<Rec<"work_log"> | null>((a, l) => (l.data.project_id && (!a || l.created_at > a.created_at) ? l : a), null);
  const guess = lastLog && going.some((p) => p.id === lastLog.data.project_id) ? lastLog.data.project_id : going.length === 1 ? going[0].id : null;
  const choose = projects.filter((p) => p.data.status !== "done" || p.id === (rec?.data.project_id || preset?.project_id)).map((p) => ({ id: p.id, name: p.data.name }));
  const today = isoDate();
  const fields: FieldSpec[] =
    type === "payment"
      ? [
          { key: "amount", type: "number", label: `Got paid (${currency})`, required: "Type how much", focus: true } as FieldSpec,
          { key: "project_id", type: "pick", label: "For", none: "No project", options: choose, half: true },
          { key: "date", type: "day", label: "When", clearable: false, half: true },
          { key: "note", type: "text", label: "Note", placeholder: "e.g. half up front (optional)" },
        ]
      : [
          { key: "minutes", type: "minutes", label: "How long", quick: [15, 30, 60, 90, 120, 240], required: "Say how long" },
          { key: "project_id", type: "pick", label: "On", none: "No project", options: choose, half: true },
          { key: "date", type: "day", label: "When", clearable: false, half: true },
          {
            key: "billable",
            type: "chips",
            label: "Charge for it?",
            options: [
              ["yes", "Yes"],
              ["no", "No, not billable"],
            ],
          },
          { key: "note", type: "text", label: "What you did", placeholder: "Optional" },
        ];
  const base = rec
    ? { ...rec.data, billable: rec.data.billable === false ? "no" : "yes", _money: !!rec.data.money_id }
    : { type, date: today, minutes: type === "time" ? 60 : null, billable: "yes", _money: true, ...preset, project_id: preset?.project_id ?? guess };
  return (
    <FieldsForm
      fields={fields}
      initial={base as Values}
      close={close}
      saveLabel={rec ? "Save" : type === "payment" ? "Save payment" : "Log time"}
      onSave={(d, raw) => {
        const { billable, ...rest } = d as Values & { billable?: string };
        const data = { ...rest, type, billable: type === "time" ? billable !== "no" : undefined, date: (rest.date as string) || today } as WorkLogData;
        const name = projects.find((p) => p.id === data.project_id)?.data.name || "";
        const inMoney = type === "payment" && !!raw._money;
        saveWorkLog(rec, data, inMoney, name);
        toast.success(type === "payment" ? (inMoney && !rec ? "Payment saved, and added to Money" : "Payment saved") : `${minutesInWords(data.minutes || 0)} logged`);
      }}
      onDelete={
        rec
          ? () => {
              const undo = removeWorkLog(rec);
              toast.undo(type === "payment" ? `Payment of ${money(rec.data.amount || 0, currency)} removed${rec.data.money_id ? " (and from Money)" : ""}` : `${minutesInWords(rec.data.minutes || 0)} removed`, undo);
              close();
            }
          : undefined
      }
      deleteLabel="Remove"
    >
      {(v, set) =>
        type === "payment" && typeof v.amount === "number" && v.amount > 0 ? (
          <SwitchRow title="Also in Money" sub={v._money ? "Saved in Money as income (Freelance)." : "Kept here only."} checked={!!v._money} onChange={(x) => set("_money", x)} />
        ) : null
      }
    </FieldsForm>
  );
}
