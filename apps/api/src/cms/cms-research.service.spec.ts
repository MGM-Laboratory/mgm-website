import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsResearchService } from "./cms-research.service.js";

const LOADED = new Date("2026-11-14T05:00:00.000Z");
const COVER = "research-alpha-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";
const COVER_2 = "research-alpha-1c7b2d63-4a3f-4e8b-8b2c-6d1e9f305b72.webp";

type Row = { slug: string; data: Record<string, unknown>; updatedAt: Date };

function row(slug: string, research: Record<string, unknown>): Row {
  return { slug, data: { research, body: [{ id: "b" }] }, updatedAt: LOADED };
}

function makeService(rows: Row[] = [], cached: Record<string, unknown> = {}) {
  const model = {
    findUnique: vi.fn(
      async ({ where }: { where: { slug: string } }) =>
        rows.find((entry) => entry.slug === where.slug) ?? null,
    ),
    findMany: vi.fn().mockResolvedValue(rows),
    count: vi.fn().mockResolvedValue(rows.length),
    create: vi.fn(async ({ data }: { data: { slug: string; data: unknown } }) => ({
      ...data,
      updatedAt: LOADED,
    })),
    update: vi.fn(async ({ data }: { data: { slug: string; data: unknown } }) => ({
      ...data,
      slug: data.slug ?? "other",
      updatedAt: new Date(LOADED.getTime() + 1),
    })),
    upsert: vi.fn().mockResolvedValue({}),
    delete: vi.fn(async ({ where }: { where: { slug: string } }) => {
      const found = rows.find((entry) => entry.slug === where.slug);
      if (!found) throw new Error("not found");
      return found;
    }),
  };
  const prisma = {
    cmsResearchInitiative: model,
    $transaction: vi.fn(async (work: unknown) =>
      typeof work === "function"
        ? (work as (client: { cmsResearchInitiative: typeof model }) => unknown)({
            cmsResearchInitiative: model,
          })
        : Promise.all(work as Promise<unknown>[]),
    ),
  };
  const store = new Map<string, unknown>(Object.entries(cached));
  const cache = {
    getJson: vi.fn(async (key: string) => store.get(key)),
    setJson: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
  const storage = { deleteFile: vi.fn().mockResolvedValue(undefined) };
  const service = new CmsResearchService(prisma as never, cache as never, storage as never);
  return { service, model, cache, storage };
}

describe("CmsResearchService reads", () => {
  const rows = [row("live", { title: "Live" }), row("hidden", { draft: true })];

  it("lists published records and caches the list", async () => {
    const { service, cache } = makeService(rows);

    const records = await service.all();

    expect(records.map((record) => record.slug)).toEqual(["live"]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:research:v1", records, 600);
  });

  it("builds a feed without the body", async () => {
    const { service, cache } = makeService(rows);

    const feed = await service.feed();

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ slug: "live", body: [] });
    expect(cache.setJson).toHaveBeenCalledWith("cms:research:feed:v1", feed, 600);
  });

  it("lists drafts for the admin", async () => {
    const { service, cache } = makeService(rows);

    const records = await service.allIncludingDrafts();

    expect(records.map((record) => record.slug)).toEqual(["live", "hidden"]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:research:drafts:v1", records, 600);
  });

  it("serves every cached list without a query", async () => {
    const cached = [{ slug: "c" }];
    const { service, model } = makeService(rows, {
      "cms:research:v1": cached,
      "cms:research:feed:v1": cached,
      "cms:research:drafts:v1": cached,
    });

    await expect(service.all()).resolves.toBe(cached);
    await expect(service.feed()).resolves.toBe(cached);
    await expect(service.allIncludingDrafts()).resolves.toBe(cached);
    expect(model.findMany).not.toHaveBeenCalled();
  });

  it("finds a published record and answers 404 for a missing one and a draft", async () => {
    const { service } = makeService(rows);

    await expect(service.bySlug("live")).resolves.toMatchObject({
      slug: "live",
      body: [{ id: "b" }],
    });
    await expect(service.bySlug("hidden")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.bySlug("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsResearchService save", () => {
  it("updates in place and clears the caches", async () => {
    const { service, model, cache } = makeService([row("a", {})]);

    const saved = await service.save("a", "a", { research: {} });

    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "a", updatedAt: LOADED },
      data: { data: { research: {} }, slug: "a" },
    });
    expect(saved.slug).toBe("a");
    expect(cache.remove).toHaveBeenCalledTimes(3);
  });

  it("creates a record that does not exist yet", async () => {
    const { service, model } = makeService();

    await service.save("new", "new", { research: {} });

    expect(model.create).toHaveBeenCalledWith({ data: { slug: "new", data: { research: {} } } });
  });

  it("answers 404 when a rename targets a missing record", async () => {
    const { service } = makeService();

    await expect(service.save("old", "new", {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a rename onto a slug in use", async () => {
    const { service, model } = makeService([row("a", {}), row("b", {})]);

    await expect(service.save("a", "b", {})).rejects.toThrow("CMS_RESEARCH_SLUG_CONFLICT");
    expect(model.update).not.toHaveBeenCalled();
  });

  it("answers 409 for a stale version, a lost record and a lost race", async () => {
    const stale = makeService([row("a", {})]);
    await expect(
      stale.service.save("a", "a", {}, new Date(LOADED.getTime() - 1)),
    ).rejects.toBeInstanceOf(ConflictException);

    const gone = makeService();
    await expect(gone.service.save("a", "a", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);
    expect(gone.model.create).not.toHaveBeenCalled();

    const race = makeService([row("a", {})]);
    race.model.update.mockRejectedValueOnce({ code: "P2025" });
    await expect(race.service.save("a", "a", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);
  });

  it("clears the featured flag on the other published initiatives", async () => {
    const other = row("other", { featured: true, title: "Other" });
    const { service, model } = makeService([row("a", {}), other]);
    model.findMany.mockResolvedValueOnce([other]);

    await service.save("a", "a", { research: { featured: true, draft: false } });

    expect(model.findMany).toHaveBeenCalledWith({
      where: { slug: { not: "a" }, data: { path: ["research", "featured"], equals: true } },
    });
    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "other" },
      data: { data: { research: { featured: false, title: "Other" }, body: [{ id: "b" }] } },
    });
  });

  it("copes with a featured record that has no research object", async () => {
    const odd: Row = { slug: "odd", data: {}, updatedAt: LOADED };
    const { service, model } = makeService([row("a", {}), odd]);
    model.findMany.mockResolvedValueOnce([odd]);

    await service.save("a", "a", { research: { featured: true } });

    expect(model.update).toHaveBeenCalledWith({ where: { slug: "odd" }, data: { data: {} } });
  });

  it("leaves the featured flag of others alone for a draft or a plain save", async () => {
    const { service, model } = makeService([row("a", {})]);

    await service.save("a", "a", { research: { featured: true, draft: true } });
    await service.save("a", "a", { research: { featured: false } });
    await service.save("a", "a", {});

    expect(model.findMany).not.toHaveBeenCalled();
  });

  it("deletes a replaced cover and keeps an unchanged one", async () => {
    const { service, storage } = makeService([row("a", { coverKey: COVER })]);

    await service.save("a", "a", { research: { coverKey: COVER_2 } });
    expect(storage.deleteFile).toHaveBeenCalledWith(COVER);

    storage.deleteFile.mockClear();
    await service.save("a", "a", { research: { coverKey: COVER } });
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it("never deletes a cover outside the research namespace and survives a failed delete", async () => {
    const seed = makeService([row("a", { coverKey: "static/seed.png" })]);
    await seed.service.save("a", "a", { research: {} });
    expect(seed.storage.deleteFile).not.toHaveBeenCalled();

    const failing = makeService([row("a", { coverKey: COVER })]);
    failing.storage.deleteFile.mockRejectedValue(new Error("down"));
    await expect(failing.service.save("a", "a", { research: {} })).resolves.toBeDefined();
  });
});

describe("CmsResearchService bootstrap and remove", () => {
  it("seeds an empty table", async () => {
    const { service, model, cache } = makeService();

    await service.bootstrap([{ slug: "a", data: { research: {} } }]);

    expect(model.upsert).toHaveBeenCalledWith({
      where: { slug: "a" },
      create: { slug: "a", data: { research: {} } },
      update: { data: { research: {} } },
    });
    expect(cache.remove).toHaveBeenCalledTimes(3);
  });

  it("does not seed when records exist", async () => {
    const { service, model } = makeService([row("a", {})]);

    await service.bootstrap([{ slug: "b", data: {} }]);

    expect(model.upsert).not.toHaveBeenCalled();
  });

  it("answers 404 when the record to remove is gone", async () => {
    const { service, cache } = makeService();

    await expect(service.remove("nope")).rejects.toBeInstanceOf(NotFoundException);
    expect(cache.remove).not.toHaveBeenCalled();
  });

  it("removes the record and its cover", async () => {
    const { service, storage, cache } = makeService([row("a", { coverKey: COVER })]);

    await service.remove("a");

    expect(storage.deleteFile).toHaveBeenCalledWith(COVER);
    expect(cache.remove).toHaveBeenCalledTimes(3);
  });

  it("skips a missing or foreign cover and survives a failed delete", async () => {
    const plain = makeService([row("a", {}), row("b", { coverKey: "static/seed.png" })]);
    await plain.service.remove("a");
    await plain.service.remove("b");
    expect(plain.storage.deleteFile).not.toHaveBeenCalled();

    const failing = makeService([row("a", { coverKey: COVER })]);
    failing.storage.deleteFile.mockRejectedValue(new Error("down"));
    await expect(failing.service.remove("a")).resolves.toBeUndefined();
  });
});
