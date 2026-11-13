import { describe, expect, it } from "vitest";

import { loginAttemptCount, releaseLoginAttempt, reserveLoginAttempt } from "./login-limit";

describe("the sign in limit", () => {
  it("allows ten attempts in a minute and refuses the eleventh", () => {
    const address = "203.0.113.1";
    for (let index = 0; index < 10; index += 1) {
      expect(reserveLoginAttempt(address, 1_000 + index)).toBe(true);
    }

    expect(reserveLoginAttempt(address, 1_100)).toBe(false);
    expect(loginAttemptCount(address, 1_100)).toBe(10);
  });

  it("counts a burst before any of its attempts finishes", () => {
    const address = "203.0.113.11";
    const results = Array.from({ length: 15 }, () => reserveLoginAttempt(address, 3_000));

    expect(results.filter(Boolean)).toHaveLength(10);
  });

  it("allows a visitor again after the minute has passed", () => {
    const address = "203.0.113.2";
    for (let index = 0; index < 10; index += 1) reserveLoginAttempt(address, 5_000);

    expect(reserveLoginAttempt(address, 5_000 + 59_999)).toBe(false);
    expect(reserveLoginAttempt(address, 5_000 + 60_000)).toBe(true);
  });

  it("counts each visitor on its own", () => {
    for (let index = 0; index < 10; index += 1) reserveLoginAttempt("203.0.113.3", 9_000);

    expect(reserveLoginAttempt("203.0.113.3", 9_001)).toBe(false);
    expect(reserveLoginAttempt("203.0.113.4", 9_001)).toBe(true);
  });

  it("counts all addresses of one IPv6 prefix together", () => {
    for (let index = 0; index < 10; index += 1) {
      expect(reserveLoginAttempt(`2001:db8:1:2:${index}::1`, 12_000)).toBe(true);
    }

    expect(reserveLoginAttempt("2001:db8:1:2:ffff::9", 12_001)).toBe(false);
    expect(reserveLoginAttempt("2001:db8:1:3::1", 12_001)).toBe(true);
  });

  it("gives back the place of an attempt that was not a wrong guess", () => {
    const address = "203.0.113.5";
    for (let index = 0; index < 10; index += 1) reserveLoginAttempt(address, 20_000);
    releaseLoginAttempt(address, 20_001);

    expect(loginAttemptCount(address, 20_001)).toBe(9);
    expect(reserveLoginAttempt(address, 20_002)).toBe(true);
    expect(reserveLoginAttempt(address, 20_003)).toBe(false);
  });

  it("drops the oldest address when too many are tracked", () => {
    const oldest = "198.51.100.1";
    for (let index = 0; index < 9; index += 1) reserveLoginAttempt(oldest, 40_000);
    for (let index = 0; index < 6_000; index += 1) {
      reserveLoginAttempt(`192.0.2.${index % 250}.${Math.floor(index / 250)}`, 40_000);
    }

    // the nine places of the oldest address were dropped, so it can try ten times again
    for (let index = 0; index < 10; index += 1) {
      expect(reserveLoginAttempt(oldest, 40_001)).toBe(true);
    }
  });
});
