import { describe, expect, it, vi } from "vitest";

import { CmsProjectsService } from "./cms-projects.service.js";

const DEMO = "demo-alpha-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.mp4";
const SECTION = "demo-beta-1c7b2d63-4a3f-4e8b-8b2c-6d1e9f305b72.webm";
const DRAFT = "demo-gamma-2d8c3e74-5b40-4f9c-9c3d-7e2fa0416c83.mp4";
const UNUSED = "demo-delta-3e9d4f85-6c51-40ad-8d4e-8f30b1527d94.mp4";

function row(slug: string, project: Record<string, unknown>) {
  return { slug, data: { project }, updatedAt: new Date("2026-01-01T00:00:00Z") };
}

function makeService() {
  const rows = [
    row("alpha", { videoKey: DEMO }),
    row("beta", { media: [{ kind: "video", key: SECTION }] }),
    row("gamma", { videoKey: DRAFT, draft: true }),
  ];
  const prisma = { cmsProject: { findMany: vi.fn().mockResolvedValue(rows) } };
  const store = new Map<string, unknown>();
  const cache = {
    getJson: vi.fn(async (key: string) => store.get(key)),
    setJson: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    remove: vi.fn(async (...keys: string[]) => {
      for (const key of keys) store.delete(key);
    }),
  };
  const service = new CmsProjectsService(prisma as never, cache as never, {} as never);
  return { service, prisma, cache };
}

describe("videoIsPublished", () => {
  it("accepts the demo video and a video media section of a published project", async () => {
    const { service } = makeService();
    expect(await service.videoIsPublished(DEMO)).toBe(true);
    expect(await service.videoIsPublished(SECTION)).toBe(true);
  });

  it("refuses the video of a draft and a key that nothing uses", async () => {
    const { service } = makeService();
    expect(await service.videoIsPublished(DRAFT)).toBe(false);
    expect(await service.videoIsPublished(UNUSED)).toBe(false);
  });

  it("reads the projects once and makes no cache entry for each key", async () => {
    const { service, prisma, cache } = makeService();
    await service.videoIsPublished(DEMO);
    await service.videoIsPublished(UNUSED);
    await service.videoIsPublished("demo-epsilon-4f0e5096-7d62-41be-9e5f-9041c2638ea5.mp4");
    expect(prisma.cmsProject.findMany).toHaveBeenCalledTimes(1);
    expect(cache.setJson).toHaveBeenCalledTimes(1);
  });

  it("shares one load between requests that arrive together, even without a cache", async () => {
    const { service, prisma, cache } = makeService();
    cache.getJson.mockResolvedValue(undefined);
    cache.setJson.mockResolvedValue(undefined);
    const answers = await Promise.all([
      service.videoIsPublished(DEMO),
      service.videoIsPublished(SECTION),
      service.videoIsPublished(UNUSED),
    ]);
    expect(answers).toEqual([true, true, false]);
    expect(prisma.cmsProject.findMany).toHaveBeenCalledTimes(1);
  });

  it("does not read the projects again for the next requests while the list is fresh", async () => {
    const { service, prisma, cache } = makeService();
    cache.getJson.mockResolvedValue(undefined);
    cache.setJson.mockResolvedValue(undefined);
    await service.videoIsPublished(DEMO);
    await service.videoIsPublished(UNUSED);
    expect(prisma.cmsProject.findMany).toHaveBeenCalledTimes(1);
  });

  it("builds the list again after a save or delete cleared it", async () => {
    const { service, prisma } = makeService();
    await service.videoIsPublished(DEMO);
    await (service as unknown as { invalidateRecords(): Promise<void> }).invalidateRecords();
    await service.videoIsPublished(DEMO);
    expect(prisma.cmsProject.findMany).toHaveBeenCalledTimes(2);
  });
});
