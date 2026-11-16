import { NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CmsJobApplicationsService } from "./cms-jobs-applications.service.js";

const CREATED = new Date("2026-11-10T01:00:00.000Z");
const UPDATED = new Date("2026-11-11T02:00:00.000Z");

function applicationRow(slug: string, application: Record<string, unknown>) {
  return { slug, data: { application }, createdAt: CREATED, updatedAt: UPDATED };
}

function makeService(rows: ReturnType<typeof applicationRow>[] = []) {
  const model = {
    findMany: vi.fn(async (args?: { where?: { slug?: { in?: string[] } } }) => {
      const ids = args?.where?.slug?.in;
      return ids ? rows.filter((entry) => ids.includes(entry.slug)) : rows;
    }),
    findUnique: vi.fn(
      async ({ where }: { where: { slug: string } }) =>
        rows.find((entry) => entry.slug === where.slug) ?? null,
    ),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn(
      async ({ where, data }: { where: { slug: string }; data: { data: unknown } }) => ({
        slug: where.slug,
        data: data.data,
        updatedAt: UPDATED,
      }),
    ),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = {
    cmsJobApplication: model,
    $transaction: vi.fn(async (work: (client: { cmsJobApplication: typeof model }) => unknown) =>
      work({ cmsJobApplication: model }),
    ),
  };
  return { service: new CmsJobApplicationsService(prisma as never), model };
}

type UpdateCall = { data: { data: { application: Record<string, unknown> } } };

afterEach(() => {
  vi.useRealTimers();
});

describe("CmsJobApplicationsService reads", () => {
  it("lists the inbox newest first with timestamps", async () => {
    const { service, model } = makeService([applicationRow("app-1", { fullName: "Ani" })]);

    const records = await service.all();

    expect(model.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
    expect(records).toEqual([
      {
        application: { fullName: "Ani" },
        slug: "app-1",
        createdAt: CREATED.toISOString(),
        updatedAt: UPDATED.toISOString(),
      },
    ]);
  });

  it("finds one application and answers 404 for an unknown one", async () => {
    const { service } = makeService([applicationRow("app-1", { fullName: "Ani" })]);

    await expect(service.bySlug("app-1")).resolves.toMatchObject({ slug: "app-1" });
    await expect(service.bySlug("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("stores an application under a fresh app- slug", async () => {
    const { service, model } = makeService();

    await expect(service.create({ application: {} })).resolves.toEqual({ ok: true });

    const call = model.create.mock.calls[0]?.[0] as { data: { slug: string } };
    expect(call.data.slug).toMatch(/^app-[0-9a-f-]{36}$/);
  });
});

describe("CmsJobApplicationsService updateState", () => {
  it("answers 404 for an unknown application", async () => {
    const { service, model } = makeService();

    await expect(service.updateState("nope", { read: true })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(model.update).not.toHaveBeenCalled();
  });

  it("marks read with a time stamp and unread without one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T08:00:00.000Z"));
    const { service, model } = makeService([applicationRow("app-1", { status: "inbox" })]);

    const result = await service.updateState("app-1", { read: true });
    expect((model.update.mock.calls[0]?.[0] as UpdateCall).data.data.application).toEqual({
      status: "inbox",
      read: true,
      readAt: "2026-11-12T08:00:00.000Z",
    });
    expect(result).toMatchObject({ slug: "app-1", updatedAt: UPDATED.toISOString() });

    await service.updateState("app-1", { read: false });
    expect((model.update.mock.calls[1]?.[0] as UpdateCall).data.data.application).toMatchObject({
      read: false,
      readAt: null,
    });
  });

  it("changes only the status when only the status is given", async () => {
    const { service, model } = makeService([applicationRow("app-1", { read: true, readAt: "x" })]);

    await service.updateState("app-1", { status: "archived" });

    expect((model.update.mock.calls[0]?.[0] as UpdateCall).data.data.application).toEqual({
      read: true,
      readAt: "x",
      status: "archived",
    });
  });
});

describe("CmsJobApplicationsService bulk", () => {
  it("deletes the applications and returns the CV keys of the ones that existed", async () => {
    const { service, model } = makeService([
      applicationRow("a", { cvKey: "cv-1.pdf" }),
      applicationRow("b", { cvKey: 42 }),
      applicationRow("c", {}),
    ]);

    const result = await service.bulk(["a", "b", "c", "ghost"], "delete");

    expect(result).toEqual({ deletedCount: 3, deletedCvKeys: ["cv-1.pdf"] });
    expect(model.deleteMany).toHaveBeenCalledWith({
      where: { slug: { in: ["a", "b", "c", "ghost"] } },
    });
  });

  it("copes with a stored record that has no application", async () => {
    const { service } = makeService([
      { slug: "a", data: {} as never, createdAt: CREATED, updatedAt: UPDATED },
    ]);

    await expect(service.bulk(["a"], "delete")).resolves.toEqual({
      deletedCount: 1,
      deletedCvKeys: [],
    });
  });

  it.each([
    ["archive", { status: "archived" }],
    ["unarchive", { status: "inbox" }],
    ["markUnread", { read: false, readAt: null }],
  ] as const)("applies %s to only the named applications that exist", async (action, expected) => {
    const { service, model } = makeService([
      applicationRow("a", { name: "A" }),
      applicationRow("b", { name: "B" }),
      applicationRow("other", { name: "Other" }),
    ]);

    await expect(service.bulk(["a", "b", "ghost"], action)).resolves.toMatchObject({
      deletedCount: 0,
    });

    expect(model.findMany).toHaveBeenCalledWith({ where: { slug: { in: ["a", "b", "ghost"] } } });
    expect(model.update).toHaveBeenCalledTimes(2);
    const calls = model.update.mock.calls.map(
      (call) =>
        call[0] as {
          where: { slug: string };
          data: { data: { application: Record<string, unknown> } };
        },
    );
    expect(calls.map((call) => call.where.slug)).toEqual(["a", "b"]);
    expect(calls[0]?.data.data.application).toEqual({ name: "A", ...expected });
    expect(calls[1]?.data.data.application).toEqual({ name: "B", ...expected });
  });

  it("stamps readAt for markRead", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T09:00:00.000Z"));
    const { service, model } = makeService([applicationRow("a", {}), applicationRow("other", {})]);

    await service.bulk(["a"], "markRead");
    expect(model.findMany).toHaveBeenCalledWith({ where: { slug: { in: ["a"] } } });
    expect(model.update).toHaveBeenCalledTimes(1);
    expect(model.update.mock.calls[0]?.[0]).toMatchObject({ where: { slug: "a" } });

    expect((model.update.mock.calls[0]?.[0] as UpdateCall).data.data.application).toEqual({
      read: true,
      readAt: "2026-11-12T09:00:00.000Z",
    });
  });
});
