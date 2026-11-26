// Starting with the computer. A Mac and Windows have a setting for it; on Linux it is a file in
// ~/.config/autostart. Redline started at login opens in the tray (--hidden) when you asked it to.
import fs from "fs";
import os from "os";
import path from "path";
import { app } from "electron";

const linuxFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "autostart", "redline.desktop");
const exe = () => process.env.APPIMAGE || process.execPath;

export function applyStartAtLogin(on: boolean, hidden: boolean): string | undefined {
  // a copy run from source would start Electron itself at login: only a built app registers
  if (!app.isPackaged && !process.env.REDLINE_E2E) return undefined;
  try {
    if (process.platform === "linux") {
      const file = linuxFile();
      if (on) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const args = hidden ? " --hidden" : "";
        fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Redline\nComment=Your day, in sync with your phone\nExec="${exe()}"${args}\nX-GNOME-Autostart-enabled=true\nTerminal=false\n`);
      } else if (fs.existsSync(file)) fs.unlinkSync(file);
    } else {
      app.setLoginItemSettings({ openAtLogin: on, args: hidden ? ["--hidden"] : [] });
    }
    return undefined;
  } catch (e: any) {
    return `Couldn't change starting with the computer: ${e?.message || e}`;
  }
}

export function openedHidden(): boolean {
  if (process.argv.includes("--hidden")) return true;
  if (process.platform === "darwin") {
    try {
      return !!app.getLoginItemSettings().wasOpenedAtLogin;
    } catch {
      return false;
    }
  }
  return false;
}

export const linuxAutostartPath = linuxFile;
