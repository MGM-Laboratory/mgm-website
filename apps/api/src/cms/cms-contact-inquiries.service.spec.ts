// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CmsContactInquiriesService } from "./cms-contact-inquiries.service.js";

const CREATED = new Date("2026-11-10T01:00:00.000Z");
const UPDATED = new Date("2026-11-11T02:00:00.000Z");

function inquiryRow(slug: string, inquiry: Record<string, unknown>) {
  return { slug, data: { inquiry }, createdAt: CREATED, updatedAt: UPDATED };
}

function makeService(rows: ReturnType<typeof inquiryRow>[] = []) {
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
    deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
  };
  const prisma = {
    cmsContactInquiry: model,
    $transaction: vi.fn(async (work: (client: { cmsContactInquiry: typeof model }) => unknown) =>
      work({ cmsContactInquiry: model }),
    ),
  };
  return { service: new CmsContactInquiriesService(prisma as never), model };
}

type UpdateCall = { data: { data: { inquiry: Record<string, unknown> } } };

afterEach(() => {
  vi.useRealTimers();
});

describe("CmsContactInquiriesService", () => {
  it("lists the inbox newest first with timestamps", async () => {
    const { service, model } = makeService([inquiryRow("inquiry-1", { name: "Ani" })]);

    const records = await service.all();

    expect(model.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
    expect(records).toEqual([
      {
        inquiry: { name: "Ani" },
        slug: "inquiry-1",
        createdAt: CREATED.toISOString(),
        updatedAt: UPDATED.toISOString(),
      },
    ]);
  });

  it("stores an inquiry under a fresh inquiry- slug", async () => {
    const { service, model } = makeService();

    await expect(service.create({ inquiry: {} })).resolves.toEqual({ ok: true });

    const call = model.create.mock.calls[0]?.[0] as { data: { slug: string } };
    expect(call.data.slug).toMatch(/^inquiry-[0-9a-f-]{36}$/);
  });

  describe("updateState", () => {
    it("answers 404 for an unknown inquiry", async () => {
      const { service, model } = makeService();

      await expect(service.updateState("nope", { read: true })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(model.update).not.toHaveBeenCalled();
    });

    it("marks read with a time stamp and unread without one", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-12T08:00:00.000Z"));
      const { service, model } = makeService([inquiryRow("i", { status: "inbox" })]);

      const result = await service.updateState("i", { read: true });
      expect((model.update.mock.calls[0]?.[0] as UpdateCall).data.data.inquiry).toEqual({
        status: "inbox",
        read: true,
        readAt: "2026-11-12T08:00:00.000Z",
      });
      expect(result).toMatchObject({ slug: "i", updatedAt: UPDATED.toISOString() });

      await service.updateState("i", { read: false });
      expect((model.update.mock.calls[1]?.[0] as UpdateCall).data.data.inquiry).toMatchObject({
        read: false,
        readAt: null,
      });
    });

    it("changes only the status when only the status is given", async () => {
      const { service, model } = makeService([inquiryRow("i", { read: true, readAt: "x" })]);

      await service.updateState("i", { status: "archived" });

      expect((model.update.mock.calls[0]?.[0] as UpdateCall).data.data.inquiry).toEqual({
        read: true,
        readAt: "x",
        status: "archived",
      });
    });
  });

  describe("bulk", () => {
    it("deletes the named inquiries and reports the count", async () => {
      const { service, model } = makeService();

      await expect(service.bulk(["a", "b"], "delete")).resolves.toEqual({ deletedCount: 2 });
      expect(model.deleteMany).toHaveBeenCalledWith({ where: { slug: { in: ["a", "b"] } } });
    });

    it.each([
      ["archive", { status: "archived" }],
      ["unarchive", { status: "inbox" }],
      ["markUnread", { read: false, readAt: null }],
    ] as const)("applies %s to only the named inquiries that exist", async (action, expected) => {
      const { service, model } = makeService([
        inquiryRow("a", { name: "A" }),
        inquiryRow("b", { name: "B" }),
        inquiryRow("other", { name: "Other" }),
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
            data: { data: { inquiry: Record<string, unknown> } };
          },
      );
      expect(calls.map((call) => call.where.slug)).toEqual(["a", "b"]);
      expect(calls[0]?.data.data.inquiry).toEqual({ name: "A", ...expected });
      expect(calls[1]?.data.data.inquiry).toEqual({ name: "B", ...expected });
    });

    it("stamps readAt for markRead", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-12T09:00:00.000Z"));
      const { service, model } = makeService([inquiryRow("a", {}), inquiryRow("other", {})]);

      await service.bulk(["a"], "markRead");
      expect(model.findMany).toHaveBeenCalledWith({ where: { slug: { in: ["a"] } } });
      expect(model.update).toHaveBeenCalledTimes(1);
      expect(model.update.mock.calls[0]?.[0]).toMatchObject({ where: { slug: "a" } });

      expect((model.update.mock.calls[0]?.[0] as UpdateCall).data.data.inquiry).toEqual({
        read: true,
        readAt: "2026-11-12T09:00:00.000Z",
      });
    });

    it("changes nothing for an action that the type does not know", async () => {
      const { service, model } = makeService([inquiryRow("a", { name: "A" })]);

      await service.bulk(["a"], "explode" as never);

      expect((model.update.mock.calls[0]?.[0] as UpdateCall).data.data.inquiry).toEqual({
        name: "A",
      });
    });
  });
});
