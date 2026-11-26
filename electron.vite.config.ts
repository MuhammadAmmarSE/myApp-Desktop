// Three builds: the main process (Node), the preload (the bridge) and the renderer (React).
// core/ is shared with the phone and the server; every build reads it as @myapp/core.
import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const core = { "@myapp/core": resolve(__dirname, "core/src/index.ts") };
const shared = { "@shared": resolve(__dirname, "src/shared") };

export default defineConfig({
  main: {
    resolve: { alias: { ...core, ...shared } },
    build: { externalizeDeps: true },
  },
  preload: {
    resolve: { alias: { ...shared } },
    build: { externalizeDeps: true },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    resolve: { alias: { ...core, ...shared, "@": resolve(__dirname, "src/renderer/src") } },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: { index: resolve(__dirname, "src/renderer/index.html") } } },
  },
});
