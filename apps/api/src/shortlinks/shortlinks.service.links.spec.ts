import { afterEach, describe, expect, it, vi } from "vitest";

import { ShortlinksService } from "./shortlinks.service.js";

const utils = vi.hoisted(() => ({ checkLongUrl: vi.fn() }));
const geo = vi.hoisted(() => ({ enrichVisit: vi.fn() }));

vi.mock("./shortlinks.utils.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shortlinks.utils.js")>()),
  checkLongUrl: utils.checkLongUrl,
}));
vi.mock("./shortlinks.geo.js", () => geo);

function makePrisma() {
  return {
    $queryRaw: vi.fn(async () => []),
    shortLink: {
      create: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    shortLinkDomain: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
    },
    shortLinkVisit: {
      create: vi.fn(async ({ data }: { data: { ip: string | null } }) => ({
        id: "v1",
        ip: data.ip,
      })),
      findMany: vi.fn(async () => []),
    },
  };
}

function makeService(geolocate = false) {
  const prisma = makePrisma();
  const values: Record<string, unknown> = {
    SHORTLINKS_GEOLOCATE: geolocate,
    SHORTLINKS_PRIMARY_DOMAIN: "labmgm.org",
  };
  const config = { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] };
  return { prisma, service: new ShortlinksService(prisma as never, config as never) };
}

const PRIMARY = { hostname: "labmgm.org", id: "d1", isPrimary: true, status: "connected" };
const CUSTOM = { hostname: "mgm.li", id: "d2", isPrimary: false, status: "connected" };

function link(overrides: Record<string, unknown> = {}) {
  return {
    clickCount: 0,
    createdAt: new Date("2030-01-01T00:00:00Z"),
    domainId: "d1",
    expiresAt: null,
    id: "l1",
    longUrl: "https://example.com/a",
    longUrlCheckedAt: null,
    longUrlStatus: null,
    maxClicks: null,
    passphraseHash: null,
    passphraseSalt: null,
    slug: "abc",
    updatedAt: new Date("2030-01-01T00:00:00Z"),
    viewCount: 0,
    ...overrides,
  };
}

