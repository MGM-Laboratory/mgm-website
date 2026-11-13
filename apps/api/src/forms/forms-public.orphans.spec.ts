import { describe, expect, it, vi } from "vitest";

import { FormsPublicService } from "./forms-public.service.js";

const NOW = Date.parse("2026-11-14T00:00:00Z");

function makeService(failing: string[] = []) {
  const prisma = {
    formUpload: {
      findMany: vi.fn().mockResolvedValue([{ key: "a.pdf" }, { key: "b.pdf" }, { key: "c.pdf" }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const storage = {
    deleteFile: vi.fn(async (key: string) => {
      if (failing.includes(key)) throw new Error("storage down");
    }),
  };
  const service = new FormsPublicService(
    prisma as never,
    storage as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, storage };
}

describe("deleteOrphans", () => {
  it("deletes the rows of every object that was deleted", async () => {
    const { service, prisma } = makeService();
    await service.deleteOrphans("form1", NOW);
    expect(prisma.formUpload.deleteMany).toHaveBeenCalledWith({
      where: { key: { in: ["a.pdf", "b.pdf", "c.pdf"] }, responseId: null },
    });
  });

  it("keeps the row of an object that failed to delete so the next sweep retries it", async () => {
    const { service, prisma } = makeService(["b.pdf"]);
    await service.deleteOrphans("form1", NOW);
    expect(prisma.formUpload.deleteMany).toHaveBeenCalledWith({
      where: { key: { in: ["a.pdf", "c.pdf"] }, responseId: null },
    });
  });

  it("deletes no row when no object could be deleted", async () => {
    const { service, prisma } = makeService(["a.pdf", "b.pdf", "c.pdf"]);
    await service.deleteOrphans("form1", NOW);
    expect(prisma.formUpload.deleteMany).not.toHaveBeenCalled();
  });

  it("reads the oldest rows first and skips a key that failed lately", async () => {
    const { service, prisma } = makeService(["b.pdf"]);
    await service.deleteOrphans("form1", NOW);
    await service.deleteOrphans("form1", NOW + 60_000);
    const [first, second] = prisma.formUpload.findMany.mock.calls.map(([args]) => args);
    expect(first.orderBy).toEqual({ createdAt: "asc" });
    expect(first.where.key).toBeUndefined();
    expect(second.where.key).toEqual({ notIn: ["b.pdf"] });
  });

  it("tries a failed key again after an hour", async () => {
    const { service, prisma } = makeService(["b.pdf"]);
    await service.deleteOrphans("form1", NOW);
    await service.deleteOrphans("form1", NOW + 61 * 60_000);
    const [, second] = prisma.formUpload.findMany.mock.calls.map(([args]) => args);
    expect(second.where.key).toBeUndefined();
  });
});
