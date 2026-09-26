import { describe, expect, it } from "vitest";

import {
  bucketIndex,
  bucketStart,
  clampTzOffset,
  mergePoints,
  orderFunnel,
  parseRange,
  rangeStart,
  ratio,
  referrerHosts,
  zeroFillSeries,
} from "./forms.analytics.js";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
// 2026-09-26 02:30 UTC = 09:30 in Jakarta (UTC+7), 08:00 in India (UTC+5:30),
// still the 25th in New York (UTC-4).
const NOW = Date.parse("2026-09-26T02:30:00Z");

describe("time zone math", () => {
  it("clamps offsets to ±14 hours", () => {
    expect(clampTzOffset("420")).toBe(420);
    expect(clampTzOffset(-2000)).toBe(-840);
    expect(clampTzOffset("abc")).toBe(0);
    expect(clampTzOffset(undefined)).toBe(0);
  });

  it("puts an instant in its local day", () => {
    const jakarta = bucketIndex(NOW, 420, DAY);
    expect(new Date(bucketStart(jakarta, 420, DAY)).toISOString()).toBe("2026-09-25T17:00:00.000Z");
    const newYork = bucketIndex(NOW, -240, DAY);
    expect(new Date(bucketStart(newYork, -240, DAY)).toISOString()).toBe(
      "2026-09-25T04:00:00.000Z",
    );
    const india = bucketIndex(NOW, 330, HOUR);
    expect(new Date(bucketStart(india, 330, HOUR)).toISOString()).toBe("2026-09-26T02:30:00.000Z");
  });

  it("starts day ranges at local midnight and 24h at a local hour", () => {
    const created = new Date("2026-09-20T12:00:00Z");
    expect(rangeStart("7d", created, 420, NOW).toISOString()).toBe("2026-09-19T17:00:00.000Z");
    expect(rangeStart("24h", created, 420, NOW).toISOString()).toBe("2026-09-25T03:00:00.000Z");
    expect(rangeStart("all", created, 420, NOW).toISOString()).toBe("2026-09-19T17:00:00.000Z");
    // A form created in the future (clock skew) still yields today's bucket.
    expect(rangeStart("all", new Date(NOW + 5 * DAY), 0, NOW).toISOString()).toBe(
      "2026-09-26T00:00:00.000Z",
    );
  });

  it("parses ranges with a 30d fallback", () => {
    expect(parseRange("365d")).toBe("365d");
    expect(parseRange("1y")).toBe("30d");
  });
});

describe("zero-filled series", () => {
  it("has one point per bucket through now, rows merged into theirs", () => {
    const start = rangeStart("7d", new Date(0), 420, NOW);
    const today = bucketIndex(NOW, 420, DAY);
    const series = zeroFillSeries(
      [
        { bucket: today, views: 3, starts: 1, submissions: 0 },
        { bucket: today, views: 0, starts: 0, submissions: 2 },
        { bucket: today - 6, views: 1, starts: 0, submissions: 0 },
      ],
      start,
      420,
      DAY,
      NOW,
    );
    expect(series).toHaveLength(7);
    expect(series[0]).toEqual({
      bucket: "2026-09-19T17:00:00.000Z",
      views: 1,
      starts: 0,
      submissions: 0,
    });
    expect(series[6]).toEqual({
      bucket: "2026-09-25T17:00:00.000Z",
      views: 3,
      starts: 1,
      submissions: 2,
    });
    expect(
      series.slice(1, 6).every((point) => point.views + point.starts + point.submissions === 0),
    ).toBe(true);
  });

  it("covers 24 hours for the 24h range", () => {
    const start = rangeStart("24h", new Date(0), -240, NOW);
    expect(zeroFillSeries([], start, -240, HOUR, NOW)).toHaveLength(24);
  });
});

describe("aggregations", () => {
  it("computes bounded ratios", () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(3, 0)).toBe(0);
    expect(ratio(5, 2)).toBe(1);
  });

  it("folds referrers into hosts with direct for none", () => {
    expect(
      referrerHosts([
        { referer: "https://www.google.com/a", count: 2 },
        { referer: "https://www.google.com/b", count: 1 },
        { referer: null, count: 4 },
        { referer: "garbage", count: 1 },
      ]),
    ).toEqual([
      { host: "direct", count: 4 },
      { host: "www.google.com", count: 3 },
      { host: "other", count: 1 },
    ]);
  });

  it("orders the funnel by the form and keeps untouched questions", () => {
    expect(
      orderFunnel(
        ["a", "b", "c"],
        [
          { fieldId: "c", sessions: 1 },
          { fieldId: "a", sessions: 5 },
        ],
      ),
    ).toEqual([
      { fieldId: "a", sessions: 5 },
      { fieldId: "b", sessions: 0 },
      { fieldId: "c", sessions: 1 },
    ]);
  });

  it("caps map points, largest first", () => {
    const points = mergePoints(
      [{ latitude: 1, longitude: 1, count: 1 }],
      [
        { latitude: 2, longitude: 2, count: 9 },
        { latitude: 3, longitude: 3, count: 4 },
      ],
      2,
    );
    expect(points).toEqual([
      { latitude: 2, longitude: 2, count: 9, kind: "submit" },
      { latitude: 3, longitude: 3, count: 4, kind: "submit" },
    ]);
  });
});