const META = { ip: "203.0.113.9", referer: "https://ref.example/x", userAgent: "curl/8" };
const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("ShortlinksService createLink and uniqueSlug", () => {
  it("rejects an unknown domain", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    await expect(
      service.createLink({ domainId: "x", expiresIn: "never", longUrl: "https://e.com" }),
    ).rejects.toThrow("That domain does not exist.");
  });

  it("rejects a taken custom slug with a 409", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue({ id: "other" });
    await expect(
      service.createLink({
        domainId: "d1",
        expiresIn: "never",
        longUrl: "https://e.com",
        slug: "abc",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("hashes a passphrase and stores the checked URL status in the background", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    prisma.shortLink.create.mockImplementation(async ({ data }: { data: object }) =>
      link({ ...data }),
    );
    prisma.shortLink.findUnique.mockResolvedValue(null);
    utils.checkLongUrl.mockResolvedValue("ok");
    const created = await service.createLink({
      domainId: "d2",
      expiresIn: "once",
      longUrl: "https://example.com/a",
      passphrase: "secret",
      slug: "mine",
    });
    await flush();
    const data = (prisma.shortLink.create.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data.passphraseHash).toMatch(/^[0-9a-f]+$/);
    expect(data.passphraseSalt).toMatch(/^[0-9a-f]+$/);
    expect(data.maxClicks).toBe(1);
    expect(created.hasPassphrase).toBe(true);
    expect(created.shortUrl).toBe("https://mgm.li/mine");
    expect(prisma.shortLink.update).toHaveBeenCalledWith({
      data: { longUrlCheckedAt: expect.any(Date), longUrlStatus: "ok" },
      where: { id: "l1" },
    });
  });

  it("grows the code length when every attempt collides and then gives up", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue({ id: "taken" });
    await expect(
      service.createLink({ domainId: "d1", expiresIn: "never", longUrl: "https://e.com" }),
    ).rejects.toThrow("Could not generate a short code.");
    // Lengths 4 to 10, five attempts each.
    expect(prisma.shortLink.findUnique).toHaveBeenCalledTimes(35);
  });
});

describe("ShortlinksService.listLinks", () => {
  it("builds the search filter and checks at most 12 stale targets", async () => {
    const { prisma, service } = makeService();
    utils.checkLongUrl.mockResolvedValue("ok");
    const stale = Array.from({ length: 15 }, (_, index) => ({
      ...link({ id: `l${index}` }),
      domain: PRIMARY,
    }));
    const fresh = { ...link({ id: "fresh", longUrlCheckedAt: new Date() }), domain: PRIMARY };
    const expired = {
      ...link({ expiresAt: new Date(Date.now() + 1000), id: "exp" }),
      domain: PRIMARY,
    };
    const old = {
      ...link({ id: "old", longUrlCheckedAt: new Date(Date.now() - 11 * 60 * 1000) }),
      domain: PRIMARY,
    };
    prisma.shortLink.findMany.mockResolvedValue([...stale, fresh, expired, old] as never);
    const links = await service.listLinks("Foo", "d1");
    await flush();
    expect(links).toHaveLength(18);
    expect(prisma.shortLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
        where: {
          OR: [
            { slug: { contains: "Foo", mode: "insensitive" } },
            { longUrl: { contains: "Foo", mode: "insensitive" } },
          ],
          domainId: "d1",
        },
      }),
    );
    expect(utils.checkLongUrl).toHaveBeenCalledTimes(12);
  });

  it("uses an empty filter without a search or domain", async () => {
    const { prisma, service } = makeService();
    await service.listLinks();
    expect(prisma.shortLink.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});

describe("ShortlinksService.updateLink", () => {
  const withDomain = (overrides: Record<string, unknown> = {}) => ({
    ...link(overrides),
    domain: PRIMARY,
  });

  it("returns null for an unknown link", async () => {
    const { prisma, service } = makeService();
    prisma.shortLink.findUnique.mockResolvedValue(null);
    expect(await service.updateLink("x", { passphraseAction: "keep" })).toBeNull();
  });

  it("rejects an unknown target domain", async () => {
    const { prisma, service } = makeService();
    prisma.shortLink.findUnique.mockResolvedValue(withDomain());
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    await expect(
      service.updateLink("l1", { domainId: "nope", passphraseAction: "keep" }),
    ).rejects.toThrow("That domain does not exist.");
  });

  it("rejects a slug that is taken on the target domain", async () => {
    const { prisma, service } = makeService();
    prisma.shortLink.findUnique
      .mockResolvedValueOnce(withDomain())
      .mockResolvedValueOnce({ id: "other" });
    await expect(
      service.updateLink("l1", { passphraseAction: "keep", slug: "new" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("keeps a stored passphrase, and keeps the slug check off when nothing moved", async () => {
    const { prisma, service } = makeService();
    prisma.shortLink.findUnique.mockResolvedValueOnce(
      withDomain({ passphraseHash: "hash", passphraseSalt: null }),
    );
    prisma.shortLink.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...withDomain(),
      ...data,
    }));
    await service.updateLink("l1", { passphraseAction: "keep", slug: "abc" });
    expect(prisma.shortLink.findUnique).toHaveBeenCalledTimes(1);
    const data = (prisma.shortLink.update.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data.passphraseHash).toBe("hash");
    expect(data.passphraseSalt).toBe("");
  });

  it("clears the passphrase on remove and sets a new one on set", async () => {
    const { prisma, service } = makeService();
    prisma.shortLink.findUnique.mockResolvedValue(withDomain({ passphraseHash: "h" }));
    prisma.shortLink.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...withDomain(),
      ...data,
    }));
    await service.updateLink("l1", { passphraseAction: "remove" });
    let data = (prisma.shortLink.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.passphraseHash).toBeNull();
    await service.updateLink("l1", { passphrase: "new secret", passphraseAction: "set" });
    data = (prisma.shortLink.update.mock.calls[1][0] as { data: Record<string, unknown> }).data;
    expect(data.passphraseHash).toMatch(/^[0-9a-f]+$/);
  });

  it("keeps no passphrase when set has no value and none was stored", async () => {
    const { prisma, service } = makeService();
    prisma.shortLink.findUnique.mockResolvedValue(withDomain());
    prisma.shortLink.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...withDomain(),
      ...data,
    }));
    await service.updateLink("l1", { passphraseAction: "set" });
    const data = (prisma.shortLink.update.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data.passphraseHash).toBeNull();
  });

  it("resets the URL check and stamps the new domain when the target moves", async () => {
    const { prisma, service } = makeService();
    utils.checkLongUrl.mockResolvedValue("error");
    prisma.shortLink.findUnique.mockResolvedValueOnce(withDomain()).mockResolvedValueOnce(null);
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    prisma.shortLink.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...link({ ...data }),
      domain: CUSTOM,
    }));
    const result = await service.updateLink("l1", {
      domainId: "d2",
      expiresIn: "7d",
      longUrl: "https://example.com/b",
      passphraseAction: "keep",
    });
    await flush();
    const data = (prisma.shortLink.update.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data).toMatchObject({
      domainId: "d2",
      longUrl: "https://example.com/b",
      longUrlCheckedAt: null,
      longUrlStatus: null,
    });
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(prisma.shortLinkDomain.update).toHaveBeenCalledWith({
      data: { lastUsedAt: expect.any(Date) },
      where: { id: "d2" },
    });
    expect(utils.checkLongUrl).toHaveBeenCalledWith("https://example.com/b");
    expect(result?.domainHost).toBe("mgm.li");
  });
});

