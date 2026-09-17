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

  // Reduced motion isn't just a faster settle: without it, the homepage's
  // perpetual decorative loops (the hero shapes' idle motion, the Projects
  // CardSwap auto-cycle) each land on whatever frame the loop happens to be
  // on when the screenshot fires, which is a different, high-contrast region
  // of the page on every run — comfortably past maxDiffPixelRatio on a
  // sizeable fraction of runs. Every component already collapses to an
  // instant, fully-settled state under reduced motion (see
  // docs/animation-system.md), so this is what makes the baseline actually
  // reproducible rather than a coin flip.
  test("homepage", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(1000); // let entrance animations settle
    await expect(page).toHaveScreenshot("homepage.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("homepage — dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("homepage-dark.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
