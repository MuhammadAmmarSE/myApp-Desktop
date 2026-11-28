# How the desktop app works

## Processes

```
main process (Node)                       screens (Chromium, sandboxed)
  windows.ts   main window, Quick window    pages/        one file per page
  tray.ts      tray icon and its menu      components/   ui kit, shell, editors, charts, orb
  menu.ts      the app menu                store/        records, sync, auth, settings, ui
  shortcuts.ts the global shortcut         lib/          pure helpers (tested) and the bridge
  reminders.ts notifications, quiet hours
  session.ts   the session token           ── window.redline (preload) ──
  http.ts      every call to the server      api.request, db.*, auth.*, prefs.*, win.*,
  records.ts   records.json                  quick.*, clipboard.*, files.*, on(event)
  prefs.ts     preferences.json
```

- **The screens never see the session token.** `api.request(method, path, body)` goes to the
  main process, which adds the token and calls the server with Electron's `net`. A dead session
  (401 `SIGNED_OUT`) clears the token and sends the screens to sign-in. The token is kept with
  `safeStorage` (the system's keychain or keyring) where it is available, otherwise in a file only
  this user can read; Settings → Account says which.
- **Offline first.** Every change goes through `store/records.ts` (`create`, `update`,
  `remove`, `restore`): it changes memory, marks the record dirty and writes it to
  `records.json` through the main process (atomic, batched). `store/sync.ts` pushes dirty
  records and pulls changes since the cursor: a moment after each change, when the window comes
  to the front, and every minute. A newer copy from the server wins; an unsent newer edit here
  stays. Records are one shape (`core/src/kinds.ts`).
- **Reminders** are worked out by the screens from the records (reminders, events with a
  reminder, dated to-dos, birthdays, car papers, warranties, domains expiring, servers' bills) and handed to the main process,
  which rings them even with the window closed (the tray keeps the app running), holds them in
  quiet hours and shows missed ones when the computer wakes.
- **Quick capture** is a second, frameless window, created at start and shown by the global
  shortcut. It keeps no records: what you save is sent to the main window to create, so it syncs
  like everything else.
- **The assistant** (`/api/operator/*`) streams a run's events with a long poll. A step that
  needs approval shows in the chat and in a banner on every page; approving calls
  `confirmIdentity()`: Touch ID on a Mac that has it, otherwise your account password, which the
  server checks (`/auth/confirm`). There is no way to approve without it.
- **Files in the assistant** (`lib/attachments.ts`, `components/assistant/Files.tsx`): the
  paperclip picks files through the main process (`bridge.files.pickFiles`: any kind, up to 4,
  10 MB each, 20 MB together; too-big ones are named), and dropping files on the box reads them in
  the window (pictures still go as photos). They're offered only when the server's
  `/operator/status` lists `"files"` in `features`. They go with the message as
  `files: [{ name, data }]`; the server saves and reads them (myapp-backend docs/OPERATOR.md →
  Files). A sent one's Save fetches it from `/runs/:id/files/:fileId` and the main process writes
  it where you choose (`bridge.files.saveFile`, a save dialog; the window never touches the disk).
- **Photos, large and edited** (`components/assistant/PhotoEditor.tsx`, `lib/photoEdit.ts`): a
  photo in the box opens to edit (crop with a box you drag, move and pull by its corners; turn
  left or right; draw in the theme's colours; Undo goes back a step); a sent one opens to look
  at. The box's arithmetic is pure and unit-tested; each step is drawn on a canvas in the window,
  and Save shrinks the result like any photo.
- **Drafts** (`store/drafts.ts`): what's written in a chat's box and not sent, per chat (`"new"`
  for the assistant's home, `"chat:<id>"` for each conversation), with its photos and files. The
  words are also kept in the records' meta (debounced), so they survive a restart; photos and
  files only while Redline is open. Sending clears that chat's draft.
- **Nudges** (`lib/nudges.ts`, `components/NudgeCard.tsx`, `pages/Nudges.tsx`,
  `components/NudgeSettings.tsx`, core's `nudges.ts`): the same as on the phone (myApp
  docs/ARCHITECTURE.md → Nudges). The app's own check (core's `planNudges`) runs when Redline
  starts, when the window comes to the front, every ten minutes and a moment after records change;
  new ones go through `createOnce` with core's id (the same on every device), and the ones whose
  reason has gone are marked done. Today shows the most pressing; the assistant's page lists the
  reminders it set; the Nudges page has the rest, what's coming and the history. What rings
  (`lib/alerts.ts` → `nudgeAlertList`, core's `nudgeAlerts`) is handed to the main process with
  the other reminders: at its time or when quiet hours end, at most the day's limit, each once
  (`nudge_sent` in the records' meta). Settings → Nudges is per computer. The assistant's own
  reminders save themselves from an `auto` card when that setting is on (`Proposal.tsx`, checked
  again here, a repeat skipped). Unit-tested in `test/unit/nudges.test.ts`, end to end in the
  "nudges" scenario.
- **The small orb** (`components/orb/Orb.tsx`): drawn beside "Working on it" at about 30 px, its
  ring, streak and moons keep a width you can see (at least a pixel or so on screen), and the
  streak is the planet's colour with a light core, so it shows on a light page too.
- **Claude sessions** (`components/assistant/ClaudeSessions.tsx`, Settings → Assistant): your
  Claude Code sessions on claude.ai, added once (a claude.ai/code link, checked with core's
  `parseClaudeSession`, and a name), renamed and forgotten (with Undo) through
  `/api/operator/claude-sessions`; shown when the server's status lists `claude_sessions`. The
  assistant sends them work by name; a sent step has Open in Claude, which opens the session in
  your browser through the main process (`bridge.app.openExternal`). Claude's answer and anything
  it asks you to approve are in the session, not here.
- **Claude reports back** (`components/assistant/ClaudeReport.tsx`): when the server's status
  lists `claude_reports` (it has `REDLINE_PUBLIC_URL`), each message asks Claude to post a short
  status when it finishes or needs you. The report is an event in the chat that sent the work
  (core's `buildTimeline` makes it a `claude_report` item: Claude's words, the status, Open in
  Claude and the pull request), and the questions long-poll (`watchApprovals`, with
  `reports_after`; the first request doesn't wait, to learn which reports are old) brings it to
  `reportNews`. `components/shell/ApprovalsHost.tsx` announces a new one with a toast you can open
  (not on that chat, which shows it) and a notification when the window isn't in front. Settings
  shows each session's last report.
- **The to and fro**: a report that Claude finished, needs you or couldn't do it wakes its chat on
  the server, and the assistant answers. When Claude asks something, the server gates any send to
  that session (it is waiting on a question), so the assistant's drafted answer arrives as an
  ordinary approval: the corner card and the notification, and in the chat `AskBox`
  (`components/assistant/Steps.tsx`) shows Claude's question and "Your answer, if you approve"
  (`detail.claude_question` / `claude_message`), with Why. Approve needs Touch ID or your password,
  as always; No asks "What should Claude be told instead?", which the assistant drafts as a new
  answer. An answer Claude moved on from shows "Not sent: Claude moved on before you answered"
  (state `superseded`); core's `describeStep` titles the step "Answer for “shop”", "Answered
  “shop” on Claude" or "…, not sent". When the open chat's status moves (it finished, or a report
  woke it) the chat list reloads.
- **Your records in the assistant**: the server reads its copy of your records to answer and
  never changes one. A look is one quiet line; changes it proposes come as a card
  (`components/assistant/Proposal.tsx`). Save runs `lib/proposals.ts`: cleaned again against this
  computer's records (core's `cleanChange`), saved through `store/records.ts`, Undo in the toast.
  What you decided goes to `/operator/runs/:id/proposals/:callId` and is kept in the records
  store's `meta` until the server has it, so a card can't be saved twice.

## Look and motion

- Colours only from the theme (`--c-*` variables from core's themes; six themes, one light).
  Charts use `--viz-*`, the orb `--orb-*`.
- Backgrounds: the live Aurora, a 3D wallpaper (two layers that drift with the pointer; drawn by
  `myApp/tools/wallpapers/render.js --desktop`) or plain.
- Motion is eased (`theme/motion.ts`), never springy; "Calm" in Settings (or the system's
  reduced motion) takes out what isn't needed.
- Effects (Settings > Appearance): Full blurs a wallpaper behind the glass and moves it with the
  pointer; Light does neither. Auto is Light when Chromium draws without the graphics card (a
  blocked driver, a remote desktop, a virtual machine; the main process reads it from
  `app.getGPUFeatureStatus()` and passes it as `AppInfo.gpu`), Full otherwise
  (`lib/effects.ts`).
- Every form field's label belongs to its control (`Field` gives the first control inside it an
  id), so screen readers read it and clicking it focuses the control.

## Staying light

What made the app slow on Windows, and the rules that keep it fast. `npm run perf` measures all of
it and fails when a rule is broken.

- **Nothing moves forever.** No endless animation in the chrome: the brand mark wobbles on
  hover, status pulses beat a few times and stop, the orb only moves while it listens or thinks.
  Each endless animation kept the page painting 60 times a second.
- **Nothing moves behind your back.** `lib/activity.ts` says whether the window is in front
  (visible and focused; `<html data-active>`). The Aurora's drift, the wallpaper's depth and the
  orb stop when it isn't, and the window is throttled when hidden (`backgroundThrottling`):
  reminders fire from the main process, and the assistant listens over the network.
- **Blur only what needs it.** A backdrop filter redraws what's behind every card each time
  anything near it changes. Only a wallpaper is blurred (it has edges); the Aurora is soft light
  already and plain glass is solid, so neither is (`--glass-filter` in `theme/index.ts`). The
  Aurora is a small canvas painted 8 times a second, not CSS blurs moving every frame.
- **Draw only what changed.** The shell's work (sync, badges, the Quick window's context) lives
  in `ShellEffects`, which draws nothing, so a record changing doesn't redraw every page. Rows
  are `memo` with stable handlers; the quick-add line owns its own text; a note's preview
  follows the typing a beat behind (`useDeferredValue`); polled data is only set when it
  changed. Stores are read with narrow selectors.
- **Pages open at once.** The new page fades in without waiting for the old one to fade out.

## Keyboard

Ctrl/⌘ K search, ? shortcuts, Ctrl/⌘ 1–9 pages, N new on any page, J/K or arrows to move through a
list, Enter to open, Space or X to tick, Delete to remove (with Undo), Ctrl/Shift-click to select
several. Calendar: T today, M/W/D/A views, ←/→. Money: ←/→ months, T this month. Work: T logs
time, S starts or stops the chosen project's timer (on a project's page: T, P got paid, E edit, S
timer, Esc back). Interests: R goes over the words that are due (Space shows the meaning, → knew
it, ← didn't). Editors save with Ctrl/⌘ Enter.

## Editors

Every record is added and changed in the drawer (`components/forms/Editors.tsx`). The plain ones
(Work and Interests) are a list of fields for `FieldsForm` (text, number, chips, a pick from a
list, a day, a duration typed as "1h 30" or picked, stars, a yes/no, reminder days), the same list
the phone's `FormSheet` takes; a field can sit two to a row and show only when another says so.
Saving and removing that touches other records goes through `lib/` with Undo: a payment saved as
income in Money (`lib/work.ts`), a wish got into Money and My things (`lib/interests.ts`), a
project removed with its log.

## Money given to you to spend (`pages/Fund.tsx`, `lib/funds.ts`, core's `funds.ts`)

The same as the phone's (myApp's docs/ARCHITECTURE.md has the whole of it): a `fund` record, what
you buy with it as money with `paid_from`, list items with `fund_id`, and the steps that settle it.
Money lists only your own entries (`ownMoney`) and the hisaabs apart; the item editor asks the
price when one on a hisaab is ticked (`preset.buying`) and has "Whose money"; the money editor, opened
with `paid_from`, is a purchase on the hisaab. Capture and Quick capture send the open hisaabs to
the server; Quick capture's window doesn't keep records, so it sends drafts with stand-in ids
(`ref`) that the main window swaps for the real ones as it makes them, and "they gave more" as a
`fund_more` draft (App.tsx `handleCommand`).

Something bought with their money but noted as your own: the page's "Put what you already bought
on it" (P) opens `components/forms/FundAttach.tsx` (core's `fundCandidates` and `fundAfter`; the
recent ones ticked in one click) and `moveOntoFund` moves the ticked ones. Money's row context
menu offers each open hisaab for that row, or for every picked row when it's one of them; a
purchase's context menu on the page has "Make it my own spending" (`takeOffFund`).

## One price for several (`components/forms/Purchase.tsx`, `lib/purchase.ts`, core's `purchase.ts`)

The same model as the phone's (myApp's docs/ARCHITECTURE.md → One price for several): one money
expense for the total, every item it covers pointing at it (`money_id`, no `price`). The editor
`purchase` (`edit("purchase", null, { picked, fundId })`) is opened from Lists' header, the
"N bought without a price" prompt, the bulk bar's "One price for these", an item's editor, and a
hisaab's page (only its items). `lib/purchase.ts` has `buyTogether`, `unbuyOne`, `unbuyAll` and
`setPurchaseFund`, each undoable; unticking one of several in Lists asks "Only X" or "None of the
N". `test/unit/purchase.test.ts` checks every figure (month, hisaab, pot) after each step.

