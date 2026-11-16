import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formDocumentSchema } from "@repo/shared";

import { FormsService } from "./forms.service.js";

const MEDIA_KEY = "form-abc123-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";

const DOCUMENT = formDocumentSchema.parse({
  title: "Survey",
  fields: [
    { id: "name", type: "short_text" },
    { id: "src", type: "hidden" },
    { id: "intro", type: "paragraph" },
  ],
});

function formRow(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2030-01-01T00:00:00Z"),
    data: DOCUMENT,
    id: "abc123",
    passphraseHash: null,
    publishedAt: null,
    slug: "survey",
    status: "draft",
    updatedAt: new Date("2030-01-02T00:00:00Z"),
    ...overrides,
  };
}

function make() {
  const prisma = {
    form: {
      create: vi.fn(async ({ data }: { data: object }) => formRow({ ...data })),
      delete: vi.fn(async () => ({})),
      findMany: vi.fn(async () => [] as unknown[]),
      findUnique: vi.fn(async (..._args: unknown[]) => null as unknown),
      update: vi.fn(async ({ data }: { data: object }) => formRow({ ...data })),
    },
    formEvent: { groupBy: vi.fn(async () => [] as unknown[]) },
    formMedia: {
      createMany: vi.fn(async () => ({ count: 0 })),
      findFirst: vi.fn(async (..._args: unknown[]) => null as unknown),
    },
    formResponse: { groupBy: vi.fn(async () => [] as unknown[]) },
    formUpload: { findMany: vi.fn(async () => [] as unknown[]) },
  };
  const storage = { deleteFile: vi.fn(async (..._args: unknown[]) => undefined) };
  return { prisma, service: new FormsService(prisma as never, storage as never), storage };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FormsService stats and shapes", () => {
  it("answers an empty map for no ids without querying", async () => {
    const { prisma, service } = make();
    expect((await service.statsFor([])).size).toBe(0);
    expect(prisma.formResponse.groupBy).not.toHaveBeenCalled();
  });

  it("fills responses, views, starts and the latest response per form", async () => {
    const { prisma, service } = make();
    prisma.formResponse.groupBy.mockResolvedValue([
      { _count: { _all: 3 }, _max: { createdAt: new Date("2030-02-01T00:00:00Z") }, formId: "a" },
      { _count: { _all: 9 }, _max: { createdAt: null }, formId: "ghost" },
    ]);
    prisma.formEvent.groupBy.mockResolvedValue([
      { _count: { _all: 10 }, formId: "a", type: "view" },
      { _count: { _all: 4 }, formId: "a", type: "start" },
      { _count: { _all: 1 }, formId: "ghost", type: "view" },
    ]);
    const stats = await service.statsFor(["a", "b"]);
    expect(stats.get("a")).toEqual({
      lastResponseAt: "2030-02-01T00:00:00.000Z",
      responses: 3,
      starts: 4,
      views: 10,
    });
    expect(stats.get("b")).toEqual({ lastResponseAt: null, responses: 0, starts: 0, views: 0 });
    expect(stats.has("ghost")).toBe(false);
  });

  it("does not share the empty stats object between forms", async () => {
    const { service } = make();
    const stats = await service.statsFor(["a", "b"]);
    stats.get("a")!.responses = 5;
    expect(stats.get("b")!.responses).toBe(0);
  });

  it("builds the record with the passphrase flag and ISO dates", () => {
    const { service } = make();
    const record = service.toRecord(
      formRow({ passphraseHash: "h", publishedAt: new Date("2030-03-01T00:00:00Z") }) as never,
    );
    expect(record.hasPassphrase).toBe(true);
    expect(record.publishedAt).toBe("2030-03-01T00:00:00.000Z");
    expect(record.createdAt).toBe("2030-01-01T00:00:00.000Z");
    expect(service.toRecord(formRow() as never).publishedAt).toBeNull();
  });

  it("counts only the questions in the summary, not hidden fields or statements", () => {
    const { service } = make();
    const summary = service.toSummary(formRow() as never);
    expect(summary.title).toBe("Survey");
    expect(summary.questionCount).toBe(1);
    expect(summary).not.toHaveProperty("document");
  });

  it("lists forms newest first with their stats", async () => {
    const { prisma, service } = make();
    prisma.form.findMany.mockResolvedValue([formRow({ id: "a" }), formRow({ id: "b" })]);
    prisma.formResponse.groupBy.mockResolvedValue([
      { _count: { _all: 2 }, _max: { createdAt: null }, formId: "b" },
    ]);
    const forms = await service.list();
    expect(forms.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(forms[1].stats.responses).toBe(2);
    expect(prisma.form.findMany).toHaveBeenCalledWith({ orderBy: { updatedAt: "desc" } });
  });

  it("gets a form with its stats and answers 404 for an unknown one", async () => {
    const { prisma, service } = make();
    prisma.form.findUnique.mockResolvedValueOnce(formRow());
    expect((await service.get("abc123")).id).toBe("abc123");
    prisma.form.findUnique.mockResolvedValueOnce(null);
    await expect(service.get("nope")).rejects.toMatchObject({ status: 404 });
  });
});

