// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import { isCloudflareAddress, visitorAddress } from "./visitor-ip";

function request(headers: Record<string, string>) {
  return new Request("https://labmgm.org/forms/x", { headers });
}

describe("isCloudflareAddress", () => {
  it("accepts addresses inside the published IPv4 ranges, edges included", () => {
    expect(isCloudflareAddress("173.245.48.0")).toBe(true);
    expect(isCloudflareAddress("173.245.63.255")).toBe(true);
    expect(isCloudflareAddress("104.16.0.1")).toBe(true);
    expect(isCloudflareAddress("104.23.255.255")).toBe(true);
    expect(isCloudflareAddress("162.159.255.255")).toBe(true);
    expect(isCloudflareAddress("198.41.200.1")).toBe(true);
  });

  it("refuses addresses just outside a range", () => {
    expect(isCloudflareAddress("173.245.47.255")).toBe(false);
    expect(isCloudflareAddress("173.245.64.0")).toBe(false);
    expect(isCloudflareAddress("104.24.0.0")).toBe(true);
    expect(isCloudflareAddress("104.28.0.0")).toBe(false);
    expect(isCloudflareAddress("8.8.8.8")).toBe(false);
    expect(isCloudflareAddress("127.0.0.1")).toBe(false);
  });

  it("rejects malformed IPv4 addresses", () => {
    expect(isCloudflareAddress("104.16.0")).toBe(false);
    expect(isCloudflareAddress("104.16.0.1.1")).toBe(false);
    expect(isCloudflareAddress("104.16.0.256")).toBe(false);
    expect(isCloudflareAddress("104.16.0.x")).toBe(false);
    expect(isCloudflareAddress("104.16.0.1234")).toBe(false);
    expect(isCloudflareAddress("")).toBe(false);
    expect(isCloudflareAddress("not an ip")).toBe(false);
  });

  it("accepts IPv6 addresses inside the ranges, in any case and with compression", () => {
    expect(isCloudflareAddress("2606:4700::1")).toBe(true);
    expect(isCloudflareAddress("2606:4700:0:0:0:0:0:1")).toBe(true);
    expect(isCloudflareAddress("2606:4700:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(true);
    expect(isCloudflareAddress("2606:4700::")).toBe(true);
    expect(isCloudflareAddress("2400:CB00::1")).toBe(true);
    // A /29 range spans eight blocks of the second group, the last one is 98c7
    expect(isCloudflareAddress("2a06:98c7::1")).toBe(true);
    expect(isCloudflareAddress("2a06:98c8::1")).toBe(false);
  });

  it("refuses IPv6 outside the ranges and malformed ones", () => {
    expect(isCloudflareAddress("2606:4701::1")).toBe(false);
    expect(isCloudflareAddress("::1")).toBe(false);
    expect(isCloudflareAddress("::")).toBe(false);
    expect(isCloudflareAddress("2606:4700::1::2")).toBe(false);
    expect(isCloudflareAddress("2606:4700:1:2:3:4:5:6:7")).toBe(false);
    expect(isCloudflareAddress("2606:4700:1:2:3")).toBe(false);
    expect(isCloudflareAddress("2606:zzzz::1")).toBe(false);
    expect(isCloudflareAddress("2606:12345::1")).toBe(false);
    expect(isCloudflareAddress("::ffff:104.16.0.1")).toBe(false);
  });
});

describe("visitorAddress", () => {
  it("uses the first forwarded address when the request did not come through Cloudflare", () => {
    expect(visitorAddress(request({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe(
      "203.0.113.9",
    );
    expect(visitorAddress(request({ "x-forwarded-for": "  203.0.113.9  " }))).toBe("203.0.113.9");
  });

  it("trusts cf-connecting-ip only when the peer is a Cloudflare edge", () => {
    expect(
      visitorAddress(
        request({ "x-forwarded-for": "104.16.0.1", "cf-connecting-ip": "198.51.100.7" }),
      ),
    ).toBe("198.51.100.7");
    expect(
      visitorAddress(
        request({ "x-forwarded-for": "2606:4700::5", "cf-connecting-ip": " 198.51.100.7 " }),
      ),
    ).toBe("198.51.100.7");
  });

  it("ignores a spoofed cf-connecting-ip from a peer outside Cloudflare", () => {
    expect(
      visitorAddress(
        request({ "x-forwarded-for": "203.0.113.9", "cf-connecting-ip": "198.51.100.7" }),
      ),
    ).toBe("203.0.113.9");
  });

  it("falls back to the peer when a Cloudflare edge sent no visitor header", () => {
    expect(visitorAddress(request({ "x-forwarded-for": "104.16.0.1" }))).toBe("104.16.0.1");
    expect(
      visitorAddress(request({ "x-forwarded-for": "104.16.0.1", "cf-connecting-ip": " " })),
    ).toBe("104.16.0.1");
  });

  it("returns null when the hosting said nothing", () => {
    expect(visitorAddress(request({}))).toBeNull();
    expect(visitorAddress(request({ "cf-connecting-ip": "198.51.100.7" }))).toBeNull();
    expect(visitorAddress(request({ "x-forwarded-for": "" }))).toBeNull();
  });
});