## Your money with others (`pages/Owed.tsx`, `lib/owed.ts`, `components/forms/OwedEditors.tsx`, core's `owed.ts`)

An `owed` record is your own money someone else has: `type` keeping (kept for you) or loan (lent),
`who`, `amount`, `date`, `account`, `due` (a loan's day), and `moves` (back / more / forgave, each
with its date). Core's `owedSummary` works out what's left; `owedWithMove` caps a step back at what
they have and settles it when nothing is left. It's never money: Money's totals don't change, and
the hero says how much of your money is with others (`owedTotals`). Once some of the period's
money went to others (or came back), the hero leads with **With you now** (`inHand(net,
owedFlow(owed, month or year))`: left over − given + back + let go), with the sum under it. Letting a loan's rest go
(`forgave`) is the one step that touches Money: an expense (category Gifts) with the step's
`money_id`, removed again when the step is taken back or the record deleted. `lib/owed.ts` has
`createOwed`, `owedStep`, `takeStepBack`, `removeOwed` (each returns its undo) and `useOwed`. The
editors are `edit("owed", rec?, { type })` and `edit("owed_step", null, { id, step })`. Capture and
Quick capture send the open ones (`owed: [{ id, who, type, left }]`); an `owed_move` action is a
step on one (Quick capture sends it to the main window as an `owed_move` draft). The assistant's
`step` change (`{ op: "step", id, step, amount }`) is applied with `owedStep`.
`test/unit/owed.test.ts` checks every figure after each step.

