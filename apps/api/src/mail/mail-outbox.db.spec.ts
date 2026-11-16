import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service.js";
import { MailOutboxService } from "./mail-outbox.service.js";

const databaseUrl = process.env.DATABASE_URL;
const MAIL = { to: "a@example.org", subject: "Outbox spec", html: "<p>hi</p>" };

type Claimer = { claimOne(): Promise<{ id: string; attempts: number } | undefined> };

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. The outbox claims a row with UPDATE ... FOR UPDATE SKIP LOCKED through
// $queryRaw. This proves that the claim returns the row on the real driver,
// that two copies cannot claim one row, and that a run sends and deletes it.
describe.skipIf(!databaseUrl)("mail outbox on PostgreSQL", () => {
  let prisma: PrismaService;
  const sendEmail = vi.fn(async (_params: unknown) => undefined);
  let outbox: MailOutboxService;
  const ids: string[] = [];

  async function due(id: string) {
    ids.push(id);
    await prisma.mailOutbox.create({
      data: { id, params: MAIL, nextAttemptAt: new Date(Date.now() - 60_000) },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService({ getOrThrow: () => databaseUrl } as never);
    await prisma.onModuleInit();
    outbox = new MailOutboxService(prisma, { sendEmail } as never);
  });

  afterAll(async () => {
    await prisma.mailOutbox.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("gives a due row to one of two overlapping claims and moves its lease", async () => {
    await due("outbox-spec-claim");
    const claimer = outbox as unknown as Claimer;
    const claims = await Promise.all([claimer.claimOne(), claimer.claimOne()]);
    const mine = claims.filter((claim) => claim?.id === "outbox-spec-claim");

    expect(mine).toHaveLength(1);
    expect(mine[0]?.attempts).toBe(1);
    const row = await prisma.mailOutbox.findUniqueOrThrow({ where: { id: "outbox-spec-claim" } });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000);
    expect(row.params).toEqual(MAIL);
  });

  it("sends a due row and deletes it", async () => {
    const id = await outbox.enqueue(MAIL);
    ids.push(id);
    await prisma.mailOutbox.update({
      where: { id },
      data: { nextAttemptAt: new Date(Date.now() - 60_000) },
    });
    await outbox.processDue();

    expect(sendEmail).toHaveBeenCalledWith(MAIL);
    expect(await prisma.mailOutbox.findUnique({ where: { id } })).toBeNull();
  });

  it("keeps a row whose send failed and records the error", async () => {
    sendEmail.mockRejectedValueOnce(new Error("provider down"));
    await due("outbox-spec-fail");
    await outbox.processDue();

    const row = await prisma.mailOutbox.findUniqueOrThrow({ where: { id: "outbox-spec-fail" } });
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastError: "provider down" });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });
});
