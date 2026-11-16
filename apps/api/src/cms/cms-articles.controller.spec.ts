import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsArticlesController } from "./cms-articles.controller.js";

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
const MEDIA_KEY = "article-post-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";

function validArticle(overrides: Record<string, unknown> = {}) {
  return {
    article: {
      slug: "post",
      title: "A post",
      date: "2026-11-01",
      categories: ["news"],
      authorSlugs: ["ani"],
      draft: false,
      ...overrides,
    },
    content: [],
  };
}

function makeController() {
  const articles = {
    all: vi.fn().mockResolvedValue([{ slug: "post" }]),
    allIncludingDrafts: vi.fn().mockResolvedValue([{ slug: "post" }, { slug: "draft" }]),
    feed: vi.fn().mockResolvedValue([{ slug: "post", content: [] }]),
    bySlug: vi.fn().mockResolvedValue({ slug: "post" }),
    save: vi.fn().mockResolvedValue({ slug: "post", updatedAt: LOADED }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const storage = {
    uploadFile: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue("https://files.example.test/signed"),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue(PASS) };
  const controller = new CmsArticlesController(
    articles as never,
    storage as never,
    config as never,
  );
  return { controller, articles, storage };
}

function makeResponse() {
  return { redirect: vi.fn().mockReturnValue("redirected") };
}

describe("CmsArticlesController public reads", () => {
  it("lists articles, the feed and one record", async () => {
    const { controller } = makeController();

    await expect(controller.all()).resolves.toEqual({ records: [{ slug: "post" }] });
    await expect(controller.feed()).resolves.toEqual({ records: [{ slug: "post", content: [] }] });
    await expect(controller.one("post")).resolves.toEqual({ record: { slug: "post" } });
  });

  it("passes the 404 of a missing record through", async () => {
    const { controller, articles } = makeController();
    articles.bySlug.mockRejectedValue(new NotFoundException());

    await expect(controller.one("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsArticlesController passphrase check", () => {
  it.each([
    ["allIncludingDrafts", (c: CmsArticlesController, p?: string) => c.allIncludingDrafts(p)],
    ["save", (c: CmsArticlesController, p?: string) => c.save("post", validArticle(), p)],
    ["remove", (c: CmsArticlesController, p?: string) => c.remove("post", p)],
    [
      "uploadCover",
      (c: CmsArticlesController, p?: string) => c.uploadCover("post", { image: "x" }, p),
    ],
  ])("answers 401 for %s with no or a wrong passphrase", async (_name, call) => {
    const { controller, articles, storage } = makeController();

    await expect(call(controller)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(call(controller, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(articles.save).not.toHaveBeenCalled();
    expect(articles.remove).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("lists drafts with the passphrase", async () => {
    const { controller } = makeController();

    await expect(controller.allIncludingDrafts(PASS)).resolves.toEqual({
      records: [{ slug: "post" }, { slug: "draft" }],
    });
  });
});

describe("CmsArticlesController save and remove", () => {
  it("saves a valid article with the version header", async () => {
    const { controller, articles } = makeController();

    await controller.save("post", { ...validArticle(), sourceSlug: "post" }, PASS, LOADED);

    const [current, next, data, version] = articles.save.mock.calls[0] as [
      string,
      string,
      { article: { slug: string } },
      Date,
    ];
    expect([current, next, data.article.slug]).toEqual(["post", "post", "post"]);
    expect(version).toEqual(new Date(LOADED));
  });

  it("keeps a valid theme and saves without a version header", async () => {
    const { controller, articles } = makeController();

    await controller.save("post", validArticle({ theme: "grove", subtitle: "Sub" }), PASS);

    const data = articles.save.mock.calls[0]?.[2] as { article: { theme: string } };
    expect(data.article.theme).toBe("grove");
    expect(articles.save.mock.calls[0]?.[3]).toBeUndefined();
  });

  it("answers 400 for a bad version header", async () => {
    const { controller, articles } = makeController();

    await expect(controller.save("post", validArticle(), PASS, "later")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(articles.save).not.toHaveBeenCalled();
  });

  it.each([
    ["a bad slug", { slug: "Not A Slug" }, "slug"],
    ["an empty title", { title: " " }, "title"],
    ["a bad date", { date: "1 Nov" }, "date"],
    ["no author", { authorSlugs: [] }, "authorSlugs"],
    ["too many categories", { categories: ["a", "b", "c", "d", "e", "f", "g"] }, "categories"],
    ["an unknown theme", { theme: "neon" }, "theme"],
  ])("answers 400 for %s and names the field", async (_name, overrides, message) => {
    const { controller, articles } = makeController();

    const error = await controller
      .save("post", validArticle(overrides), PASS)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain(message);
    expect(articles.save).not.toHaveBeenCalled();
  });

  it("answers 400 without a field name when the body is not an object", async () => {
    const { controller } = makeController();

    const error = await controller.save("post", "nope", PASS).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).not.toMatch(/^: /);
  });

  it("answers 409 when the new slug belongs to another article", async () => {
    const { controller, articles } = makeController();
    articles.save.mockRejectedValue(new Error("CMS_ARTICLE_SLUG_CONFLICT"));

    await expect(controller.save("old", validArticle(), PASS)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("passes the 409 of a stale version and any other error through", async () => {
    const { controller, articles } = makeController();
    articles.save.mockRejectedValueOnce(new ConflictException("stale"));
    await expectRejection(
      controller.save("post", validArticle(), PASS, LOADED),
      ConflictException,
      "stale",
    );

    articles.save.mockRejectedValueOnce(new Error("boom"));
    await expect(controller.save("post", validArticle(), PASS)).rejects.toThrow("boom");

    articles.save.mockRejectedValueOnce("odd");
    await expect(controller.save("post", validArticle(), PASS)).rejects.toBe("odd");
  });

  it("removes an article and passes the 404 through", async () => {
    const { controller, articles } = makeController();

    await expect(controller.remove("post", PASS)).resolves.toEqual({ ok: true });
    expect(articles.remove).toHaveBeenCalledWith("post");

    articles.remove.mockRejectedValue(new NotFoundException());
    await expect(controller.remove("nope", PASS)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsArticlesController cover and media", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ])("stores a %s cover as .%s", async (type, extension) => {
    const { controller, storage } = makeController();
    const image = `data:${type};base64,${Buffer.from("x").toString("base64")}`;

    const { key } = await controller.uploadCover("post", { image }, PASS);

    expect(key).toMatch(new RegExp(`^article-post-[0-9a-f-]{36}\\.${extension}$`));
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: type, key }),
    );
  });

  it.each([
    ["a body without an image", {}],
    ["an unsupported type", { image: "data:image/gif;base64,aGk=" }],
    ["an empty payload", { image: "data:image/png;base64," }],
    ["a payload over 6 MB", { image: `data:image/png;base64,${"A".repeat(9 * 1024 * 1024)}` }],
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, storage } = makeController();

    await expect(controller.uploadCover("post", body, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 when storage is not configured", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));
    const image = `data:image/png;base64,${Buffer.from("x").toString("base64")}`;

    await expectRejection(
      controller.uploadCover("post", { image }, PASS),
      BadRequestException,
      "Media storage is not configured",
    );
  });

  it("redirects a valid key and refuses another namespace", async () => {
    const { controller, storage } = makeController();

    await expect(controller.media(MEDIA_KEY, makeResponse() as never)).resolves.toBe("redirected");
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(MEDIA_KEY, 900);

    await expect(controller.media("member-x.png", makeResponse() as never)).rejects.toBeInstanceOf(
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