## Pots (`pages/Pot.tsx`, `lib/pots.ts`, `components/forms/PotEditors.tsx`, core's `pots.ts`)

Envelope budgeting, the same as the phone's (myApp's docs/ARCHITECTURE.md → Pots): a `pot` record
is part of your own money with a job (spending, bills, saving up, paying off). An income's `split`
gives some of it to pots, an expense's `pot_id` takes it out of one, and moves between pots (or
from money not in a pot) are kept on a pot's `moves`. Balances roll over; your totals in Money
don't change. The sums are core's (`potSummary`, `ruleSplit`, `monthJobs`, `suggestPot`).

- Money: a Pots card (each pot's balance, meter and where it stands; starters and a 50/30/20
  split to begin; "Add:" for the starters not made yet; pots put away), "Where {month}'s money
  went" (a bar by pot), and each entry says which pot it came from or went into. `?add=pot`
  opens a new pot (Search: "New pot").
- The money editor: "Comes out of" for spending (the pot you used before for the same thing is
  suggested until you pick; it warns when it takes a pot over) and "Give it jobs" for income
  (split by your pots' rules as you type the amount, until you change it).
- A pot's page (`/pots/:id`): Cover it, Add money (A), Move out (M), Spend from it (S), and every
  entry in and out; a move can be taken back (hover, or right-click).
- Pot colours are `--pot-0` … `--pot-7` (and `-soft`), set from core's `POT_COLORS` for the
  theme's mode. Light mode's are below 3:1 against the page, so a pot is always named beside its
  colour.
- Capture and Quick capture send the pots to the server and show "pot" / "pot_move" cards; a
  pot made in the same capture is "new". An income saved from Capture without its own split is
  split by your rules.
- Sync: a record the server rejects as "unknown kind" (a server older than this app) stays to be
  sent again, and Sync says so, instead of being marked as sent and lost.

## Talking (`lib/listen.ts`, `lib/voiceActivity.ts`, `lib/talk.ts`)

The microphone button (the assistant's message box, Capture, the Quick capture window, and
Settings → Assistant → Talking to it as a test) records with `getUserMedia` + `MediaRecorder`
(webm/opus, 32 kbps). The main process allows the page sound only, never the camera or the screen,
and only for Redline's own pages (`index.ts`, the permission handler); a Mac asks you first
(`bridge.mic.access`, with the words in electron-builder.yml, and the audio-input entitlement in
build/entitlements.mac.plist), Windows has its own privacy switch. An `AnalyserNode` gives the
loudness ten times a second to `voiceActivity.ts`, which learns the room's noise and says when
you've spoken and gone quiet for 1 s (or said nothing for 7 s, or talked for 90 s); the meter
reads the same number. The recording goes to `/api/voice/transcribe` through the main process
with the language and how Urdu is written (Settings), and ElevenLabs Scribe on your server writes
it down. Without an ElevenLabs key on the server there is no listening: this computer has no
recogniser of its own, and the button says so. One microphone at a time (`listen.ts` `owner`);
the Quick window lets go of it when it hides.

In the assistant, what you said goes out as soon as you stop talking (Settings: or it waits in the
box). With a server that takes recordings (`features` include `voice_in`), it isn't written down
here first: `useListen`'s `send` hands the recording to the page, which posts it to
`/operator/runs/voice` or `/operator/runs/:id/voice` (`sendSpoken` in `lib/assistant.ts`) and the
assistant starts on it at once (not when a card waits for a spoken yes or no). A chat started by
voice opens with `?spoken=1`; answers to spoken requests are read aloud
(Settings → Read answers aloud: when I talk / always / never, plus the speaker button in the chat),
and once one has been read to its end (`useSpeaking.finished`) the box listens again, quietly, for
your reply (Settings: or stop there). Esc stops listening without sending.

The talk shortcut (Alt+Space by default, a global shortcut like Quick capture's, in `main/shortcuts.ts`;
Settings → Assistant, the menu and the tray) sends a `talk` command: the assistant's message box on
screen starts listening, or stops if it is (`talk.ts` keeps the newest box that answers it);
with none on screen the assistant opens a new chat already listening (`/assistant?voice=1`). The
two global shortcuts can't share keys.

Recording either shortcut in Settings (`ShortcutButton`): the main process catches the keys itself
(`recordKeys` in `main/shortcuts.ts`, the window's `before-input-event`), so the menu's own keys,
Alt focusing the menu on Windows, and Redline's global shortcuts can't take them first; Redline's
global shortcuts let go meanwhile (a key combo is checked by registering it and letting go) and
come back when it stops: on a shortcut, Esc, the window losing focus, or after a minute. The
button shows what's held ("Ctrl + …") and says why a key can't be used (no Ctrl or Alt with it).
The page's own key events are the fallback. In the e2e test the keys are sent through the window
(`sendInputEvent`): Playwright's keys go straight into the page and never reach `before-input-event`.

## Saying yes, no, or what to change

The same spoken loop as the phone's (myApp's docs/ARCHITECTURE.md → The spoken loop). Something
said in Capture goes out with `context.spoken: true`; the answer's `speak` is read aloud and,
once read to its end, Capture listens for your answer (`data-testid="answer-listening"`): core's
`spokenAnswer` makes "yes" / "haan ji" a save and "no" / "nahi" a no, and anything else goes back
to the server as a change (`revise`), made by the AI and read back (at most three in a row). The
microphone beside Save takes a change by voice on any capture. In the assistant, a spoken yes or
no right after a card saves or skips its open changes (`lib/proposals.ts` `decide`, as a click
would; a deletion still needs a click) and isn't sent as a message.

## Reading aloud (`lib/speech.ts`)

When an answer is to be read (see Talking), it is read in your ElevenLabs voice when your server has an
ElevenLabs key (`/api/voice/status`, checked every ten minutes) and Settings → Assistant → Natural
voice is on: the words go to `/api/voice/speak` through the main process like every other call,
and the mp3 that comes back plays from a data URL (`media-src data:`). The page fetches nothing
itself, so trying a voice in Settings reads a line in it through the server rather than playing
ElevenLabs' sample URL. Otherwise the computer's own voices (`speechSynthesis`) read it. The key
never leaves the server.

Live (the server's `features` include `speech`): a spoken request's context carries `speech: true`
and your voice, so the server streams the answer and makes each sentence's audio as soon as it's
written ("speech" events, `{ n, clip, text }`). `speakLine` fetches the clip playing and the next
(`/api/voice/clip/:id`) and plays them in order; the reply says `voiced` and `linesDone()` ends it,
so it isn't read again. A short "One moment" comes before a lookup.

## The assistant's guide

Every page in `App.tsx`'s `ROUTES` must be in core's `guide.ts` (the feature it belongs to), and
every page the guide names must exist: `test/unit/guide.test.ts` fails otherwise. That's how the
assistant knows the whole app, including what's added later.

## Files on this computer

In the app's data folder (`%APPDATA%/Redline`, `~/.config/Redline`,
`~/Library/Application Support/Redline`; `REDLINE_DATA_DIR` moves it): `records.json`,
`session.json`, `preferences.json`, `reminders.json`. Sign-out empties `records.json` but keeps
this computer's settings.

## Testing

`npm test` (unit), `npm run e2e` (real Electron against the real server on a test database, with
a fake microphone that "says" something: test/e2e/speech.js writes it, and the ElevenLabs stand-in
writes it down as "Read me something short") and
`npm run perf` (how hard the app works); see the README. The e2e scenarios check the server's database after each step, so a pass means
the change was made, kept and synced.
