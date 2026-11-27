# Redline for the desktop

The desktop app of Redline: your day, to-dos, lists, notes, saved text, money, people and their
dates, your car, your things, your work, your interests and the assistant, on Windows, Linux and macOS, in sync with the
phone app (repo `myApp`) through your own Redline server (repo `myapp-backend`).

Built with Electron, React and Tailwind. It works offline: everything is kept on this computer
and sent to the server when it can reach it.

## What's in it

| Page | What it does |
|---|---|
| **Today** | Greeting and the time, the next thing coming up, today's to-dos with a progress ring, your day as a timeline, what's coming up in 30 days, heads-ups (late to-dos, car papers, warranties, domains and servers to renew, words to go over, spending) |
| **Capture** | Write (or say: the microphone) what someone told you in plain words, in any language. The AI sorts it into to-dos, list items, events, reminders, money, notes, saved text, dates and money someone gave you to spend; you check each card, edit or untick it, and only what you keep is saved. Ctrl/⌘ Enter sorts it out and saves |
| **Quick capture** | The same in a small window over any app: Ctrl/⌘ ⇧ Space from anywhere (you can change the shortcut), with a microphone too |
| **Calendar** | Month, week, day and agenda. Events, reminders, dated to-dos, birthdays and anniversaries, car papers and services, warranties. Drag to another day or time, double-click to add |
| **To-dos** | Smart lists (Today, Upcoming, Anytime, Late, High priority, Done) and tags. One line adds a to-do with its day, time, tags and priority ("call mum tomorrow 6pm #family !"). List or board (drag between days), multi-select with Ctrl/⇧-click and act on all of them |
| **Lists** | Buy today, Order online, Later, side by side; commas add several; drag between columns; regulars; copy today's list; what you bought this week |
| **Notes** | Markdown with a toolbar and shortcuts, Write / Both / Read, lists that carry on as you type, checkboxes you tick in the preview, tags, pinned notes. Saves itself. Open, drop or save .md files |
| **Saved** | Text you copy often: one click copies it. Paste a new one straight from the clipboard |
| **Money** | The month or the year: left over, spent against last month, the pace, a chart against last month, where it went, monthly bills to note, every entry. Export CSV. Money held for others: each hisaab, with what's left or owed |
| **Hisaab** | Money someone gave you to spend for them ("Ammi gave me 5000 for groceries: doodh, anday" in Capture, or Money → Someone gave me money to spend). Its items are on your list marked as theirs; ticking one asks its price, which comes off their money and never counts as your spending. Its page: what they gave, what you bought, what's still to buy, and settling it (give back what's left, keep it as income, they pay you back, or cover the extra as your spending). Copy the hisaab to send it to them |
| **People & dates** | People with their phone, notes and things to remember (sizes, likes); birthdays and anniversaries counting down |
| **My car** | Fill-ups, services and papers; km per litre fill by fill, cost per km, monthly cost; what needs doing (papers to renew, services due) |
| **My things** | What you own with its warranty and receipt; warranties ending; the price can go into Money |
| **Work** | Projects (for clients or your own) with the hours this week and in all, what's owed and what's been paid; a project's own page with a timer (S starts and stops it; stopping opens "Log time" with the minutes), its hours week by week and its log. Clients, servers (one click copies the ssh command) and domains; renewals coming up with a one-click "Renewed". A payment can go into Money as income. T logs time anywhere on the page |
| **Interests** | What you practise, against a weekly goal, with the days in a row and 16 weeks as a heat map; +15 / +30 in a click. Words as flashcards (type "word = meaning"; R goes over the due ones: Space shows, → knew it, ← didn't), games, books and shows, and a wishlist whose "Got it" can save it in Money and My things |
| **Assistant** | It knows what you keep here and every feature of the app (and what's coming next), and remembers what you tell it about yourself (Settings → What it remembers). Ask it about anything you keep here and it looks it up; ask it to add, change or delete something and the changes come as a card to Save or Skip (Undo right after). Or ask it to do things on your server and accounts, or to send coding work to one of your Claude Code sessions on claude.ai (give each once in Settings → Assistant → Claude sessions; Open in Claude shows its answer). Every risky step waits for you: your password (or Touch ID on a Mac). Chats are kept, starred, archived. Photos can be sent, and files (a PDF, a Word, Excel or PowerPoint file, CSV, code, a zip; up to 4, 10 MB each) with the paperclip or by dropping them on the box: it reads them and keeps them on your server to use; Save puts a sent one back on this computer. **Talk to it**: click the microphone, or press Alt/⌥ Space in any app (it brings Redline up listening). It stops when you stop talking, your server writes down what you said (English or Urdu; Urdu in English letters or Urdu script), and it goes after a moment unless you click Edit. Answers to what you said are read aloud, then it listens for your reply. Replies can be read aloud always, when you talk, or never, in the ElevenLabs voice you pick in Settings → Assistant (this computer's voice otherwise). Talking needs an ElevenLabs key on your server |
| **Settings** | Six themes (the phone's), the Aurora background or a 3D wallpaper, motion, density, text size; reminders and quiet hours; start at login, start in the tray, close to the tray, the Quick capture shortcut; the assistant and talking to it (the talk shortcut, the language you speak, how Urdu is written, sending by itself, listening for your reply, reading aloud, a microphone test); your account and devices; sync, export and import |

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
npm run perf         # CPU, React renders, page opening and memory, see below
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
- `npm run perf`: the built app on the same setup, measured. CPU of every process sitting still
  and with the pointer moving (per background, and on the orb pages), React commits and what
  rendered (idle, pointer, typing in a note and in quick-add, opening every page), how long each
  page takes to open, and memory over several rounds of every page (heap, DOM nodes, listeners
  after garbage collection). It fails over its limits: React drawing while nothing happens,
  memory that keeps growing. `REDLINE_PROFILE=1 npm run build` first keeps component names
  readable; `PERF_EFFECTS=full|light` measures one of the effects; `PERF_ONLY=cpu,react,pages,memory`
  some parts; `PERF_OUT=file.json` writes the report. `test/perf/animations.js` lists what keeps
  moving on a quiet page, and `test/perf/endless.js` which components carry an endless animation.

## Installers

```bash
npm run icons        # draws the icons into build/ and resources/ (needs Playwright's Chromium)
npm run dist:win     # on Windows: release/Redline-Setup-<version>.exe and Redline-<version>-portable.exe
npm run dist:win:portable  # anywhere: the portable .exe and a .zip (no installer)
npm run dist:linux   # release/Redline-<version>-linux-x86_64.AppImage and the .deb
npm run dist:mac     # on a Mac: .dmg and .zip
```

The Windows installer (Setup .exe) needs Windows or Wine to build; the portable .exe and the .zip
build anywhere (`scripts/afterPack.js` writes the exe's icon and details without Wine). The
**Installers** workflow (`.github/workflows/installers.yml`, run it from the Actions tab or push a
`v*` tag) builds all of them on Windows, macOS and Linux machines and attaches them to the run.
Nothing is code-signed, so Windows SmartScreen and macOS Gatekeeper ask before the first start.

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