describe("ShortlinksService.deleteLink", () => {
  it("deletes by id and does not fail for a missing link", async () => {
    const { prisma, service } = makeService();
    await service.deleteLink("l1");
    expect(prisma.shortLink.deleteMany).toHaveBeenCalledWith({ where: { id: "l1" } });
  });
});

describe("ShortlinksService routing of a host", () => {
  it("answers not found for a custom domain that is not connected yet", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue({ ...CUSTOM, status: "pending" });
    expect(await service.resolve("mgm.li", "abc", META)).toEqual({ status: "not_found" });
    expect(prisma.shortLink.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to the primary domain for a host that is not a short domain", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    prisma.shortLinkDomain.findFirst.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(link());
    const result = await service.resolve("WWW.labmgm.org", "abc", META);
    expect(result).toEqual({ longUrl: "https://example.com/a", status: "ok" });
    expect(prisma.shortLink.findUnique).toHaveBeenCalledWith({
      where: { domainId_slug: { domainId: "d1", slug: "abc" } },
    });
  });

  it("answers not found when there is no primary domain either", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    prisma.shortLinkDomain.findFirst.mockResolvedValue(null);
    expect(await service.resolve("other.example", "abc", META)).toEqual({ status: "not_found" });
  });
});

describe("ShortlinksService.resolve", () => {
  it("answers expired for an expired or spent link without a visit row", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(link({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await service.resolve("labmgm.org", "abc", META)).toEqual({
      kind: "expired",
      status: "expired",
    });
    prisma.shortLink.findUnique.mockResolvedValue(link({ clickCount: 1, maxClicks: 1 }));
    expect(await service.resolve("labmgm.org", "abc", META)).toEqual({
      kind: "consumed",
      status: "expired",
    });
    expect(prisma.shortLinkVisit.create).not.toHaveBeenCalled();
  });

  it("sends a passphrase link to the gate", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    prisma.shortLink.findUnique.mockResolvedValue(link({ passphraseHash: "h" }));
    expect(await service.resolve("MGM.li", "abc", META)).toEqual({
      host: "mgm.li",
      status: "passphrase",
    });
  });

  it("records a view without a click when another request spent the single click", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(link({ maxClicks: 1 }));
    prisma.shortLink.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.resolve("labmgm.org", "abc", META)).toEqual({
      kind: "consumed",
      status: "expired",
    });
    const visit = (
      prisma.shortLinkVisit.create.mock.calls[0][0] as { data: Record<string, unknown> }
    ).data;
    expect(visit).toMatchObject({ isClick: false, isView: true });
  });

  it("clips long visit fields and enriches the visit when geolocation is on", async () => {
    const { prisma, service } = makeService(true);
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(link());
    await service.resolve("labmgm.org", "abc", {
      ip: "i".repeat(80),
      referer: "r".repeat(900),
      userAgent: "u".repeat(900),
    });
    const visit = (
      prisma.shortLinkVisit.create.mock.calls[0][0] as {
        data: { ip: string; referer: string; userAgent: string };
      }
    ).data;
    expect(visit.ip).toHaveLength(45);
    expect(visit.referer).toHaveLength(500);
    expect(visit.userAgent).toHaveLength(500);
    expect(geo.enrichVisit).toHaveBeenCalledWith(prisma, "v1", "i".repeat(45));
  });

  it("stores empty visit fields as null", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(link());
    await service.resolve("labmgm.org", "abc", {});
    const visit = (
      prisma.shortLinkVisit.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(visit).toMatchObject({ ip: null, referer: null, userAgent: null });
    expect(geo.enrichVisit).not.toHaveBeenCalled();
  });
});

