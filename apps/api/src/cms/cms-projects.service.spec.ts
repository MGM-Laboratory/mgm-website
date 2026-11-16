import { ConflictException, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CmsProjectsService } from "./cms-projects.service.js";

const LOADED = new Date("2026-11-14T05:00:00.000Z");
const IMAGE_A = "project-alpha-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";
const IMAGE_B = "project-alpha-1c7b2d63-4a3f-4e8b-8b2c-6d1e9f305b72.jpg";
const IMAGE_C = "project-alpha-2d8c3e74-5b40-4f9c-9c3d-7e2fa0416c83.webp";
const POSTER = "project-alpha-3e9d4f85-6c51-40ad-8d4e-8f30b1527d94.png";
const VIDEO_A = "demo-alpha-4f0e5a96-7d62-41be-8e5f-9a41c2638ea5.mp4";
const VIDEO_B = "demo-alpha-5a1f6ba7-8e73-42cf-9f60-ab52d3749fb6.webm";
const PHOTO = "contributor-6b2a7cb8-9f84-43d0-a071-bc63e485a0c7.webp";

type Row = { slug: string; data: Record<string, unknown>; updatedAt: Date };

function row(slug: string, project: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { slug, data: { project, ...extra }, updatedAt: LOADED } satisfies Row;
}

