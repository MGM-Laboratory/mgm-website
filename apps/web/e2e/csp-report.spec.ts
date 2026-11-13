import { expect, test } from "@playwright/test";

test.describe("Content-Security-Policy-Report-Only", () => {
  test("pages send the policy as a report only header", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["content-security-policy-report-only"]).toContain("default-src 'self'");
    expect(headers["content-security-policy-report-only"]).toContain("report-uri /api/csp-report");
    expect(headers["content-security-policy"]).toBeUndefined();
  });

  test("the report route accepts a report and a list of reports", async ({ request }) => {
    const old = await request.post("/api/csp-report", {
      data: JSON.stringify({
        "csp-report": {
          "document-uri": "https://example.test/page?token=secret",
          "blocked-uri": "https://cdn.example.test/script.js",
          "effective-directive": "script-src-elem",
        },
      }),
      headers: { "content-type": "application/csp-report" },
    });
    const list = await request.post("/api/csp-report", {
      data: JSON.stringify([
        {
          type: "csp-violation",
          body: { documentURL: "https://example.test/", blockedURL: "inline" },
        },
      ]),
      headers: { "content-type": "application/reports+json" },
    });

    expect(old.status()).toBe(204);
    expect(list.status()).toBe(204);
  });

  test("the report route refuses a body that is not JSON and a body that is too large", async ({
    request,
  }) => {
    const notJson = await request.post("/api/csp-report", { data: "not json" });
    const large = await request.post("/api/csp-report", {
      data: "x".repeat(20 * 1024),
      headers: { "content-type": "application/csp-report" },
    });

    expect(notJson.status()).toBe(400);
    expect(large.status()).toBe(413);
  });
});
