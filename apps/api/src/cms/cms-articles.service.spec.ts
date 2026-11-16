// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsArticlesService } from "./cms-articles.service.js";

const LOADED = new Date("2026-11-14T05:00:00.000Z");

type Row = { slug: string; data: Record<string, unknown>; updatedAt: Date };

function row(slug: string, article: Record<string, unknown>): Row {
  return { slug, data: { article, content: [{ id: "b" }] }, updatedAt: LOADED };
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
    delete: vi.fn().mockResolvedValue({}),
  };
  const prisma = {
    cmsArticle: model,
    $transaction: vi.fn(async (work: (client: { cmsArticle: typeof model }) => unknown) =>
      work({ cmsArticle: model }),
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
  return { service: new CmsArticlesService(prisma as never, cache as never), model, cache };
}

describe("CmsArticlesService reads", () => {
  const rows = [row("live", { title: "Live" }), row("hidden", { draft: true })];

  it("lists published articles and caches the list", async () => {
    const { service, cache } = makeService(rows);

    const records = await service.all();

    expect(records.map((record) => record.slug)).toEqual(["live"]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:articles:v1", records, 600);
  });

  it("builds a feed without the document", async () => {
    const { service, cache } = makeService(rows);

    const feed = await service.feed();

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ slug: "live", content: [] });
    expect(cache.setJson).toHaveBeenCalledWith("cms:articles:feed:v1", feed, 600);
  });

  it("lists drafts for the admin", async () => {
    const { service, cache } = makeService(rows);

    const records = await service.allIncludingDrafts();

    expect(records.map((record) => record.slug)).toEqual(["live", "hidden"]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:articles:drafts:v1", records, 600);
  });

  it("serves every cached list without a query", async () => {
    const cached = [{ slug: "c" }];
    const { service, model } = makeService(rows, {
      "cms:articles:v1": cached,
      "cms:articles:feed:v1": cached,
      "cms:articles:drafts:v1": cached,
    });

    await expect(service.all()).resolves.toBe(cached);
    await expect(service.feed()).resolves.toBe(cached);
    await expect(service.allIncludingDrafts()).resolves.toBe(cached);
    expect(model.findMany).not.toHaveBeenCalled();
  });

  it("finds a published article and answers 404 for a missing one and a draft", async () => {
    const { service } = makeService(rows);

    await expect(service.bySlug("live")).resolves.toMatchObject({
      slug: "live",
      updatedAt: LOADED.toISOString(),
      content: [{ id: "b" }],
    });
    await expect(service.bySlug("hidden")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.bySlug("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsArticlesService save and remove", () => {
  it("answers 404 when a rename targets a missing article", async () => {
    const { service, model } = makeService();

    await expect(service.save("old", "new", {})).rejects.toBeInstanceOf(NotFoundException);
    expect(model.create).not.toHaveBeenCalled();
  });

  it("refuses a rename onto a slug in use and allows a free one", async () => {
    const { service, model } = makeService([row("a", {}), row("b", {})]);

    await expect(service.save("a", "b", {})).rejects.toThrow("CMS_ARTICLE_SLUG_CONFLICT");
    expect(model.update).not.toHaveBeenCalled();

    const saved = await service.save("a", "c", { article: { title: "C" } });
    expect(saved.slug).toBe("c");
    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "a", updatedAt: LOADED },
      data: { data: { article: { title: "C" } }, slug: "c" },
    });
  });

  it("answers 409 for a stale version on a rename too", async () => {
    const { service } = makeService([row("a", {})]);

    await expect(service.save("a", "c", {}, new Date(LOADED.getTime() - 1))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("removes an article and clears the three caches", async () => {
    const { service, model, cache } = makeService();

    await service.remove("a");

    expect(model.delete).toHaveBeenCalledWith({ where: { slug: "a" } });
    expect(cache.remove).toHaveBeenCalledTimes(3);
  });

  it("answers 404 when the article to remove is gone", async () => {
    const { service, model, cache } = makeService();
    model.delete.mockRejectedValue(new Error("not found"));

    await expect(service.remove("a")).rejects.toBeInstanceOf(NotFoundException);
    expect(cache.remove).not.toHaveBeenCalled();
  });
});
