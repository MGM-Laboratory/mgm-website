import { ConflictException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service.js";
import { orConflict } from "./record-version.js";

const databaseUrl = process.env.DATABASE_URL;

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. The services update with the `updatedAt` that they read in the same
// transaction. This proves that Prisma accepts that filter next to the unique
// slug and that a stale value matches no row.
describe.skipIf(!databaseUrl)("guarded update on PostgreSQL", () => {
  let prisma: PrismaService;
  const slug = "record-version-spec";

  beforeAll(async () => {
    prisma = new PrismaService({ getOrThrow: () => databaseUrl } as never);
    await prisma.onModuleInit();
    await prisma.cmsArticle.deleteMany({ where: { slug } });
    await prisma.cmsArticle.create({ data: { slug, data: { article: { title: "first" } } } });
  });

  afterAll(async () => {
    await prisma.cmsArticle.deleteMany({ where: { slug } });
    await prisma.$disconnect();
  });

  it("updates when the version matches and answers 409 when it is stale", async () => {
    const loaded = await prisma.cmsArticle.findUniqueOrThrow({ where: { slug } });

    const saved = await orConflict(() =>
      prisma.cmsArticle.update({
        where: { slug, updatedAt: loaded.updatedAt },
        data: { data: { article: { title: "second" } } },
      }),
    );
    expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(loaded.updatedAt.getTime());

    await expect(
      orConflict(() =>
        prisma.cmsArticle.update({
          where: { slug, updatedAt: new Date(loaded.updatedAt.getTime() - 5000) },
          data: { data: { article: { title: "third" } } },
        }),
      ),
    ).rejects.toThrow(ConflictException);
    const after = await prisma.cmsArticle.findUniqueOrThrow({ where: { slug } });
    expect(after.data).toEqual({ article: { title: "second" } });
  });

  it("lets only one of two overlapping saves write", async () => {
    const loaded = await prisma.cmsArticle.findUniqueOrThrow({ where: { slug } });
    let firstHasWritten: () => void = () => undefined;
    const written = new Promise<void>((resolve) => {
      firstHasWritten = resolve;
    });
    let releaseFirst: () => void = () => undefined;
    const release = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = prisma.$transaction(async (tx) => {
      await tx.cmsArticle.update({
        where: { slug, updatedAt: loaded.updatedAt },
        data: { data: { article: { title: "winner" } } },
      });
      firstHasWritten();
      await release;
    });
    await written;
    // The second save reads nothing new. Its update waits for the row of the first one.
    const second = prisma.$transaction((tx) =>
      orConflict(() =>
        tx.cmsArticle.update({
          where: { slug, updatedAt: loaded.updatedAt },
          data: { data: { article: { title: "loser" } } },
        }),
      ),
    );
    const outcome = second.then(
      () => "written",
      (error: unknown) => (error instanceof ConflictException ? "conflict" : "other"),
    );
    // A short wait makes the second update reach the row lock before the first one commits.
    await new Promise((resolve) => setTimeout(resolve, 300));
    releaseFirst();
    await first;
    expect(await outcome).toBe("conflict");
    const after = await prisma.cmsArticle.findUniqueOrThrow({ where: { slug } });
    expect(after.data).toEqual({ article: { title: "winner" } });
  });
});
