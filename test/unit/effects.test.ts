import { describe, expect, it } from "vitest";
import { themeById } from "@myapp/core";
import { isLight } from "@/lib/effects";
import { themeVars } from "@/theme";

describe("effects", () => {
  it("Auto is light only when Chromium draws without the graphics card", () => {
    expect(isLight("auto", "hardware")).toBe(false);
    expect(isLight("auto", "software")).toBe(true);
  });
  it("a forced choice wins either way", () => {
    expect(isLight("full", "software")).toBe(false);
    expect(isLight("light", "hardware")).toBe(true);
  });
});

describe("glass", () => {
  const theme = themeById("redline");
  it("blurs only a wallpaper, and only with full effects", () => {
    expect(themeVars(theme, "monolith")["--glass-filter"]).toMatch(/^blur\(/);
    expect(themeVars(theme, "monolith", true)["--glass-filter"]).toBe("none");
    expect(themeVars(theme, "aurora")["--glass-filter"]).toBe("none");
    expect(themeVars(theme, "none")["--glass-filter"]).toBe("none");
    expect(themeVars(theme, "none")["--glass-filter-strong"]).toBe("none");
  });
  it("lets less of a wallpaper through when it isn't blurred", () => {
    const alpha = (v: string) => Number(v.match(/,([\d.]+)\)$/)?.[1]);
    expect(alpha(themeVars(theme, "monolith", true)["--glass"])).toBeGreaterThan(alpha(themeVars(theme, "monolith")["--glass"]));
  });
  it("leaves plain glass solid", () => {
    expect(themeVars(theme, "none")["--glass"]).toMatch(/,1\)$/);
  });
});
