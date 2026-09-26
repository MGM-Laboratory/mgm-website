import { expect, test, type Locator } from "@playwright/test";

// The process section's fridge magnets (components/process/magnet-board.ts).
// Reduced motion keeps every interaction but makes each one instant, and
// without ScrollSmoother native focus scrolling reaches the board.

const offset = (magnet: Locator) =>
  magnet.evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: Math.round(m.m41), y: Math.round(m.m42) };
  });

test("magnets move with the keyboard, flip, persist and go back home", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("mgm:process-magnets:v1"));

  const magnet = page.getByRole("button", { name: /^Research\. Press Enter to flip/ });
  await magnet.focus();
  await expect(page.locator('#process[data-magnet-board="ready"]')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(magnet).toHaveCSS("opacity", "1");
  expect(await offset(magnet)).toEqual({ x: 0, y: 0 });

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => offset(magnet)).toEqual({ x: 16, y: 64 });

  await page.keyboard.press("Enter");
  await expect(magnet).toHaveAttribute("data-flipped", "true");
  await page.keyboard.press("Escape");
  await expect(magnet).toHaveAttribute("data-flipped", "false");

  // The arrangement survives a reload.
  await page.reload();
  const again = page.getByRole("button", { name: /^Research\. Press Enter to flip/ });
  await again.focus();
  await expect(page.locator('#process[data-magnet-board="ready"]')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect.poll(() => offset(again)).toEqual({ x: 16, y: 64 });

  const reset = page.getByRole("button", { name: "Put them back" });
  await expect(reset).toBeVisible();
  await reset.click();
  await expect.poll(() => offset(again)).toEqual({ x: 0, y: 0 });
  await expect(reset).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("mgm:process-magnets:v1"))).toBeNull();
  expect(errors).toEqual([]);
});

test("magnets are thrown onto the board when it scrolls into view", async ({ page }) => {
  await page.goto("/");
  const magnets = page.locator("[data-magnet]");
  await expect(magnets).toHaveCount(10);
  // A native scroll: on "/" ScrollSmoother follows it, and its fixed
  // wrapper would swallow a scrollIntoView.
  await page.evaluate(() => {
    const top = document.querySelector("#process")!.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top - 64);
  });
  for (let i = 0; i < 10; i++) {
    await expect(magnets.nth(i)).toHaveCSS("opacity", "1", { timeout: 15000 });
  }
  await expect(page.locator("#process")).toHaveCSS("overflow-x", "clip");
});
