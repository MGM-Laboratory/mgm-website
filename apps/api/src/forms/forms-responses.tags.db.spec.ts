import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service.js";
import { FormsResponsesService } from "./forms-responses.service.js";
import { TAGS_MAX } from "./forms.utils.js";

const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "db-tags-spec-";

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. The bulk tag and untag actions are raw SQL with text array operators.
// This runs them on real rows, with a legacy row that has NULL tags, a row at
// the tag limit and rows of another form that must stay untouched.
describe.skipIf(!databaseUrl)("bulk tag SQL on PostgreSQL", () => {
  let prisma: PrismaService;
  let service: FormsResponsesService;
  let formId: string;
  let otherId: string;

  const response = (id: string, form: string, tags: string[] = []) =>
    prisma.formResponse.create({ data: { id, formId: form, answers: {}, tags } });
  const tagsOf = async (id: string) =>
    (await prisma.formResponse.findUniqueOrThrow({ where: { id } })).tags;

  beforeAll(async () => {
    prisma = new PrismaService({ getOrThrow: () => databaseUrl } as never);
    await prisma.onModuleInit();
    await prisma.form.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    formId = (await prisma.form.create({ data: { slug: `${PREFIX}one`, data: {} } })).id;
    otherId = (await prisma.form.create({ data: { slug: `${PREFIX}two`, data: {} } })).id;
    const forms = { require: async () => ({ id: formId }) };
    service = new FormsResponsesService(prisma, {} as never, forms as never);
  });

  afterAll(async () => {
    await prisma.form.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it("adds a tag once, also to a row with NULL tags, and only inside the form", async () => {
    await response("tags-plain", formId);
    await response("tags-null", formId);
    await response("tags-has", formId, ["vip"]);
    await response("tags-other", otherId);
    await prisma.$executeRaw`UPDATE "FormResponse" SET "tags" = NULL WHERE "id" = 'tags-null'`;

    const ids = ["tags-plain", "tags-null", "tags-has", "tags-other"];
    const done = await service.bulk(formId, { ids, action: "tag", tag: "vip" });

    expect(done).toEqual({ ok: true, count: 2 });
    expect(await tagsOf("tags-plain")).toEqual(["vip"]);
    expect(await tagsOf("tags-null")).toEqual(["vip"]);
    expect(await tagsOf("tags-has")).toEqual(["vip"]);
    expect(await tagsOf("tags-other")).toEqual([]);
  });

  it("does not add a tag to a row that is at the tag limit", async () => {
    const full = Array.from({ length: TAGS_MAX }, (_, index) => `t${index}`);
    await response("tags-full", formId, full);
    const done = await service.bulk(formId, { ids: ["tags-full"], action: "tag", tag: "extra" });
    expect(done.count).toBe(0);
    expect(await tagsOf("tags-full")).toEqual(full);
  });

  it("removes a tag only from the rows that have it", async () => {
    await response("untag-has", formId, ["a", "b"]);
    await response("untag-not", formId, ["a"]);
    await response("untag-other", otherId, ["b"]);
    const ids = ["untag-has", "untag-not", "untag-other"];
    const done = await service.bulk(formId, { ids, action: "untag", tag: "b" });

    expect(done.count).toBe(1);
    expect(await tagsOf("untag-has")).toEqual(["a"]);
    expect(await tagsOf("untag-not")).toEqual(["a"]);
    expect(await tagsOf("untag-other")).toEqual(["b"]);
  });

  it("keeps one copy of a tag when two bulk actions overlap", async () => {
    const ids = ["race-1", "race-2", "race-3"];
    for (const id of ids) await response(id, formId);
    const counts = await Promise.all([
      service.bulk(formId, { ids, action: "tag", tag: "same" }),
      service.bulk(formId, { ids, action: "tag", tag: "same" }),
    ]);

    expect(counts.reduce((sum, done) => sum + done.count, 0)).toBe(ids.length);
    for (const id of ids) expect(await tagsOf(id)).toEqual(["same"]);
  });
});
