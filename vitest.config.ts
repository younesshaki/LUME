import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Two projects, because `@` means two different things in this repo:
 *
 *  - `app` — everything that existed before: the public Vite app and the
 *    admin libraries' unit tests, with `@` → the Vite app's `src`.
 *  - `admin-routes` — `*.route.test.ts` files that execute a real Next.js
 *    route handler in-process, with `@` → `apps/admin` so the handler's own
 *    imports resolve. Their I/O (tenant, database, provider) is mocked.
 */
const ADMIN_ROUTE_TESTS = "apps/admin/**/*.route.test.ts";

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        resolve: {
          alias: {
            "@": "/src",
          },
        },
        test: {
          name: "app",
          environment: "jsdom",
          globals: true,
          setupFiles: ["src/test/setup.ts"],
          // Playwright specs run via `npm run test:e2e`, never under vitest.
          exclude: [
            ...configDefaults.exclude,
            "apps/admin/e2e/**",
            "e2e/**",
            ADMIN_ROUTE_TESTS,
          ],
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./apps/admin", import.meta.url)),
          },
        },
        test: {
          name: "admin-routes",
          environment: "node",
          include: [ADMIN_ROUTE_TESTS],
        },
      },
    ],
  },
});
