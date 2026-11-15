import { NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CmsAdminsService } from "./cms-admins.service.js";

const CREATED = new Date("2026-11-01T01:00:00.000Z");
const UPDATED = new Date("2026-11-02T02:00:00.000Z");

type Row = { slug: string; data: Record<string, unknown>; createdAt: Date; updatedAt: Date };

function makeService(rows: Row[] = [], cached?: unknown) {
  const model = {
    findMany: vi.fn(async () => rows),
    findUnique: vi.fn(
      async ({ where }: { where: { slug: string } }) =>
        rows.find((entry) => entry.slug === where.slug) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: { slug: string; data: Record<string, unknown> } }) => {
      const created = { ...data, createdAt: CREATED, updatedAt: CREATED };
      rows.push(created);
      return created;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { slug: string };
        data: { data: Record<string, unknown> };
      }) => {
        const found = rows.find((entry) => entry.slug === where.slug);
        const updated = {
          slug: where.slug,
          data: data.data,
          createdAt: CREATED,
          updatedAt: UPDATED,
        };
        if (found) found.data = data.data;
        return updated;
      },
    ),
    delete: vi.fn().mockResolvedValue({}),
  };
  const prisma = { cmsAdmin: model };
  const cache = {
    getJson: vi.fn().mockResolvedValue(cached ?? null),
    setJson: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new CmsAdminsService(prisma as never, cache as never), model, cache, rows };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CmsAdminsService create", () => {
  it("hashes a typed passphrase, never stores it and never echoes it", async () => {
    const { service, model } = makeService();

    const result = await service.create({ name: "Ani", passphrase: "a-typed-passphrase" });

    expect(result.generatedPassphrase).toBeUndefined();
    const stored = (
      model.create.mock.calls[0]?.[0] as { data: { slug: string; data: Record<string, unknown> } }
    ).data;
    expect(stored.slug).toMatch(/^admin-[0-9a-f-]{36}$/);
    expect(stored.data).toMatchObject({
      name: "Ani",
      role: "admin",
      active: true,
      expiresAt: null,
      sessionVersion: 1,
      lastLoginAt: null,
    });
    const passphrase = stored.data.passphrase as { salt: string; hash: string };
    expect(passphrase.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(passphrase.hash).toMatch(/^[0-9a-f]{128}$/);
    expect(JSON.stringify(result)).not.toContain("a-typed-passphrase");
    expect(result.record).not.toHaveProperty("passphrase");
  });

  it("generates a passphrase once for `generate` and for none", async () => {
    const { service } = makeService();

    const generated = await service.create({ name: "A", passphrase: "generate" });
    const missing = await service.create({ name: "B" });

    expect(generated.generatedPassphrase).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(missing.generatedPassphrase).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(generated.generatedPassphrase).not.toBe(missing.generatedPassphrase);
  });

  it("keeps the permissions, limits contact inquiries to read and clears the cache", async () => {
    const { service, cache } = makeService();

    const { record } = await service.create({
      name: "Ani",
      expiresAt: "2030-01-01T00:00:00.000Z",
      permissions: {
        articles: ["read", "write"],
        "contact-inquiries": ["read", "write", "delete"],
      },
    });

    expect(record.permissions.articles).toEqual(["read", "write"]);
    expect(record.permissions["contact-inquiries"]).toEqual(["read"]);
    expect(record.permissions.members).toEqual([]);
    expect(record.expiresAt).toBe("2030-01-01T00:00:00.000Z");
    expect(cache.remove).toHaveBeenCalledWith("cms:admins:v1");
  });

  it("gives no contact inquiry access when read is not asked for", async () => {
    const { service } = makeService();

    const { record } = await service.create({
      name: "Ani",
      permissions: { "contact-inquiries": ["write"] },
    });

    expect(record.permissions["contact-inquiries"]).toEqual([]);
  });
});

