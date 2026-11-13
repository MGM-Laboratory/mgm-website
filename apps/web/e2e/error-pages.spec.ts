import { expect, test } from "@playwright/test";

// The fixture API (e2e/fixtures/cms-fixture-server.mjs) drops the connection
// for every route it does not serve, such as the event pages. That is how a
// page behaves when the API is down, so it covers the error page. The
// fixture answers a real 404 for a missing project, which covers not found.

test.describe("error pages", () => {
  test("an address that nothing serves shows the site's 404 page", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "This page does not exist" }),
    ).toBeVisible();
  });

  test("a script that asks for an unknown address still gets JSON", async ({ request }) => {
    const response = await request.get("/no-such-page", {
      headers: { accept: "application/json" },
    });
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: "Not Found" });
  });

  test("a failed API read shows the error page and not a 404", async ({ page }) => {
    // Event pages stream behind a loading screen, so only the page counts here.
    await page.goto("/events/e2e-no-api");
    await expect(
      page.getByRole("heading", { level: 1, name: "We could not load this page" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the home page" })).toBeVisible();
  });
});
