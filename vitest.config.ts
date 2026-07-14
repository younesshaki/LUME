import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    // Playwright specs run via `npm run test:e2e`, never under vitest.
    exclude: [...configDefaults.exclude, "apps/admin/e2e/**", "e2e/**"],
  },
});
