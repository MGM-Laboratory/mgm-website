// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from "vitest";

const { visitorAddress } = vi.hoisted(() => ({
  visitorAddress: vi.fn<(request: Request) => string | undefined>(),
}));

vi.mock("@/lib/forms/visitor-ip", () => ({ visitorAddress }));

import { provenVisitorHeaders, visitorHeaders } from "./visitor-headers";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://site.test/x", { headers });

afterEach(() => {
  vi.unstubAllEnvs();
  visitorAddress.mockReset();
});

describe("visitorHeaders", () => {
  it("forwards the address, the client and the referer", () => {
    visitorAddress.mockReturnValue("203.0.113.9");

    expect(
      visitorHeaders(request({ "user-agent": "TestBrowser/1", referer: "https://from.test/" })),
    ).toEqual({
      "x-visitor-ip": "203.0.113.9",
      "x-visitor-user-agent": "TestBrowser/1",
      "x-visitor-referer": "https://from.test/",
    });
  });

  it("leaves out what the request does not carry", () => {
    visitorAddress.mockReturnValue(undefined);

    expect(visitorHeaders(request())).toEqual({});
  });
});

describe("provenVisitorHeaders", () => {
  it("adds the passphrase that proves the headers", () => {
    vi.stubEnv("ADMIN_PASSPHRASE", "the-admin-login-value");
    visitorAddress.mockReturnValue("203.0.113.9");

    expect(provenVisitorHeaders(request())).toEqual({
      "x-cms-passphrase": "the-admin-login-value",
      "x-visitor-ip": "203.0.113.9",
    });
  });

  it("sends an empty passphrase when none is configured", () => {
    vi.stubEnv("ADMIN_PASSPHRASE", undefined);
    visitorAddress.mockReturnValue(undefined);

    expect(provenVisitorHeaders(request())).toEqual({ "x-cms-passphrase": "" });
  });
});
