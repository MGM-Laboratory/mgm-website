// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShortlinksError, ShortlinksService } from "./shortlinks.service.js";

const dns = vi.hoisted(() => ({ resolveNs: vi.fn(), resolveTxt: vi.fn() }));
const connect = vi.hoisted(() => ({ buildConnectUrl: vi.fn(), resolveCloudflareSync: vi.fn() }));

vi.mock("node:dns/promises", () => dns);
vi.mock("./shortlinks.domainconnect.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shortlinks.domainconnect.js")>()),
  buildConnectUrl: connect.buildConnectUrl,
  resolveCloudflareSync: connect.resolveCloudflareSync,
}));

type Values = Record<string, unknown>;

function makePrisma() {
  return {
    shortLink: { count: vi.fn(async () => 0) },
    shortLinkDomain: {
      create: vi.fn(),
      delete: vi.fn(async () => ({})),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(async (..._args: unknown[]) => ({})),
      updateMany: vi.fn(async (..._args: unknown[]) => ({ count: 0 })),
      upsert: vi.fn(async () => ({})),
    },
  };
}

function makeService(values: Values = {}) {
  const prisma = makePrisma();
  const all: Values = {
    SHORTLINKS_CNAME_TARGET: "edge.example.net",
    SHORTLINKS_PRIMARY_DOMAIN: "LabMGM.org",
    ...values,
  };
  const config = {
    get: (key: string) => all[key],
    getOrThrow: (key: string) => {
      if (all[key] === undefined) throw new Error(`${key} missing`);
      return all[key];
    },
  };
  return { prisma, service: new ShortlinksService(prisma as never, config as never) };
}

const CUSTOM = {
  createdAt: new Date("2030-01-01T00:00:00Z"),
  hostname: "mgm.li",
  id: "d2",
  isPrimary: false,
  lastUsedAt: null,
  provider: "manual",
  status: "pending",
  verifyToken: "tok",
};

const fetchMock = vi.fn();

beforeEach(() => {
  dns.resolveNs.mockRejectedValue(new Error("ENOTFOUND"));
  dns.resolveTxt.mockRejectedValue(new Error("ENODATA"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.clearAllMocks();
  connect.buildConnectUrl.mockReset();
  connect.resolveCloudflareSync.mockReset();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("ShortlinksService domains", () => {
  it("seeds the primary domain once at boot with a lower cased hostname", async () => {
    const { prisma, service } = makeService();
    await service.onApplicationBootstrap();
    expect(prisma.shortLinkDomain.upsert).toHaveBeenCalledWith({
      create: { hostname: "labmgm.org", isPrimary: true, provider: "local", status: "connected" },
      update: {},
      where: { hostname: "labmgm.org" },
    });
    expect(prisma.shortLinkDomain.updateMany).toHaveBeenCalledWith({
      data: { isPrimary: true },
      where: { hostname: "labmgm.org", isPrimary: false },
    });
  });

  it("rejects hostnames that are not domain names", async () => {
    const { service } = makeService();
    for (const bad of ["localhost", "a b.com", "-x.com", "x.c", "https://", ""]) {
      await expect(service.createDomain(bad)).rejects.toThrow(
        "That does not look like a domain name.",
      );
    }
  });

  it("rejects the site's own domain", async () => {
    const { service } = makeService();
    await expect(service.createDomain("labmgm.org")).rejects.toThrow(
      "That is the site's own domain, it is already available.",
    );
  });

  it("rejects a domain that is already added with a 409", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    const error = await service.createDomain("mgm.li").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ShortlinksError);
    expect((error as ShortlinksError).status).toBe(409);
  });

  it("creates a manual domain with a random verify token", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    prisma.shortLinkDomain.create.mockImplementation(async ({ data }: { data: object }) => ({
      ...CUSTOM,
      ...data,
    }));
    const result = await service.createDomain("  MGM.li ");
    const data = (
      prisma.shortLinkDomain.create.mock.calls[0][0] as { data: Record<string, string> }
    ).data;
    expect(data.hostname).toBe("mgm.li");
    expect(data.provider).toBe("manual");
    expect(data.verifyToken).toMatch(/^[0-9a-f]{32}$/);
    expect(result.domain.linkCount).toBe(0);
  });

  it("marks a domain on Cloudflare nameservers as cloudflare", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    prisma.shortLinkDomain.create.mockImplementation(async ({ data }: { data: object }) => ({
      ...CUSTOM,
      ...data,
    }));
    dns.resolveNs.mockResolvedValue(["Ada.NS.Cloudflare.com"]);
    await service.createDomain("go.mgm.li");
    expect(
      (prisma.shortLinkDomain.create.mock.calls[0][0] as { data: { provider: string } }).data
        .provider,
    ).toBe("cloudflare");
  });

  it("does not treat other nameservers as Cloudflare", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    prisma.shortLinkDomain.create.mockImplementation(async ({ data }: { data: object }) => ({
      ...CUSTOM,
      ...data,
    }));
    dns.resolveNs.mockResolvedValue(["ns1.example.net"]);
    await service.createDomain("go.mgm.li");
    expect(
      (prisma.shortLinkDomain.create.mock.calls[0][0] as { data: { provider: string } }).data
        .provider,
    ).toBe("manual");
  });
});

