// Every page of the computer app is in the assistant's guide (core's FEATURES), and every page the
// guide names exists: a page added without telling the assistant fails here.
import { describe, expect, it } from "vitest";
import { routesInGuide } from "@myapp/core";
import app from "../../src/renderer/src/App.tsx?raw";

const block = app.slice(app.indexOf("const ROUTES"), app.indexOf("];", app.indexOf("const ROUTES")));
const routes = [...block.matchAll(/\["(\/[^"]*)"/g)].map((m) => m[1]);

describe("the assistant's guide", () => {
  it("reads the app's pages", () => {
    expect(routes.length).toBeGreaterThan(10);
  });
  it("names every page of the computer app", () => {
    const guide = new Set(routesInGuide("desktop"));
    expect(routes.filter((r) => !guide.has(r))).toEqual([]);
  });
  it("names no page the computer app doesn't have", () => {
    const have = new Set(routes);
    expect(routesInGuide("desktop").filter((r) => !have.has(r))).toEqual([]);
  });
});