describe("ShortlinksService.publicLinkState", () => {
  it("answers not found for an unknown link", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(null);
    expect(await service.publicLinkState("labmgm.org", "x", META)).toEqual({ status: "not_found" });
  });

  it("records the view of an expired link", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(link({ expiresAt: new Date(Date.now() - 1) }));
    expect(await service.publicLinkState("labmgm.org", "abc", META)).toEqual({
      kind: "expired",
      status: "expired",
    });
    expect(prisma.shortLinkVisit.create).toHaveBeenCalledTimes(1);
  });

  it("records the view of a passphrase gate", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(link({ passphraseHash: "h" }));
    expect(await service.publicLinkState("labmgm.org", "abc", META)).toEqual({
      host: "labmgm.org",
      status: "passphrase",
    });
    expect(prisma.shortLinkVisit.create).toHaveBeenCalledTimes(1);
  });

  it("behaves like a resolve for an open link", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(link());
    expect(await service.publicLinkState("labmgm.org", "abc", META)).toEqual({
      longUrl: "https://example.com/a",
      status: "ok",
    });
  });
});

describe("ShortlinksService.verify", () => {
  it("returns null for an unknown link", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(null);
    expect(await service.verify("labmgm.org", "x", "p", META)).toBeNull();
  });

  it("reports an expired link", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(link({ expiresAt: new Date(Date.now() - 1) }));
    expect(await service.verify("labmgm.org", "abc", "p", META)).toEqual({
      expired: true,
      longUrl: null,
    });
  });

  it("records a failed attempt for a wrong passphrase", async () => {
    const { prisma, service } = makeService();
    const { hashPassphrase } = await import("./shortlinks.utils.js");
    const stored = await hashPassphrase("right");
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(
      link({ passphraseHash: stored.hash, passphraseSalt: stored.salt }),
    );
    expect(await service.verify("labmgm.org", "abc", "wrong", META)).toEqual({
      expired: false,
      longUrl: null,
      rejected: true,
    });
    expect(
      (
        prisma.shortLinkVisit.create.mock.calls[0][0] as unknown as {
          data: { failedAttempt: boolean };
        }
      ).data.failedAttempt,
    ).toBe(true);
    expect(prisma.shortLink.updateMany).toHaveBeenCalledTimes(1);
  });

  it("hands over the URL for the right passphrase", async () => {
    const { prisma, service } = makeService();
    const { hashPassphrase } = await import("./shortlinks.utils.js");
    const stored = await hashPassphrase("right");
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(
      link({ passphraseHash: stored.hash, passphraseSalt: stored.salt }),
    );
    expect(await service.verify("labmgm.org", "abc", "right", META)).toEqual({
      expired: false,
      longUrl: "https://example.com/a",
    });
  });

  it("reports expired when the single click was spent in a race", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(link({ maxClicks: 1 }));
    prisma.shortLink.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.verify("labmgm.org", "abc", "p", META)).toEqual({
      expired: true,
      longUrl: null,
    });
  });
});

describe("ShortlinksService.linkAnalytics", () => {
  it("returns null for an unknown link", async () => {
    const { prisma, service } = makeService();
    prisma.shortLink.findUnique.mockResolvedValue(null);
    expect(await service.linkAnalytics("x")).toBeNull();
  });

  it("falls back to zero totals and groups referrers by host", async () => {
    const { prisma, service } = makeService();
    prisma.shortLink.findUnique.mockResolvedValue({ ...link(), domain: PRIMARY });
    prisma.shortLinkVisit.findMany
      .mockResolvedValueOnce([
        { referer: "https://a.example/x" },
        { referer: "https://a.example/y" },
        { referer: "https://b.example/" },
        { referer: "direct" },
        { referer: "garbage" },
        { referer: "also garbage" },
        { referer: null },
      ] as never)
      .mockResolvedValueOnce([]);
    const result = await service.linkAnalytics("l1");
    expect(result?.totals).toEqual({ clicks: 0, failedAttempts: 0, uniqueIps: 0, views: 0 });
    expect(result?.days).toHaveLength(14);
    expect(result?.referrers).toEqual([
      { host: "a.example", visits: 2 },
      { host: "other", visits: 2 },
      { host: "b.example", visits: 1 },
      { host: "direct", visits: 1 },
    ]);
  });
});
