import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "./prisma.service.js";

const databaseUrl = process.env.DATABASE_URL;

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. `pg_advisory_xact_lock` returns void, and the driver adapter cannot read
// a void column through `$queryRaw`, so the services take the lock with
// `$executeRaw`. This proves that form works on a real connection.
describe.skipIf(!databaseUrl)("advisory lock on PostgreSQL", () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService({ getOrThrow: () => databaseUrl } as never);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("takes the lock of a transaction with $executeRaw", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"advisory-lock-spec"}))`;
        return "locked";
      }),
    ).resolves.toBe("locked");
  });

  it("queues a second transaction behind the first until it ends", async () => {
    const order: string[] = [];
    let firstHoldsLock: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      firstHoldsLock = resolve;
    });
    let releaseFirst: () => void = () => undefined;
    const release = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const lock = (tx: Pick<PrismaService, "$executeRaw">) =>
      tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"advisory-lock-queue"}))`;

    const first = prisma.$transaction(async (tx) => {
      await lock(tx);
      order.push("first in");
      firstHoldsLock();
      await release;
      order.push("first out");
    });
    // The second transaction starts only after the first one holds the lock.
    await held;
    const second = prisma.$transaction(async (tx) => {
      await lock(tx);
      order.push("second in");
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(order).toEqual(["first in"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first in", "first out", "second in"]);
  });
});
