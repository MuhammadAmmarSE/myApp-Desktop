# Redline desktop: working rules

The desktop app of Redline (Electron + React + Tailwind). The phone app is repo
`MuhammadAmmarSE/myApp`, the server `MuhammadAmmarSE/myapp-backend`; each has its own CLAUDE.md.
Read [README.md](README.md) for what it does and [docs/DESKTOP.md](docs/DESKTOP.md) for how.

## Non-negotiables

1. **Keys stay on the server.** DeepSeek and every other key live only in the server's `.env`.
   The app calls `/api/ai/*` and `/api/operator/*`; it never holds a provider key.
2. **The screens never see the session token.** Every server call goes through
   `bridge.api.request` (the main process signs it). Don't add a way for the page to read the
   token, make its own network requests, or open other windows.
3. **Never test against the real server or real accounts.** `npm run e2e` uses the real server
   code on a test database (its name must contain `test`: it is emptied) and a stand-in for
   DeepSeek.
4. **Offline first.** Every change goes through `store/records.ts` (`create` / `update` /
   `remove` / `restore`); never write records or call `/sync` from a page.
5. **Records are one shape.** New fields go in `data`, typed in `core/src/kinds.ts`. `core/` is a
   copy: edit `packages/core` in myApp and run `npm run sync-core`.
6. **AI output is a proposal.** Clean it (core's `cleanActions`), show it, save only what the
   person keeps.
7. **Approvals need the person.** Never add a way to approve an assistant step without
   `confirmIdentity()` (Touch ID or the account password, checked by the server), and never
   decide a step on the owner's behalf.
8. **Private:** no real names, numbers or addresses in code, seeds or tests (sample text uses
   generic ones). Never commit `.env`, keys, certificates.

## The screens

- Colours only from the theme (`--c-*`, `--viz-*`, `--orb-*`); no fixed colour in a page.
- Use the kit in `components/ui` (Button, Input, Field, Select, Segmented, Dialog, Menu, Toast,
  Empty, Skeleton…), `components/forms/Editors.tsx` for every record editor, `lib/format` for
  dates, times and money. A form field goes in a `Field` (its label then belongs to the control).
- Motion from `theme/motion.ts` only: eased, no springs, reduced motion respected.
- Lists use `useListNav` (keyboard, multi-select) and `BulkBar`; anything removed can be put
  back with Undo.
- Pure logic goes in `lib/` with a unit test in `test/unit/`.
- Plain words in every label and message.

## Before calling it done

`npm run typecheck`, `npm test`, `npm run build`, and `npm run e2e` (under `xvfb-run -a` without
a display). For a change you can see, look at it: `node test/e2e/server.js 4199 --seed` gives a
server with sample data to sign in to (`me@example.com` / `correct horse battery`).

## Git

Work on the session's branch; push only when asked; open a pull request only when asked.
