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
  reminder, dated to-dos, birthdays, car papers, warranties) and handed to the main process,
  which rings them even with the window closed (the tray keeps the app running), holds them in
  quiet hours and shows missed ones when the computer wakes.
- **Quick capture** is a second, frameless window, created at start and shown by the global
  shortcut. It keeps no records: what you save is sent to the main window to create, so it syncs
  like everything else.
- **The assistant** (`/api/operator/*`) streams a run's events with a long poll. A step that
  needs approval shows in the chat and in a banner on every page; approving calls
  `confirmIdentity()`: Touch ID on a Mac that has it, otherwise your account password, which the
  server checks (`/auth/confirm`). There is no way to approve without it.

## Look and motion

- Colours only from the theme (`--c-*` variables from core's themes; six themes, one light).
  Charts use `--viz-*`, the orb `--orb-*`.
- Backgrounds: the live Aurora, a 3D wallpaper (two layers that drift with the pointer; drawn by
  `myApp/tools/wallpapers/render.js --desktop`) or plain.
- Motion is eased (`theme/motion.ts`), never springy; "Calm" in Settings (or the system's
  reduced motion) takes out what isn't needed.
- Every form field's label belongs to its control (`Field` gives the first control inside it an
  id), so screen readers read it and clicking it focuses the control.

## Keyboard

Ctrl/⌘ K search, ? shortcuts, Ctrl/⌘ 1–9 pages, N new on any page, J/K or arrows to move through a
list, Enter to open, Space or X to tick, Delete to remove (with Undo), Ctrl/Shift-click to select
several. Calendar: T today, M/W/D/A views, ←/→. Money: ←/→ months, T this month. Editors save
with Ctrl/⌘ Enter.

## Files on this computer

In the app's data folder (`%APPDATA%/Redline`, `~/.config/Redline`,
`~/Library/Application Support/Redline`; `REDLINE_DATA_DIR` moves it): `records.json`,
`session.json`, `preferences.json`, `reminders.json`. Sign-out empties `records.json` but keeps
this computer's settings.

## Testing

`npm test` (unit) and `npm run e2e` (real Electron against the real server on a test database);
see the README. The e2e scenarios check the server's database after each step, so a pass means
the change was made, kept and synced.
