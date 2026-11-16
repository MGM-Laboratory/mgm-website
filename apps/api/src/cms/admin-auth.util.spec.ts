import { describe, expect, it } from "vitest";

import { safeEqual } from "./admin-auth.util.js";

describe("safeEqual", () => {
  it("accepts equal strings", () => {
    expect(safeEqual("the-passphrase", "the-passphrase")).toBe(true);
    expect(safeEqual("", "")).toBe(true);
  });

  it("refuses a different string of the same length", () => {
    expect(safeEqual("the-passphrasX", "the-passphrase")).toBe(false);
  });

  it("refuses a prefix, an extension and an empty value without throwing", () => {
    expect(safeEqual("the-pass", "the-passphrase")).toBe(false);
    expect(safeEqual("the-passphrase-extra", "the-passphrase")).toBe(false);
    expect(safeEqual("", "the-passphrase")).toBe(false);
  });

  it("compares by bytes, so a multi byte character cannot match a shorter one", () => {
    expect(safeEqual("é", "e")).toBe(false);
    expect(safeEqual("é", "é")).toBe(true);
  });
});
