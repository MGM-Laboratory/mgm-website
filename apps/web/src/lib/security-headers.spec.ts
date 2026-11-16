// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { createRequire } from "node:module";

import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig, { FRAME_PROTECTED_SOURCE } from "../../next.config";

// The compiled copy of path-to-regexp is the one that Next uses to match the `source` of a header rule. It is an internal path of
// Next, so a Next upgrade can move it, and then this import is what needs a new path.
const nextRequire = createRequire(require.resolve("next/package.json"));
const { pathToRegexp } = nextRequire("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (path: string) => RegExp;
};

async function headerRules() {
  return (await nextConfig.headers?.()) ?? [];
}

function valuesFor(rules: Awaited<ReturnType<typeof headerRules>>, path: string) {
  const sent = new Map<string, string>();
  for (const rule of rules) {
    if (pathToRegexp(rule.source).test(path)) {
      for (const header of rule.headers) sent.set(header.key, header.value);
    }
  }
  return sent;
}

describe("security headers of the web app", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends the hardening headers on a page of the production build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const sent = valuesFor(await headerRules(), "/about");
    expect(sent.get("X-Content-Type-Options")).toBe("nosniff");
    expect(sent.get("Strict-Transport-Security")).toBe("max-age=31536000");
    expect(sent.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(sent.has("Content-Security-Policy-Report-Only")).toBe(true);
  });

  it("lets the public forms be embedded on other sites", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const sent = valuesFor(await headerRules(), "/forms/open-day");
    expect(sent.has("X-Frame-Options")).toBe(false);
    expect(sent.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("keeps the frame rule on pages whose name only starts like the forms path", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const path of ["/", "/formsite", "/admin/forms/preview", "/api/health"]) {
      expect(valuesFor(await headerRules(), path).get("X-Frame-Options")).toBe("SAMEORIGIN");
    }
    expect(pathToRegexp(FRAME_PROTECTED_SOURCE).test("/forms/a")).toBe(false);
  });

  it("sends none of them from the development server", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const sent = valuesFor(await headerRules(), "/about");
    expect(sent.has("X-Frame-Options")).toBe(false);
    expect(sent.has("Strict-Transport-Security")).toBe(false);
  });
});
