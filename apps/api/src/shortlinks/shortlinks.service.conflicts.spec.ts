// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from "vitest";

import { ShortlinksError, ShortlinksService } from "./shortlinks.service.js";

const dns = vi.hoisted(() => ({
  lookup: vi.fn(),
  resolveNs: vi.fn(),
  resolveTxt: vi.fn(),
}));
vi.mock("node:dns/promises", () => dns);

const PRIMARY = { hostname: "labmgm.org", id: "d1", isPrimary: true, status: "connected" };
const UNIQUE = { code: "P2002" };
const BROKEN = new Error("the database went away");

function setup() {
  dns.lookup.mockRejectedValue(new Error("ENOTFOUND"));
  dns.resolveNs.mockRejectedValue(new Error("ENOTFOUND"));
  const prisma = {
    shortLink: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    shortLinkDomain: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
  const values: Record<string, unknown> = { SHORTLINKS_PRIMARY_DOMAIN: "labmgm.org" };
  const config = { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] };
  return { prisma, service: new ShortlinksService(prisma as never, config as never) };
}

const newLink = (slug?: string) => ({
  domainId: "d1",
  expiresIn: "never" as const,
  longUrl: "https://example.org/",
  slug,
});

// The unique index can refuse a write that passed the free-slug or free-name
// check. These tests cover what the service does with that refusal and with
// any other database error, without a database.
describe("ShortlinksService conflict handling", () => {
  it("answers 409 when the index refuses a custom code on create", async () => {
    const { prisma, service } = setup();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(null);
    prisma.shortLink.create.mockRejectedValue(UNIQUE);

    const error = await service.createLink(newLink("mine")).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ShortlinksError);
    expect(error).toMatchObject({
      message: "That short code is already taken on this domain.",
      status: 409,
    });
  });

  it("passes any other database error of a custom code create on", async () => {
    const { prisma, service } = setup();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(null);
    prisma.shortLink.create.mockRejectedValue(BROKEN);

    await expect(service.createLink(newLink("mine"))).rejects.toBe(BROKEN);
  });

  it("does not blame the visitor when a generated code collides", async () => {
    const { prisma, service } = setup();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(PRIMARY);
    prisma.shortLink.findUnique.mockResolvedValue(null);
    prisma.shortLink.create.mockRejectedValue(UNIQUE);

    await expect(service.createLink(newLink())).rejects.toBe(UNIQUE);
  });

  it("answers 409 when the index refuses a renamed code", async () => {
    const { prisma, service } = setup();
    prisma.shortLink.findUnique
      .mockResolvedValueOnce({ id: "l1", slug: "old", domainId: "d1", domain: PRIMARY })
      .mockResolvedValueOnce(null);
    prisma.shortLink.update.mockRejectedValue(UNIQUE);

    const error = await service
      .updateLink("l1", { slug: "new", passphraseAction: "keep" })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      message: "That short code is already taken on this domain.",
      status: 409,
    });
  });

  it("passes any other database error of a link update on", async () => {
    const { prisma, service } = setup();
    prisma.shortLink.findUnique.mockResolvedValue({
      id: "l1",
      slug: "old",
      domainId: "d1",
      domain: PRIMARY,
    });
    prisma.shortLink.update.mockRejectedValue(BROKEN);

    await expect(service.updateLink("l1", { passphraseAction: "keep" })).rejects.toBe(BROKEN);
  });

  it("answers 409 when the index refuses a domain that was added at the same time", async () => {
    const { prisma, service } = setup();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    prisma.shortLinkDomain.create.mockRejectedValue(UNIQUE);

    const error = await service.createDomain("mgm.li").catch((caught: unknown) => caught);

    expect(error).toMatchObject({ message: "That domain is already added.", status: 409 });
  });

  it("passes any other database error of a domain create on", async () => {
    const { prisma, service } = setup();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    prisma.shortLinkDomain.create.mockRejectedValue(BROKEN);

    await expect(service.createDomain("mgm.li")).rejects.toBe(BROKEN);
  });
});
