// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RandomModule = typeof import("./random");

let random: RandomModule["random"];
let randomBetween: RandomModule["randomBetween"];
let randomInt: RandomModule["randomInt"];
let randomPick: RandomModule["randomPick"];

// The generator seeds itself from the clock on import, so a fixed clock gives every test the same sequence.
beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  vi.spyOn(performance, "now").mockReturnValue(12_345.678);
  vi.resetModules();
  ({ random, randomBetween, randomInt, randomPick } = await import("./random"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("random", () => {
  it("returns floats in [0, 1) that are not all the same", () => {
    const values = Array.from({ length: 500 }, () => random());

    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(new Set(values).size).toBeGreaterThan(450);
  });

  it("is spread across the range", () => {
    const values = Array.from({ length: 2000 }, () => random());
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe("randomBetween", () => {
  it("stays in [min, max)", () => {
    for (let index = 0; index < 500; index += 1) {
      const value = randomBetween(-5, 10);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(10);
    }
  });

  it("returns the bound for an empty range", () => {
    expect(randomBetween(3, 3)).toBe(3);
  });
});

describe("randomInt", () => {
  it("includes both ends and nothing outside", () => {
    const seen = new Set<number>();
    for (let index = 0; index < 500; index += 1) seen.add(randomInt(2, 5));

    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it("returns the only value of a single value range", () => {
    expect(randomInt(7, 7)).toBe(7);
  });
});

describe("randomPick", () => {
  it("picks every element of a list over time and nothing else", () => {
    const items = ["a", "b", "c"] as const;
    const seen = new Set<string>();
    for (let index = 0; index < 300; index += 1) seen.add(randomPick(items));

    expect([...seen].sort()).toEqual(["a", "b", "c"]);
  });
});
