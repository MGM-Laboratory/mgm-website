import { describe, expect, it } from "vitest";

import { clearLoginFailures, loginAllowed, recordLoginFailure } from "./login-limit";

describe("the sign in limit", () => {
  it("allows ten failures in a minute and refuses the eleventh attempt", () => {
    const key = "203.0.113.1";
    for (let index = 0; index < 10; index += 1) {
      expect(loginAllowed(key, 1_000 + index)).toBe(true);
      recordLoginFailure(key, 1_000 + index);
    }

    expect(loginAllowed(key, 1_100)).toBe(false);
  });

  it("allows a visitor again after the minute has passed", () => {
    const key = "203.0.113.2";
    for (let index = 0; index < 10; index += 1) recordLoginFailure(key, 5_000);

    expect(loginAllowed(key, 5_000 + 59_999)).toBe(false);
    expect(loginAllowed(key, 5_000 + 60_000)).toBe(true);
  });

  it("counts each visitor on its own", () => {
    for (let index = 0; index < 10; index += 1) recordLoginFailure("203.0.113.3", 9_000);

    expect(loginAllowed("203.0.113.3", 9_001)).toBe(false);
    expect(loginAllowed("203.0.113.4", 9_001)).toBe(true);
  });

  it("forgets the failures of a visitor that signed in", () => {
    const key = "203.0.113.5";
    for (let index = 0; index < 10; index += 1) recordLoginFailure(key, 20_000);
    clearLoginFailures(key);

    expect(loginAllowed(key, 20_001)).toBe(true);
  });

  it("keeps the map bounded when many addresses fail once", () => {
    for (let index = 0; index < 6_000; index += 1)
      recordLoginFailure(`198.51.100.${index}`, 40_000);

    // the oldest addresses were dropped, so the first one is free again, and the newest is still counted once
    expect(loginAllowed("198.51.100.0", 40_001)).toBe(true);
    expect(loginAllowed("198.51.100.5999", 40_001)).toBe(true);
  });
});
