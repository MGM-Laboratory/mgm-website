import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service.js";
import { FormsError } from "./forms.common.js";
import { FormsService } from "./forms.service.js";

const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "db-slug-spec-";
const DOCUMENT = { title: "Slug spec", fields: [{ id: "name", type: "short_text" }] };

type Slugs = { slugFree(slug: string, excludeId?: string): Promise<boolean> };

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. The code checks that a slug is free and then writes it, so two saves can
// both pass the check. The unique index then refuses the second write with
// P2002, and the service must turn that into a 409. The tests make the check
// pass on purpose, so the answer really comes from the database.
describe.skipIf(!databaseUrl)("form slug unique violation on PostgreSQL", () => {
  let prisma: PrismaService;
  let service: FormsService;

  const claimedByCheck = () =>
    vi.spyOn(service as unknown as Slugs, "slugFree").mockResolvedValue(true);

  beforeAll(async () => {
    prisma = new PrismaService({ getOrThrow: () => databaseUrl } as never);
    await prisma.onModuleInit();
    await prisma.form.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    service = new FormsService(prisma, {} as never);
  });

  afterAll(async () => {
    await prisma.form.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it("reports a duplicate slug as P2002 through the driver adapter", async () => {
    await prisma.form.create({ data: { slug: `${PREFIX}raw`, data: {} } });
    await expect(
      prisma.form.create({ data: { slug: `${PREFIX}raw`, data: {} } }),
    ).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("answers 409 when a create meets a slug that the check missed", async () => {
    await prisma.form.create({ data: { slug: `${PREFIX}create`, data: {} } });
    const check = claimedByCheck();
    await expect(
      service.create({ document: DOCUMENT, slug: `${PREFIX}create` }),
    ).rejects.toMatchObject({
      status: 409,
      message: "That form URL is already in use.",
    });
    check.mockRestore();
    expect(await prisma.form.count({ where: { slug: `${PREFIX}create` } })).toBe(1);
  });

  it("stores one form when two creates of one slug overlap", async () => {
    const results = await Promise.allSettled([
      service.create({ document: DOCUMENT, slug: `${PREFIX}race` }),
      service.create({ document: DOCUMENT, slug: `${PREFIX}race` }),
    ]);
    const refused = results.filter((result) => result.status === "rejected");

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(FormsError);
    expect(((refused[0] as PromiseRejectedResult).reason as FormsError).status).toBe(409);
    expect(await prisma.form.count({ where: { slug: `${PREFIX}race` } })).toBe(1);
  });

  it("answers 409 when an update takes a slug that another form owns", async () => {
    await prisma.form.create({ data: { slug: `${PREFIX}owner`, data: {} } });
    const mine = await prisma.form.create({ data: { slug: `${PREFIX}mine`, data: {} } });
    const check = claimedByCheck();
    await expect(
      service.update(mine.id, { slug: `${PREFIX}owner`, passphraseAction: "keep" }),
    ).rejects.toMatchObject({
      status: 409,
    });
    check.mockRestore();
    const after = await prisma.form.findUniqueOrThrow({ where: { id: mine.id } });
    expect(after.slug).toBe(`${PREFIX}mine`);
  });
});
