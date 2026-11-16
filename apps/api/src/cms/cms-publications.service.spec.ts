import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsPublicationsService } from "./cms-publications.service.js";

const LOADED = new Date("2026-11-14T05:00:00.000Z");
const PAPER = "paper-study-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.pdf";
const PAPER_2 = "paper-study-1c7b2d63-4a3f-4e8b-8b2c-6d1e9f305b72.pdf";
const PHOTO = "author-2d8c3e74-5b40-4f9c-9c3d-7e2fa0416c83.webp";
const PHOTO_2 = "author-3e9d4f85-6c51-40ad-8d4e-8f30b1527d94.png";

type Row = { slug: string; data: Record<string, unknown>; updatedAt: Date };

function row(slug: string, publication: Record<string, unknown>): Row {
  return { slug, data: { publication }, updatedAt: LOADED };
}

function makeService(rows: Row[] = [], cached: Record<string, unknown> = {}) {
  const model = {
    findUnique: vi.fn(
      async ({ where }: { where: { slug: string } }) =>
        rows.find((entry) => entry.slug === where.slug) ?? null,
    ),
    findMany: vi.fn().mockResolvedValue(rows),
    create: vi.fn(async ({ data }: { data: { slug: string; data: unknown } }) => ({
      ...data,
      updatedAt: LOADED,
    })),
    update: vi.fn(async ({ data }: { data: { slug: string; data: unknown } }) => ({
      ...data,
      updatedAt: new Date(LOADED.getTime() + 1),
    })),
    delete: vi.fn(async ({ where }: { where: { slug: string } }) => {
      const found = rows.find((entry) => entry.slug === where.slug);
      if (!found) throw new Error("not found");
      return found;
    }),
  };
  const prisma = {
    cmsPublication: model,
    $transaction: vi.fn(async (work: (client: { cmsPublication: typeof model }) => unknown) =>
      work({ cmsPublication: model }),
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
  const service = new CmsPublicationsService(prisma as never, cache as never, storage as never);
  return { service, model, cache, storage };
}

describe("CmsPublicationsService reads", () => {
  const rows = [row("live", { title: "Live" }), row("hidden", { draft: true })];

  it("lists published records and caches the list", async () => {
    const { service, cache } = makeService(rows);

    const records = await service.all();

    expect(records.map((record) => record.slug)).toEqual(["live"]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:publications:v1", records, 600);
  });

  it("serves a cached list and a cached feed without a query", async () => {
    const cached = [{ slug: "c" }];
    const { service, model } = makeService(rows, {
      "cms:publications:v1": cached,
      "cms:publications:feed:v1": cached,
      "cms:publications:drafts:v1": cached,
    });

    await expect(service.all()).resolves.toBe(cached);
    await expect(service.feed()).resolves.toBe(cached);
    await expect(service.allIncludingDrafts()).resolves.toBe(cached);
    expect(model.findMany).not.toHaveBeenCalled();
  });

  it("builds the feed and the admin list on a cache miss", async () => {
    const { service, cache } = makeService(rows);

    const feed = await service.feed();
    const admin = await service.allIncludingDrafts();

    expect(feed.map((record) => record.slug)).toEqual(["live"]);
    expect(admin.map((record) => record.slug)).toEqual(["live", "hidden"]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:publications:feed:v1", feed, 600);
    expect(cache.setJson).toHaveBeenCalledWith("cms:publications:drafts:v1", admin, 600);
  });

  it("finds a published record and answers 404 for a missing one and a draft", async () => {
    const { service } = makeService(rows);

    await expect(service.bySlug("live")).resolves.toMatchObject({
      slug: "live",
      updatedAt: LOADED.toISOString(),
    });
    await expect(service.bySlug("hidden")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.bySlug("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsPublicationsService paperIsPublished", () => {
  it("allows a paper of a published record that marks it visible", async () => {
    const { service, model, cache } = makeService([
      row("a", { paperKey: PAPER, paperHidden: false }),
    ]);

    await expect(service.paperIsPublished(PAPER)).resolves.toBe(true);

    expect(model.findMany).toHaveBeenCalledWith({
      where: { data: { path: ["publication", "paperKey"], equals: PAPER } },
    });
    expect(cache.setJson).toHaveBeenCalledWith(
      `cms:publications:paper-allowed:${PAPER}`,
      true,
      600,
    );
  });

  it("refuses a hidden paper, a paper without the flag and a draft paper", async () => {
    const hidden = makeService([row("a", { paperKey: PAPER, paperHidden: true })]);
    await expect(hidden.service.paperIsPublished(PAPER)).resolves.toBe(false);

    const flagless = makeService([row("a", { paperKey: PAPER })]);
    await expect(flagless.service.paperIsPublished(PAPER)).resolves.toBe(false);

    const draft = makeService([row("a", { paperKey: PAPER, paperHidden: false, draft: true })]);
    await expect(draft.service.paperIsPublished(PAPER)).resolves.toBe(false);

    const none = makeService([]);
    await expect(none.service.paperIsPublished(PAPER)).resolves.toBe(false);
  });

  it("answers from the cache, also when the cached answer is false", async () => {
    const { service, model } = makeService([], {
      [`cms:publications:paper-allowed:${PAPER}`]: false,
      [`cms:publications:paper-allowed:${PAPER_2}`]: true,
    });

    await expect(service.paperIsPublished(PAPER)).resolves.toBe(false);
    await expect(service.paperIsPublished(PAPER_2)).resolves.toBe(true);
    expect(model.findMany).not.toHaveBeenCalled();
  });
});

describe("CmsPublicationsService save", () => {
  it("updates in place and clears the list caches and the paper answers", async () => {
    const { service, model, cache } = makeService([row("a", { paperKey: PAPER })]);

    const saved = await service.save("a", "a", { publication: { paperKey: PAPER_2 } });

    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "a", updatedAt: LOADED },
      data: { data: { publication: { paperKey: PAPER_2 } }, slug: "a" },
    });
    expect(saved.slug).toBe("a");
    const removed = cache.remove.mock.calls.map((call) => call[0]);
    expect(removed).toEqual(
      expect.arrayContaining([
        "cms:publications:v1",
        "cms:publications:drafts:v1",
        "cms:publications:feed:v1",
        `cms:publications:paper-allowed:${PAPER}`,
        `cms:publications:paper-allowed:${PAPER_2}`,
      ]),
    );
  });

  it("creates a record that does not exist yet", async () => {
    const { service, model } = makeService();

    await service.save("new", "new", { publication: {} });

    expect(model.create).toHaveBeenCalledWith({
      data: { slug: "new", data: { publication: {} } },
    });
  });

  it("answers 404 when a rename targets a missing record", async () => {
    const { service } = makeService();

    await expect(service.save("old", "new", {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a rename onto a slug in use", async () => {
    const { service, model } = makeService([row("a", {}), row("b", {})]);

    await expect(service.save("a", "b", {})).rejects.toThrow("CMS_PUBLICATION_SLUG_CONFLICT");
    expect(model.update).not.toHaveBeenCalled();
  });

  it("answers 409 for a stale version, a lost record and a lost race", async () => {
    const stale = makeService([row("a", {})]);
    await expect(
      stale.service.save("a", "a", {}, new Date(LOADED.getTime() - 1)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stale.model.update).not.toHaveBeenCalled();

    const gone = makeService();
    await expect(gone.service.save("a", "a", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);

    const race = makeService([row("a", {})]);
    race.model.update.mockRejectedValueOnce({ code: "P2025" });
    await expect(race.service.save("a", "a", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);
  });

  it("deletes a replaced paper and the author photos that are gone", async () => {
    const { service, storage } = makeService([
      row("a", { paperKey: PAPER, authors: [{ photoKey: PHOTO }, { photoKey: PHOTO_2 }, {}] }),
    ]);

    await service.save("a", "a", {
      publication: { paperKey: PAPER_2, authors: [{ photoKey: PHOTO_2 }] },
    });

    expect(storage.deleteFile.mock.calls.map((call) => call[0]).sort()).toEqual(
      [PAPER, PHOTO].sort(),
    );
  });

  it("keeps the paper when the key is unchanged and never deletes foreign keys", async () => {
    const { service, storage } = makeService([
      row("a", { paperKey: PAPER, authors: [{ photoKey: "static/who.png" }] }),
      row("b", { paperKey: "static/seed.pdf" }),
    ]);

    await service.save("a", "a", { publication: { paperKey: PAPER, authors: [] } });
    await service.save("b", "b", { publication: {} });

    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it("still saves when a stale file cannot be deleted", async () => {
    const { service, storage } = makeService([
      row("a", { paperKey: PAPER, authors: [{ photoKey: PHOTO }] }),
    ]);
    storage.deleteFile.mockRejectedValue(new Error("down"));

    await expect(service.save("a", "a", { publication: {} })).resolves.toBeDefined();
  });

  it("copes with a stored record that has no publication and loose author data", async () => {
    const { service, storage } = makeService([
      { slug: "odd", data: {}, updatedAt: LOADED },
      row("odd2", { authors: "nope", paperKey: 5 }),
    ]);

    await service.save("odd", "odd", {});
    await service.save("odd2", "odd2", {});

    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});

describe("CmsPublicationsService remove", () => {
  it("answers 404 when the record is gone", async () => {
    const { service, cache } = makeService();

    await expect(service.remove("nope")).rejects.toBeInstanceOf(NotFoundException);
    expect(cache.remove).not.toHaveBeenCalled();
  });

  it("removes the record, its paper and its author photos, and clears the caches", async () => {
    const { service, storage, cache } = makeService([
      row("a", { paperKey: PAPER, authors: [{ photoKey: PHOTO }, { photoKey: "static/x.png" }] }),
    ]);

    await service.remove("a");

    expect(storage.deleteFile.mock.calls.map((call) => call[0]).sort()).toEqual(
      [PAPER, PHOTO].sort(),
    );
    expect(cache.remove).toHaveBeenCalledWith(`cms:publications:paper-allowed:${PAPER}`);
    expect(cache.remove).toHaveBeenCalledWith("cms:publications:v1");
  });

  it("skips a record with no paper and survives failed deletes", async () => {
    const plain = makeService([row("a", {})]);
    await plain.service.remove("a");
    expect(plain.storage.deleteFile).not.toHaveBeenCalled();

    const failing = makeService([row("a", { paperKey: PAPER, authors: [{ photoKey: PHOTO }] })]);
    failing.storage.deleteFile.mockRejectedValue(new Error("down"));
    await expect(failing.service.remove("a")).resolves.toBeUndefined();
    expect(failing.storage.deleteFile).toHaveBeenCalledTimes(2);
  });
});