describe("FormsService slugs", () => {
  it("mints a slug that no form uses", async () => {
    const { prisma, service } = make();
    prisma.form.findUnique.mockResolvedValueOnce({ id: "taken" }).mockResolvedValue(null);
    const slug = await service.mintSlug();
    expect(slug).toMatch(/^[a-z2-9]{8}$/);
    expect(prisma.form.findUnique).toHaveBeenCalledTimes(2);
  });

  it("lengthens the slug after four collisions and gives up after twelve with a 503", async () => {
    const { prisma, service } = make();
    prisma.form.findUnique.mockResolvedValue({ id: "taken" });
    const error = await service.mintSlug().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 503 });
    expect(prisma.form.findUnique).toHaveBeenCalledTimes(12);
    const lengths = (
      prisma.form.findUnique.mock.calls as unknown as [{ where: { slug: string } }][]
    ).map(([arg]) => arg.where.slug.length);
    expect([...new Set(lengths)]).toEqual([8, 10, 12]);
  });

  it("suggests the base when it is valid and free", async () => {
    const { service } = make();
    expect(await service.suggestSlug("My Survey 2030!")).toBe("my-survey-2030");
  });

  it("suggests a numbered variant when the base is taken", async () => {
    const { prisma, service } = make();
    prisma.form.findUnique.mockResolvedValueOnce({ id: "other" }).mockResolvedValue(null);
    expect(await service.suggestSlug("survey")).toBe("survey-2");
  });

  it("treats the excluded form as the owner of its own slug", async () => {
    const { prisma, service } = make();
    prisma.form.findUnique.mockResolvedValue({ id: "me" });
    expect(await service.suggestSlug("survey", "me")).toBe("survey");
  });

  it("mints a random slug when the text has no usable characters", async () => {
    const { service } = make();
    expect(await service.suggestSlug("!!!")).toMatch(/^[a-z2-9]{8}$/);
  });

  it("falls back to a random slug when every variant is taken", async () => {
    const { prisma, service } = make();
    prisma.form.findUnique.mockImplementation(async (arg: unknown) => {
      const slug = (arg as { where: { slug: string } }).where.slug;
      return /^survey(-\d)?$/.test(slug) ? { id: "other" } : null;
    });
    expect(await service.suggestSlug("survey")).toMatch(/^[a-z2-9]{8}$/);
  });

  it("reports an available slug with its normalized form", async () => {
    const { service } = make();
    expect(await service.slugAvailable("Survey")).toEqual({
      available: true,
      suggestion: "survey",
    });
  });

  it("reports a taken or invalid slug with a suggestion", async () => {
    const { prisma, service } = make();
    prisma.form.findUnique.mockImplementation(async (arg: unknown) =>
      (arg as { where: { slug: string } }).where.slug === "survey" ? { id: "other" } : null,
    );
    expect(await service.slugAvailable("survey")).toEqual({
      available: false,
      suggestion: "survey-2",
    });
    const invalid = await service.slugAvailable("Not A Slug!");
    expect(invalid).toEqual({ available: false, suggestion: "not-a-slug" });
  });
});