describe("CmsAdminsService verify", () => {
  it("recognizes the passphrase of an active account and stamps the login", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T09:00:00.000Z"));
    const { service, model, cache } = makeService();
    await service.create({ name: "Ani", passphrase: "a-typed-passphrase" });
    await service.create({ name: "Budi", passphrase: "another-passphrase" });
    cache.remove.mockClear();

    const account = await service.verify("another-passphrase");

    expect(account).toMatchObject({ name: "Budi", lastLoginAt: "2026-11-05T09:00:00.000Z" });
    expect(account).not.toHaveProperty("passphrase");
    expect(model.update).toHaveBeenCalledTimes(1);
    expect(cache.remove).toHaveBeenCalledWith("cms:admins:v1");
  });

  it("answers null for a wrong passphrase and changes nothing", async () => {
    const { service, model } = makeService();
    await service.create({ name: "Ani", passphrase: "a-typed-passphrase" });

    await expect(service.verify("wrong-passphrase")).resolves.toBeNull();
    expect(model.update).not.toHaveBeenCalled();
  });

  it("skips inactive and expired accounts and accounts without a passphrase", async () => {
    const { service, rows } = makeService();
    await service.create({ name: "Off", passphrase: "inactive-passphrase" });
    await service.create({
      name: "Old",
      passphrase: "expired-passphrase",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    rows[0]!.data.active = false;
    rows.push({
      slug: "admin-none",
      data: { name: "None", active: true, expiresAt: null, passphrase: null },
      createdAt: CREATED,
      updatedAt: CREATED,
    });

    await expect(service.verify("inactive-passphrase")).resolves.toBeNull();
    await expect(service.verify("expired-passphrase")).resolves.toBeNull();
    await expect(service.verify("")).resolves.toBeNull();
  });

  it("accepts an account whose expiry is still in the future", async () => {
    const { service } = makeService();
    await service.create({
      name: "Soon",
      passphrase: "future-passphrase",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    await expect(service.verify("future-passphrase")).resolves.toMatchObject({ name: "Soon" });
  });
});

describe("CmsAdminsService reads", () => {
  it("lists sanitized accounts oldest first and caches them for 30 seconds", async () => {
    const { service, model, cache } = makeService([
      {
        slug: "admin-1",
        data: {
          name: "Ani",
          role: "admin",
          active: true,
          expiresAt: null,
          sessionVersion: 3,
          passphrase: { salt: "aa", hash: "bb" },
          permissions: { articles: ["read"] },
          lastLoginAt: null,
        },
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ]);

    const records = await service.all();

    expect(model.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "asc" } });
    expect(records[0]).toMatchObject({
      slug: "admin-1",
      name: "Ani",
      sessionVersion: 3,
      createdAt: CREATED.toISOString(),
      updatedAt: UPDATED.toISOString(),
    });
    expect(records[0]).not.toHaveProperty("passphrase");
    expect(records[0]?.permissions.articles).toEqual(["read"]);
    expect(records[0]?.permissions.events).toEqual([]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:admins:v1", records, 30);
  });

  it("serves the cached list without a query", async () => {
    const cached = [{ slug: "c" }];
    const { service, model } = makeService([], cached);

    await expect(service.all()).resolves.toBe(cached);
    expect(model.findMany).not.toHaveBeenCalled();
  });

  it("finds one account and answers 404 for an unknown one", async () => {
    const { service } = makeService();
    const { record } = await service.create({ name: "Ani" });

    await expect(service.bySlug(record.slug)).resolves.toMatchObject({ name: "Ani" });
    await expect(service.bySlug("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsAdminsService update", () => {
  it("answers 404 for an unknown account", async () => {
    const { service, model } = makeService();

    await expect(service.update("nope", { name: "X" })).rejects.toBeInstanceOf(NotFoundException);
    expect(model.update).not.toHaveBeenCalled();
  });

  it("bumps the session version and keeps what the patch leaves out", async () => {
    const { service, cache } = makeService();
    const { record } = await service.create({
      name: "Ani",
      passphrase: "a-typed-passphrase",
      expiresAt: "2030-01-01T00:00:00.000Z",
      permissions: { articles: ["read"], members: ["read", "write"] },
    });
    cache.remove.mockClear();

    const result = await service.update(record.slug, {
      active: false,
      permissions: { articles: ["read", "write"] },
    });

    expect(result.generatedPassphrase).toBeUndefined();
    expect(result.record).toMatchObject({
      name: "Ani",
      active: false,
      expiresAt: "2030-01-01T00:00:00.000Z",
      sessionVersion: 2,
    });
    expect(result.record.permissions.articles).toEqual(["read", "write"]);
    expect(result.record.permissions.members).toEqual(["read", "write"]);
    expect(cache.remove).toHaveBeenCalledWith("cms:admins:v1");
    await expect(service.verify("a-typed-passphrase")).resolves.toBeNull();
  });

  it("changes the name and the expiry, and clears the expiry with null", async () => {
    const { service } = makeService();
    const { record } = await service.create({
      name: "Ani",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });

    const renamed = await service.update(record.slug, { name: "Ani W" });
    expect(renamed.record).toMatchObject({ name: "Ani W", expiresAt: "2030-01-01T00:00:00.000Z" });

    const cleared = await service.update(record.slug, { expiresAt: null });
    expect(cleared.record.expiresAt).toBeNull();
    expect(cleared.record.sessionVersion).toBe(3);
  });

  it("sets a typed passphrase without echoing it", async () => {
    const { service } = makeService();
    const { record } = await service.create({ name: "Ani", passphrase: "old-passphrase-1" });

    const result = await service.update(record.slug, { passphrase: "new-passphrase-2" });

    expect(result.generatedPassphrase).toBeUndefined();
    await expect(service.verify("old-passphrase-1")).resolves.toBeNull();
    await expect(service.verify("new-passphrase-2")).resolves.toMatchObject({ name: "Ani" });
  });

  it("generates a new passphrase once for `generate`", async () => {
    const { service } = makeService();
    const { record } = await service.create({ name: "Ani", passphrase: "old-passphrase-1" });

    const result = await service.update(record.slug, { passphrase: "generate" });

    expect(result.generatedPassphrase).toMatch(/^[A-Za-z0-9_-]{24}$/);
    await expect(service.verify(result.generatedPassphrase!)).resolves.toMatchObject({
      name: "Ani",
    });
    await expect(service.verify("old-passphrase-1")).resolves.toBeNull();
  });
});

describe("CmsAdminsService remove", () => {
  it("removes an account and clears the cache", async () => {
    const { service, model, cache } = makeService();

    await service.remove("admin-1");

    expect(model.delete).toHaveBeenCalledWith({ where: { slug: "admin-1" } });
    expect(cache.remove).toHaveBeenCalledWith("cms:admins:v1");
  });

  it("answers 404 when the account is gone", async () => {
    const { service, model, cache } = makeService();
    model.delete.mockRejectedValue(new Error("not found"));

    await expect(service.remove("nope")).rejects.toBeInstanceOf(NotFoundException);
    expect(cache.remove).not.toHaveBeenCalled();
  });
});
