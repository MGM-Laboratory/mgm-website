import { describe, expect, it } from "vitest";

import { EXPIRY_OPTIONS, STATUS_HINT, STATUS_LABEL } from "./links-cms";

describe("shortlink labels", () => {
  it("offers the expiry options once each, with never first", () => {
    const ids = EXPIRY_OPTIONS.map((option) => option.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("never");
    expect(ids).toEqual(["never", "once", "24h", "3d", "7d", "30d"]);
  });

  it("has a label and a hint for every link status", () => {
    for (const status of ["available", "expired", "consumed", "error"] as const) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(STATUS_HINT[status]).toBeTruthy();
    }
  });
});
