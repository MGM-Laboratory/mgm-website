import { test, expect } from "@playwright/test";

// Visual baselines are only meaningful per-engine/OS — keeping them to a
// single project avoids cross-platform pixel-diff noise on every PR.
test.describe("visual regression", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
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
