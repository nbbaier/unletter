import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "miniflare",
    environmentOptions: {
      modules: true,
      scriptPath: "./src/worker.ts",
      kvNamespaces: ["DATA", "WAITLIST"],
    },
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/**/*.test.ts",
        "src/assets/**",
        "types/**",
      ],
    },
  },
});
