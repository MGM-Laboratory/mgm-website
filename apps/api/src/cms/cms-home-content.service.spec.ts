import { DEFAULT_HOME_CONTENT } from "@repo/shared";
import { describe, expect, it, vi } from "vitest";

import { CmsHomeContentService } from "./cms-home-content.service.js";

const VIDEO_KEY = "home-video-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.mp4";

function makeService(options: { stored?: unknown; cached?: unknown } = {}) {
  const model = {
    findUnique: vi
      .fn()
      .mockResolvedValue(options.stored === undefined ? null : { data: options.stored }),
    upsert: vi.fn().mockResolvedValue({}),
  };
  const cache = {
    getJson: vi.fn().mockResolvedValue(options.cached ?? null),
    setJson: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CmsHomeContentService({ cmsHomeContent: model } as never, cache as never);
  return { service, model, cache };
}

describe("CmsHomeContentService get", () => {
  it("returns the stored content and caches it for 10 minutes", async () => {
    const { service, model, cache } = makeService({
      stored: { videoMode: "upload", videoKey: VIDEO_KEY, videoName: "demo.mp4", videoSize: 10 },
    });

    const content = await service.get();

    expect(model.findUnique).toHaveBeenCalledWith({ where: { slug: "home" } });
    expect(content).toEqual({
      videoMode: "upload",
      videoKey: VIDEO_KEY,
      videoName: "demo.mp4",
      videoSize: 10,
    });
    expect(cache.setJson).toHaveBeenCalledWith("cms:home-content:v1", content, 600);
  });

  it("falls back to the default content when nothing is stored", async () => {
    const { service } = makeService();

    await expect(service.get()).resolves.toEqual(DEFAULT_HOME_CONTENT);
  });

  it("falls back to the default content when the stored record is invalid", async () => {
    const { service } = makeService({ stored: { videoMode: "upload", videoSize: -1 } });

    await expect(service.get()).resolves.toEqual(DEFAULT_HOME_CONTENT);
  });

  it("migrates an old url mode record to no video and keeps its other valid fields", async () => {
    const { service } = makeService({
      stored: {
        videoMode: "youtube",
        videoUrl: "https://youtu.be/x",
        videoTitle: "Old",
        videoName: " demo.mp4 ",
        videoSize: 10,
      },
    });

    // A record that the schema rejected would come back as the plain default.
    // These fields prove that it was migrated, and the old ones are dropped.
    await expect(service.get()).resolves.toEqual({
      videoMode: "none",
      videoName: "demo.mp4",
      videoSize: 10,
    });
  });

  it("serves the cached content without a query and revalidates it", async () => {
    const { service, model } = makeService({
      cached: { videoMode: "upload", videoKey: VIDEO_KEY },
    });

    await expect(service.get()).resolves.toEqual({ videoMode: "upload", videoKey: VIDEO_KEY });
    expect(model.findUnique).not.toHaveBeenCalled();
  });

  it("replaces a cached value that no longer passes the schema", async () => {
    const { service } = makeService({ cached: { videoMode: "upload", videoKey: "" } });

    await expect(service.get()).resolves.toEqual(DEFAULT_HOME_CONTENT);
  });
});

describe("CmsHomeContentService save", () => {
  it("upserts the singleton row and clears the cache", async () => {
    const { service, model, cache } = makeService();
    const data = { videoMode: "upload" as const, videoKey: VIDEO_KEY };

    await expect(service.save(data)).resolves.toBe(data);

    expect(model.upsert).toHaveBeenCalledWith({
      where: { slug: "home" },
      create: { slug: "home", data },
      update: { data },
    });
    expect(cache.remove).toHaveBeenCalledWith("cms:home-content:v1");
  });
});

describe("CmsHomeContentService videoKeyMatches", () => {
  it("is true only for the saved upload key", async () => {
    const { service } = makeService({ stored: { videoMode: "upload", videoKey: VIDEO_KEY } });

    await expect(service.videoKeyMatches(VIDEO_KEY)).resolves.toBe(true);
    await expect(
      service.videoKeyMatches("home-video-1c7b2d63-4a3f-4e8b-8b2c-6d1e9f305b72.mp4"),
    ).resolves.toBe(false);
  });

  it("is false when the mode is none even if a key is stored", async () => {
    const { service } = makeService({ stored: { videoMode: "none", videoKey: VIDEO_KEY } });

    await expect(service.videoKeyMatches(VIDEO_KEY)).resolves.toBe(false);
  });
});
