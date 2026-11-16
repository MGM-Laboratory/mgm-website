import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CmsProjectsController } from "./cms-projects.controller.js";

/** Asserts the Nest exception class of a rejection and, when given, a part of its message. */
async function expectRejection(
  promise: Promise<unknown>,
  type: new (...args: never[]) => Error,
  message?: string,
) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(type);
  if (message !== undefined) expect((error as Error).message).toContain(message);
}

const PASS = "the-admin-passphrase";
const LOADED = "2026-11-14T05:00:00.000Z";
const MEDIA_KEY = "project-alpha-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";
const VIDEO_KEY = "demo-alpha-4f0e5a96-7d62-41be-8e5f-9a41c2638ea5.mp4";

function validProject(overrides: Record<string, unknown> = {}) {
  return {
    slug: "alpha",
    title: "Alpha",
    summary: "A project",
    categories: ["website"],
    techStack: ["TypeScript"],
    status: "in-progress",
    featured: false,
    draft: false,
    galleryKeys: [],
    videoMode: "none",
    links: [],
    contributors: [],
    organizations: [],
    outputs: [],
    ...overrides,
  };
}

function validDocument(project: Record<string, unknown> = {}) {
  return { project: validProject(project), body: [] };
}

function makeController() {
  const projects = {
    all: vi.fn().mockResolvedValue([{ slug: "alpha" }]),
    allIncludingDrafts: vi.fn().mockResolvedValue([{ slug: "alpha" }, { slug: "draft" }]),
    feed: vi.fn().mockResolvedValue([{ slug: "alpha", body: [] }]),
    bySlug: vi.fn().mockResolvedValue({ slug: "alpha" }),
    bootstrap: vi.fn().mockResolvedValue([{ slug: "alpha" }]),
    save: vi.fn().mockResolvedValue({ slug: "alpha", updatedAt: LOADED }),
    remove: vi.fn().mockResolvedValue(undefined),
    videoIsPublished: vi.fn().mockResolvedValue(true),
  };
  const storage = {
    uploadFile: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue("https://files.example.test/signed"),
  };
  const config = {
    getOrThrow: vi.fn((name: string) => (name === "CMS_MAX_VIDEO_BYTES" ? 1024 : PASS)),
  };
  const controller = new CmsProjectsController(
    projects as never,
    storage as never,
    config as never,
  );
  return { controller, projects, storage, config };
}

function makeResponse() {
  return { redirect: vi.fn().mockReturnValue("redirected") };
}

let pngDataUrl: string;
beforeAll(async () => {
  const png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  pngDataUrl = `data:image/png;base64,${png.toString("base64")}`;
});

