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

## Reading aloud (`lib/speech.ts`)

With "Read answers aloud" on, an answer is read in your ElevenLabs voice when your server has an
ElevenLabs key (`/api/voice/status`, checked every ten minutes) and Settings → Assistant → Natural
voice is on: the words go to `/api/voice/speak` through the main process like every other call,
and the mp3 that comes back plays from a data URL (`media-src data:`). The page fetches nothing
itself, so trying a voice in Settings reads a line in it through the server rather than playing
ElevenLabs' sample URL. Otherwise the computer's own voices (`speechSynthesis`) read it. The key
never leaves the server.

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

`npm test` (unit), `npm run e2e` (real Electron against the real server on a test database) and
`npm run perf` (how hard the app works); see the README. The e2e scenarios check the server's database after each step, so a pass means
the change was made, kept and synced.
