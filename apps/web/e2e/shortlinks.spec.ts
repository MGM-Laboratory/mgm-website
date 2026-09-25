import { expect, test, type APIRequestContext } from "@playwright/test";

// The public short-link pages, rendered from the CMS fixture API's
// shortlinks routes (e2e/fixtures/cms-fixture-server.mjs). These cover the
// click path end to end: the instant redirect for open links, the
// passphrase gate and its wrong/right paths, and the expired/not-found
// pages. The fixture's destinations live under fixture.example so the
// redirects are asserted without ever resolving that host.

// A render plus a form round-trip per test, on slow CI runners.
test.setTimeout(60_000);

// The fixture long URLs don't resolve, so redirects are asserted at the
// response level; outside CI a reused dev server (real API behind it) has
// no /s/redirect link and answers 404, which skips the file.
async function requireFixture(request: APIRequestContext) {
  if (process.env.CI) return;
  const response = await request.get("/s/redirect", { maxRedirects: 0 });
  test.skip(
    response.status() !== 302,
    "The server under test isn't reading the CMS fixture API (see docs/testing-verification.md)",
  );
}

test.describe("short links", () => {
  test.beforeEach(({ request }) => requireFixture(request));

  test("an open link redirects instantly", async ({ request }) => {
    const response = await request.get("/s/redirect", { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe("https://fixture.example/destination");
  });

  test("a passphrase link shows the gate and rejects a wrong passphrase", async ({ page }) => {
    await page.goto("/s/gated");
    await expect(page).toHaveTitle("Protected link · MGM Laboratory");
    await expect(page.getByRole("heading", { name: "Protected link" })).toBeVisible();
    await page.fill("#passphrase", "wrong");
    await page.click('button[type="submit"]');
    await expect(page.getByText("That passphrase is not right.")).toBeVisible();
  });

  test("the right passphrase unlocks the link", async ({ page, request }) => {
    const response = await request.post("/s/gated", {
      form: { passphrase: "sesame" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe("https://fixture.example/gated-destination");
  });

  test("used and unknown links get their own pages", async ({ page, request }) => {
    const used = await request.get("/s/used", { maxRedirects: 0 });
    expect(used.status()).toBe(410);
    const missing = await request.get("/s/unknown-thing", { maxRedirects: 0 });
    expect(missing.status()).toBe(404);

    await page.goto("/s/used");
    await expect(page).toHaveTitle("Link used · MGM Laboratory");
    await page.goto("/s/unknown-thing");
    await expect(page).toHaveTitle("Link not found · MGM Laboratory");
  });

  test("the catch-all leaves the marketing site alone", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.locator(".hero")).toBeVisible();
  });
});
