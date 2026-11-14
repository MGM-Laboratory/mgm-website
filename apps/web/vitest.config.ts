import path from "node:path";

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the `@/` alias of tsconfig.json
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` throws on import outside a Next server build, so the tests get an empty module in its place
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    // The Playwright specs live in e2e/, and the unit specs live next to the code
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      // Only the files of src/lib and src/app/api are counted. The pages and components are
      // covered by the Playwright specs, which line coverage cannot see, so they are not counted here.
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/**/*.d.ts"],
    },
  },
});