describe("ShortlinksService.refreshDomain", () => {
  it("returns null for an unknown or primary domain", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValueOnce(null);
    expect(await service.refreshDomain("x")).toBeNull();
    prisma.shortLinkDomain.findUnique.mockResolvedValueOnce({ ...CUSTOM, isPrimary: true });
    expect(await service.refreshDomain("d1")).toBeNull();
  });

  it("connects only when the TXT matches and the marker answers", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    prisma.shortLink.count.mockResolvedValue(3);
    dns.resolveTxt.mockResolvedValue([["to", "k"], ["other"]]);
    fetchMock.mockResolvedValue({ ok: true, text: async () => " mgm-shortlinks-ok\n" });
    const result = await service.refreshDomain("d2");
    expect(result?.checks).toEqual({ marker: true, verifyTxt: true });
    expect(result?.domain.status).toBe("connected");
    expect(result?.domain.linkCount).toBe(3);
    expect(prisma.shortLinkDomain.update).toHaveBeenCalledWith({
      data: { provider: "manual", status: "connected" },
      where: { id: "d2" },
    });
  });

  it("stays pending when the TXT record is missing", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    fetchMock.mockResolvedValue({ ok: true, text: async () => "mgm-shortlinks-ok" });
    const result = await service.refreshDomain("d2");
    expect(result?.checks).toEqual({ marker: true, verifyTxt: false });
    expect(result?.domain.status).toBe("pending");
  });

  it("stays pending for a wrong marker, a non ok answer and a network error", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    dns.resolveTxt.mockResolvedValue([["tok"]]);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "something else" });
    expect((await service.refreshDomain("d2"))?.checks.marker).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: false });
    expect((await service.refreshDomain("d2"))?.checks.marker).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("tls"));
    expect((await service.refreshDomain("d2"))?.checks.marker).toBe(false);
  });

  it("creates a verify token on demand for an older domain and skips the TXT check without it", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue({ ...CUSTOM, verifyToken: null });
    fetchMock.mockResolvedValue({ ok: true, text: async () => "mgm-shortlinks-ok" });
    const result = await service.refreshDomain("d2");
    const stored = prisma.shortLinkDomain.update.mock.calls[0][0] as {
      data: { verifyToken: string };
    };
    expect(stored.data.verifyToken).toMatch(/^[0-9a-f]{32}$/);
    expect(result?.checks.verifyTxt).toBe(false);
  });

  it("refreshes the Cloudflare detection of a manual domain only", async () => {
    const { prisma, service } = makeService();
    dns.resolveNs.mockResolvedValue(["x.ns.cloudflare.com"]);
    fetchMock.mockResolvedValue({ ok: false });
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    expect((await service.refreshDomain("d2"))?.domain.provider).toBe("cloudflare");
    dns.resolveNs.mockClear();
    prisma.shortLinkDomain.findUnique.mockResolvedValue({ ...CUSTOM, provider: "cloudflare" });
    expect((await service.refreshDomain("d2"))?.domain.provider).toBe("cloudflare");
    expect(dns.resolveNs).not.toHaveBeenCalled();
  });
});

