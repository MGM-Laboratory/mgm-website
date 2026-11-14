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
});
