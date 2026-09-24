import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

// The CMS fixture API (e2e/fixtures/cms-fixture-server.mjs) serves the
// project reads the project pages need, from committed records and media,
// and drops every other request as if no API were running. 4000 is where
// CI's build points NEXT_PUBLIC_API_URL. Pick a free port locally when a
// real API already listens there.
const CMS_FIXTURE_PORT = process.env.CMS_FIXTURE_PORT ?? "4000";
const cmsFixtureURL = `http://127.0.0.1:${CMS_FIXTURE_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
  webServer: [
    {
      name: "cms-fixture",
      command: "node e2e/fixtures/cms-fixture-server.mjs",
      // A path only the fixture answers: a real API on the port 404s it, so
      // the run stops with a clear error instead of reading real records.
      url: `${cmsFixtureURL}/__cms-fixture`,
      env: { CMS_FIXTURE_PORT },
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      name: "web",
      command: "pnpm start",
      url: baseURL,
      // Server-side CMS reads go to the fixture by IPv4 address: `localhost`
      // (the build's NEXT_PUBLIC_API_URL) resolves to ::1 first on some
      // runners, where nothing listens.
      env: { CMS_API_URL: `${cmsFixtureURL}/api` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
