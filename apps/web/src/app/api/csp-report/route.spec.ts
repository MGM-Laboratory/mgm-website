// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const REPORT = {
  "csp-report": {
    "document-uri": "https://site.test/about?token=secret#part",
    "blocked-uri": "eval",
    "effective-directive": "script-src",
    "violated-directive": "script-src",
    "source-file": "https://site.test/_next/static/chunks/a.js?v=1",
    "line-number": 1,
    disposition: "report",
  },
};

function report(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://site.test/api/csp-report", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  });
}

describe("POST /api/csp-report", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  let clock = 1_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    // Each test starts two minutes later, so the line limit of an earlier test does not carry over
    clock += 120_000;
    vi.setSystemTime(clock);
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    warn.mockRestore();
  });

  it("logs one line with the user agent and no query string or fragment", async () => {
    const response = await POST(report(REPORT, { "user-agent": "TestBrowser/1.2 (X11)" }));

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const [label, json] = warn.mock.calls[0] as [string, string];
    expect(label).toBe("csp-report");
    expect(JSON.parse(json)).toMatchObject({
      page: "https://site.test/about",
      blocked: "eval",
      directive: "script-src",
      source: "https://site.test/_next/static/chunks/a.js",
      line: 1,
      userAgent: "TestBrowser/1.2 (X11)",
    });
    expect(json).not.toContain("secret");
  });

  it("cuts a long user agent to 160 characters", async () => {
    await POST(report(REPORT, { "user-agent": "a".repeat(500) }));

    const parsed = JSON.parse((warn.mock.calls[0] as [string, string])[1]) as { userAgent: string };
    expect(parsed.userAgent).toHaveLength(160);
  });

  it("leaves the field out when the browser sends no user agent", async () => {
    await POST(report(REPORT));

    const parsed = JSON.parse((warn.mock.calls[0] as [string, string])[1]) as Record<
      string,
      unknown
    >;
    expect(parsed).not.toHaveProperty("userAgent");
  });

  it("answers 400 for a body that is not JSON and 413 for a body above 8 KB", async () => {
    expect((await POST(report("not json"))).status).toBe(400);
    expect((await POST(report(`{"x":"${"a".repeat(9000)}"}`))).status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });
});
