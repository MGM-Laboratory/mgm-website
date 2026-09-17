import { test, expect, type Page } from "@playwright/test";

// The Projects section's MorphSlider defers its (expensive) WebGL
// construction until it's actually near the viewport, so a fullPage
// screenshot taken from the top of the page — which doesn't itself scroll
// far enough to trigger that, Chromium's full-page capture just expands the
// frame rather than scrolling it — would otherwise catch that section still
// unmounted. Scrolling past it first (ScrollSmoother moves content via a
// GSAP transform on a fixed-position wrapper, so this needs a real wheel
// event rather than scrollIntoView — see docs/animation-system.md) lets it
// mount and paint at least one frame before the screenshot is taken; the
// canvas keeps that frame's pixels once scrolled back away from, since the
// render loop only pauses rather than clearing it.
async function primeProjectsSlider(page: Page) {
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 400);
    const reached = await page.locator("#projects canvas").count();
    if (reached > 0) break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(300);
  // Scrolling back with window.scrollTo wouldn't move anything — content is
  // positioned via a GSAP transform on a fixed wrapper under ScrollSmoother
  // — and leaving ScrollTrigger's own tracked position mid-page risks
  // capturing scroll-triggered UI (the footer's "back to top" button) in a
  // state a real top-of-page load never shows.
  await page.evaluate(() => {
    (
      window as unknown as {
        ScrollSmoother?: { get?: () => { scrollTo: (v: number, s: boolean) => void } };
      }
    ).ScrollSmoother?.get?.()?.scrollTo(0, true);
  });
  await page.waitForTimeout(300);
}

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
  // MorphSlider's autoplay) each land on whatever frame the loop happens to
  // be on when the screenshot fires, which is a different, high-contrast
  // region of the page on every run — comfortably past maxDiffPixelRatio on
  // a sizeable fraction of runs. Every component already collapses to an
  // instant, fully-settled state under reduced motion (see
  // docs/animation-system.md), so this is what makes the baseline actually
  // reproducible rather than a coin flip.
  test("homepage", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(1000); // let entrance animations settle
    await primeProjectsSlider(page);
    await expect(page).toHaveScreenshot("homepage.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("homepage — dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(1000);
    await primeProjectsSlider(page);
    await expect(page).toHaveScreenshot("homepage-dark.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