describe("ShortlinksService.deleteDomain", () => {
  it("returns false for an unknown domain", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(null);
    expect(await service.deleteDomain("x")).toBe(false);
  });

  it("refuses a domain that still has links, with the right plural", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    prisma.shortLink.count.mockResolvedValueOnce(1);
    await expect(service.deleteDomain("d2")).rejects.toThrow("Delete its 1 link first.");
    prisma.shortLink.count.mockResolvedValueOnce(4);
    await expect(service.deleteDomain("d2")).rejects.toThrow("Delete its 4 links first.");
    expect(prisma.shortLinkDomain.delete).not.toHaveBeenCalled();
  });

  it("deletes an empty custom domain", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    expect(await service.deleteDomain("d2")).toBe(true);
    expect(prisma.shortLinkDomain.delete).toHaveBeenCalledWith({ where: { id: "d2" } });
  });
});

describe("ShortlinksService.connectDomain", () => {
  it("returns null for an unknown or primary domain", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValueOnce(null);
    expect(await service.connectDomain("x")).toBeNull();
    prisma.shortLinkDomain.findUnique.mockResolvedValueOnce({ ...CUSTOM, isPrimary: true });
    expect(await service.connectDomain("d1")).toBeNull();
  });

  it("hands over the records without a URL when no signing key is set", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    const result = await service.connectDomain("d2");
    expect(result).toEqual({
      records: {
        cname: { content: "edge.example.net", name: "mgm.li" },
        verifyTxt: { content: "tok", name: "_mgm-verify.mgm.li" },
      },
      url: null,
    });
    expect(connect.buildConnectUrl).not.toHaveBeenCalled();
  });

  it("builds the signed URL from the configured Domain Connect settings", async () => {
    const { prisma, service } = makeService({
      DOMAIN_CONNECT_KEY_ID: "_key",
      DOMAIN_CONNECT_PRIVATE_KEY: "pem",
      DOMAIN_CONNECT_PROVIDER_ID: "labmgm.org",
      DOMAIN_CONNECT_REDIRECT_URL: "https://labmgm.org/admin",
      DOMAIN_CONNECT_SERVICE_ID: "shortlinks",
      DOMAIN_CONNECT_SYNC_URL: "https://fallback.example.net",
    });
    prisma.shortLinkDomain.findUnique.mockResolvedValue(CUSTOM);
    connect.resolveCloudflareSync.mockResolvedValue({
      syncUrl: "https://dash.example.net",
      zone: "mgm.li",
    });
    connect.buildConnectUrl.mockReturnValue({
      canonical: "c",
      signature: "s",
      url: "https://apply",
    });
    const result = await service.connectDomain("d2");
    expect(result?.url).toBe("https://apply");
    expect(connect.resolveCloudflareSync).toHaveBeenCalledWith(
      "mgm.li",
      "https://fallback.example.net",
    );
    expect(connect.buildConnectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "mgm.li",
        keyId: "_key",
        privateKey: "pem",
        providerId: "labmgm.org",
        redirectUrl: "https://labmgm.org/admin",
        serviceId: "shortlinks",
        syncUrl: "https://dash.example.net",
        zone: "mgm.li",
      }),
    );
  });
});

describe("ShortlinksService.routingHosts", () => {
  it("lists only the custom domains with their status", async () => {
    const { prisma, service } = makeService();
    prisma.shortLinkDomain.findMany.mockResolvedValue([
      { hostname: "mgm.li", status: "connected" },
    ]);
    expect(await service.routingHosts()).toEqual([{ hostname: "mgm.li", status: "connected" }]);
    expect(prisma.shortLinkDomain.findMany).toHaveBeenCalledWith({
      select: { hostname: true, status: true },
      where: { isPrimary: false },
    });
  });
});
