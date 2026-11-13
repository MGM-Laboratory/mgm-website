import { describe, expect, it } from "vitest";

import { parseTrustProxy } from "./trust-proxy.js";

describe("parseTrustProxy", () => {
  it.each([undefined, "", "  ", "false", "FALSE"])("leaves the setting off for %j", (value) => {
    expect(parseTrustProxy(value)).toBeUndefined();
  });

  it("reads a number of hops", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy(" 2 ")).toBe(2);
    expect(parseTrustProxy("10")).toBe(10);
  });

  it("reads a list of addresses, ranges and keywords", () => {
    expect(parseTrustProxy("loopback")).toBe("loopback");
    expect(parseTrustProxy("127.0.0.1, 10.0.0.0/8")).toBe("127.0.0.1,10.0.0.0/8");
    expect(parseTrustProxy("loopback,fd00::/8,2001:db8::1")).toBe("loopback,fd00::/8,2001:db8::1");
  });

  it.each([
    "true",
    "0",
    "11",
    "-1",
    "1.5",
    "everyone",
    "127.0.0.1,",
    "10.0.0.0/33",
    "10.0.0.0/8/8",
    "999.1.1.1",
    "fd00::/129",
  ])("refuses %j", (value) => {
    expect(() => parseTrustProxy(value)).toThrow();
  });
});
