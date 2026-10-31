import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/core/**", "src/drivers/**"],
      thresholds: { lines: 90, branches: 85 },
    },
  },
});
