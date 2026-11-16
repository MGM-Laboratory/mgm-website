// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from "vitest";

import { formDocumentSchema } from "@repo/shared";

import { FormsAnalyticsService } from "./forms-analytics.service.js";
import { FormsError } from "./forms.common.js";

const NOW = Date.parse("2026-09-26T02:30:00Z");

function make(results: { raw?: unknown[][]; groups?: unknown[][] } = {}) {
  const raw = [...(results.raw ?? [])];
  const groups = [...(results.groups ?? [])];
  const tx = {
    $executeRawUnsafe: vi.fn(async () => 0),
    $queryRaw: vi.fn(async () => raw.shift() ?? []),
    formEvent: { groupBy: vi.fn(async () => groups.shift() ?? []) },
  };
  const prisma = {
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    formEvent: { findMany: vi.fn(async () => [] as unknown[]) },
  };
  const forms = {
    require: vi.fn(async () => ({
      createdAt: new Date("2026-09-01T00:00:00Z"),
      data: formDocumentSchema.parse({
        title: "Survey",
        fields: [
          { id: "name", type: "short_text" },
          { id: "src", type: "hidden" },
          { id: "age", type: "number" },
        ],
      }),
      id: "form1",
    })),
  };
  return { forms, prisma, service: new FormsAnalyticsService(prisma as never, forms as never), tx };
}

