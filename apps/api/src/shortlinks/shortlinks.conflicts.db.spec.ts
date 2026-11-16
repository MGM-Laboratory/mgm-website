// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service.js";
import { ShortlinksError, ShortlinksService } from "./shortlinks.service.js";

const dns = vi.hoisted(() => ({ resolveNs: vi.fn(), resolveTxt: vi.fn(), lookup: vi.fn() }));
vi.mock("node:dns/promises", () => dns);

const databaseUrl = process.env.DATABASE_URL;
const HOST = "db-conflicts-spec.example.test";
const NEW_HOST = "db-conflicts-new.example.test";

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. Two requests can pass the free-slug check together, and then the unique
// index refuses the second write. The service has to turn that refusal into
// the same 409 answer as the check, and not into a raw database error.
describe.skipIf(!databaseUrl)("short link conflicts on PostgreSQL", () => {
  let prisma: PrismaService;
  let service: ShortlinksService;
  let domainId: string;

  const status = async (work: Promise<unknown>) => {
    const error = await work.then(
      () => null,
      (caught: unknown) => caught,
    );
    return error instanceof ShortlinksError ? error.status : error;
  };

  // Skips the pre-check, so the write itself meets the unique index.
  const skipSlugCheck = () =>
    vi
      .spyOn(service as unknown as { assertSlugFree: () => Promise<void> }, "assertSlugFree")
      .mockResolvedValue(undefined);

  const link = (slug: string) => ({
    domainId,
    longUrl: "https://example.org/",
    slug,
    expiresIn: "never" as const,
  });

  beforeAll(async () => {
    dns.resolveNs.mockRejectedValue(new Error("ENOTFOUND"));
    dns.lookup.mockRejectedValue(new Error("ENOTFOUND"));
    prisma = new PrismaService({ getOrThrow: () => databaseUrl } as never);
    await prisma.onModuleInit();
    await prisma.shortLinkDomain.deleteMany({ where: { hostname: { in: [HOST, NEW_HOST] } } });
    const domain = await prisma.shortLinkDomain.create({
      data: { hostname: HOST, status: "connected" },
    });
    domainId = domain.id;
    const values: Record<string, unknown> = {
      SHORTLINKS_GEOLOCATE: false,
      SHORTLINKS_PRIMARY_DOMAIN: "primary.example.test",
    };
    const config = { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] };
    service = new ShortlinksService(prisma, config as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.shortLinkDomain.deleteMany({ where: { hostname: { in: [HOST, NEW_HOST] } } });
    await prisma.$disconnect();
  });

  it("answers 409 when a custom code is taken between the check and the write", async () => {
    await service.createLink(link("taken-on-create"));
    skipSlugCheck();

    expect(await status(service.createLink(link("taken-on-create")))).toBe(409);
    expect(await prisma.shortLink.count({ where: { domainId, slug: "taken-on-create" } })).toBe(1);
  });

  it("gives one of two overlapping creates of a custom code and refuses the other with 409", async () => {
    const outcomes = await Promise.all([
      status(service.createLink(link("overlap"))),
      status(service.createLink(link("overlap"))),
    ]);

    expect(outcomes.filter((outcome) => outcome === null)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 409)).toHaveLength(1);
    expect(await prisma.shortLink.count({ where: { domainId, slug: "overlap" } })).toBe(1);
  });

  it("answers 409 when a renamed code is taken between the check and the write", async () => {
    await service.createLink(link("rename-target"));
    const other = await service.createLink(link("rename-source"));
    skipSlugCheck();

    const outcome = await status(
      service.updateLink(other.id, { slug: "rename-target", passphraseAction: "keep" }),
    );

    expect(outcome).toBe(409);
    const stored = await prisma.shortLink.findUniqueOrThrow({ where: { id: other.id } });
    expect(stored.slug).toBe("rename-source");
  });

  it("answers 409 when a domain is added twice and the lookup misses the first one", async () => {
    await service.createDomain(NEW_HOST);
    const lookup = vi
      .spyOn(prisma.shortLinkDomain, "findUnique")
      .mockResolvedValueOnce(null as never);

    expect(await status(service.createDomain(NEW_HOST))).toBe(409);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(await prisma.shortLinkDomain.count({ where: { hostname: NEW_HOST } })).toBe(1);
  });
});