describe("FormsService.create", () => {
  it("refuses an invalid document naming the path", async () => {
    const { service } = make();
    await expect(service.create({ document: { title: "" } })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("mints a slug for a missing or blank one and starts as a draft", async () => {
    const { prisma, service } = make();
    await service.create({ document: DOCUMENT, slug: "   " });
    const data = (prisma.form.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.slug).toMatch(/^[a-z2-9]{8}$/);
    expect(data.status).toBe("draft");
    expect(data.publishedAt).toBeNull();
  });

  it("stamps the publish time for a published form and indexes its media", async () => {
    const { prisma, service } = make();
    const withMedia = {
      ...DOCUMENT,
      design: { ...DOCUMENT.design, cover: { media: { kind: "image", key: MEDIA_KEY } } },
    };
    await service.create({ document: withMedia, slug: "launch", status: "published" });
    const data = (prisma.form.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(data.media).toEqual({
      createMany: { data: [{ key: MEDIA_KEY }], skipDuplicates: true },
    });
  });

  it("answers 400 for an invalid slug and 409 for a taken one", async () => {
    const { prisma, service } = make();
    await expect(service.create({ document: DOCUMENT, slug: "Not A Slug!" })).rejects.toMatchObject(
      {
        status: 400,
      },
    );
    prisma.form.findUnique.mockResolvedValue({ id: "other" });
    await expect(service.create({ document: DOCUMENT, slug: "survey" })).rejects.toMatchObject({
      message: "That form URL is already in use.",
      status: 409,
    });
  });

  it("answers 409 when the database reports a unique violation and rethrows other errors", async () => {
    const { prisma, service } = make();
    prisma.form.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(service.create({ document: DOCUMENT, slug: "survey" })).rejects.toMatchObject({
      status: 409,
    });
    const failure = new Error("db down");
    prisma.form.create.mockRejectedValueOnce(failure);
    await expect(service.create({ document: DOCUMENT, slug: "survey" })).rejects.toBe(failure);
  });
});

describe("FormsService.update", () => {
  function withRow(row = formRow()) {
    const made = make();
    made.prisma.form.findUnique.mockResolvedValueOnce(row);
    return made;
  }

  it("writes the document together with its media rows", async () => {
    const { prisma, service } = withRow();
    await service.update("abc123", { document: DOCUMENT, passphraseAction: "keep" });
    const data = (prisma.form.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.data).toEqual(DOCUMENT);
    expect(data.media).toEqual({ createMany: { data: [], skipDuplicates: true }, deleteMany: {} });
  });

  it("claims a new slug only when it differs from the stored one", async () => {
    const { prisma, service } = withRow();
    await service.update("abc123", { passphraseAction: "keep", slug: " SURVEY " });
    expect(
      (prisma.form.update.mock.calls[0][0] as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty("slug");
    const second = withRow();
    await second.service.update("abc123", { passphraseAction: "keep", slug: "renamed" });
    expect(
      (second.prisma.form.update.mock.calls[0][0] as { data: { slug: string } }).data.slug,
    ).toBe("renamed");
  });

  it("stamps the publish time once", async () => {
    const first = withRow();
    await first.service.update("abc123", { passphraseAction: "keep", status: "published" });
    expect(
      (first.prisma.form.update.mock.calls[0][0] as { data: Record<string, unknown> }).data
        .publishedAt,
    ).toBeInstanceOf(Date);
    const again = withRow(formRow({ publishedAt: new Date("2030-01-01T00:00:00Z") }));
    await again.service.update("abc123", { passphraseAction: "keep", status: "published" });
    expect(
      again.prisma.form.update.mock.calls[0][0] as { data: Record<string, unknown> },
    ).toMatchObject({
      data: { status: "published" },
    });
    expect(
      (again.prisma.form.update.mock.calls[0][0] as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty("publishedAt");
  });

  it("hashes a new passphrase and clears it on remove", async () => {
    const set = withRow();
    await set.service.update("abc123", { passphrase: " secret ", passphraseAction: "set" });
    const setData = (set.prisma.form.update.mock.calls[0][0] as { data: Record<string, string> })
      .data;
    expect(setData.passphraseHash).toMatch(/^[0-9a-f]+$/);
    expect(setData.passphraseSalt).toMatch(/^[0-9a-f]+$/);
    const remove = withRow();
    await remove.service.update("abc123", { passphraseAction: "remove" });
    expect(
      remove.prisma.form.update.mock.calls[0][0] as { data: Record<string, unknown> },
    ).toMatchObject({
      data: { passphraseHash: null, passphraseSalt: null },
    });
  });

  it("refuses to set a blank or missing passphrase", async () => {
    const blank = withRow();
    await expect(
      blank.service.update("abc123", { passphrase: "   ", passphraseAction: "set" }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Enter a passphrase"),
      status: 400,
    });
    expect(blank.prisma.form.update).not.toHaveBeenCalled();
    const missing = withRow();
    await expect(
      missing.service.update("abc123", { passphraseAction: "set" }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Enter a passphrase"),
      status: 400,
    });
    expect(missing.prisma.form.update).not.toHaveBeenCalled();
  });

  it("answers 409 on a unique violation at write time and rethrows other errors", async () => {
    const dup = withRow();
    dup.prisma.form.update.mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );
    await expect(dup.service.update("abc123", { passphraseAction: "keep" })).rejects.toMatchObject({
      status: 409,
    });
    const failure = new Error("db down");
    const other = withRow();
    other.prisma.form.update.mockRejectedValueOnce(failure);
    await expect(other.service.update("abc123", { passphraseAction: "keep" })).rejects.toBe(
      failure,
    );
    const rawNull = withRow();
    rawNull.prisma.form.update.mockRejectedValueOnce(null);
    await expect(rawNull.service.update("abc123", { passphraseAction: "keep" })).rejects.toBeNull();
  });
});

describe("FormsService.duplicate", () => {
  it("creates a draft copy with a suffixed title, a new slug and no passphrase", async () => {
    const { prisma, service } = make();
    prisma.form.findUnique.mockResolvedValueOnce(
      formRow({ passphraseHash: "h", status: "published" }),
    );
    await service.duplicate("abc123");
    const data = (
      prisma.form.create.mock.calls[0][0] as {
        data: { data: { title: string }; slug: string; status: string };
      }
    ).data;
    expect(data.data.title).toBe("Survey (copy)");
    expect(data.slug).toBe("survey-copy");
    expect(data.status).toBe("draft");
    expect(data).not.toHaveProperty("passphraseHash");
  });

  it("keeps the title within 200 characters", async () => {
    const { prisma, service } = make();
    prisma.form.findUnique.mockResolvedValueOnce(
      formRow({ data: { ...DOCUMENT, title: "x".repeat(200) } }),
    );
    await service.duplicate("abc123");
    const data = (prisma.form.create.mock.calls[0][0] as { data: { data: { title: string } } })
      .data;
    expect(data.data.title).toHaveLength(200);
  });
});

describe("FormsService.remove", () => {
  it("deletes the form and then the uploads and the media that no other form uses", async () => {
    const { prisma, service, storage } = make();
    const shared = "form-abc123-1b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a62.png";
    prisma.form.findUnique.mockResolvedValueOnce(
      formRow({
        data: {
          ...DOCUMENT,
          design: {
            ...DOCUMENT.design,
            cover: { media: { kind: "image", key: MEDIA_KEY } },
            background: { media: { kind: "image", key: shared } },
          },
        },
      }),
    );
    prisma.formUpload.findMany.mockResolvedValue([{ key: "formfile-abc123-up" }]);
    prisma.formMedia.findFirst.mockImplementation(async (arg: unknown) =>
      (arg as { where: { key: string } }).where.key === shared ? { key: shared } : null,
    );
    await service.remove("abc123");
    expect(prisma.form.delete).toHaveBeenCalledWith({ where: { id: "abc123" } });
    const deleted = storage.deleteFile.mock.calls.map(([key]) => key as string);
    expect(deleted).toContain("formfile-abc123-up");
    expect(deleted).toContain(MEDIA_KEY);
    expect(deleted).not.toContain(shared);
  });

  it("answers 404 for an unknown form without deleting anything", async () => {
    const { prisma, service } = make();
    await expect(service.remove("nope")).rejects.toMatchObject({ status: 404 });
    expect(prisma.form.delete).not.toHaveBeenCalled();
  });
});

describe("FormsService.deleteObjects", () => {
  it("goes on after a failed delete and logs the count", async () => {
    const { service, storage } = make();
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    storage.deleteFile.mockRejectedValueOnce(new Error("gone")).mockResolvedValue(undefined);
    await service.deleteObjects(["a", "b", "c"]);
    expect(storage.deleteFile).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith("Could not delete 1 of 3 form files");
  });

  it("stays quiet when every delete works", async () => {
    const { service } = make();
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    await service.deleteObjects(["a"]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("FormsService.onModuleInit", () => {
  it("logs one line with the count when some forms fail", async () => {
    const { prisma, service } = make();
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const withMedia = {
      design: { cover: { media: { kind: "image", key: MEDIA_KEY } } },
      fields: [],
    };
    prisma.form.findMany.mockResolvedValue([
      { data: withMedia, id: "a" },
      { data: withMedia, id: "b" },
    ]);
    prisma.formMedia.createMany.mockRejectedValue(new Error("fk"));
    await service.onModuleInit();
    expect(warn).toHaveBeenCalledWith("Could not fill the form media index for 2 forms");
  });

  it("logs the stack and returns when the read itself fails", async () => {
    const { prisma, service } = make();
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    prisma.form.findMany.mockRejectedValue("plain failure");
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Could not fill the form media index", "plain failure");
  });
});
