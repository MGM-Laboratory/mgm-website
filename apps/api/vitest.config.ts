import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: "./",
    include: ["**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      // Count every source file, also the ones that no test loads, so the percentage is not
      // the share of the files that happen to be tested.
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/**/*.spec.ts", "src/**/*.d.ts"],
    },
  },
});
