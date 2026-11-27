import { describe, expect, it } from "vitest";
import { createDetector, dbfs, LONGEST_MS, meterLevel, NOTHING_MS, QUIET_MS } from "@/lib/voiceActivity";

// feed a run of readings every 100 ms from `from` for `ms`, returning the last verdict
function run(d: ReturnType<typeof createDetector>, from: number, ms: number, db: number | ((t: number) => number)) {
  let v = "listening";
  for (let t = from; t < from + ms; t += 100) {
    v = d.feed(typeof db === "number" ? db : db(t), t);
    if (v !== "listening") return { v, at: t };
  }
  return { v, at: from + ms };
}

describe("createDetector", () => {
  it("stops once you've spoken and then gone quiet for a moment", () => {
    const d = createDetector(0);
    expect(run(d, 0, 400, -70).v).toBe("listening"); // the room
    expect(run(d, 400, 2000, -25).v).toBe("listening"); // talking
    expect(d.spoke()).toBe(true);
    const end = run(d, 2400, 4000, -70);
    expect(end.v).toBe("done");
    expect(end.at - 2400).toBeGreaterThan(QUIET_MS);
    expect(end.at - 2400).toBeLessThan(QUIET_MS + 300);
  });
  it("keeps listening through short pauses between words", () => {
    const d = createDetector(0);
    run(d, 0, 1000, -25);
    expect(run(d, 1000, 900, -70).v).toBe("listening");
    expect(run(d, 1900, 1000, -25).v).toBe("listening");
  });
  it("gives up when nothing is said", () => {
    const d = createDetector(0);
    const r = run(d, 0, 10000, -70);
    expect(r.v).toBe("nothing");
    expect(r.at).toBeGreaterThan(NOTHING_MS);
    expect(d.spoke()).toBe(false);
  });
  it("doesn't count the click on the button as speech", () => {
    const d = createDetector(0);
    run(d, 0, 200, -20); // a loud click in the first moment
    expect(d.spoke()).toBe(false);
  });
  it("a single loud bump isn't speech", () => {
    const d = createDetector(0);
    run(d, 0, 1000, -70);
    d.feed(-20, 1000);
    d.feed(-70, 1100);
    expect(d.spoke()).toBe(false);
  });
  it("a fan's hum isn't speech, talking over it is", () => {
    const d = createDetector(0);
    run(d, 0, 3000, -50);
    expect(d.spoke()).toBe(false);
    run(d, 3000, 1000, -18);
    expect(d.spoke()).toBe(true);
    expect(run(d, 4000, 3000, -50).v).toBe("done");
  });
  it("a steady sound that never changes is learned as the room, not taken for talk", () => {
    const d = createDetector(0);
    run(d, 0, 1200, -25); // talking
    expect(run(d, 1200, 20000, -30).v).toBe("done"); // then a steady drone: it stops
  });
  it("sends a long ramble as it is", () => {
    const d = createDetector(0);
    // words with the short breaths between them
    expect(run(d, 0, LONGEST_MS + 500, (t) => (t % 1000 < 700 ? -25 : -60)).v).toBe("longest");
  });
  it("silence (no samples) is quiet, not an error", () => {
    const d = createDetector(0);
    expect(d.feed(-Infinity, 500)).toBe("listening");
  });
});

describe("dbfs and meterLevel", () => {
  it("measures loudness", () => {
    expect(dbfs(new Float32Array(128))).toBe(-Infinity);
    expect(dbfs(new Float32Array(128).fill(1))).toBeCloseTo(0, 5);
    expect(dbfs(new Float32Array(128).fill(0.1))).toBeCloseTo(-20, 1);
  });
  it("turns loudness into a meter's 0..1", () => {
    expect(meterLevel(-Infinity)).toBe(0);
    expect(meterLevel(-80)).toBe(0);
    expect(meterLevel(-36)).toBeCloseTo(0.5, 2);
    expect(meterLevel(0)).toBe(1);
  });
});
