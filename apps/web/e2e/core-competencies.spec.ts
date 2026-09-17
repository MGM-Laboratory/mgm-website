import { test, expect, type Locator, type Page } from "@playwright/test";

function cardFor(page: Page, name: RegExp) {
  return page.locator("div.reveal-card").filter({ has: page.getByRole("button", { name }) });
}

/**
 * ScrollSmoother eases toward a new scroll position rather than snapping
 * instantly, so hover()'s coordinates can land short of a just-scrolled-to
 * element (seen intermittently in Firefox). Polling the element's own
 * bounding box for two consecutive stable reads is an observable condition
 * to synchronize on, instead of guessing a fixed settle time.
 */
async function waitForStableLayout(locator: Locator, timeout = 10_000) {
  let last: number | undefined;
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox();
        const y = box?.y;
        const stable = last !== undefined && y !== undefined && Math.abs(y - last) < 0.5;
        last = y;
        return stable;
      },
      { timeout },
    )
    .toBe(true);
}

test.describe("core competencies cards", () => {
  test("mount at rest under reduced motion (no snap-to-hovered)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const card = cardFor(page, /Website Development/);
    await card.scrollIntoViewIfNeeded();
    const transform = await card
      .locator("> div")
      .first()
      .evaluate((el) => getComputedStyle(el).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
  });

  test("flips on hover and reverses on mouse leave", async ({ page }) => {
    await page.goto("/");
    const card = cardFor(page, /Website Development/);
    await card.scrollIntoViewIfNeeded();
    // Let the scroll-triggered entrance animation settle before capturing
    // the "rest" transform below (see waitForStableLayout's own doc comment
    // for why this polls layout rather than a fixed sleep).
    await waitForStableLayout(card);

    const inner = card.locator("> div").first();
    const restTransform = await inner.evaluate((el) => getComputedStyle(el).transform);

    await card.hover();
    await expect
      .poll(() => inner.evaluate((el) => getComputedStyle(el).transform))
      .not.toBe(restTransform);
  });

  test("back-face link is unreachable until the card opens", async ({ page }) => {
    await page.goto("/");
    const card = cardFor(page, /Website Development/);
    await card.scrollIntoViewIfNeeded();
    await waitForStableLayout(card);

    const exploreLink = card.getByRole("link", { name: "Explore" });
    await expect(exploreLink).toBeHidden();

    await card.hover();
    // Generous timeout: this hover-driven GSAP entrance can be slow to
    // settle on a loaded CI runner (e.g. the visual-regression suite's
    // full-page screenshots competing for the same worker's CPU, or headless
    // Firefox's simulated hover state being less consistently "sticky"
    // across sequential queries).
    await expect(exploreLink).toBeVisible({ timeout: 10_000 });
  });

  test("keyboard focus opens the card and un-inerts its links", async ({ page, browserName }) => {
    await page.goto("/");
    const card = cardFor(page, /Website Development/);
    await card.scrollIntoViewIfNeeded();

    const trigger = page.getByRole("button", { name: /Website Development/ });
    await trigger.focus();
    // No wait needed: the inert/aria-hidden flip happens synchronously in the
    // focus handler, and these assertions already poll on their own.
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(card.getByRole("link", { name: "Explore" })).toBeVisible();

    // WebKit's default keyboard config (mirroring real Safari) only
    // includes form controls in the Tab order, not plain links, unless the
    // OS-level "Full Keyboard Access" setting is on — that's a platform
    // default affecting every <a> on the site, not something this page
    // controls, so only Chromium/Firefox assert Tab actually lands there.
    if (browserName !== "webkit") {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => document.activeElement?.textContent);
      expect(focused).toBe("Explore");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
    }
  });

  test("Explore link points at the competency's own page", async ({ page }) => {
    await page.goto("/");
    const card = cardFor(page, /Website Development/);
    await card.scrollIntoViewIfNeeded();
    // See the "back-face link is unreachable" test above.
    await waitForStableLayout(card);
    await card.hover();

    await expect(card.getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/website", {
      timeout: 10_000,
    });
  });

  test("the yellow (UX) card uses black text for contrast", async ({ page }) => {
    await page.goto("/");
    const card = cardFor(page, /UX Research/);
    await card.scrollIntoViewIfNeeded();
    await card.hover();

    // The yellow card's text color is a static class, not hover-driven, but
    // poll anyway (an observable condition) rather than assume timing.
    const title = card.getByText("UX Research & Design").last();
    await expect
      .poll(() => title.evaluate((el) => getComputedStyle(el).color))
      .toBe("rgb(0, 0, 0)");
  });
});
