import { test, expect } from "@playwright/test";

test.describe("theme toggle", () => {
  test("toggles the .dark class on <html>", async ({ page }) => {
    await page.goto("/");

    const html = page.locator("html");
    const toggle = page.getByRole("button", { name: "Toggle theme" });

    const initiallyDark = await html.evaluate((el) => el.classList.contains("dark"));

    await toggle.click();
    await expect(html).toHaveClass(initiallyDark ? /^(?!.*dark).*$/ : /dark/);

    await toggle.click();
    await expect(html).toHaveClass(initiallyDark ? /dark/ : /^(?!.*dark).*$/);
  });
});
