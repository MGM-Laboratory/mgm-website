// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import { LAND_BITS, LAND_BOTTOM, LAND_COLUMNS, LAND_ROWS, LAND_TOP } from "./world-land";

describe("world land grid", () => {
  it("holds one bit for every cell of the grid", () => {
    const bytes = Buffer.from(LAND_BITS, "base64");
    expect(bytes.length).toBe(Math.ceil((LAND_COLUMNS * LAND_ROWS) / 8));
  });

  it("covers 84 degrees north to 60 degrees south", () => {
    expect(LAND_TOP - LAND_BOTTOM).toBe(144);
    expect(360 / LAND_COLUMNS).toBe(1.875);
    expect((LAND_TOP - LAND_BOTTOM) / LAND_ROWS).toBe(2);
  });

  it("marks some cells as land and some as sea", () => {
    const bytes = Buffer.from(LAND_BITS, "base64");
    const set = bytes.reduce((total, byte) => total + byte.toString(2).replace(/0/g, "").length, 0);
    expect(set).toBeGreaterThan(0);
    expect(set).toBeLessThan(LAND_COLUMNS * LAND_ROWS);
    // The first row is the Arctic ocean at 84N with little land
    expect(bytes[0]).toBe(0);
  });
});
