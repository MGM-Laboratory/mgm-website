import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ShortlinksService } from "./shortlinks.service.js";

const databaseUrl = process.env.DATABASE_URL;
const HOST = "db-shortlinks-spec.example.test";
const DAY_MS = 24 * 60 * 60 * 1000;

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. The link analytics are raw SQL with FILTER aggregates, a 14 day window
// and a host count of the referers. The single use link cap is a guarded
// update. This runs both on real rows.
describe.skipIf(!databaseUrl)("short link queries on PostgreSQL", () => {
  let prisma: PrismaService;
  let service: ShortlinksService;
  let domainId: string;

  async function makeLink(slug: string, maxClicks: number | null = null) {
    return prisma.shortLink.create({
      data: { slug, longUrl: "https://example.org/", domainId, maxClicks },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService({ getOrThrow: () => databaseUrl } as never);
    await prisma.onModuleInit();
    await prisma.shortLinkDomain.deleteMany({ where: { hostname: HOST } });
    const domain = await prisma.shortLinkDomain.create({
      data: { hostname: HOST, status: "connected" },
    });
    domainId = domain.id;
    const values: Record<string, unknown> = { SHORTLINKS_GEOLOCATE: false };
    const config = { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] };
    service = new ShortlinksService(prisma, config as never);
  });

  afterAll(async () => {
    await prisma.shortLinkDomain.deleteMany({ where: { hostname: HOST } });
    await prisma.$disconnect();
  });

  it("counts views, clicks, hosts and countries of the real visits", async () => {
    const link = await makeLink("analytics");
    const chrome = { browser: "Chrome", os: "Linux", device: "desktop" };
    const visit = (data: Omit<Prisma.ShortLinkVisitCreateManyInput, "linkId">) => ({
      linkId: link.id,
      ...data,
    });
    await prisma.shortLinkVisit.createMany({
      data: [
        visit({
          isClick: true,
          ip: "1.1.1.1",
          country: "ID",
          referer: "https://example.org/a",
          ...chrome,
        }),
        visit({
          isClick: true,
          ip: "1.1.1.1",
          country: "ID",
          referer: "https://example.org/b",
          ...chrome,
        }),
        visit({
          ip: "2.2.2.2",
          country: "US",
          referer: "direct",
          browser: "Firefox",
          os: "Windows",
          device: "mobile",
        }),
        visit({ failedAttempt: true, referer: "not a url" }),
        visit({
          isClick: true,
          ip: "3.3.3.3",
          country: "ID",
          createdAt: new Date(Date.now() - 3 * DAY_MS),
          ...chrome,
        }),
        visit({ ip: "4.4.4.4", country: "US", createdAt: new Date(Date.now() - 20 * DAY_MS) }),
      ],
    });

    const result = await service.linkAnalytics(link.id);

    expect(result?.totals).toEqual({ views: 6, clicks: 3, uniqueIps: 4, failedAttempts: 1 });
    expect(result?.countries).toEqual([
      { country: "ID", visits: 3 },
      { country: "US", visits: 2 },
    ]);
    expect(result?.browsers).toEqual([
      { browser: "Chrome", visits: 3 },
      { browser: "Firefox", visits: 1 },
    ]);
    expect(result?.referrers[0]).toEqual({ host: "example.org", visits: 2 });
    expect(result?.referrers).toHaveLength(3);
    expect(result?.days).toHaveLength(14);
    expect(result?.days.at(-1)).toMatchObject({ views: 4, clicks: 2 });
    expect(result?.days.at(-4)).toMatchObject({ views: 1, clicks: 1 });
    // The visit of 20 days ago counts in the totals and not in the series.
    expect(result?.days.reduce((sum, day) => sum + day.views, 0)).toBe(5);
  });

  it("lets only one of two overlapping visits spend a single use link", async () => {
    const link = await makeLink("single-use", 1);
    const meta = { ip: null, referer: null, userAgent: "Mozilla/5.0 Chrome/120" };
    const answers = await Promise.all([
      service.resolve(HOST, link.slug, meta),
      service.resolve(HOST, link.slug, meta),
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual(["expired", "ok"]);
    const stored = await prisma.shortLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(stored.clickCount).toBe(1);
    expect(stored.viewCount).toBe(2);
    expect(await prisma.shortLinkVisit.count({ where: { linkId: link.id, isClick: true } })).toBe(
      1,
    );
  });
});