describe("FormsAnalyticsService.analytics results", () => {
  it("maps the totals, rounds the durations and computes the ratios", async () => {
    const { service } = make({
      raw: [
        [],
        [],
        [{ starts: 50, uniqueVisitors: 80, views: 100 }],
        [{ average: 61_234.6, median: 45_000.4, submissions: 25 }],
      ],
    });
    const result = await service.analytics("form1", "30d", 0, NOW);
    expect(result.totals).toEqual({
      averageDurationMs: 61_235,
      completion: 0.5,
      conversion: 0.25,
      medianDurationMs: 45_000,
      starts: 50,
      submissions: 25,
      uniqueVisitors: 80,
      views: 100,
    });
  });

  it("keeps a null median and average and a zero ratio when there is no data", async () => {
    const { service } = make({
      raw: [[], [], [], [{ average: null, median: null, submissions: 0 }]],
    });
    const result = await service.analytics("form1", "7d", 0, NOW);
    expect(result.totals).toMatchObject({
      averageDurationMs: null,
      completion: 0,
      conversion: 0,
      medianDurationMs: null,
      views: 0,
    });
  });

  it("drops null groups and maps every breakdown", async () => {
    const { service } = make({
      groups: [
        [
          { _count: { _all: 5 }, country: "Indonesia" },
          { _count: { _all: 1 }, country: null },
        ],
        [
          { _count: { _all: 3 }, city: "Malang", country: "Indonesia" },
          { _count: { _all: 1 }, city: null, country: null },
        ],
        [
          { _count: { _all: 4 }, referer: "https://a.example/x" },
          { _count: { _all: 2 }, referer: "https://a.example/y" },
          { _count: { _all: 1 }, referer: null },
        ],
        [
          { _count: { _all: 2 }, device: "mobile" },
          { _count: { _all: 1 }, device: null },
        ],
        [
          { _count: { _all: 2 }, browser: "Firefox" },
          { _count: { _all: 1 }, browser: null },
        ],
        [
          { _count: { _all: 2 }, os: "Linux" },
          { _count: { _all: 1 }, os: null },
        ],
        [
          { _count: { _all: 2 }, language: "en" },
          { _count: { _all: 1 }, language: null },
        ],
      ],
      raw: [[], [], [], [], [], [], [{ count: 7, source: "mail" }]],
    });
    const result = await service.analytics("form1", "30d", 0, NOW);
    expect(result.countries).toEqual([{ count: 5, country: "Indonesia" }]);
    expect(result.cities).toEqual([{ city: "Malang", count: 3, country: "Indonesia" }]);
    expect(result.devices).toEqual([{ count: 2, device: "mobile" }]);
    expect(result.browsers).toEqual([{ browser: "Firefox", count: 2 }]);
    expect(result.oss).toEqual([{ count: 2, os: "Linux" }]);
    expect(result.languages).toEqual([{ count: 2, language: "en" }]);
    expect(result.utmSources).toEqual([{ count: 7, source: "mail" }]);
    expect(result.referrers[0]).toMatchObject({ host: "a.example" });
  });

  it("orders the funnel by the questions and leaves out hidden fields", async () => {
    const { service } = make({
      raw: [
        [],
        [],
        [],
        [],
        [],
        [
          { fieldId: "age", sessions: 2 },
          { fieldId: "name", sessions: 4 },
        ],
      ],
    });
    const result = await service.analytics("form1", "30d", 0, NOW);
    expect(result.funnel.map((step: { fieldId: string }) => step.fieldId)).toEqual(["name", "age"]);
  });

  it("lists the map points of views and submissions with their kind, largest first", async () => {
    const { service } = make({
      raw: [
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [{ count: 2, latitude: 1.1, longitude: 2.2 }],
        [{ count: 3, latitude: 1.1, longitude: 2.2 }],
      ],
    });
    const result = await service.analytics("form1", "30d", 0, NOW);
    expect(result.points).toEqual([
      { count: 3, kind: "submit", latitude: 1.1, longitude: 2.2 },
      { count: 2, kind: "view", latitude: 1.1, longitude: 2.2 },
    ]);
  });

  it("fills the series from the event and response buckets", async () => {
    const hour = 3_600_000;
    const current = Math.floor(NOW / hour);
    const { service } = make({
      raw: [
        [
          { bucket: current, starts: 2, views: 5 },
          { bucket: current - 1, starts: 0, views: 1 },
        ],
        [{ bucket: current, submissions: 3 }],
        [],
        [],
      ],
    });
    const result = await service.analytics("form1", "24h", 0, NOW);
    expect(result.series).toHaveLength(24);
    expect(result.series.at(-1)).toEqual({
      bucket: new Date(current * hour).toISOString(),
      starts: 2,
      submissions: 3,
      views: 5,
    });
    expect(result.series.at(-2)).toEqual({
      bucket: new Date((current - 1) * hour).toISOString(),
      starts: 0,
      submissions: 0,
      views: 1,
    });
    expect(result.series[0]).toMatchObject({ starts: 0, submissions: 0, views: 0 });
  });

  it("fails with the refusal of the form lookup before any query", async () => {
    const { forms, tx, service } = make();
    forms.require.mockRejectedValue(new FormsError("That form does not exist.", 404));
    await expect(service.analytics("x", "30d", 0, NOW)).rejects.toMatchObject({ status: 404 });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("FormsAnalyticsService.visits", () => {
  const row = {
    browser: "Firefox",
    city: null,
    country: "Indonesia",
    createdAt: new Date("2030-01-01T00:00:00Z"),
    device: "desktop",
    fieldId: null,
    id: "e1",
    ip: "203.0.113.9",
    os: "Linux",
    referer: null,
    region: null,
    sessionId: "s",
    type: "view",
  };

  it("maps the rows newest first with ISO dates", async () => {
    const { prisma, service } = make();
    prisma.formEvent.findMany.mockResolvedValue([row]);
    const visits = await service.visits("form1", 50);
    expect(visits).toEqual([
      {
        browser: "Firefox",
        city: null,
        country: "Indonesia",
        createdAt: "2030-01-01T00:00:00.000Z",
        device: "desktop",
        fieldId: null,
        id: "e1",
        ip: "203.0.113.9",
        os: "Linux",
        referer: null,
        region: null,
        sessionId: "s",
        type: "view",
      },
    ]);
    expect(prisma.formEvent.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 50,
      where: { formId: "form1" },
    });
  });

  it("clamps the limit between 1 and 1000 and defaults a bad number to 200", async () => {
    const { prisma, service } = make();
    const takes = async (limit: number) => {
      await service.visits("form1", limit);
      return (prisma.formEvent.findMany.mock.calls.at(-1) as unknown as [{ take: number }])[0].take;
    };
    expect(await takes(0)).toBe(1);
    expect(await takes(-5)).toBe(1);
    expect(await takes(5000)).toBe(1000);
    expect(await takes(Number.NaN)).toBe(200);
    expect(await takes(Number.POSITIVE_INFINITY)).toBe(200);
    expect(await takes(12.9)).toBe(12);
  });
});
