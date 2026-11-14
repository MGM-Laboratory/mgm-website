import { describe, expect, it, vi } from "vitest";

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

  it("does not stop the start of the API when the backfill fails", async () => {
    const { service, prisma } = makeService(null, false);
    prisma.form.findMany.mockRejectedValue(new Error("db down"));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
