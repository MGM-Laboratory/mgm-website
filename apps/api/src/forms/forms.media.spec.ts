import { describe, expect, it, vi } from "vitest";

import { formDocumentSchema } from "@repo/shared";

import { FormsService } from "./forms.service.js";

const KEY = "form-abc123-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";

function makeService(owner: { id: string } | null, referenced: boolean) {
  const prisma = {
    form: { findUnique: vi.fn().mockResolvedValue(owner), findMany: vi.fn().mockResolvedValue([]) },
    formMedia: {
      findFirst: vi.fn().mockResolvedValue(referenced ? { key: KEY } : null),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return { service: new FormsService(prisma as never, {} as never), prisma };
}

describe("mediaServable", () => {
  it("serves a key of an existing form without looking at the index", async () => {
    const { service, prisma } = makeService({ id: "abc123" }, false);
    expect(await service.mediaServable(KEY)).toBe(true);
    expect(prisma.formMedia.findFirst).not.toHaveBeenCalled();
  });

  it("serves a key that another form still uses when its owner is gone", async () => {
    const { service, prisma } = makeService(null, true);
    expect(await service.mediaServable(KEY)).toBe(true);
    expect(prisma.formMedia.findFirst).toHaveBeenCalledWith({
      where: { key: KEY },
      select: { key: true },
    });
  });

  it("refuses a key that no form owns or uses", async () => {
    const { service } = makeService(null, false);
    expect(await service.mediaServable(KEY)).toBe(false);
  });

  it("refuses a key that does not look like a form media key without a query", async () => {
    const { service, prisma } = makeService({ id: "abc123" }, true);
    expect(await service.mediaServable("not-a-form-key.png")).toBe(false);
    expect(prisma.form.findUnique).not.toHaveBeenCalled();
    expect(prisma.formMedia.findFirst).not.toHaveBeenCalled();
  });
});

describe("media index backfill", () => {
  const document = { design: { cover: { media: { kind: "image", key: KEY } } }, fields: [] };

  it("adds the rows of every form and skips the ones that exist", async () => {
    const { service, prisma } = makeService(null, false);
    prisma.form.findMany.mockResolvedValue([
      { id: "abc123", data: document },
      { id: "def456", data: { design: {}, fields: [] } },
    ]);
    await service.onModuleInit();
    expect(prisma.formMedia.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.formMedia.createMany).toHaveBeenCalledWith({
      data: [{ formId: "abc123", key: KEY }],
      skipDuplicates: true,
    });
  });

  it("goes on with the other forms when one of them fails", async () => {
    const { service, prisma } = makeService(null, false);
    prisma.form.findMany.mockResolvedValue([
      { id: "abc123", data: document },
      { id: "def456", data: document },
    ]);
    prisma.formMedia.createMany.mockRejectedValueOnce(new Error("foreign key"));
    await service.onModuleInit();
    expect(prisma.formMedia.createMany).toHaveBeenCalledTimes(2);
  });

  it("reads only the forms that have no row yet", async () => {
    const { service, prisma } = makeService(null, false);
    await service.onModuleInit();
    expect(prisma.form.findMany).toHaveBeenCalledWith({
      where: { media: { none: {} } },
      select: { id: true, data: true },
    });
  });

  it("does not stop the start of the API when the backfill fails", async () => {
    const { service, prisma } = makeService(null, false);
    prisma.form.findMany.mockRejectedValue(new Error("db down"));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

describe("media index writes", () => {
  const OTHER = "form-abc123-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a62.jpg";
  const makeDocument = (key: string) =>
    formDocumentSchema.parse({
      title: "Survey",
      fields: [{ id: "name", type: "short_text" }],
      design: { cover: { style: "banner", media: { kind: "image", key } } },
    });
  const rowOf = (document: unknown, extra: Record<string, unknown> = {}) => ({
    id: "abc123",
    slug: "survey",
    status: "draft",
    data: document,
    passphraseHash: null,
    passphraseSalt: null,
    publishedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  });
  function makeWriter(row: unknown) {
    const prisma = {
      form: {
        // A slug lookup finds no owner, so every slug is free. A lookup by id finds the row.
        findUnique: vi
          .fn()
          .mockImplementation(({ where }: { where: { slug?: string } }) =>
            Promise.resolve(where.slug ? null : row),
          ),
        create: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue(row),
        delete: vi.fn().mockResolvedValue(row),
      },
      formUpload: { findMany: vi.fn().mockResolvedValue([]) },
      formMedia: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const storage = { deleteFile: vi.fn().mockResolvedValue(undefined) };
    return { service: new FormsService(prisma as never, storage as never), prisma, storage };
  }

  it("writes the keys of the document with a new form and skips a row that exists", async () => {
    const document = makeDocument(KEY);
    const { service, prisma } = makeWriter(rowOf(document));
    await service.create({ document });
    const data = prisma.form.create.mock.calls[0]?.[0].data;
    expect(data.media).toEqual({ createMany: { data: [{ key: KEY }], skipDuplicates: true } });
  });

  it("replaces the rows of a form together with its document", async () => {
    const document = makeDocument(OTHER);
    const { service, prisma } = makeWriter(rowOf(makeDocument(KEY)));
    vi.spyOn(service as never, "recordWithStats" as never).mockResolvedValue({} as never);
    await service.update("abc123", { document });
    const data = prisma.form.update.mock.calls[0]?.[0].data;
    expect(data.media).toEqual({
      deleteMany: {},
      createMany: { data: [{ key: OTHER }], skipDuplicates: true },
    });
  });

  it("leaves the rows alone when a save does not change the document", async () => {
    const { service, prisma } = makeWriter(rowOf(makeDocument(KEY)));
    vi.spyOn(service as never, "recordWithStats" as never).mockResolvedValue({} as never);
    await service.update("abc123", { status: "closed" });
    expect(prisma.form.update.mock.calls[0]?.[0].data.media).toBeUndefined();
  });

  it("gives a copy the keys of its original", async () => {
    const { service, prisma } = makeWriter(rowOf(makeDocument(KEY)));
    await service.duplicate("abc123");
    const data = prisma.form.create.mock.calls[0]?.[0].data;
    expect(data.media).toEqual({ createMany: { data: [{ key: KEY }], skipDuplicates: true } });
  });

  it("deletes the files of a removed form unless another form still uses them", async () => {
    const { service, prisma, storage } = makeWriter(rowOf(makeDocument(KEY)));
    await service.remove("abc123");
    expect(storage.deleteFile).toHaveBeenCalledWith(KEY);

    storage.deleteFile.mockClear();
    prisma.formMedia.findFirst.mockResolvedValue({ key: KEY });
    await service.remove("abc123");
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});
