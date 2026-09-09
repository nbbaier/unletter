import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "node_modules/",
        "src/**/*.test.ts",
        "src/assets/**",
        "types/**",
      ],
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 55,
        functions: 65,
        lines: 70,
        statements: 70,
      },
    },
    environment: "miniflare",
    environmentOptions: {
      kvNamespaces: ["DATA", "WAITLIST"],
      modules: true,
      scriptPath: "./src/worker.ts",
    },
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
