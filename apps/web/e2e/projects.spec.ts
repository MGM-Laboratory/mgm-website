import { test, expect, type Page } from "@playwright/test";

// CI runs the web build without an API, so /projects renders its empty
// state there, while a local run against the CMS renders the full list.
// These checks hold for both: the page loads cleanly, the hero reads as a
// heading with its count, and the intro (which locks the page and hides
// the list only while the hero's entrance plays) always lets go.

const htmlOverflow = (page: Page) => page.evaluate(() => document.documentElement.style.overflow);
const listOpacity = (page: Page) =>
  page.evaluate(() => {
    const list = document.getElementById("projects");
    return list ? getComputedStyle(list).opacity : null;
  });

test.describe("projects page", () => {
  test("finishes its intro and never strands the page locked or the list hidden", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/projects");
    await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    await expect(page.getByText(/^\d+ projects?$/)).toBeAttached();

    await expect.poll(() => htmlOverflow(page), { timeout: 15_000 }).toBe("");
    await expect.poll(() => listOpacity(page), { timeout: 15_000 }).toBe("1");
    expect(errors).toEqual([]);
  });

  test("arriving through the page transition still finishes the intro", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // After the app has booted, the hero waits for the transition curtain
    // to reveal the page before its entrance (and the intro's release)
    // runs: a different path from the fresh loads above. Click the real
    // homepage call to action, the way the other specs cross the curtain.
    await page.goto("/");
    await page
      .locator('a[href="/projects"]')
      .filter({ hasText: /our work/i })
      .first()
      .evaluate((el: HTMLElement) => el.click());
    await expect(page).toHaveURL(/\/projects$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();

    await expect.poll(() => htmlOverflow(page), { timeout: 20_000 }).toBe("");
    await expect.poll(() => listOpacity(page), { timeout: 20_000 }).toBe("1");
    expect(errors).toEqual([]);
  });

  test("reduced motion shows everything at once without locking", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/projects");
    await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    expect(await htmlOverflow(page)).toBe("");
    await expect.poll(() => listOpacity(page), { timeout: 5_000 }).toBe("1");
  });
});
