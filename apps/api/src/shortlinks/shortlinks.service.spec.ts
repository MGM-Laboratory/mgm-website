import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../prisma/prisma.service.js";
import type { ConfigService } from "@nestjs/config";

import { ShortlinksError, ShortlinksService } from "./shortlinks.service.js";

type Env = {
  SHORTLINKS_PRIMARY_DOMAIN: string;
  SHORTLINKS_CNAME_TARGET: string;
  SHORTLINKS_WEB_SERVICE_ID: string;
  SHORTLINKS_RAILWAY_PROJECT_ID: string;
  SHORTLINKS_RAILWAY_ENV_ID: string;
  RAILWAY_API_TOKEN?: string;
  SHORTLINKS_GEOLOCATE: boolean;
};

function makeConfig(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const values: Env = {
    SHORTLINKS_PRIMARY_DOMAIN: "labmgm.org",
    SHORTLINKS_CNAME_TARGET: "web-production-589d3f.up.railway.app",
    SHORTLINKS_WEB_SERVICE_ID: "web-service-id",
    SHORTLINKS_RAILWAY_PROJECT_ID: "project-id",
    SHORTLINKS_RAILWAY_ENV_ID: "env-id",
    SHORTLINKS_GEOLOCATE: false,
    ...overrides,
  };
  return {
    get: (key: keyof Env) => values[key],
    getOrThrow: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
}

type FakePrisma = {
  shortLinkDomain: Record<string, ReturnType<typeof vi.fn>>;
  shortLink: Record<string, ReturnType<typeof vi.fn>>;
  shortLinkVisit: Record<string, ReturnType<typeof vi.fn>>;
  $queryRaw: ReturnType<typeof vi.fn>;
};

function makePrisma(): FakePrisma {
  return {
    shortLinkDomain: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    shortLink: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    shortLinkVisit: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
}

function makeService(prisma: FakePrisma, config = makeConfig()) {
  return new ShortlinksService(prisma as unknown as PrismaService, config);
}

const DOMAIN = {
  id: "domain-1",
  hostname: "labmgm.org",
  isPrimary: true,
  provider: "local",
  status: "connected",
  railwayDomainId: null,
};

const OPEN_LINK = {
  id: "link-1",
  slug: "abc",
  longUrl: "https://example.com/destination",
  domainId: "domain-1",
  expiresAt: null,
  maxClicks: null,
  clickCount: 0,
  viewCount: 0,
  passphraseSalt: null,
  passphraseHash: null,
  longUrlStatus: null,
  longUrlCheckedAt: null,
  createdAt: new Date("2026-09-25T00:00:00Z"),
  updatedAt: new Date("2026-09-25T00:00:00Z"),
};

const VISIT_META = { ip: "203.0.113.9", userAgent: "curl/8", referer: null };

describe("ShortlinksService", () => {
  it("creates a link on the chosen domain with a generated code when none is given", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLinkDomain.findUnique.mockResolvedValue(DOMAIN);
    prisma.shortLink.findUnique.mockResolvedValue(null);
    prisma.shortLink.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...OPEN_LINK,
        ...data,
      }),
    );
    prisma.shortLinkDomain.update.mockResolvedValue(DOMAIN);

    const link = await service.createLink({
      domainId: "domain-1",
      longUrl: "https://example.com/destination",
      expiresIn: "never",
    });
    expect(link.slug).toMatch(/^[A-Za-z0-9]{4}$/);
    expect(link.shortUrl).toBe(`https://labmgm.org/s/${link.slug}`);
  });

  it("rejects a short code that is already taken on the domain", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLinkDomain.findUnique.mockResolvedValue(DOMAIN);
    prisma.shortLink.findUnique.mockResolvedValue(OPEN_LINK);

    await expect(
      service.createLink({
        domainId: "domain-1",
        longUrl: "https://example.com/destination",
        slug: "abc",
        expiresIn: "never",
      }),
    ).rejects.toThrow(new ShortlinksError("That short code is already taken on this domain.", 409));
  });

  it("applies the once and fixed expiry options", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLinkDomain.findUnique.mockResolvedValue(DOMAIN);
    prisma.shortLink.findUnique.mockResolvedValue(null);
    const created: Record<string, unknown>[] = [];
    prisma.shortLink.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { ...OPEN_LINK, ...data };
      },
    );

    await service.createLink({
      domainId: "domain-1",
      longUrl: "https://example.com/destination",
      expiresIn: "once",
    });
    await service.createLink({
      domainId: "domain-1",
      longUrl: "https://example.com/destination",
      expiresIn: "24h",
    });
    expect(created[0].maxClicks).toBe(1);
    expect(created[0].expiresAt).toBeNull();
    expect((created[1].expiresAt as Date).getTime()).toBeGreaterThan(
      Date.now() + 23 * 60 * 60 * 1000,
    );
  });

  it("resolves an open link, counting the click and the view", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLinkDomain.findUnique.mockResolvedValue(DOMAIN);
    prisma.shortLink.findUnique.mockResolvedValue(OPEN_LINK);
    prisma.shortLink.updateMany.mockResolvedValue({ count: 1 });
    prisma.shortLinkVisit.create.mockResolvedValue({ id: "visit-1" });

    const result = await service.resolve("labmgm.org", "abc", VISIT_META);
    expect(result).toEqual({ status: "ok", longUrl: "https://example.com/destination" });
    // The single-use cap ran first (clickCount), the visit row then bumped views.
    expect(prisma.shortLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { clickCount: { increment: 1 } } }),
    );
    expect(prisma.shortLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { viewCount: { increment: 1 } } }),
    );
  });

  it("spends a single-use link exactly once", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLinkDomain.findUnique.mockResolvedValue(DOMAIN);
    prisma.shortLink.findUnique.mockResolvedValue({ ...OPEN_LINK, maxClicks: 1, clickCount: 1 });
    prisma.shortLink.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.resolve("labmgm.org", "abc", VISIT_META);
    expect(result).toEqual({ status: "expired", kind: "consumed" });
  });

  it("points a passphrased link at the gate instead of redirecting", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLinkDomain.findUnique.mockResolvedValue(DOMAIN);
    prisma.shortLink.findUnique.mockResolvedValue({
      ...OPEN_LINK,
      passphraseSalt: "a".repeat(32),
      passphraseHash: "b".repeat(128),
    });

    expect(await service.resolve("labmgm.org", "abc", VISIT_META)).toEqual({
      status: "passphrase",
      host: "labmgm.org",
    });
    expect(prisma.shortLink.updateMany).not.toHaveBeenCalled();
  });

  it("returns not_found for an unknown host or code", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    expect(await service.resolve("labmgm.org", "nope", VISIT_META)).toEqual({
      status: "not_found",
    });
  });

  it("verifies the gate passphrase and counts a click on success", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    const { salt, hash } = await (await import("./shortlinks.utils.js")).hashPassphrase("sesame");
    prisma.shortLinkDomain.findUnique.mockResolvedValue(DOMAIN);
    prisma.shortLink.findUnique.mockResolvedValue({
      ...OPEN_LINK,
      passphraseSalt: salt,
      passphraseHash: hash,
    });
    prisma.shortLink.updateMany.mockResolvedValue({ count: 1 });
    prisma.shortLinkVisit.create.mockResolvedValue({ id: "visit-1" });

    const rejected = await service.verify("labmgm.org", "abc", "nope", VISIT_META);
    expect(rejected).toEqual({ expired: false, longUrl: null, rejected: true });
    const accepted = await service.verify("labmgm.org", "abc", "sesame", VISIT_META);
    expect(accepted).toEqual({ expired: false, longUrl: "https://example.com/destination" });
  });

  it("updates a link: slug, domain, expiry and passphrase handling", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLink.findUnique.mockImplementation(async ({ select }: { select?: unknown }) => {
      if (select) return null; // the slug-uniqueness probe
      return { ...OPEN_LINK, domain: DOMAIN };
    });
    prisma.shortLink.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...OPEN_LINK,
        ...data,
        domain: DOMAIN,
      }),
    );

    const kept = await service.updateLink("link-1", {
      slug: "newcode",
      passphraseAction: "keep",
    });
    expect(kept!.slug).toBe("newcode");
    expect(kept!.hasPassphrase).toBe(false);
    const cleared = await service.updateLink("link-1", { passphraseAction: "remove" });
    expect(cleared!.hasPassphrase).toBe(false);
  });

  it("lists links with a search and a domain filter", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLink.findMany.mockResolvedValue([{ ...OPEN_LINK, domain: DOMAIN }]);

    const links = await service.listLinks("exam", "domain-1");
    expect(links).toHaveLength(1);
    expect(links[0].status).toBe("available");
    expect(prisma.shortLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { domainId: "domain-1", OR: expect.any(Array) } }),
    );
  });

  it("aggregates analytics from the stored visits", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLink.findUnique.mockResolvedValue({ ...OPEN_LINK, domain: DOMAIN });
    prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      // The daily series also mentions the view filter, so check it first.
      if (strings[0].includes("date_trunc")) {
        return [{ day: new Date("2026-09-25T00:00:00Z"), views: 2, clicks: 1 }];
      }
      if (strings[0].includes('FILTER (WHERE "isView")')) {
        return [{ views: 2, clicks: 1, uniqueIps: 1, failedAttempts: 1 }];
      }
      return [];
    });
    prisma.shortLinkVisit.findMany.mockResolvedValue([]);

    const analytics = await service.linkAnalytics("link-1");
    expect(analytics!.totals).toEqual({ views: 2, clicks: 1, uniqueIps: 1, failedAttempts: 1 });
    expect(analytics!.days).toHaveLength(14);
    expect(analytics!.days[13]).toEqual({ day: "2026-09-25", views: 2, clicks: 1 });
  });

  it("refuses to delete the primary domain", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.shortLinkDomain.findUnique.mockResolvedValue(DOMAIN);
    await expect(service.deleteDomain("domain-1")).rejects.toThrow(
      new ShortlinksError("The site's own domain cannot be deleted."),
    );
  });
});
