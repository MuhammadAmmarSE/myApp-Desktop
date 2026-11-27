// When to stop listening by itself: after you've spoken and then gone quiet, or when nothing is
// said at all. Fed the microphone's loudness (dBFS, about ten times a second); it learns the room's
// own noise as it goes, and speech is well above it. Pure, so it is tested (the phone does the same
// with its recorder's metering).

export const QUIET_MS = 1500; // quiet this long after speaking: done
export const NOTHING_MS = 7000; // nothing said this long: give up
export const LONGEST_MS = 90000; // a long ramble is sent as it is

export type Verdict = "listening" | "done" | "nothing" | "longest";

export interface Detector {
  feed(db: number, now: number): Verdict;
  spoke(): boolean;
}

export function createDetector(started: number): Detector {
  let floor = -55; // the room's noise, learned (it can rise ~3 dB a second)
  let loud = 0; // readings that sounded like speech
  let spokeAt = 0;
  let quietSince = 0;
  return {
    feed(db, now) {
      if (Number.isFinite(db)) {
        // -Infinity / very low is silence: quiet, but not the room's noise level
        if (db > -100) floor = Math.min(floor + 0.3, db);
        const speech = db > -48 && db > floor + 12;
        // speech for about a third of a second counts; the click on the button doesn't
        if (speech && now - started > 250) loud++;
        if (loud >= 3) {
          spokeAt = spokeAt || now;
          if (speech) quietSince = 0;
          else if (!quietSince) quietSince = now;
        }
        if (spokeAt && quietSince && now - quietSince > QUIET_MS) return "done";
      }
      if (!spokeAt && now - started > NOTHING_MS) return "nothing";
      if (now - started > LONGEST_MS) return "longest";
      return "listening";
    },
    spoke: () => spokeAt > 0,
  };
}

// loudness of a block of samples (-1..1), in dBFS
export function dbfs(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

// 0..1 for a level meter: -60 dB is nothing, -12 dB is full
export const meterLevel = (db: number) => (Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 48)) : 0);
