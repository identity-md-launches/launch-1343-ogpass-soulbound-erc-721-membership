import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
