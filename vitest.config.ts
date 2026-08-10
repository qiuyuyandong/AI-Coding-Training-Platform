import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    exclude: ["node_modules/**", ".worktrees/**", "tests/e2e/**", "tests/extension-e2e/**"],
    environment: "jsdom",
    globals: true,
  },
});
