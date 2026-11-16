import { NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CmsEventRegistrationsService } from "./cms-event-registrations.service.js";

const CREATED = new Date("2026-11-10T01:00:00.000Z");
const UPDATED = new Date("2026-11-11T02:00:00.000Z");

function registrationRow(slug: string, registration: Record<string, unknown>) {
  return { slug, data: { registration }, createdAt: CREATED, updatedAt: UPDATED };
}

function makeService(rows: ReturnType<typeof registrationRow>[] = []) {
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
    cmsEventRegistration: model,
    $transaction: vi.fn(async (work: (client: { cmsEventRegistration: typeof model }) => unknown) =>
      work({ cmsEventRegistration: model }),
    ),
  };
  return { service: new CmsEventRegistrationsService(prisma as never), model };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CmsEventRegistrationsService", () => {
  it("lists every registration with its timestamps, newest first", async () => {
    const { service, model } = makeService([registrationRow("reg-1", { fullName: "Ani" })]);

    const records = await service.all();

    expect(model.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
    expect(records).toEqual([
      {
        registration: { fullName: "Ani" },
        slug: "reg-1",
        createdAt: CREATED.toISOString(),
        updatedAt: UPDATED.toISOString(),
      },
    ]);
  });

  it("stores a registration under a fresh reg- slug", async () => {
    const { service, model } = makeService();

    await expect(service.create({ registration: { fullName: "Ani" } })).resolves.toEqual({
      ok: true,
    });

    const call = model.create.mock.calls[0]?.[0] as { data: { slug: string; data: unknown } };
    expect(call.data.slug).toMatch(/^reg-[0-9a-f-]{36}$/);
    expect(call.data.data).toEqual({ registration: { fullName: "Ani" } });
  });

  describe("updateState", () => {
    it("answers 404 for an unknown registration", async () => {
      const { service, model } = makeService();

      await expect(service.updateState("nope", { read: true })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(model.update).not.toHaveBeenCalled();
    });

    it("marks a registration read and stamps readAt", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-12T08:00:00.000Z"));
      const { service, model } = makeService([
        registrationRow("reg-1", { fullName: "Ani", read: false, status: "inbox" }),
      ]);

      const result = await service.updateState("reg-1", { read: true });

      expect(model.update).toHaveBeenCalledWith({
        where: { slug: "reg-1" },
        data: {
          data: {
            registration: {
              fullName: "Ani",
              read: true,
              readAt: "2026-11-12T08:00:00.000Z",
              status: "inbox",
            },
          },
        },
      });
      expect(result).toMatchObject({ slug: "reg-1", updatedAt: UPDATED.toISOString() });
    });

    it("clears readAt when a registration is marked unread", async () => {
      const { service, model } = makeService([
        registrationRow("reg-1", { read: true, readAt: "2026-11-12T08:00:00.000Z" }),
      ]);

      await service.updateState("reg-1", { read: false });

      const call = model.update.mock.calls[0]?.[0] as {
        data: { data: { registration: Record<string, unknown> } };
      };
      expect(call.data.data.registration).toMatchObject({ read: false, readAt: null });
    });

    it("changes only the status and leaves the read state alone", async () => {
      const { service, model } = makeService([
        registrationRow("reg-1", { read: true, readAt: "x", status: "inbox" }),
      ]);

      await service.updateState("reg-1", { status: "archived" });

      const call = model.update.mock.calls[0]?.[0] as {
        data: { data: { registration: Record<string, unknown> } };
      };
      expect(call.data.data.registration).toEqual({ read: true, readAt: "x", status: "archived" });
    });
  });

  describe("bulk", () => {
    it("deletes the named registrations and reports the count", async () => {
      const { service, model } = makeService();

      await expect(service.bulk(["a", "b"], "delete")).resolves.toEqual({ deletedCount: 2 });
      expect(model.deleteMany).toHaveBeenCalledWith({ where: { slug: { in: ["a", "b"] } } });
    });

    it.each([
      ["archive", { status: "archived" }],
      ["unarchive", { status: "inbox" }],
      ["markUnread", { read: false, readAt: null }],
    ] as const)(
      "applies %s to only the named registrations that exist",
      async (action, expected) => {
        const { service, model } = makeService([
          registrationRow("a", { name: "A" }),
          registrationRow("b", { name: "B" }),
          registrationRow("other", { name: "Other" }),
        ]);

        await expect(service.bulk(["a", "b", "ghost"], action)).resolves.toMatchObject({
          deletedCount: 0,
        });

        expect(model.findMany).toHaveBeenCalledWith({
          where: { slug: { in: ["a", "b", "ghost"] } },
        });
        expect(model.update).toHaveBeenCalledTimes(2);
        const calls = model.update.mock.calls.map(
          (call) =>
            call[0] as {
              where: { slug: string };
              data: { data: { registration: Record<string, unknown> } };
            },
        );
        expect(calls.map((call) => call.where.slug)).toEqual(["a", "b"]);
        expect(calls[0]?.data.data.registration).toEqual({ name: "A", ...expected });
        expect(calls[1]?.data.data.registration).toEqual({ name: "B", ...expected });
      },
    );

    it("stamps readAt for markRead", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-12T09:00:00.000Z"));
      const { service, model } = makeService([
        registrationRow("a", {}),
        registrationRow("other", {}),
      ]);

      await service.bulk(["a"], "markRead");
      expect(model.findMany).toHaveBeenCalledWith({ where: { slug: { in: ["a"] } } });
      expect(model.update).toHaveBeenCalledTimes(1);
      expect(model.update.mock.calls[0]?.[0]).toMatchObject({ where: { slug: "a" } });

      const call = model.update.mock.calls[0]?.[0] as {
        data: { data: { registration: Record<string, unknown> } };
      };
      expect(call.data.data.registration).toEqual({
        read: true,
        readAt: "2026-11-12T09:00:00.000Z",
      });
    });
  });
});
