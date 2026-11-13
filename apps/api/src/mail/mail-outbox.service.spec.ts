import { describe, expect, it, vi } from "vitest";

import { backoffMinutes, MailOutboxService } from "./mail-outbox.service.js";

const NOW = new Date("2026-11-14T00:00:00Z");
const MAIL = { to: ["lab@example.test"], subject: "Hello", html: "<p>Hi</p>" };

function makeService(
  rows: Array<{ id: string; params: unknown; attempts: number }>,
  failing = false,
) {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue(rows),
    mailOutbox: {
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const mail = {
    sendEmail: failing
      ? vi.fn().mockRejectedValue(new Error("All mail providers failed"))
      : vi.fn().mockResolvedValue(undefined),
  };
  const service = new MailOutboxService(prisma as never, mail as never);
  return { service, prisma, mail };
}

describe("backoffMinutes", () => {
  it("grows with each failure and repeats the last wait", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffMinutes)).toEqual([
      1, 5, 30, 120, 360, 720, 720, 720,
    ]);
  });
});

describe("MailOutboxService", () => {
  it("stores a mail and returns its id", async () => {
    const { service, prisma } = makeService([]);
    const id = await service.enqueue(MAIL);

    expect(prisma.mailOutbox.create).toHaveBeenCalledWith({ data: { id, params: MAIL } });
  });

  it("sends a claimed mail and deletes its row", async () => {
    const { service, prisma, mail } = makeService([{ id: "a", params: MAIL, attempts: 1 }]);
    await service.processDue(NOW);

    expect(mail.sendEmail).toHaveBeenCalledWith(MAIL);
    expect(prisma.mailOutbox.delete).toHaveBeenCalledWith({ where: { id: "a" } });
    expect(prisma.mailOutbox.update).not.toHaveBeenCalled();
  });

  it("keeps a failed mail and schedules the next try with the backoff", async () => {
    const { service, prisma } = makeService([{ id: "a", params: MAIL, attempts: 2 }], true);
    await service.processDue(NOW);

    expect(prisma.mailOutbox.delete).not.toHaveBeenCalled();
    const update = prisma.mailOutbox.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "a" });
    expect(update.data.lastError).toBe("All mail providers failed");
    expect(update.data.nextAttemptAt).toEqual(new Date(NOW.getTime() + 5 * 60_000));
    expect(update.data.status).toBeUndefined();
  });

  it("marks a mail as failed after the last attempt", async () => {
    const { service, prisma } = makeService([{ id: "a", params: MAIL, attempts: 8 }], true);
    await service.processDue(NOW);

    const update = prisma.mailOutbox.update.mock.calls[0][0];
    expect(update.data.status).toBe("failed");
    expect(update.data.nextAttemptAt).toBeUndefined();
  });

  it("claims with a lease and skips rows that another copy holds", async () => {
    const { service, prisma } = makeService([]);
    await service.processDue(NOW);

    const query = String(prisma.$queryRaw.mock.calls[0][0]);
    expect(query).toContain("FOR UPDATE SKIP LOCKED");
    expect(prisma.$queryRaw.mock.calls[0]).toContainEqual(new Date(NOW.getTime() + 5 * 60_000));
  });

  it("does not start a second run while one is going", async () => {
    const { service, prisma } = makeService([]);
    await Promise.all([service.processDue(NOW), service.processDue(NOW)]);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("deletes failed rows older than a month", async () => {
    const { service, prisma } = makeService([]);
    await service.processDue(NOW);

    const where = prisma.mailOutbox.deleteMany.mock.calls[0][0].where;
    expect(where.status).toBe("failed");
    expect(where.createdAt.lt.getTime()).toBe(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
  });
});
