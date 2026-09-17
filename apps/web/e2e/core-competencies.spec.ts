import { test, expect } from "@playwright/test";

function cardFor(page: import("@playwright/test").Page, name: RegExp) {
  return page.locator("div.reveal-card").filter({ has: page.getByRole("button", { name }) });
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
    // Let the scroll-triggered entrance animation settle before interacting.
    await page.waitForTimeout(800);

    const inner = card.locator("> div").first();
    const restTransform = await inner.evaluate((el) => getComputedStyle(el).transform);

    await card.hover();
    await page.waitForTimeout(500);
    const hoverTransform = await inner.evaluate((el) => getComputedStyle(el).transform);

    expect(hoverTransform).not.toBe(restTransform);
  });

  test("back-face links are unreachable until the card opens", async ({ page }) => {
    await page.goto("/");
    const card = cardFor(page, /Website Development/);
    await card.scrollIntoViewIfNeeded();

    const exploreLink = card.getByRole("link", { name: "Explore" });
    await expect(exploreLink).toBeHidden();

    await card.hover();
    // Generous timeout: this hover-driven GSAP entrance can be slow to
    // settle on a loaded CI runner (e.g. the visual-regression suite's
    // full-page screenshots competing for the same worker's CPU).
    await expect(exploreLink).toBeVisible({ timeout: 10_000 });
    await expect(card.getByRole("link", { name: "Member" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Publications" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Article" })).toBeVisible();
  });

  test("keyboard focus opens the card and un-inerts its links", async ({ page, browserName }) => {
    await page.goto("/");
    const card = cardFor(page, /Website Development/);
    await card.scrollIntoViewIfNeeded();

    const trigger = page.getByRole("button", { name: /Website Development/ });
    await trigger.focus();
    await page.waitForTimeout(900);
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

  test("Projects and Member bento links carry the division filter; Publications/Article do not", async ({
    page,
  }) => {
    await page.goto("/");
    const card = cardFor(page, /Website Development/);
    await card.scrollIntoViewIfNeeded();
    await card.hover();

    await expect(card.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "href",
      "/projects?category=website",
      { timeout: 10_000 },
    );
    await expect(card.getByRole("link", { name: "Member" })).toHaveAttribute(
      "href",
      "/member?division=Website",
    );
    await expect(card.getByRole("link", { name: "Publications" })).toHaveAttribute(
      "href",
      "/publications",
    );
    await expect(card.getByRole("link", { name: "Article" })).toHaveAttribute("href", "/articles");
  });

  test("the yellow (UX) card uses black text for contrast", async ({ page }) => {
    await page.goto("/");
    const card = cardFor(page, /UX Research/);
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await page.waitForTimeout(900);

    const color = await card
      .getByText("UX Research & Design")
      .last()
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(0, 0, 0)");
  });
});
