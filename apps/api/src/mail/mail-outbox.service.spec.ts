import { describe, expect, it, vi } from "vitest";

import { backoffMinutes, MailOutboxService } from "./mail-outbox.service.js";

const NOW = new Date("2026-11-14T00:00:00Z");
const MAIL = { to: ["lab@example.test"], subject: "Hello", html: "<p>Hi</p>" };

type Row = { id: string; params: unknown; attempts: number };

function makeService(
  rows: Row[],
  options: { sendFails?: boolean; deleteFails?: boolean; slowSend?: Promise<void> } = {},
) {
  const queue = [...rows];
  const prisma = {
    $queryRaw: vi.fn(async () => {
      const next = queue.shift();
      return next ? [next] : [];
    }),
    mailOutbox: {
      create: vi.fn().mockResolvedValue({}),
      delete: options.deleteFails
        ? vi.fn().mockRejectedValue(new Error("connection closed"))
        : vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const mail = {
    sendEmail: options.sendFails
      ? vi.fn().mockRejectedValue(new Error("All mail providers failed"))
      : vi.fn(async () => {
          await options.slowSend;
        }),
  };
  const service = new MailOutboxService(prisma as never, mail as never);
  service.now = () => NOW;
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
    await service.processDue();

    expect(mail.sendEmail).toHaveBeenCalledWith(MAIL);
    expect(prisma.mailOutbox.delete).toHaveBeenCalledWith({ where: { id: "a" } });
    expect(prisma.mailOutbox.update).not.toHaveBeenCalled();
  });

  it("reads the params again when the driver returns them as text", async () => {
    const { service, mail } = makeService([{ id: "a", params: JSON.stringify(MAIL), attempts: 1 }]);
    await service.processDue();

    expect(mail.sendEmail).toHaveBeenCalledWith(MAIL);
  });

  it("claims one row at a time and stops when none is due", async () => {
    const { service, prisma, mail } = makeService([
      { id: "a", params: MAIL, attempts: 1 },
      { id: "b", params: MAIL, attempts: 1 },
      { id: "c", params: MAIL, attempts: 1 },
    ]);
    await service.processDue();

    expect(mail.sendEmail).toHaveBeenCalledTimes(3);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
  });

  it("keeps a failed mail and schedules the next try with the backoff", async () => {
    const { service, prisma } = makeService([{ id: "a", params: MAIL, attempts: 2 }], {
      sendFails: true,
    });
    await service.processDue();

    expect(prisma.mailOutbox.delete).not.toHaveBeenCalled();
    const update = prisma.mailOutbox.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "a" });
    expect(update.data.lastError).toBe("All mail providers failed");
    expect(update.data.nextAttemptAt).toEqual(new Date(NOW.getTime() + 5 * 60_000));
    expect(update.data.status).toBeUndefined();
  });

  it("marks a mail as failed after the last attempt", async () => {
    const { service, prisma } = makeService([{ id: "a", params: MAIL, attempts: 8 }], {
      sendFails: true,
    });
    await service.processDue();

    const update = prisma.mailOutbox.update.mock.calls[0][0];
    expect(update.data.status).toBe("failed");
    expect(update.data.nextAttemptAt).toBeUndefined();
  });

  it("does not send a mail again when only the delete of its row failed", async () => {
    const { service, prisma, mail } = makeService([{ id: "a", params: MAIL, attempts: 1 }], {
      deleteFails: true,
    });
    await service.processDue();

    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(prisma.mailOutbox.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { status: "sent" },
    });
    const data = prisma.mailOutbox.update.mock.calls[0][0].data;
    expect(data.nextAttemptAt).toBeUndefined();
    expect(data.lastError).toBeUndefined();
  });

  it("claims with a lease on the clock of the database and skips rows that another copy holds", async () => {
    const { service, prisma } = makeService([]);
    await service.processDue();

    const call = prisma.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray];
    const query = String(call[0]);
    expect(query).toContain("FOR UPDATE SKIP LOCKED");
    expect(query).toContain("LIMIT 1");
    expect(query).toContain("AT TIME ZONE 'UTC'");
    expect(call).toHaveLength(1);
  });

  it("does not start a second run while one is going", async () => {
    const { service, prisma } = makeService([]);
    await Promise.all([service.processDue(), service.processDue()]);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("deletes failed rows after a month and sent rows after a day", async () => {
    const { service, prisma } = makeService([]);
    await service.processDue();

    const where = prisma.mailOutbox.deleteMany.mock.calls[0][0].where;
    expect(where.OR[0].status).toBe("failed");
    expect(where.OR[0].createdAt.lt.getTime()).toBe(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(where.OR[1].status).toBe("sent");
    expect(where.OR[1].createdAt.lt.getTime()).toBe(NOW.getTime() - 24 * 60 * 60 * 1000);
  });

  it("waits for a send that is running when the module stops and starts no new run", async () => {
    let release: () => void = () => undefined;
    const slowSend = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, prisma } = makeService([{ id: "a", params: MAIL, attempts: 1 }], {
      slowSend,
    });
    const run = service.processDue();
    await vi.waitFor(() => expect(prisma.$queryRaw).toHaveBeenCalled());

    let stopped = false;
    const stopping = service.onModuleDestroy().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    release();
    await run;
    await stopping;
    expect(prisma.mailOutbox.delete).toHaveBeenCalledWith({ where: { id: "a" } });

    await service.processDue();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
