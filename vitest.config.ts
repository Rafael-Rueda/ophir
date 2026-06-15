import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { LOG_LEVEL: "silent", NODE_ENV: "test" },
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/observability/instrumentation.ts", "src/main.ts"],
    },
  },
});
