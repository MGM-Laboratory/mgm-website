import { afterAll, describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service.js";

const databaseUrl = process.env.DATABASE_URL;

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. It checks what the analytics rely on. A statement that runs too long
// ends the transaction, and the limit does not stay on the connection.
describe.skipIf(!databaseUrl)("statement timeout on PostgreSQL", () => {
  const prisma = new PrismaService({ getOrThrow: () => databaseUrl } as never);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("stops a slow query and leaves the connection without the limit", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '200ms'`);
        await tx.$queryRaw`SELECT pg_sleep(2)`;
      }),
    ).rejects.toThrow();

    // Every connection of the pool must be clean, so ask more times than it has connections.
    const answers = await Promise.all(
      Array.from(
        { length: 12 },
        () => prisma.$queryRaw<{ statement_timeout: string }[]>`SHOW statement_timeout`,
      ),
    );
    for (const rows of answers) expect(rows[0]?.statement_timeout).toBe("0");
  });
});
