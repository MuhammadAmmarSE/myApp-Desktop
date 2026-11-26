// Files shipped next to the app (icons). In a packaged app they are unpacked from the archive,
// because the system draws them itself (notifications, the tray) and can't read inside it.
import path from "path";

export const resource = (...parts: string[]) => path.join(__dirname, "../../resources", ...parts).replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
