import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Lets examples/ import from "reveclicat" exactly like a user would.
    alias: { reveclicat: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
  },
  test: {
    pool: "forks", // process.chdir() in tests (rcc init) is not allowed in worker threads
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
