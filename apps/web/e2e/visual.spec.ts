import { test, expect } from "@playwright/test";

// Visual baselines are only meaningful per-engine/OS — keeping them to a
// single project avoids cross-platform pixel-diff noise on every PR.
test.describe("visual regression", () => {
  test.beforeEach(async ({}, testInfo) => {
    // testInfo.project.name is just the browser engine ("chromium") — it
    // doesn't vary by OS, so this also has to check process.platform
    // directly. Without it, the windows-latest/chromium matrix job ran this
    // same comparison against a baseline (homepage-chromium-win32.png) that
    // was never captured and was never meant to exist, failing every time.
    test.skip(
      testInfo.project.name !== "chromium" || process.platform !== "linux",
      "Baselines are only maintained for the primary chromium/ubuntu project",
    );
  });

  test("homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000); // let entrance animations settle
    await expect(page).toHaveScreenshot("homepage.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("homepage — dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("homepage-dark.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
