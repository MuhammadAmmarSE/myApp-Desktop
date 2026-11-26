// A small JSON file on disk, kept in memory and written back atomically (to a temp file, then
// renamed over the old one), so a crash or a power cut mid-write never leaves half a file.
// Writes are batched: many changes in a moment cost one write.
import fs from "fs";
import path from "path";

export class JsonFile<T extends object> {
  private value: T;
  private timer: NodeJS.Timeout | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private file: string,
    fallback: T,
    private delayMs = 250,
  ) {
    this.value = fallback;
    try {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") this.value = parsed as T;
    } catch (e: any) {
      // a missing file is the first run; a broken one is set aside rather than lost
      if (e && e.code !== "ENOENT") {
        try {
          fs.renameSync(file, `${file}.broken-${Date.now()}`);
        } catch {
          /* nothing to keep */
        }
      }
    }
  }

  get(): T {
    return this.value;
  }

  set(next: T) {
    this.value = next;
    this.schedule();
  }

  update(fn: (v: T) => T) {
    this.set(fn(this.value));
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  // write now (also called before quitting)
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const data = JSON.stringify(this.value);
    this.writing = this.writing.then(() => writeAtomic(this.file, data)).catch(() => {});
    return this.writing;
  }

  flushSync() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.value), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch {
      /* best effort at exit */
    }
  }
}

async function writeAtomic(file: string, data: string) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, data, { mode: 0o600 });
  await fs.promises.rename(tmp, file);
}
