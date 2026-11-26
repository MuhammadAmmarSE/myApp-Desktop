import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@myapp/core": resolve(import.meta.dirname, "core/src/index.ts"),
      "@shared": resolve(import.meta.dirname, "src/shared"),
      "@": resolve(import.meta.dirname, "src/renderer/src"),
    },
  },
  test: { include: ["test/unit/**/*.test.ts"], environment: "node" },
});
