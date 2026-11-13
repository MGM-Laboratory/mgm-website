import { expect, test } from "@playwright/test";

test.describe("healthz", () => {
  test("answers ok with no caching and without a page", async ({ request }) => {
    const response = await request.get("/healthz");

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