function makeService(rows: Row[] = [], cached: Record<string, unknown> = {}) {
  const model = {
    findUnique: vi.fn(
      async ({ where }: { where: { slug: string } }) =>
        rows.find((entry) => entry.slug === where.slug) ?? null,
    ),
    findMany: vi.fn().mockResolvedValue(rows),
    count: vi.fn().mockResolvedValue(rows.length),
    create: vi.fn(async ({ data }: { data: { slug: string; data: unknown } }) => ({
      ...data,
      updatedAt: LOADED,
    })),
    update: vi.fn(async ({ data }: { data: { slug: string; data: unknown } }) => ({
      ...data,
      updatedAt: new Date(LOADED.getTime() + 1),
    })),
    upsert: vi.fn().mockResolvedValue({}),
    delete: vi.fn(async ({ where }: { where: { slug: string } }) => {
      const found = rows.find((entry) => entry.slug === where.slug);
      if (!found) throw new Error("not found");
      return found;
    }),
  };
  const prisma = {
    cmsProject: model,
    $transaction: vi.fn(async (work: unknown) =>
      typeof work === "function"
        ? (work as (client: { cmsProject: typeof model }) => unknown)({ cmsProject: model })
        : Promise.all(work as Promise<unknown>[]),
    ),
  };
  const store = new Map<string, unknown>(Object.entries(cached));
  const cache = {
    getJson: vi.fn(async (key: string) => store.get(key)),
    setJson: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
  const storage = {
    readFile: vi.fn(),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CmsProjectsService(prisma as never, cache as never, storage as never);
  return { service, model, cache, storage, store };
}

let png: Buffer;
beforeAll(async () => {
  png = await sharp({
    create: { width: 30, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CmsProjectsService lists", () => {
  const rows = [
    row("live", { title: "Live" }, { body: [{ id: "1" }] }),
    row("hidden", { draft: true }),
  ];

  it("lists published projects only and caches them", async () => {
    const { service, cache } = makeService(rows);

    const records = await service.all();

    expect(records.map((record) => record.slug)).toEqual(["live"]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:projects:v1", records, 600);
  });

  it("serves the cached public list without a query", async () => {
    const cached = [{ slug: "c" }];
    const { service, model } = makeService(rows, { "cms:projects:v1": cached });

    await expect(service.all()).resolves.toBe(cached);
    expect(model.findMany).not.toHaveBeenCalled();
  });

  it("builds a feed without the body and caches it", async () => {
    const { service, cache } = makeService(rows);

    const feed = await service.feed();

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ slug: "live", body: [] });
    expect(cache.setJson).toHaveBeenCalledWith("cms:projects:feed:v1", feed, 600);
  });

  it("serves the cached feed without a query", async () => {
    const cached = [{ slug: "c" }];
    const { service, model } = makeService(rows, { "cms:projects:feed:v1": cached });

    await expect(service.feed()).resolves.toBe(cached);
    expect(model.findMany).not.toHaveBeenCalled();
  });

  it("lists drafts for the admin and uses its own cache", async () => {
    const { service, cache } = makeService(rows);

    const records = await service.allIncludingDrafts();

    expect(records.map((record) => record.slug)).toEqual(["live", "hidden"]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:projects:drafts:v1", records, 600);

    const cached = [{ slug: "c" }];
    const again = makeService(rows, { "cms:projects:drafts:v1": cached });
    await expect(again.service.allIncludingDrafts()).resolves.toBe(cached);
  });
});

describe("CmsProjectsService bySlug", () => {
  it("answers 404 for a missing project and for a draft", async () => {
    const { service } = makeService([row("hidden", { draft: true })]);

    await expect(service.bySlug("missing")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.bySlug("hidden")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("measures the cover and gallery of a record without media sections", async () => {
    const { service, storage, cache } = makeService([
      row("alpha", { coverKey: IMAGE_A, galleryKeys: [IMAGE_B, "static/seed.png", 7] }),
    ]);
    storage.readFile.mockResolvedValue(png);

    const record = await service.bySlug("alpha");

    expect(record.mediaSizes).toEqual({ [IMAGE_A]: [30, 20], [IMAGE_B]: [30, 20] });
    expect(storage.readFile).toHaveBeenCalledTimes(2);
    expect(cache.setJson).toHaveBeenCalledWith(
      `cms:projects:media-size:${IMAGE_A}`,
      [30, 20],
      60 * 60 * 24 * 30,
    );
  });

  it("measures only the image sections that carry no size", async () => {
    const { service, storage } = makeService([
      row("alpha", {
        coverKey: IMAGE_A,
        media: [
          { kind: "image", key: IMAGE_B },
          { kind: "image", key: IMAGE_C, width: 10 },
          { kind: "video", key: VIDEO_A },
          { kind: "image" },
        ],
      }),
    ]);
    storage.readFile.mockResolvedValue(png);

    const record = await service.bySlug("alpha");

    expect(Object.keys(record.mediaSizes)).toEqual([IMAGE_B]);
  });

  it("serves a cached size and a cached miss without reading the file", async () => {
    const { service, storage } = makeService(
      [row("alpha", { coverKey: IMAGE_A, galleryKeys: [IMAGE_B] })],
      {
        [`cms:projects:media-size:${IMAGE_A}`]: [640, 480],
        [`cms:projects:media-size:${IMAGE_B}`]: 0,
      },
    );

    const record = await service.bySlug("alpha");

    expect(record.mediaSizes).toEqual({ [IMAGE_A]: [640, 480] });
    expect(storage.readFile).not.toHaveBeenCalled();
  });

  it("remembers a failed read for a short time and leaves the size out", async () => {
    const { service, storage, cache } = makeService([row("alpha", { coverKey: IMAGE_A })]);
    storage.readFile.mockRejectedValue(new Error("gone"));

    const record = await service.bySlug("alpha");

    expect(record.mediaSizes).toEqual({});
    expect(cache.setJson).toHaveBeenCalledWith(`cms:projects:media-size:${IMAGE_A}`, 0, 600);
  });

  it("treats a file that sharp cannot read as a miss", async () => {
    const { service, storage } = makeService([row("alpha", { coverKey: IMAGE_A })]);
    storage.readFile.mockResolvedValue(Buffer.from("not an image"));

    await expect(service.bySlug("alpha")).resolves.toMatchObject({ mediaSizes: {} });
  });

  it("swaps the sides of an image that is stored turned a quarter", async () => {
    const turned = await sharp({
      create: { width: 30, height: 20, channels: 3, background: "#fff" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const { service, storage } = makeService([row("alpha", { coverKey: IMAGE_B })]);
    storage.readFile.mockResolvedValue(turned);

    const record = await service.bySlug("alpha");

    expect(record.mediaSizes).toEqual({ [IMAGE_B]: [20, 30] });
  });

  it("ignores keys outside the media namespace and caps the keys measured", async () => {
    const many = Array.from(
      { length: 60 },
      (_, index) =>
        `project-alpha-${index.toString(16).padStart(8, "0")}-3f2e-4d7a-9a1b-5c0d8e2f4a61.png`,
    );
    const { service, storage } = makeService([
      row("alpha", { coverKey: "../etc/passwd", galleryKeys: many }),
    ]);
    storage.readFile.mockResolvedValue(png);

    await service.bySlug("alpha");

    expect(storage.readFile).toHaveBeenCalledTimes(48);
  });

  it("returns what it has when a read outlasts the time budget", async () => {
    vi.useFakeTimers();
    const { service, storage } = makeService([row("alpha", { coverKey: IMAGE_A })]);
    storage.readFile.mockReturnValue(new Promise(() => undefined));

    const pending = service.bySlug("alpha");
    await vi.advanceTimersByTimeAsync(2500);

    await expect(pending).resolves.toMatchObject({ mediaSizes: {} });
  });
});

describe("CmsProjectsService save", () => {
  const photoProject = {
    coverKey: IMAGE_A,
    galleryKeys: [IMAGE_B],
    videoKey: VIDEO_A,
    media: [
      { kind: "image", key: IMAGE_C },
      { kind: "video", key: VIDEO_B, posterKey: POSTER },
    ],
    contributors: [{ photoKey: PHOTO }, { name: "No photo" }],
  };
  const bodyWithImage = [
    {
      props: { url: `/api/projects-cms/media/${encodeURIComponent(POSTER)}` },
      children: [{ props: { url: "/api/projects-cms/media/%E0%A4%A" } }, { props: {} }],
    },
  ];

  it("writes with the version the transaction read and clears the caches", async () => {
    const { service, model, cache } = makeService([row("alpha", {})]);

    const saved = await service.save("alpha", "alpha", { project: {} });

    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "alpha", updatedAt: LOADED },
      data: { data: { project: {} }, slug: "alpha" },
    });
    expect(saved).toMatchObject({ slug: "alpha" });
    expect(cache.remove).toHaveBeenCalledTimes(3);
  });

  it("creates a record that does not exist yet", async () => {
    const { service, model } = makeService();

    await service.save("new", "new", { project: {} });

    expect(model.create).toHaveBeenCalledWith({ data: { slug: "new", data: { project: {} } } });
  });

  it("answers 404 when a rename targets a missing record", async () => {
    const { service } = makeService();

    await expect(service.save("old", "new", {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a rename onto a slug in use", async () => {
    const { service, model } = makeService([row("a", {}), row("b", {})]);

    await expect(service.save("a", "b", {})).rejects.toThrow("CMS_PROJECT_SLUG_CONFLICT");
    expect(model.update).not.toHaveBeenCalled();
  });

  it("answers 409 for a stale version, for a lost record and for a lost race", async () => {
    const stale = makeService([row("a", {})]);
    await expect(
      stale.service.save("a", "a", {}, new Date(LOADED.getTime() - 1)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stale.model.update).not.toHaveBeenCalled();

    const gone = makeService();
    await expect(gone.service.save("a", "a", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);
    expect(gone.model.create).not.toHaveBeenCalled();

    const race = makeService([row("a", {})]);
    race.model.update.mockRejectedValueOnce({ code: "P2025" });
    await expect(race.service.save("a", "a", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);
  });

  it("deletes the stored files that the new version no longer uses", async () => {
    const { service, storage } = makeService([row("alpha", photoProject, { body: bodyWithImage })]);

    await service.save("alpha", "alpha", { project: { coverKey: IMAGE_A }, body: [] });

    // The poster is also placed in the body, so it is named twice and deleted twice. That is harmless.
    const deleted = [...new Set(storage.deleteFile.mock.calls.map((call) => call[0]))].sort();
    expect(deleted).toEqual([IMAGE_B, IMAGE_C, POSTER, VIDEO_A, VIDEO_B, PHOTO].sort());
  });

  it("keeps a file that the body still shows", async () => {
    const { service, storage } = makeService([row("alpha", { galleryKeys: [POSTER] })]);

    await service.save("alpha", "alpha", { project: {}, body: bodyWithImage });

    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it("never deletes a key that is outside the storage namespaces", async () => {
    const { service, storage } = makeService([
      row("alpha", {
        coverKey: "static/seed.png",
        videoKey: "static/seed.mp4",
        contributors: [{ photoKey: "static/who.webp" }],
      }),
    ]);

    await service.save("alpha", "alpha", { project: {} });

    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it("still saves when a stale file cannot be deleted", async () => {
    const { service, storage, cache } = makeService([row("alpha", photoProject)]);
    storage.deleteFile.mockRejectedValue(new Error("storage down"));

    await expect(service.save("alpha", "alpha", { project: {} })).resolves.toBeDefined();
    expect(cache.remove).toHaveBeenCalled();
  });

  it("reads loosely typed stored data without throwing", async () => {
    const { service, storage } = makeService([
      { slug: "odd", data: {}, updatedAt: LOADED },
      row("odd2", { galleryKeys: "nope", media: "nope", contributors: "nope" }),
    ]);

    await service.save("odd", "odd", { project: {} });
    await service.save("odd2", "odd2", { project: {} });

    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});

describe("CmsProjectsService bootstrap and remove", () => {
  it("seeds an empty table", async () => {
    const { service, model, cache } = makeService();

    await service.bootstrap([{ slug: "a", data: { project: {} } }]);

    expect(model.upsert).toHaveBeenCalledWith({
      where: { slug: "a" },
      create: { slug: "a", data: { project: {} } },
      update: { data: { project: {} } },
    });
    expect(cache.remove).toHaveBeenCalledTimes(3);
  });

  it("does not seed when projects exist", async () => {
    const { service, model } = makeService([row("a", {})]);

    await service.bootstrap([{ slug: "b", data: {} }]);

    expect(model.upsert).not.toHaveBeenCalled();
  });

  it("answers 404 when the project to remove is gone", async () => {
    const { service, cache } = makeService();

    await expect(service.remove("nope")).rejects.toBeInstanceOf(NotFoundException);
    expect(cache.remove).not.toHaveBeenCalled();
  });

  it("removes the record and every stored file it used", async () => {
    const { service, storage, cache } = makeService([
      row(
        "alpha",
        {
          coverKey: IMAGE_A,
          videoKey: VIDEO_A,
          media: [{ kind: "video", key: VIDEO_B }],
          contributors: [{ photoKey: PHOTO }],
        },
        {},
      ),
    ]);

    await service.remove("alpha");

    expect(storage.deleteFile.mock.calls.map((call) => call[0]).sort()).toEqual(
      [IMAGE_A, VIDEO_A, VIDEO_B, PHOTO].sort(),
    );
    expect(cache.remove).toHaveBeenCalledTimes(3);
  });

  it("skips files outside the namespaces and survives a failed delete", async () => {
    const { service, storage } = makeService([
      row("alpha", { coverKey: IMAGE_A, videoKey: "static/seed.mp4" }),
    ]);
    storage.deleteFile.mockRejectedValue(new Error("down"));

    await expect(service.remove("alpha")).resolves.toBeUndefined();
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
  });
});

describe("CmsProjectsService videoIsPublished memo", () => {
  it("keeps the list for a few seconds, then reads it again, and a save drops it at once", async () => {
    vi.useFakeTimers();
    const { service, model, store } = makeService([row("alpha", { videoKey: VIDEO_A })]);

    await expect(service.videoIsPublished(VIDEO_A)).resolves.toBe(true);
    await expect(service.videoIsPublished(VIDEO_A)).resolves.toBe(true);
    expect(model.findMany).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(16_000);
    store.clear();
    await expect(service.videoIsPublished(VIDEO_A)).resolves.toBe(true);
    expect(model.findMany).toHaveBeenCalledTimes(2);

    await service.save("alpha", "alpha", { project: { videoKey: VIDEO_B } });
    await expect(service.videoIsPublished(VIDEO_A)).resolves.toBe(true);
    expect(model.findMany).toHaveBeenCalledTimes(3);
  });
});
