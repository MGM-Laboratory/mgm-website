import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CmsPublicationsController } from "./cms-publications.controller.js";

const PASS = "the-admin-passphrase";
const LOADED = "2026-11-14T05:00:00.000Z";
const PAPER_KEY = "paper-study-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.pdf";
const PHOTO_KEY = "author-2d8c3e74-5b40-4f9c-9c3d-7e2fa0416c83.webp";

function validDocument(overrides: Record<string, unknown> = {}) {
  return {
    publication: {
      slug: "study",
      title: "A study",
      type: "journal-article",
      date: "2026-05-01",
      keywords: ["ml"],
      authors: [{ id: "a1", name: "Ani" }],
      draft: false,
      ...overrides,
    },
  };
}

function makeController() {
  const publications = {
    all: vi.fn().mockResolvedValue([{ slug: "study" }]),
    allIncludingDrafts: vi.fn().mockResolvedValue([{ slug: "study" }, { slug: "draft" }]),
    feed: vi.fn().mockResolvedValue([{ slug: "study" }]),
    bySlug: vi.fn().mockResolvedValue({ slug: "study" }),
    paperIsPublished: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue({ slug: "study", updatedAt: LOADED }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const storage = {
    uploadFile: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue("https://files.example.test/signed"),
  };
  const config = {
    getOrThrow: vi.fn((name: string) => (name === "CMS_MAX_PAPER_BYTES" ? 2 * 1024 * 1024 : PASS)),
  };
  const controller = new CmsPublicationsController(
    publications as never,
    storage as never,
    config as never,
  );
  return { controller, publications, storage, config };
}

function makeResponse() {
  return { redirect: vi.fn().mockReturnValue("redirected") };
}

const bodyRequest = (body: unknown) => ({ body, headers: {} }) as never;

function pdfRequest(body: unknown, contentType: string | null = "application/pdf") {
  return { body, headers: contentType === null ? {} : { "content-type": contentType } } as never;
}

function pdfBytes(size: number) {
  const buffer = Buffer.alloc(size);
  buffer.write("%PDF-", 0, "ascii");
  return buffer;
}

let pngDataUrl: string;
beforeAll(async () => {
  const png = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
  pngDataUrl = `data:image/png;base64,${png.toString("base64")}`;
});

describe("CmsPublicationsController public reads", () => {
  it("lists publications, the feed and one record", async () => {
    const { controller } = makeController();

    await expect(controller.all()).resolves.toEqual({ records: [{ slug: "study" }] });
    await expect(controller.feed()).resolves.toEqual({ records: [{ slug: "study" }] });
    await expect(controller.one("study")).resolves.toEqual({ record: { slug: "study" } });
  });

  it("passes the 404 of a missing record through", async () => {
    const { controller, publications } = makeController();
    publications.bySlug.mockRejectedValue(new NotFoundException());

    await expect(controller.one("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsPublicationsController passphrase check", () => {
  it.each([
    ["allIncludingDrafts", (c: CmsPublicationsController, p?: string) => c.allIncludingDrafts(p)],
    [
      "uploadAuthorPhoto",
      (c: CmsPublicationsController, p?: string) => c.uploadAuthorPhoto(bodyRequest({}), p),
    ],
    [
      "save",
      (c: CmsPublicationsController, p?: string) =>
        c.save("study", bodyRequest(validDocument()), p),
    ],
    ["remove", (c: CmsPublicationsController, p?: string) => c.remove("study", p)],
    [
      "uploadPaper",
      (c: CmsPublicationsController, p?: string) =>
        c.uploadPaper("study", pdfRequest(pdfBytes(10)), p),
    ],
  ])("answers 401 for %s with no or a wrong passphrase", async (_name, call) => {
    const { controller, publications, storage } = makeController();

    await expect(call(controller)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(call(controller, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(publications.save).not.toHaveBeenCalled();
    expect(publications.remove).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("lists drafts with the passphrase", async () => {
    const { controller } = makeController();

    await expect(controller.allIncludingDrafts(PASS)).resolves.toEqual({
      records: [{ slug: "study" }, { slug: "draft" }],
    });
  });
});

describe("CmsPublicationsController paper and media redirects", () => {
  it("redirects a published paper to a signed url that lasts an hour", async () => {
    const { controller, storage } = makeController();
    const response = makeResponse();

    await expect(controller.paper(PAPER_KEY, response as never)).resolves.toBe("redirected");

    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(PAPER_KEY, 3600);
  });

  it("answers 400 for a key that is not a paper key", async () => {
    const { controller, publications } = makeController();

    await expect(controller.paper("../x.pdf", makeResponse() as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(publications.paperIsPublished).not.toHaveBeenCalled();
  });

  it("answers 404 for a paper that is hidden or belongs to a draft", async () => {
    const { controller, publications, storage } = makeController();
    publications.paperIsPublished.mockResolvedValue(false);

    await expect(controller.paper(PAPER_KEY, makeResponse() as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("answers 400 when paper storage cannot sign", async () => {
    const { controller, storage } = makeController();
    storage.getSignedDownloadUrl.mockRejectedValue(new Error("no bucket"));

    await expect(controller.paper(PAPER_KEY, makeResponse() as never)).rejects.toThrow(
      "Media storage is not configured",
    );
  });

  it("redirects an author photo and refuses other keys", async () => {
    const { controller, storage } = makeController();

    await expect(controller.media(PHOTO_KEY, makeResponse() as never)).resolves.toBe("redirected");
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(PHOTO_KEY, 3600);

    await expect(controller.media(PAPER_KEY, makeResponse() as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("answers 400 when photo storage cannot sign", async () => {
    const { controller, storage } = makeController();
    storage.getSignedDownloadUrl.mockRejectedValue(new Error("no bucket"));

    await expect(controller.media(PHOTO_KEY, makeResponse() as never)).rejects.toThrow(
      "Media storage is not configured",
    );
  });
});

describe("CmsPublicationsController author photo", () => {
  it("converts the portrait to WebP, keeps it as an author key", async () => {
    const { controller, storage } = makeController();

    const { key } = await controller.uploadAuthorPhoto(bodyRequest({ image: pngDataUrl }), PASS);

    expect(key).toMatch(/^author-[0-9a-f-]{36}\.webp$/);
    const upload = storage.uploadFile.mock.calls[0]?.[0] as { body: Buffer; contentType: string };
    expect(upload.contentType).toBe("image/webp");
    expect((await sharp(upload.body).metadata()).format).toBe("webp");
  });

  it.each([
    ["a data url that is not base64", { image: "data:image/png,aGk=" }],
    ["an empty payload", { image: "data:image/png;base64," }],
    ["a payload over 6 MB", { image: `data:image/png;base64,${"A".repeat(9 * 1024 * 1024)}` }],
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, storage } = makeController();

    await expect(controller.uploadAuthorPhoto(bodyRequest(body), PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("rejects a body without an image and a data url that is not an image", async () => {
    const { controller, storage } = makeController();

    await expect(controller.uploadAuthorPhoto(bodyRequest({}), PASS)).rejects.toThrow();
    await expect(
      controller.uploadAuthorPhoto(bodyRequest({ image: "data:text/plain;base64,aGk=" }), PASS),
    ).rejects.toThrow();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 when the bytes are not an image", async () => {
    const { controller } = makeController();
    const image = `data:image/png;base64,${Buffer.from("not an image").toString("base64")}`;

    await expect(controller.uploadAuthorPhoto(bodyRequest({ image }), PASS)).rejects.toThrow(
      "That file is not a valid image.",
    );
  });

  it("answers 400 when storage is not configured", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));

    await expect(
      controller.uploadAuthorPhoto(bodyRequest({ image: pngDataUrl }), PASS),
    ).rejects.toThrow("Media storage is not configured");
  });
});

describe("CmsPublicationsController save and remove", () => {
  it("saves a valid record, hides the paper by default and passes the version", async () => {
    const { controller, publications } = makeController();

    await controller.save(
      "study",
      bodyRequest({ ...validDocument(), sourceSlug: "study" }),
      PASS,
      LOADED,
    );

    const [current, next, data, version] = publications.save.mock.calls[0] as [
      string,
      string,
      { publication: { slug: string; paperHidden: boolean } },
      Date,
    ];
    expect([current, next, data.publication.slug]).toEqual(["study", "study", "study"]);
    expect(data.publication.paperHidden).toBe(true);
    expect(version).toEqual(new Date(LOADED));
  });

  it("keeps an explicit paperHidden false and accepts a year only date", async () => {
    const { controller, publications } = makeController();

    await controller.save(
      "study",
      bodyRequest(validDocument({ paperHidden: false, date: "2019", doi: "10.1000/xyz123" })),
      PASS,
    );

    const data = publications.save.mock.calls[0]?.[2] as { publication: { paperHidden: boolean } };
    expect(data.publication.paperHidden).toBe(false);
    expect(publications.save.mock.calls[0]?.[3]).toBeUndefined();
  });

  it("answers 400 for a bad version header", async () => {
    const { controller, publications } = makeController();

    await expect(
      controller.save("study", bodyRequest(validDocument()), PASS, "later"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(publications.save).not.toHaveBeenCalled();
  });

  it.each([
    ["a bad slug", { slug: "Not A Slug" }],
    ["an unknown type", { type: "blog" }],
    ["a bad date", { date: "May 2026" }],
    ["a bad DOI", { doi: "https://doi.org/10.1000/x" }],
    ["no authors", { authors: [] }],
    ["too many keywords", { keywords: Array.from({ length: 21 }, (_, index) => `k${index}`) }],
  ])("rejects %s and saves nothing", async (_name, overrides) => {
    const { controller, publications } = makeController();

    await expect(
      controller.save("study", bodyRequest(validDocument(overrides)), PASS),
    ).rejects.toThrow();
    expect(publications.save).not.toHaveBeenCalled();
  });

  it("answers 409 when the new slug belongs to another record", async () => {
    const { controller, publications } = makeController();
    publications.save.mockRejectedValue(new Error("CMS_PUBLICATION_SLUG_CONFLICT"));

    await expect(controller.save("old", bodyRequest(validDocument()), PASS)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("passes the 409 of a stale version and any other error through", async () => {
    const { controller, publications } = makeController();
    publications.save.mockRejectedValueOnce(new ConflictException("stale"));
    await expect(
      controller.save("study", bodyRequest(validDocument()), PASS, LOADED),
    ).rejects.toThrow("stale");

    publications.save.mockRejectedValueOnce(new Error("boom"));
    await expect(controller.save("study", bodyRequest(validDocument()), PASS)).rejects.toThrow(
      "boom",
    );

    publications.save.mockRejectedValueOnce("odd");
    await expect(controller.save("study", bodyRequest(validDocument()), PASS)).rejects.toBe("odd");
  });

  it("removes a record and passes the 404 through", async () => {
    const { controller, publications } = makeController();

    await expect(controller.remove("study", PASS)).resolves.toEqual({ ok: true });
    expect(publications.remove).toHaveBeenCalledWith("study");

    publications.remove.mockRejectedValue(new NotFoundException());
    await expect(controller.remove("nope", PASS)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsPublicationsController uploadPaper", () => {
  it("stores a PDF and returns its key and size", async () => {
    const { controller, storage } = makeController();
    const body = pdfBytes(100);

    const result = await controller.uploadPaper("study", pdfRequest(body), PASS);

    expect(result.size).toBe(100);
    expect(result.key).toMatch(/^paper-study-[0-9a-f-]{36}\.pdf$/);
    expect(storage.uploadFile).toHaveBeenCalledWith({
      body,
      contentType: "application/pdf",
      key: result.key,
    });
  });

  it("reads the content type without parameters and in any case", async () => {
    const { controller } = makeController();

    await expect(
      controller.uploadPaper("study", pdfRequest(pdfBytes(10), " Application/PDF; x=1 "), PASS),
    ).resolves.toMatchObject({ size: 10 });
  });

  it("answers 400 for a bad slug", async () => {
    const { controller, storage } = makeController();

    await expect(
      controller.uploadPaper("Bad Slug", pdfRequest(pdfBytes(10)), PASS),
    ).rejects.toThrow("Invalid publication slug");
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it.each([
    ["a body that is an array", pdfRequest([1, 2, 3])],
    ["a body that is a string", pdfRequest("%PDF-1")],
    ["no body", pdfRequest(undefined)],
    ["an empty body", pdfRequest(Buffer.alloc(0))],
    ["no content type", pdfRequest(pdfBytes(10), null)],
    ["a wrong content type", pdfRequest(pdfBytes(10), "text/plain")],
  ])("answers 400 for %s", async (_name, request) => {
    const { controller, storage } = makeController();

    await expect(controller.uploadPaper("study", request, PASS)).rejects.toThrow(
      "The paper must be a PDF file.",
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 for a body over the limit and for a file that is not a PDF", async () => {
    const { controller, storage } = makeController();

    await expect(
      controller.uploadPaper("study", pdfRequest(pdfBytes(3 * 1024 * 1024)), PASS),
    ).rejects.toThrow("The paper must be under 2 MB.");
    await expect(
      controller.uploadPaper("study", pdfRequest(Buffer.from("not a pdf at all")), PASS),
    ).rejects.toThrow("That file is not a valid PDF.");
    await expect(
      controller.uploadPaper("study", pdfRequest(Buffer.from("%PDF")), PASS),
    ).rejects.toThrow("That file is not a valid PDF.");
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 when paper storage is not configured", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));

    await expect(controller.uploadPaper("study", pdfRequest(pdfBytes(10)), PASS)).rejects.toThrow(
      "Paper storage is not configured",
    );
  });
});