describe("CmsProjectsController public reads", () => {
  it("lists published projects, the feed and one project", async () => {
    const { controller } = makeController();

    await expect(controller.all()).resolves.toEqual({ records: [{ slug: "alpha" }] });
    await expect(controller.feed()).resolves.toEqual({ records: [{ slug: "alpha", body: [] }] });
    await expect(controller.one("alpha")).resolves.toEqual({ record: { slug: "alpha" } });
  });

  it("passes a 404 from the service through", async () => {
    const { controller, projects } = makeController();
    projects.bySlug.mockRejectedValue(new NotFoundException("Project record not found"));

    await expect(controller.one("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsProjectsController passphrase check", () => {
  it.each([
    ["allIncludingDrafts", (c: CmsProjectsController, p?: string) => c.allIncludingDrafts(p)],
    ["bootstrap", (c: CmsProjectsController, p?: string) => c.bootstrap({ records: [] }, p)],
    [
      "uploadContributorPhoto",
      (c: CmsProjectsController, p?: string) => c.uploadContributorPhoto({ image: "x" }, p),
    ],
    ["save", (c: CmsProjectsController, p?: string) => c.save("alpha", validDocument(), p)],
    ["remove", (c: CmsProjectsController, p?: string) => c.remove("alpha", p)],
    [
      "uploadMedia",
      (c: CmsProjectsController, p?: string) => c.uploadMedia("alpha", { image: "x" }, p),
    ],
    [
      "uploadVideo",
      (c: CmsProjectsController, p?: string) => c.uploadVideo("alpha", {} as never, p),
    ],
  ])("answers 401 for %s with no or a wrong passphrase", async (_name, call) => {
    const { controller, projects, storage } = makeController();

    await expect(call(controller)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(call(controller, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(projects.save).not.toHaveBeenCalled();
    expect(projects.remove).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("lists drafts with the passphrase", async () => {
    const { controller } = makeController();

    await expect(controller.allIncludingDrafts(PASS)).resolves.toEqual({
      records: [{ slug: "alpha" }, { slug: "draft" }],
    });
  });
});

describe("CmsProjectsController bootstrap", () => {
  it("seeds valid records", async () => {
    const { controller, projects } = makeController();

    await controller.bootstrap({ records: [validDocument()] }, PASS);

    expect(projects.bootstrap).toHaveBeenCalledWith([expect.objectContaining({ slug: "alpha" })]);
  });

  it("answers 400 for no records and for an invalid record", async () => {
    const { controller, projects } = makeController();

    await expect(controller.bootstrap({ records: [] }, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.bootstrap({ records: [validDocument({ title: "" })] }, PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(projects.bootstrap).not.toHaveBeenCalled();
  });
});

describe("CmsProjectsController save", () => {
  it("saves a valid project with the version header", async () => {
    const { controller, projects } = makeController();

    await controller.save("alpha", { ...validDocument(), sourceSlug: "alpha" }, PASS, LOADED);

    const [current, next, data, version] = projects.save.mock.calls[0] as [
      string,
      string,
      { project: { slug: string } },
      Date,
    ];
    expect([current, next, data.project.slug]).toEqual(["alpha", "alpha", "alpha"]);
    expect(version).toEqual(new Date(LOADED));
  });

  it("saves without a version header", async () => {
    const { controller, projects } = makeController();

    await controller.save("alpha", validDocument(), PASS);

    expect(projects.save.mock.calls[0]?.[3]).toBeUndefined();
  });

  it("accepts the detail fields and a media section of its own kind", async () => {
    const { controller, projects } = makeController();

    await controller.save(
      "alpha",
      validDocument({
        theme: "grove",
        description: "Text",
        cta: { label: "Open", url: "/projects" },
        services: ["Design"],
        media: [
          { id: "m1", kind: "image", size: "normal", key: MEDIA_KEY, width: 0, height: 0 },
          {
            id: "m2",
            kind: "video",
            size: "full",
            key: VIDEO_KEY,
            width: 1,
            height: 1,
            posterKey: MEDIA_KEY,
          },
          { id: "m3", kind: "image", size: "normal", key: "static/seed.png", width: 1, height: 1 },
        ],
      }),
      PASS,
    );

    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it("answers 400 for a bad version header", async () => {
    const { controller, projects } = makeController();

    await expect(controller.save("alpha", validDocument(), PASS, "later")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(projects.save).not.toHaveBeenCalled();
  });

  it.each([
    ["a bad slug", { slug: "Not A Slug" }, "slug"],
    ["no category", { categories: [] }, "categories"],
    ["an unknown status", { status: "paused" }, "status"],
    [
      "an end date before the start date",
      { startDate: "2026-02-01", endDate: "2026-01-01" },
      "earlier",
    ],
    ["a url video with no url", { videoMode: "url" }, "Add a video URL"],
    [
      "a youtube video with a wrong url",
      { videoMode: "youtube", videoUrl: "https://example.test/x" },
      "YouTube",
    ],
    ["an unsafe link", { links: [{ id: "l", label: "x", url: "javascript:alert(1)" }] }, "links"],
    [
      "an unsafe organization url",
      { organizations: [{ name: "Org", url: "//evil.test" }] },
      "organizations",
    ],
    [
      "an output with a bad slug",
      { outputs: [{ id: "o", type: "research", label: "R", href: "/r", recordSlug: "BAD" }] },
      "outputs",
    ],
    [
      "an image section that points at a video key",
      { media: [{ id: "m", kind: "image", size: "normal", key: VIDEO_KEY, width: 1, height: 1 }] },
      "wrong kind",
    ],
    [
      "an image section with a poster",
      {
        media: [
          {
            id: "m",
            kind: "image",
            size: "normal",
            key: MEDIA_KEY,
            width: 1,
            height: 1,
            posterKey: MEDIA_KEY,
          },
        ],
      },
      "wrong kind",
    ],
    [
      "a video section whose poster is a video",
      {
        media: [
          {
            id: "m",
            kind: "video",
            size: "normal",
            key: VIDEO_KEY,
            width: 1,
            height: 1,
            posterKey: VIDEO_KEY,
          },
        ],
      },
      "wrong kind",
    ],
    ["an unknown theme", { theme: "neon" }, "theme"],
  ])("answers 400 for %s", async (_name, overrides, message) => {
    const { controller, projects } = makeController();

    const error = await controller
      .save("alpha", validDocument(overrides), PASS)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain(message);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it("answers 400 for a body with no project", async () => {
    const { controller } = makeController();

    await expect(controller.save("alpha", {}, PASS)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts a youtube video with a youtube url", async () => {
    const { controller, projects } = makeController();

    await controller.save(
      "alpha",
      validDocument({ videoMode: "youtube", videoUrl: "https://youtu.be/abcdef123" }),
      PASS,
    );

    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it("answers 409 when the new slug belongs to another project", async () => {
    const { controller, projects } = makeController();
    projects.save.mockRejectedValue(new Error("CMS_PROJECT_SLUG_CONFLICT"));

    await expect(controller.save("old", validDocument(), PASS)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("passes the 409 of a stale version and any other error through", async () => {
    const { controller, projects } = makeController();
    projects.save.mockRejectedValueOnce(new ConflictException("stale"));
    await expectRejection(
      controller.save("alpha", validDocument(), PASS, LOADED),
      ConflictException,
      "stale",
    );

    projects.save.mockRejectedValueOnce(new Error("boom"));
    await expect(controller.save("alpha", validDocument(), PASS)).rejects.toThrow("boom");

    projects.save.mockRejectedValueOnce("odd");
    await expect(controller.save("alpha", validDocument(), PASS)).rejects.toBe("odd");
  });

  it("removes a project and passes the 404 through", async () => {
    const { controller, projects } = makeController();

    await expect(controller.remove("alpha", PASS)).resolves.toEqual({ ok: true });
    expect(projects.remove).toHaveBeenCalledWith("alpha");

    projects.remove.mockRejectedValue(new NotFoundException());
    await expect(controller.remove("nope", PASS)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsProjectsController contributor photo", () => {
  it("converts the portrait to WebP and stores it under a contributor key", async () => {
    const { controller, storage } = makeController();

    const { key } = await controller.uploadContributorPhoto({ image: pngDataUrl }, PASS);

    expect(key).toMatch(/^contributor-[0-9a-f-]{36}\.webp$/);
    const upload = storage.uploadFile.mock.calls[0]?.[0] as { body: Buffer; contentType: string };
    expect(upload.contentType).toBe("image/webp");
    expect((await sharp(upload.body).metadata()).format).toBe("webp");
  });

  it.each([
    ["a body without an image", {}],
    ["a non image data url", { image: "data:text/plain;base64,aGk=" }],
    ["a data url that is not base64", { image: "data:image/png,aGk=" }],
    ["an empty payload", { image: "data:image/png;base64," }],
    ["a payload over 6 MB", { image: `data:image/png;base64,${"A".repeat(9 * 1024 * 1024)}` }],
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, storage } = makeController();

    await expect(controller.uploadContributorPhoto(body, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 when the bytes are not an image", async () => {
    const { controller } = makeController();
    const image = `data:image/png;base64,${Buffer.from("not an image").toString("base64")}`;

    await expectRejection(
      controller.uploadContributorPhoto({ image }, PASS),
      BadRequestException,
      "That file is not a valid image.",
    );
  });

  it("answers 400 when storage is not configured", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));

    await expectRejection(
      controller.uploadContributorPhoto({ image: pngDataUrl }, PASS),
      BadRequestException,
      "Media storage is not configured",
    );
  });
});

describe("CmsProjectsController media", () => {
  const jpeg = `data:image/jpeg;base64,${Buffer.from("jpg").toString("base64")}`;

  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ])("stores a %s upload as .%s", async (type, extension) => {
    const { controller, storage } = makeController();
    const image = `data:${type};base64,${Buffer.from("x").toString("base64")}`;

    const { key } = await controller.uploadMedia("alpha", { image }, PASS);

    expect(key).toMatch(new RegExp(`^project-alpha-[0-9a-f-]{36}\\.${extension}$`));
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: type, key }),
    );
  });

  it("answers 400 for a bad slug before it reads the body", async () => {
    const { controller, storage } = makeController();

    await expectRejection(
      controller.uploadMedia("Bad Slug", { image: jpeg }, PASS),
      BadRequestException,
      "Invalid project slug",
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it.each([
    ["a body without an image", {}],
    ["an unsupported type", { image: "data:image/gif;base64,aGk=" }],
    ["an empty payload", { image: "data:image/png;base64," }],
    ["a payload over 6 MB", { image: `data:image/png;base64,${"A".repeat(9 * 1024 * 1024)}` }],
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, storage } = makeController();

    await expect(controller.uploadMedia("alpha", body, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 when storage is not configured", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));

    await expectRejection(
      controller.uploadMedia("alpha", { image: jpeg }, PASS),
      BadRequestException,
      "Media storage is not configured",
    );
  });

  it("redirects a valid key and refuses another namespace", async () => {
    const { controller, storage } = makeController();
    const response = makeResponse();

    await expect(controller.media(MEDIA_KEY, response as never)).resolves.toBe("redirected");
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(MEDIA_KEY, 900);

    await expect(controller.media("../x.png", response as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.media(VIDEO_KEY, response as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("answers 400 when signing fails", async () => {
    const { controller, storage } = makeController();
    storage.getSignedDownloadUrl.mockRejectedValue(new Error("no bucket"));

    await expectRejection(
      controller.media(MEDIA_KEY, makeResponse() as never),
      BadRequestException,
      "Media storage is not configured",
    );
  });
});

describe("CmsProjectsController video", () => {
  it("redirects a published video to a signed url", async () => {
    const { controller, storage } = makeController();
    const response = makeResponse();

    await controller.video(VIDEO_KEY, response as never);

    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(VIDEO_KEY, 3600);
    expect(response.redirect).toHaveBeenCalledWith("https://files.example.test/signed");
  });

  it("answers 400 for a key outside the video namespace", async () => {
    const { controller, projects } = makeController();

    await expectRejection(
      controller.video(MEDIA_KEY, makeResponse() as never),
      BadRequestException,
      "Unknown video key",
    );
    expect(projects.videoIsPublished).not.toHaveBeenCalled();
  });

  it("answers 400 for a video that no published project uses", async () => {
    const { controller, projects, storage } = makeController();
    projects.videoIsPublished.mockResolvedValue(false);

    await expectRejection(
      controller.video(VIDEO_KEY, makeResponse() as never),
      BadRequestException,
      "Project record not found",
    );
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("stores an uploaded MP4 and returns its key and size", async () => {
    const { controller, storage } = makeController();
    const body = Buffer.alloc(64);
    body.write("ftyp", 4, "ascii");

    const result = await controller.uploadVideo(
      "alpha",
      { headers: { "content-type": "video/mp4" }, body } as never,
      PASS,
    );

    expect(result.size).toBe(64);
    expect(result.key).toMatch(/^demo-alpha-[0-9a-f-]{36}\.mp4$/);
    expect(storage.uploadFile).toHaveBeenCalledWith({
      body,
      contentType: "video/mp4",
      key: result.key,
    });
  });

  it("answers 400 for a bad slug, a bad body and a body over the limit", async () => {
    const { controller, storage } = makeController();
    const request = (body: Buffer, type = "video/mp4") =>
      ({ headers: { "content-type": type }, body }) as never;
    const mp4 = (size: number) => {
      const buffer = Buffer.alloc(size);
      buffer.write("ftyp", 4, "ascii");
      return buffer;
    };

    await expectRejection(
      controller.uploadVideo("Bad Slug", request(mp4(64)), PASS),
      BadRequestException,
      "Invalid project slug",
    );
    await expect(
      controller.uploadVideo("alpha", request(mp4(64), "text/plain"), PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expectRejection(
      controller.uploadVideo("alpha", request(mp4(2048)), PASS),
      BadRequestException,
      "The video must be under",
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 when video storage is not configured", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));
    const body = Buffer.alloc(64);
    body.write("ftyp", 4, "ascii");

    await expectRejection(
      controller.uploadVideo(
        "alpha",
        { headers: { "content-type": "video/mp4" }, body } as never,
        PASS,
      ),
      BadRequestException,
      "Video storage is not configured",
    );
  });
});
