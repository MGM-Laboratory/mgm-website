import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { visitMeta, visitorTracker } from "./forms.common.js";

const PASSPHRASE = "web-server-passphrase";

function request(headers: Record<string, string>, ip = "10.0.0.5") {
  return { headers, ip } as unknown as Request;
}

describe("the visitor details that the web server forwards", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_PASSPHRASE", PASSPHRASE);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("believes the forwarded details when the request carries the passphrase", () => {
    const req = request({
      "x-cms-passphrase": PASSPHRASE,
      "x-visitor-ip": "203.0.113.9, 10.0.0.1",
      "x-visitor-user-agent": "visitor-agent",
      "x-visitor-referer": "https://example.test/",
    });

    expect(visitMeta(req)).toEqual({
      ip: "203.0.113.9",
      userAgent: "visitor-agent",
      referer: "https://example.test/",
    });
    expect(visitorTracker(req as unknown as Record<string, unknown>)).toBe("visitor:203.0.113.9");
  });

  it("counts every address of one IPv6 prefix under one key, for a forwarded visitor and for a direct caller", () => {
    const forwarded = (address: string) =>
      visitorTracker(
        request({ "x-cms-passphrase": PASSPHRASE, "x-visitor-ip": address }) as unknown as Record<string, unknown>,
      );
    const direct = (address: string) =>
      visitorTracker(request({}, address) as unknown as Record<string, unknown>);

    expect(forwarded("2001:db8:1:2:aaaa::1")).toBe("visitor:2001:db8:1:2::/64");
    expect(forwarded("2001:db8:1:2:bbbb::2")).toBe(forwarded("2001:db8:1:2:aaaa::1"));
    expect(direct("2001:db8:9:9:1::1")).toBe(direct("2001:db8:9:9:2::2"));
    expect(forwarded("2001:db8:1:3::1")).not.toBe(forwarded("2001:db8:1:2::1"));
  });

  it("uses the address of the peer when the passphrase is missing or wrong", () => {
    const proofs: Record<string, string>[] = [{}, { "x-cms-passphrase": "wrong" }];
    for (const proof of proofs) {
      const req = request({
        ...proof,
        "x-visitor-ip": "203.0.113.9",
        "x-visitor-user-agent": "claimed-agent",
        "user-agent": "real-agent",
      });

      expect(visitMeta(req).ip).toBe("10.0.0.5");
      expect(visitMeta(req).userAgent).toBe("real-agent");
      expect(visitorTracker(req as unknown as Record<string, unknown>)).toBe("10.0.0.5");
    }
  });

  it("uses the address of the peer when the web server sends no visitor address", () => {
    const req = request({ "x-cms-passphrase": PASSPHRASE });

    expect(visitMeta(req).ip).toBe("10.0.0.5");
    expect(visitorTracker(req as unknown as Record<string, unknown>)).toBe("10.0.0.5");
  });

  it("falls back to the address of the peer for an empty forwarded address in both places", () => {
    const req = request({ "x-cms-passphrase": PASSPHRASE, "x-visitor-ip": " , 203.0.113.9" });

    expect(visitMeta(req).ip).toBe("10.0.0.5");
    expect(visitorTracker(req as unknown as Record<string, unknown>)).toBe("10.0.0.5");
  });

  it("never believes a forwarded address when no passphrase is configured", () => {
    vi.stubEnv("ADMIN_PASSPHRASE", "");
    const req = request({ "x-cms-passphrase": "", "x-visitor-ip": "203.0.113.9" });

    expect(visitMeta(req).ip).toBe("10.0.0.5");
    expect(visitorTracker(req as unknown as Record<string, unknown>)).toBe("10.0.0.5");
  });
});
