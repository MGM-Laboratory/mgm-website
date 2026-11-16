// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsEventsService } from "./cms-events.service.js";

const LOADED = new Date("2026-11-14T05:00:00.000Z");

function row(slug: string, data: Record<string, unknown>, updatedAt = LOADED) {
  return { slug, data, updatedAt };
}

function makeService(options: { rows?: ReturnType<typeof row>[]; cached?: unknown } = {}) {
  const rows = options.rows ?? [];
  const model = {
    findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
      return rows.find((entry) => entry.slug === where.slug) ?? null;
    }),
    findMany: vi.fn().mockResolvedValue(rows),
    count: vi.fn().mockResolvedValue(rows.length),
    create: vi.fn(async ({ data }: { data: { slug: string; data: unknown } }) => ({
      ...data,
      updatedAt: LOADED,
    })),
    update: vi.fn(async ({ data }: { data: { slug: string; data: unknown } }) => ({
      ...data,
      updatedAt: new Date(LOADED.getTime() + 1),
    })),
    upsert: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
  const prisma = {
    cmsEvent: model,
    $transaction: vi.fn(async (work: unknown) =>
      typeof work === "function"
        ? (work as (client: { cmsEvent: typeof model }) => unknown)({ cmsEvent: model })
        : Promise.all(work as Promise<unknown>[]),
    ),
  };
  const cache = {
    getJson: vi.fn().mockResolvedValue(options.cached ?? null),
    setJson: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CmsEventsService(prisma as never, cache as never);
  return { service, model, cache, prisma };
}

describe("CmsEventsService reads", () => {
  it("lists published events only and caches the list", async () => {
    const { service, cache } = makeService({
      rows: [row("live", { title: "Live" }), row("hidden", { title: "Hidden", draft: true })],
    });

    const records = await service.all();

    expect(records.map((record) => record.slug)).toEqual(["live"]);
    expect(records[0]).toMatchObject({ title: "Live", updatedAt: LOADED.toISOString() });
    expect(cache.setJson).toHaveBeenCalledWith("cms:events:v1", records, 600);
  });

  it("returns the cached public list without reading the database", async () => {
    const cached = [{ slug: "cached", updatedAt: "x" }];
    const { service, model } = makeService({ cached });

    await expect(service.all()).resolves.toBe(cached);
    expect(model.findMany).not.toHaveBeenCalled();
  });

  it("lists drafts for the admin workspace and caches that list apart", async () => {
    const { service, cache } = makeService({
      rows: [row("live", {}), row("hidden", { draft: true })],
    });

    const records = await service.allIncludingDrafts();

    expect(records.map((record) => record.slug)).toEqual(["live", "hidden"]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:events:drafts:v1", records, 600);
  });

  it("returns the cached admin list without reading the database", async () => {
    const cached = [{ slug: "cached" }];
    const { service, model } = makeService({ cached });

    await expect(service.allIncludingDrafts()).resolves.toBe(cached);
    expect(model.findMany).not.toHaveBeenCalled();
  });

  it("finds a published event by slug", async () => {
    const { service } = makeService({ rows: [row("live", { title: "Live" })] });

    await expect(service.bySlug("live")).resolves.toEqual({
      title: "Live",
      slug: "live",
      updatedAt: LOADED.toISOString(),
    });
  });

  it("answers 404 for a missing event and for a draft", async () => {
    const { service } = makeService({ rows: [row("hidden", { draft: true })] });

    await expect(service.bySlug("missing")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.bySlug("hidden")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsEventsService save", () => {
  it("updates a record in place and clears both caches", async () => {
    const { service, model, cache } = makeService({ rows: [row("a", { title: "A" })] });

    const saved = await service.save("a", "a", { title: "New" });

    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "a", updatedAt: LOADED },
      data: { data: { title: "New" }, slug: "a" },
    });
    expect(saved).toMatchObject({ title: "New", slug: "a" });
    expect(cache.remove).toHaveBeenCalledWith("cms:events:v1");
    expect(cache.remove).toHaveBeenCalledWith("cms:events:drafts:v1");
  });

  it("creates a record that does not exist yet", async () => {
    const { service, model } = makeService();

    const saved = await service.save("new", "new", { title: "New" });

    expect(model.create).toHaveBeenCalledWith({ data: { slug: "new", data: { title: "New" } } });
    expect(saved).toMatchObject({ slug: "new", updatedAt: LOADED.toISOString() });
  });

  it("answers 404 when a rename targets a record that does not exist", async () => {
    const { service, model } = makeService();

    await expect(service.save("old", "new", {})).rejects.toBeInstanceOf(NotFoundException);
    expect(model.create).not.toHaveBeenCalled();
  });

  it("refuses a rename onto a slug that another event uses", async () => {
    const { service, model } = makeService({ rows: [row("a", {}), row("b", {})] });

    await expect(service.save("a", "b", {})).rejects.toThrow("CMS_EVENT_SLUG_CONFLICT");
    expect(model.update).not.toHaveBeenCalled();
  });

  it("renames a record when the new slug is free", async () => {
    const { service, model } = makeService({ rows: [row("a", {})] });

    const saved = await service.save("a", "c", { title: "C" });

    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "a", updatedAt: LOADED },
      data: { data: { title: "C" }, slug: "c" },
    });
    expect(saved.slug).toBe("c");
  });

  it("answers 409 for a stale version and writes nothing", async () => {
    const { service, model, cache } = makeService({ rows: [row("a", {})] });

    await expect(
      service.save("a", "a", {}, new Date(LOADED.getTime() - 1000)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(model.update).not.toHaveBeenCalled();
    expect(cache.remove).not.toHaveBeenCalled();
  });

  it("answers 409 and does not create a record that the editor already lost", async () => {
    const { service, model } = makeService();

    await expect(service.save("a", "a", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);
    expect(model.create).not.toHaveBeenCalled();
  });

  it("answers 409 when another save wins between the read and the update", async () => {
    const { service, model } = makeService({ rows: [row("a", {})] });
    model.update.mockRejectedValueOnce({ code: "P2025" });

    await expect(service.save("a", "a", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("CmsEventsService bootstrap and remove", () => {
  it("seeds an empty table once and returns the public list", async () => {
    const { service, model, cache } = makeService();
    cache.getJson.mockResolvedValue(null);

    await service.bootstrap([{ slug: "a", data: { title: "A" } }]);

    expect(model.upsert).toHaveBeenCalledWith({
      where: { slug: "a" },
      create: { slug: "a", data: { title: "A" } },
      update: { data: { title: "A" } },
    });
    expect(cache.remove).toHaveBeenCalledTimes(2);
  });

  it("does not seed when events already exist", async () => {
    const { service, model } = makeService({ rows: [row("a", {})] });

    await service.bootstrap([{ slug: "b", data: {} }]);

    expect(model.upsert).not.toHaveBeenCalled();
  });

  it("removes an event and clears the caches", async () => {
    const { service, model, cache } = makeService();

    await service.remove("a");

    expect(model.delete).toHaveBeenCalledWith({ where: { slug: "a" } });
    expect(cache.remove).toHaveBeenCalledTimes(2);
  });

  it("answers 404 when the event to remove is gone", async () => {
    const { service, model, cache } = makeService();
    model.delete.mockRejectedValueOnce(new Error("not found"));

    await expect(service.remove("a")).rejects.toBeInstanceOf(NotFoundException);
    expect(cache.remove).not.toHaveBeenCalled();
  });
});
