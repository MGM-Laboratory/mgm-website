import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsResearchController } from "./cms-research.controller.js";

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
const MEDIA_KEY = "research-alpha-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";

function validResearch(overrides: Record<string, unknown> = {}) {
  return {
    slug: "alpha",
    title: "Alpha",
    summary: "Summary",
    question: "Why?",
    areas: ["website"],
    status: "active",
    featured: false,
    draft: false,
    methods: [],
    memberSlugs: [],
    milestones: [],
    outputs: [],
    ...overrides,
  };
}

function validDocument(overrides: Record<string, unknown> = {}) {
  return { research: validResearch(overrides), body: [] };
}

function makeController() {
  const research = {
    all: vi.fn().mockResolvedValue([{ slug: "alpha" }]),
    allIncludingDrafts: vi.fn().mockResolvedValue([{ slug: "alpha" }, { slug: "draft" }]),
    feed: vi.fn().mockResolvedValue([{ slug: "alpha", body: [] }]),
    bySlug: vi.fn().mockResolvedValue({ slug: "alpha" }),
    bootstrap: vi.fn().mockResolvedValue([{ slug: "alpha" }]),
    save: vi.fn().mockResolvedValue({ slug: "alpha", updatedAt: LOADED }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const storage = {
    uploadFile: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue("https://files.example.test/signed"),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue(PASS) };
  const controller = new CmsResearchController(
    research as never,
    storage as never,
    config as never,
  );
  return { controller, research, storage };
}

function makeResponse() {
  return { redirect: vi.fn().mockReturnValue("redirected") };
}

describe("CmsResearchController public reads", () => {
  it("lists initiatives, the feed and one record", async () => {
    const { controller } = makeController();

    await expect(controller.all()).resolves.toEqual({ records: [{ slug: "alpha" }] });
    await expect(controller.feed()).resolves.toEqual({ records: [{ slug: "alpha", body: [] }] });
    await expect(controller.one("alpha")).resolves.toEqual({ record: { slug: "alpha" } });
  });

  it("passes the 404 of a missing record through", async () => {
    const { controller, research } = makeController();
    research.bySlug.mockRejectedValue(new NotFoundException());

    await expect(controller.one("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsResearchController passphrase check", () => {
  it.each([
    ["allIncludingDrafts", (c: CmsResearchController, p?: string) => c.allIncludingDrafts(p)],
    ["bootstrap", (c: CmsResearchController, p?: string) => c.bootstrap({ records: [] }, p)],
    ["save", (c: CmsResearchController, p?: string) => c.save("alpha", validDocument(), p)],
    ["remove", (c: CmsResearchController, p?: string) => c.remove("alpha", p)],
    [
      "uploadCover",
      (c: CmsResearchController, p?: string) => c.uploadCover("alpha", { image: "x" }, p),
    ],
  ])("answers 401 for %s with no or a wrong passphrase", async (_name, call) => {
    const { controller, research, storage } = makeController();

    await expect(call(controller)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(call(controller, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(research.save).not.toHaveBeenCalled();
    expect(research.remove).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("lists drafts with the passphrase", async () => {
    const { controller } = makeController();

    await expect(controller.allIncludingDrafts(PASS)).resolves.toEqual({
      records: [{ slug: "alpha" }, { slug: "draft" }],
    });
  });
});

describe("CmsResearchController bootstrap", () => {
  it("seeds valid records", async () => {
    const { controller, research } = makeController();

    await controller.bootstrap({ records: [validDocument()] }, PASS);

    expect(research.bootstrap).toHaveBeenCalledWith([expect.objectContaining({ slug: "alpha" })]);
  });

  it("answers 400 for no records and for an invalid record", async () => {
    const { controller, research } = makeController();

    await expect(controller.bootstrap({ records: [] }, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.bootstrap({ records: [validDocument({ title: "" })] }, PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(research.bootstrap).not.toHaveBeenCalled();
  });
});

describe("CmsResearchController save and remove", () => {
  it("saves a valid record with the version header", async () => {
    const { controller, research } = makeController();

    await controller.save("alpha", { ...validDocument(), sourceSlug: "alpha" }, PASS, LOADED);

    const [current, next, data, version] = research.save.mock.calls[0] as [
      string,
      string,
      { research: { slug: string } },
      Date,
    ];
    expect([current, next, data.research.slug]).toEqual(["alpha", "alpha", "alpha"]);
    expect(version).toEqual(new Date(LOADED));
  });

  it("saves a full record with milestones, outputs and partners", async () => {
    const { controller, research } = makeController();

    await controller.save(
      "alpha",
      validDocument({
        startDate: "2026-01-01",
        endDate: "2026-06-01",
        milestones: [
          {
            id: "m1",
            date: "2026-02-01",
            title: "Kickoff",
            summary: "Started",
            relatedUrl: "/projects/x",
          },
        ],
        outputs: [
          { id: "o1", type: "project", label: "P", href: "https://x.test", recordSlug: "x" },
        ],
        partners: [{ name: "Org", url: "https://org.test" }],
      }),
      PASS,
    );

    expect(research.save).toHaveBeenCalledTimes(1);
    expect(research.save.mock.calls[0]?.[3]).toBeUndefined();
  });

  it("answers 400 for a bad version header", async () => {
    const { controller, research } = makeController();

    await expect(controller.save("alpha", validDocument(), PASS, "later")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(research.save).not.toHaveBeenCalled();
  });

  it.each([
    ["a bad slug", { slug: "Not A Slug" }, "slug"],
    ["no area", { areas: [] }, "areas"],
    ["an unknown status", { status: "paused" }, "status"],
    [
      "an end date before the start date",
      { startDate: "2026-02-01", endDate: "2026-01-01" },
      "earlier",
    ],
    [
      "a milestone with a bad date",
      { milestones: [{ id: "m", date: "May", title: "T", summary: "S" }] },
      "milestones",
    ],
    [
      "a milestone with an unsafe link",
      {
        milestones: [
          { id: "m", date: "2026-01-01", title: "T", summary: "S", relatedUrl: "javascript:x" },
        ],
      },
      "milestones",
    ],
    [
      "an unsafe output link",
      { outputs: [{ id: "o", type: "project", label: "L", href: "//evil.test" }] },
      "outputs",
    ],
    ["an unsafe partner url", { partners: [{ name: "Org", url: "data:text/html,x" }] }, "partners"],
    ["a member slug that is not a slug", { memberSlugs: ["Not A Slug"] }, "memberSlugs"],
  ])("answers 400 for %s", async (_name, overrides, message) => {
    const { controller, research } = makeController();

    const error = await controller
      .save("alpha", validDocument(overrides), PASS)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain(message);
    expect(research.save).not.toHaveBeenCalled();
  });

  it("answers 409 when the new slug belongs to another record", async () => {
    const { controller, research } = makeController();
    research.save.mockRejectedValue(new Error("CMS_RESEARCH_SLUG_CONFLICT"));

    await expect(controller.save("old", validDocument(), PASS)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("passes the 409 of a stale version and any other error through", async () => {
    const { controller, research } = makeController();
    research.save.mockRejectedValueOnce(new ConflictException("stale"));
    await expectRejection(
      controller.save("alpha", validDocument(), PASS, LOADED),
      ConflictException,
      "stale",
    );

    research.save.mockRejectedValueOnce(new Error("boom"));
    await expect(controller.save("alpha", validDocument(), PASS)).rejects.toThrow("boom");

    research.save.mockRejectedValueOnce("odd");
    await expect(controller.save("alpha", validDocument(), PASS)).rejects.toBe("odd");
  });

  it("removes a record and passes the 404 through", async () => {
    const { controller, research } = makeController();

    await expect(controller.remove("alpha", PASS)).resolves.toEqual({ ok: true });
    expect(research.remove).toHaveBeenCalledWith("alpha");

    research.remove.mockRejectedValue(new NotFoundException());
    await expect(controller.remove("nope", PASS)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsResearchController cover and media", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ])("stores a %s cover as .%s", async (type, extension) => {
    const { controller, storage } = makeController();
    const image = `data:${type};base64,${Buffer.from("x").toString("base64")}`;

    const { key } = await controller.uploadCover("alpha", { image }, PASS);

    expect(key).toMatch(new RegExp(`^research-alpha-[0-9a-f-]{36}\\.${extension}$`));
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: type, key }),
    );
  });

  it.each([
    ["a body without an image", {}],
    ["a non image data url", { image: "data:text/plain;base64,aGk=" }],
    ["an unsupported type", { image: "data:image/gif;base64,aGk=" }],
    ["an empty payload", { image: "data:image/png;base64," }],
    ["a payload over 6 MB", { image: `data:image/png;base64,${"A".repeat(9 * 1024 * 1024)}` }],
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, storage } = makeController();

    await expect(controller.uploadCover("alpha", body, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 when storage is not configured", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));
    const image = `data:image/png;base64,${Buffer.from("x").toString("base64")}`;

    await expectRejection(
      controller.uploadCover("alpha", { image }, PASS),
      BadRequestException,
      "Media storage is not configured",
    );
  });

  it("redirects a valid key and refuses another namespace", async () => {
    const { controller, storage } = makeController();

    await expect(controller.media(MEDIA_KEY, makeResponse() as never)).resolves.toBe("redirected");
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(MEDIA_KEY, 900);

    await expect(controller.media("article-x.png", makeResponse() as never)).rejects.toBeInstanceOf(
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
