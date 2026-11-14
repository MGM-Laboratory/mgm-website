import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsArticlesService } from "./cms-articles.service.js";

const LOADED = new Date("2026-11-14T05:00:00.000Z");
const STORED = { slug: "post", data: { article: { slug: "post" } }, updatedAt: LOADED };

function makeService(current: typeof STORED | null, updateError?: unknown) {
  const tx = {
    cmsArticle: {
      findUnique: vi.fn().mockResolvedValue(current),
      create: vi.fn().mockResolvedValue({ ...STORED, updatedAt: new Date(LOADED.getTime() + 1) }),
      update: vi.fn(() =>
        updateError
          ? Promise.reject(updateError)
          : Promise.resolve({ ...STORED, updatedAt: new Date(LOADED.getTime() + 1) }),
      ),
    },
  };
  const prisma = { $transaction: vi.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  const cache = { remove: vi.fn().mockResolvedValue(undefined) };
  const service = new CmsArticlesService(prisma as never, cache as never);
  return { service, tx, cache };
}

describe("a CMS record save with a version", () => {
  it("writes with the version that the transaction read and clears the cache", async () => {
    const { service, tx, cache } = makeService(STORED);
    await service.save("post", "post", STORED.data as never, new Date(LOADED));
    expect(tx.cmsArticle.update).toHaveBeenCalledWith({
      where: { slug: "post", updatedAt: LOADED },
      data: { data: STORED.data, slug: "post" },
    });
    expect(cache.remove).toHaveBeenCalled();
  });

  it("answers 409 and writes nothing when the record changed after it was loaded", async () => {
    const { service, tx, cache } = makeService(STORED);
    const stale = new Date(LOADED.getTime() - 1000);
    await expect(service.save("post", "post", STORED.data as never, stale)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.cmsArticle.update).not.toHaveBeenCalled();
    expect(cache.remove).not.toHaveBeenCalled();
  });

  it("answers 409 and does not create the record when it is gone", async () => {
    const { service, tx } = makeService(null);
    await expect(
      service.save("post", "post", STORED.data as never, new Date(LOADED)),
    ).rejects.toThrow(ConflictException);
    expect(tx.cmsArticle.create).not.toHaveBeenCalled();
  });

  it("answers 409 when another save wins between the read and the update", async () => {
    const { service, cache } = makeService(STORED, { code: "P2025" });
    await expect(
      service.save("post", "post", STORED.data as never, new Date(LOADED)),
    ).rejects.toThrow(ConflictException);
    expect(cache.remove).not.toHaveBeenCalled();
  });
});

describe("a CMS record save without a version", () => {
  it("still saves, and still creates a record that does not exist", async () => {
    const existing = makeService(STORED);
    await existing.service.save("post", "post", STORED.data as never);
    expect(existing.tx.cmsArticle.update).toHaveBeenCalledTimes(1);

    const missing = makeService(null);
    await missing.service.save("post", "post", STORED.data as never);
    expect(missing.tx.cmsArticle.create).toHaveBeenCalledTimes(1);
  });
});
