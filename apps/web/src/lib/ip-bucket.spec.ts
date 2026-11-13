import { describe, expect, it } from "vitest";

import { ipBucket } from "./ip-bucket";

describe("ipBucket", () => {
  it("keeps an IPv4 address as it is", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
  });

  it("counts every address of one /64 prefix under the same key", () => {
    const first = ipBucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    const second = ipBucket("2001:0DB8:1:2::1");

    expect(first).toBe("2001:db8:1:2::/64");
    expect(second).toBe(first);
  });

  it("tells two prefixes apart", () => {
    expect(ipBucket("2001:db8:1:2::1")).not.toBe(ipBucket("2001:db8:1:3::1"));
  });

  it("expands a compressed address before it takes the prefix", () => {
    expect(ipBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipBucket("::1")).toBe("0:0:0:0::/64");
  });

  it("counts an IPv4 address inside an IPv6 one as that IPv4 address", () => {
    expect(ipBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("returns a value that is not an address as it is", () => {
    expect(ipBucket("unknown")).toBe("unknown");
    expect(ipBucket("2001:db8:::1")).toBe("2001:db8:::1");
  });
});
