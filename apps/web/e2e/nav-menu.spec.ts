import { test, expect } from "@playwright/test";

// Regression coverage for the bugs documented in docs/testing-verification.md.

test.describe("nav menu", () => {
  test("panel is fully hidden before any JS runs (no reload flash)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // The panel itself must already be aria-hidden in the server-rendered
    // HTML — nothing of the closed menu may be visible pre-hydration.
    await expect(page.locator('[aria-hidden="true"]').first()).toBeAttached();
    await context.close();
  });

  test("opens and closes, updating aria-expanded and aria-hidden", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Open menu" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    const closeToggle = page.getByRole("button", { name: "Close menu" });
    await expect(closeToggle).toHaveAttribute("aria-expanded", "true");

    await closeToggle.click();
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("surviving an open→close→open interruption still shows the panel", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Open menu" });
    await toggle.click();
    // Interrupt the open animation almost immediately with a close, then
    // immediately open again — this used to leave `busyRef` stuck true
    // forever (playClose killed the open timeline before its onComplete
    // could clear it), so the next playOpen() silently no-op'd: aria state
    // said "open" but the panel never actually animated in.
    // No observable condition to synchronize on here by design: the point is
    // to interrupt the animation at an arbitrary moment while it's still in
    // flight, not to wait for it to reach some state.
    await page.waitForTimeout(60); // NOSONAR: deliberate mid-animation interrupt, see comment above
    await page.getByRole("button", { name: "Close menu" }).click();
    await page.waitForTimeout(60); // NOSONAR: deliberate mid-animation interrupt, see comment above
    await page.getByRole("button", { name: "Open menu" }).click();

    const panel = page.locator("#site-nav-panel");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // The real symptom: the panel must actually slide fully on-screen, not
    // just report itself open in aria/icon state while sitting translated
    // off the right edge. The panel's own tween doesn't start until partway
    // through the timeline (after the layer stagger), so poll rather than
    // sampling immediately.
    const viewport = page.viewportSize();
    await expect
      .poll(async () => (await panel.boundingBox())?.x, { timeout: 3000 })
      .toBeLessThan(viewport!.width);

    // And the menu must still be fully interactive afterward — clicking a
    // real nav item should navigate, not require an extra "unstick" click.
    const firstLink = panel.getByRole("link").first();
    await expect(firstLink).toBeVisible();
  });

  test("menu text stays visible in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();

    // Every nav item link should render with a non-transparent, visible color.
    const firstLink = page.getByRole("link").filter({ hasText: /./ }).first();
    await expect(firstLink).toBeVisible();
    const color = await firstLink.evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("respects prefers-reduced-motion on mount and toggle", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Open menu" });
    await toggle.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test.describe("no-scroll viewport matrix", () => {
    const viewports = [
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1280, height: 600 },
      { width: 390, height: 844 },
    ];

    for (const viewport of viewports) {
      test(`scroll is locked at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await page.getByRole("button", { name: "Open menu" }).click();

        // The menu's own scroll lock (docs/architecture.md: ScrollSmoother
        // paused + documentElement.style.overflow fallback) must engage —
        // regardless of viewport, the page behind the overlay must not scroll.
        await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
      });
    }
  });
});
