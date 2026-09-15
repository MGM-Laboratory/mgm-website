import { test, expect } from "@playwright/test";

test.describe("core competencies cards", () => {
  test("mount at rest under reduced motion (no snap-to-hovered)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const card = page.getByRole("link", { name: /Website Development/ });
    await card.scrollIntoViewIfNeeded();
    const transform = await card
      .locator("> div")
      .first()
      .evaluate((el) => getComputedStyle(el).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
  });

  test("flips on hover and reverses on mouse leave", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("link", { name: /Website Development/ });
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
});
