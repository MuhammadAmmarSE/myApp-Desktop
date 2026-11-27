// The application menu. On a Mac it is the menu bar; on Windows and Linux the window has its own
// title bar instead, and the menu is there for its shortcuts' labels. The screens handle the
// shortcuts themselves (registerAccelerator: false), so a key never does two things.
import { app, Menu, type MenuItemConstructorOptions } from "electron";
import type { Command } from "@shared/ipc";
import { getPrefs } from "./prefs";
import { command, openQuick, setQuitting } from "./windows";

const isMac = process.platform === "darwin";
const cmd = (c: Command) => () => command(c);
const item = (label: string, accelerator: string, click: () => void): MenuItemConstructorOptions => ({ label, ...(accelerator ? { accelerator } : {}), registerAccelerator: false, click });

// built again when the global shortcuts change, so their labels stay true
export function buildMenu() {
  const p = getPrefs();
  const go = (label: string, to: string, n: string) => item(label, `CmdOrCtrl+${n}`, cmd({ type: "navigate", to }));
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              item("Settings…", "Cmd+,", cmd({ type: "navigate", to: "/settings" })),
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { label: "Quit Redline", accelerator: "Cmd+Q", click: () => (setQuitting(), app.quit()) },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [
        item("Capture…", "CmdOrCtrl+Shift+C", cmd({ type: "new", what: "capture" })),
        item("Quick capture", p.quickShortcut || "", openQuick),
        item("Talk to the assistant", p.talkShortcut || "", cmd({ type: "talk" })),
        { type: "separator" },
        item("New to-do", "CmdOrCtrl+N", cmd({ type: "new", what: "todo" })),
        item("New note", "CmdOrCtrl+Shift+N", cmd({ type: "new", what: "note" })),
        item("Add an expense", "CmdOrCtrl+Shift+E", cmd({ type: "new", what: "money" })),
        item("Add an event", "CmdOrCtrl+Shift+V", cmd({ type: "new", what: "event" })),
        { type: "separator" },
        item("Sync now", "CmdOrCtrl+R", cmd({ type: "sync" })),
        ...(isMac ? [] : [{ type: "separator" } as MenuItemConstructorOptions, { label: "Quit", click: () => (setQuitting(), app.quit()) }]),
      ],
    },
    { role: "editMenu" },
    {
      label: "Go",
      submenu: [
        go("Today", "/", "1"),
        go("Calendar", "/calendar", "2"),
        go("To-dos", "/todos", "3"),
        go("Lists", "/lists", "4"),
        go("Notes", "/notes", "5"),
        go("Money", "/money", "6"),
        go("People and dates", "/people", "7"),
        go("Assistant", "/assistant", "8"),
        { type: "separator" },
        item("Search everything", "CmdOrCtrl+K", cmd({ type: "palette" })),
      ],
    },
    {
      label: "View",
      submenu: [{ role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { type: "separator" }, { role: "togglefullscreen" }, ...(app.isPackaged ? [] : [{ type: "separator" } as MenuItemConstructorOptions, { role: "toggleDevTools" } as MenuItemConstructorOptions])],
    },
    { role: "windowMenu" },
    { role: "help", submenu: [item("Keyboard shortcuts", "CmdOrCtrl+/", cmd({ type: "shortcuts" }))] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
