import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve(projectDirectory, "src") } },
  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], clearMocks: true },
});
