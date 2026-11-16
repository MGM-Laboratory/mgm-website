import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CmsJobsService, isOpenJob, todayUtc } from "./cms-jobs.service.js";

const LOADED = new Date("2026-11-14T05:00:00.000Z");

type Row = { slug: string; data: Record<string, unknown>; updatedAt: Date };

function row(slug: string, job: Record<string, unknown>): Row {
  return { slug, data: { job, content: [{ id: "b" }] }, updatedAt: LOADED };
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
    cmsJobPosting: model,
    $transaction: vi.fn(async (work: (client: { cmsJobPosting: typeof model }) => unknown) =>
      work({ cmsJobPosting: model }),
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
  return { service: new CmsJobsService(prisma as never, cache as never), model, cache };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isOpenJob", () => {
  it("is open for a published role whose deadline is today or later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T23:59:59.000Z"));

    expect(todayUtc()).toBe("2026-11-20");
    expect(isOpenJob({ job: { status: "published", deadline: "2026-11-20" } })).toBe(true);
    expect(isOpenJob({ job: { status: "published", deadline: "2026-12-01" } })).toBe(true);
  });

  it("is closed after the deadline, for other statuses and for odd records", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T00:00:00.000Z"));

    expect(isOpenJob({ job: { status: "published", deadline: "2026-11-19" } })).toBe(false);
    expect(isOpenJob({ job: { status: "draft", deadline: "2026-12-01" } })).toBe(false);
    expect(isOpenJob({ job: { status: "closed", deadline: "2026-12-01" } })).toBe(false);
    expect(isOpenJob({ job: { status: "published" } })).toBe(false);
    expect(isOpenJob({ job: { status: "published", deadline: 20261201 } })).toBe(false);
    expect(isOpenJob({})).toBe(false);
  });
});

describe("CmsJobsService reads", () => {
  const open = { status: "published", deadline: "2999-01-01" };
  const rows = [
    row("open", open),
    row("closed", { status: "closed", deadline: "2999-01-01" }),
    row("draft", { status: "draft", deadline: "2999-01-01" }),
  ];

  it("lists open roles without their documents and caches the list", async () => {
    const { service, cache } = makeService(rows);

    const records = await service.all();

    expect(records.map((record) => record.slug)).toEqual(["open"]);
    expect(records[0]?.content).toEqual([]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:jobs:v1", records, 600);
  });

  it("serves the cached list without a query", async () => {
    const cached = [{ slug: "c" }];
    const { service, model } = makeService(rows, { "cms:jobs:v1": cached });

    await expect(service.all()).resolves.toBe(cached);
    expect(model.findMany).not.toHaveBeenCalled();
  });

  it("lists every role with its document for the admin and caches that list apart", async () => {
    const { service, cache } = makeService(rows);

    const records = await service.allIncludingDrafts();

    expect(records.map((record) => record.slug)).toEqual(["open", "closed", "draft"]);
    expect(records[0]?.content).toEqual([{ id: "b" }]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:jobs:admin:v1", records, 600);

    const cached = [{ slug: "c" }];
    const again = makeService(rows, { "cms:jobs:admin:v1": cached });
    await expect(again.service.allIncludingDrafts()).resolves.toBe(cached);
  });

  it("resolves an open or closed role by slug and hides a draft", async () => {
    const { service } = makeService(rows);

    await expect(service.bySlug("open")).resolves.toMatchObject({
      slug: "open",
      updatedAt: LOADED.toISOString(),
    });
    await expect(service.bySlug("closed")).resolves.toMatchObject({ slug: "closed" });
    await expect(service.bySlug("draft")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.bySlug("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsJobsService save and remove", () => {
  it("updates in place with the version it read and clears both caches", async () => {
    const { service, model, cache } = makeService([row("a", {})]);

    const saved = await service.save("a", "a", { job: {} });

    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "a", updatedAt: LOADED },
      data: { data: { job: {} }, slug: "a" },
    });
    expect(saved.slug).toBe("a");
    expect(cache.remove).toHaveBeenCalledTimes(2);
  });

  it("creates a role that does not exist yet", async () => {
    const { service, model } = makeService();

    await service.save("new", "new", { job: {} });

    expect(model.create).toHaveBeenCalledWith({ data: { slug: "new", data: { job: {} } } });
  });

  it("answers 404 when a rename targets a missing role", async () => {
    const { service } = makeService();

    await expect(service.save("old", "new", {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a rename onto a slug in use and allows a free one", async () => {
    const { service, model } = makeService([row("a", {}), row("b", {})]);

    await expect(service.save("a", "b", {})).rejects.toThrow("CMS_JOB_SLUG_CONFLICT");
    expect(model.update).not.toHaveBeenCalled();

    await expect(service.save("a", "c", {})).resolves.toMatchObject({ slug: "c" });
  });

  it("answers 409 for a stale version, a lost role and a lost race", async () => {
    const stale = makeService([row("a", {})]);
    await expect(
      stale.service.save("a", "a", {}, new Date(LOADED.getTime() - 1)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stale.model.update).not.toHaveBeenCalled();

    const gone = makeService();
    await expect(gone.service.save("a", "a", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);
    expect(gone.model.create).not.toHaveBeenCalled();

    const race = makeService([row("a", {})]);
    race.model.update.mockRejectedValueOnce({ code: "P2025" });
    await expect(race.service.save("a", "a", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);
  });

  it("removes a role and clears the caches", async () => {
    const { service, model, cache } = makeService();

    await service.remove("a");

    expect(model.delete).toHaveBeenCalledWith({ where: { slug: "a" } });
    expect(cache.remove).toHaveBeenCalledTimes(2);
  });

  it("answers 404 when the role to remove is gone", async () => {
    const { service, model, cache } = makeService();
    model.delete.mockRejectedValue(new Error("not found"));

    await expect(service.remove("a")).rejects.toBeInstanceOf(NotFoundException);
    expect(cache.remove).not.toHaveBeenCalled();
  });
});
