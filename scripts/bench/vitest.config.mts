import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Concierge latency benchmark — NOT part of `npm test`.
 *
 * The root vitest config aliases `@` to the public Vite app, so the Next.js
 * chat route cannot be imported there. This config points `@` at the admin
 * app instead and runs only the benchmark file. See
 * scripts/bench/concierge-latency.bench.ts for what it may and may not touch.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../apps/admin", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/bench/concierge-latency.bench.ts"],
    testTimeout: 600_000,
    hookTimeout: 60_000,
    // Sequential by construction: turns of one conversation share memory.
    fileParallelism: false,
  },
});
