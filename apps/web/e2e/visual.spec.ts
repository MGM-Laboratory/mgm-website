import { test, expect, type Page } from "@playwright/test";

// The Projects section's covers are lazy-loaded and its scroll reveal only
// plays once the section actually crosses into the viewport, so a fullPage
// screenshot taken from the top of the page — which doesn't itself scroll
// far enough to trigger either, Chromium's full-page capture just expands
// the frame rather than scrolling it — would otherwise catch that section
// still empty. Scrolling past it first (ScrollSmoother moves content via a
// GSAP transform on a fixed-position wrapper, so this needs a real wheel
// event rather than scrollIntoView — see docs/animation-system.md) lets it
// reveal and fetch its covers before the screenshot is taken; the loaded
// covers keep their pixels once scrolled back away from.
//
// The whole check runs in one page.evaluate rather than through a locator:
// this suite runs against a web build with no API behind it, so the section
// renders its "no featured projects" state, `#projects img` never exists, and
// a locator would sit there waiting for it until the test timed out.
async function primeProjectsSection(page: Page) {
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 400);
    const state = await page.evaluate(() => {
      const section = document.querySelector("#projects");
      if (!section) return { inView: false, covers: 0, loaded: false };
      const covers = Array.from(section.querySelectorAll<HTMLImageElement>("img"));
      return {
        inView: section.getBoundingClientRect().top < window.innerHeight,
        covers: covers.length,
        loaded: covers.every((img) => img.complete && img.naturalWidth > 0),
      };
    });
    // Covers on the page: stop as soon as they've painted. No covers (the
    // empty state this suite's web-only build renders): keep scrolling all
    // the way down, the same distance this helper always scrolled, so the
    // scroll-revealed sections below land in the state the baseline captured.
    if (state.inView && state.covers > 0 && state.loaded) break;
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
  // carousel's autoplay) each land on whatever frame the loop happens to be
  // on when the screenshot fires, which is a different, high-contrast
  // region of the page on every run — comfortably past maxDiffPixelRatio on
  // a sizeable fraction of runs. Every component already collapses to an
  // instant, fully-settled state under reduced motion (see
  // docs/animation-system.md), so this is what makes the baseline actually
  // reproducible rather than a coin flip.
  test("homepage", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(1000); // let entrance animations settle
    await primeProjectsSection(page);
    await expect(page).toHaveScreenshot("homepage.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("homepage — dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(1000);
    await primeProjectsSection(page);
    await expect(page).toHaveScreenshot("homepage-dark.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
