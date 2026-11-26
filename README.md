# Redline for the desktop

The desktop app of Redline: your day, to-dos, lists, notes, saved text, money, people and their
dates, your car, your things and the assistant, on Windows, Linux and macOS, in sync with the
phone app (repo `myApp`) through your own Redline server (repo `myapp-backend`).

Built with Electron, React and Tailwind. It works offline: everything is kept on this computer
and sent to the server when it can reach it.

## What's in it

| Page | What it does |
|---|---|
| **Today** | Greeting and the time, the next thing coming up, today's to-dos with a progress ring, your day as a timeline, what's coming up in 30 days, heads-ups (late to-dos, car papers, warranties, spending) |
| **Capture** | Write what someone told you in plain words, in any language. The AI sorts it into to-dos, list items, events, reminders, money, notes, saved text and dates; you check each card, edit or untick it, and only what you keep is saved. Ctrl/⌘ Enter sorts it out and saves |
| **Quick capture** | The same in a small window over any app: Ctrl/⌘ ⇧ Space from anywhere (you can change the shortcut) |
| **Calendar** | Month, week, day and agenda. Events, reminders, dated to-dos, birthdays and anniversaries, car papers and services, warranties. Drag to another day or time, double-click to add |
| **To-dos** | Smart lists (Today, Upcoming, Anytime, Late, High priority, Done) and tags. One line adds a to-do with its day, time, tags and priority ("call mum tomorrow 6pm #family !"). List or board (drag between days), multi-select with Ctrl/⇧-click and act on all of them |
| **Lists** | Buy today, Order online, Later, side by side; commas add several; drag between columns; regulars; copy today's list; what you bought this week |
| **Notes** | Markdown with a toolbar and shortcuts, Write / Both / Read, lists that carry on as you type, checkboxes you tick in the preview, tags, pinned notes. Saves itself. Open, drop or save .md files |
| **Saved** | Text you copy often: one click copies it. Paste a new one straight from the clipboard |
| **Money** | The month or the year: left over, spent against last month, the pace, a chart against last month, where it went, monthly bills to note, every entry. Export CSV |
| **People & dates** | People with their phone, notes and things to remember (sizes, likes); birthdays and anniversaries counting down |
| **My car** | Fill-ups, services and papers; km per litre fill by fill, cost per km, monthly cost; what needs doing (papers to renew, services due) |
| **My things** | What you own with its warranty and receipt; warranties ending; the price can go into Money |
| **Assistant** | Ask it to do things on your server and accounts. Every risky step waits for you: your password (or Touch ID on a Mac). Chats are kept, starred, archived. Photos can be sent. Replies can be read aloud |
| **Settings** | Six themes (the phone's), the Aurora background or a 3D wallpaper, motion, density, text size; reminders and quiet hours; start at login, start in the tray, close to the tray, the Quick capture shortcut; the assistant; your account and devices; sync, export and import |

Everywhere: **Ctrl/⌘ K** searches everything (records, pages and actions), **?** lists the
keyboard shortcuts, the tray keeps reminders ringing when the window is closed, and
`redline://capture?text=…` / `redline://open/todos` links open the app.

## Running it

```bash
npm install
npm run dev          # the app, with hot reload
npm run typecheck
npm test             # unit tests (vitest)
npm run build        # into out/
npm run e2e          # real-app scenarios, see below
```

It talks to the server set at sign-in (`REDLINE_API_URL` sets the default). The server's address
can be changed on the sign-in screen under "Use a different server".

## Tests

- `npm test`: the pure parts (quick-add parsing, markdown editing, calendar, money, car,
  shortcuts, the record store and sync with a stand-in server, the files on disk).
- `npm run e2e`: the built app in real Electron, driven like a person would, against the real
  server on a test database with a stand-in for DeepSeek. Each scenario checks the server's
  database afterwards. Needs MariaDB/MySQL (`TEST_DB_USER`, `TEST_DB_PASSWORD`, a
  `TEST_DB_NAME` containing "test"; it is emptied) and `myapp-backend` next to this folder (or
  `REDLINE_BACKEND_DIR`). Without a display, run it under `xvfb-run -a`.

  `test/e2e/server.js [port] --seed` on its own starts that server with sample data, for trying
  the app by hand.

## Installers

```bash
npm run icons        # draws the icons into build/ and resources/ (needs Playwright's Chromium)
npm run dist:win     # release/Redline-Setup-<version>.exe and Redline-<version>-portable.exe
npm run dist:linux   # release/Redline-<version>-linux-x86_64.AppImage and the .deb
npm run dist:mac     # on a Mac: .dmg and .zip
```

Windows builds work from Linux with no Wine: `scripts/afterPack.js` writes the exe's icon and
details. The installers aren't code-signed, so Windows SmartScreen and macOS Gatekeeper ask
before the first start.

## Where things are

```
src/main/        the app's life: windows, tray, menu, global shortcut, reminders, the session
                 (kept encrypted by the system where it can), files on disk, calls to the server
src/preload/     window.redline: the only bridge between the screens and the main process
src/shared/      the bridge's types and channels
src/renderer/    the screens (React): pages/, components/, store/ (records, sync, settings),
                 lib/ (pure helpers, tested)
core/            a copy of the phone app's packages/core: record kinds, themes, AI actions,
                 formats (npm run sync-core updates it)
test/            unit tests and the end-to-end scenarios
build/, resources/  icons; src/renderer/src/assets/wallpapers/ the 3D wallpapers
```

More in [docs/DESKTOP.md](docs/DESKTOP.md); the working rules are in [CLAUDE.md](CLAUDE.md).
