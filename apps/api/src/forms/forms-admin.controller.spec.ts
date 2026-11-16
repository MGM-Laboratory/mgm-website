// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { HttpException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormsAdminController } from "./forms-admin.controller.js";
import { FormsError } from "./forms.common.js";

const PASS = "admin-pass";
// A 1x1 PNG, built from its bytes so no long literal sits in the file.
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0,
]);
const PNG_URL = `data:image/png;base64,${PNG.toString("base64")}`;

function make() {
  const forms = {
    create: vi.fn(async () => ({ id: "f1" })),
    duplicate: vi.fn(async () => ({ id: "f2" })),
    get: vi.fn(async () => ({ id: "f1" })),
    list: vi.fn(async () => [{ id: "f1" }]),
    remove: vi.fn(async () => undefined),
    require: vi.fn(async () => ({ id: "abc123" })),
    slugAvailable: vi.fn(async () => ({ available: true })),
    update: vi.fn(async () => ({ id: "f1" })),
  };
  const responses = {
    apply: vi.fn(async () => ({ count: 1, ok: true })),
    bulk: vi.fn(async () => ({ count: 1, ok: true })),
    fileBytes: vi.fn(async () => ({
      body: Buffer.from("bytes"),
      name: "ré sumé.pdf",
      type: "application/pdf",
    })),
    fileLink: vi.fn(async () => ({ url: "https://signed.example/x" })),
    list: vi.fn(async () => ({ nextCursor: null, responses: [] })),
    patch: vi.fn(async () => ({ id: "r1" })),
  };
  const analytics = {
    analytics: vi.fn(async () => ({ ok: true })),
    visits: vi.fn(async () => [{ id: "v" }]),
  };
  const storage = { uploadFile: vi.fn(async () => ({ key: "x" })) };
  const values: Record<string, unknown> = {
    ADMIN_PASSPHRASE: PASS,
    CMS_MAX_VIDEO_BYTES: 1000,
    FORMS_MAX_UPLOAD_BYTES: 5000,
  };
  const config = { getOrThrow: (key: string) => values[key] };
  const controller = new FormsAdminController(
    forms as never,
    responses as never,
    analytics as never,
    storage as never,
    config as never,
  );
  return { analytics, controller, forms, responses, storage };
}

async function status(work: Promise<unknown>) {
  const error = await work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return error instanceof HttpException
    ? { message: error.message, status: error.getStatus() }
    : error;
}

function imageRequest(body: unknown, contentType = "application/json") {
  return { body, headers: { "content-type": contentType } } as never;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("FormsAdminController guard", () => {
  it("answers 401 without the passphrase on every route", async () => {
    const { controller } = make();
    const res = { json: vi.fn(), send: vi.fn(), setHeader: vi.fn() } as never;
    const calls: Array<(pass?: string) => Promise<unknown>> = [
      (pass) => controller.list(pass),
      (pass) => controller.create({}, pass),
      (pass) => controller.slugAvailable("a", "b", pass),
      (pass) => controller.get("f1", pass),
      (pass) => controller.update("f1", {}, pass),
      (pass) => controller.remove("f1", pass),
      (pass) => controller.duplicate("f1", pass),
      (pass) => controller.uploadMedia("f1", imageRequest({}), pass),
      (pass) => controller.listResponses("f1", undefined, undefined, pass),
      (pass) => controller.bulk("f1", {}, pass),
      (pass) => controller.apply("f1", {}, pass),
      (pass) => controller.patchResponse("f1", "r1", {}, pass),
      (pass) => controller.file("f1", "k", undefined, res, pass),
      (pass) => controller.analytics("f1", "30d", "0", pass),
      (pass) => controller.visits("f1", undefined, pass),
    ];
    for (const call of calls) {
      await expect(call(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(call("wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });
});

describe("FormsAdminController forms", () => {
  it("lists, gets, duplicates and removes", async () => {
    const { controller, forms } = make();
    expect(await controller.list(PASS)).toEqual({ forms: [{ id: "f1" }] });
    expect(await controller.get("f1", PASS)).toEqual({ form: { id: "f1" } });
    expect(await controller.duplicate("f1", PASS)).toEqual({ form: { id: "f2" } });
    expect(await controller.remove("f1", PASS)).toEqual({ ok: true });
    expect(forms.remove).toHaveBeenCalledWith("f1");
  });

  it("turns a service refusal into its status", async () => {
    const { controller, forms } = make();
    forms.get.mockRejectedValueOnce(new FormsError("That form does not exist.", 404));
    expect(await status(controller.get("x", PASS))).toEqual({
      message: "That form does not exist.",
      status: 404,
    });
  });

  it("creates and updates with the parsed body", async () => {
    const { controller, forms } = make();
    await controller.create({ document: { title: "T" }, slug: "abc", status: "draft" }, PASS);
    expect(forms.create).toHaveBeenCalledWith({
      document: { title: "T" },
      slug: "abc",
      status: "draft",
    });
    await controller.update("f1", { slug: "new" }, PASS);
    expect(forms.update).toHaveBeenCalledWith("f1", { passphraseAction: "keep", slug: "new" });
  });

  it("answers 400 for a bad status and names the path", async () => {
    const { controller } = make();
    expect(await status(controller.create({ document: {}, status: "weird" }, PASS))).toMatchObject({
      status: 400,
    });
    const result = (await status(controller.update("f1", { passphraseAction: "wipe" }, PASS))) as {
      message: string;
    };
    expect(result.message.startsWith("passphraseAction:")).toBe(true);
  });

  it("checks a slug with type guards on the query values", async () => {
    const { controller, forms } = make();
    await controller.slugAvailable("x".repeat(300), "form1", PASS);
    expect(forms.slugAvailable).toHaveBeenLastCalledWith("x".repeat(200), "form1");
    await controller.slugAvailable(["a"], ["b"], PASS);
    expect(forms.slugAvailable).toHaveBeenLastCalledWith("", undefined);
    await controller.slugAvailable("a", "", PASS);
    expect(forms.slugAvailable).toHaveBeenLastCalledWith("a", undefined);
  });
});

describe("FormsAdminController.uploadMedia", () => {
  it("stores an image under a key of the form and returns it", async () => {
    const { controller, storage } = make();
    const result = await controller.uploadMedia("abc123", imageRequest({ image: PNG_URL }), PASS);
    expect(result.key).toMatch(/^form-abc123-[0-9a-f-]{36}\.png$/);
    expect(storage.uploadFile).toHaveBeenCalledWith({
      body: expect.any(Buffer),
      contentType: "image/png",
      key: result.key,
    });
  });

  it("answers 400 for a body that is not an image data URL", async () => {
    const { controller, storage } = make();
    expect(
      await status(
        controller.uploadMedia("f1", imageRequest({ image: "data:image/png,abc" }), PASS),
      ),
    ).toEqual({
      message: "The image must be a base64 data URL.",
      status: 400,
    });
    expect(await status(controller.uploadMedia("f1", imageRequest({}), PASS))).toMatchObject({
      status: 400,
    });
    expect(
      await status(controller.uploadMedia("f1", imageRequest({ image: "https://x" }), PASS)),
    ).toMatchObject({
      status: 400,
    });
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 for bytes that are not an image", async () => {
    const { controller } = make();
    const text = `data:image/png;base64,${Buffer.from("not an image at all").toString("base64")}`;
    expect(await status(controller.uploadMedia("f1", imageRequest({ image: text }), PASS))).toEqual(
      {
        message: "The image must be a PNG, JPEG, WebP or GIF under 6 MB.",
        status: 400,
      },
    );
  });

  it("answers 400 for an image over 6 MB", async () => {
    const { controller } = make();
    const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    const url = `data:image/png;base64,${big.toString("base64")}`;
    expect(
      await status(controller.uploadMedia("f1", imageRequest({ image: url }), PASS)),
    ).toMatchObject({
      status: 400,
    });
  });

  it("stores a video that passes the magic byte check", async () => {
    const { controller, storage } = make();
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypisom"),
      Buffer.alloc(8),
    ]);
    const result = await controller.uploadMedia(
      "abc123",
      { body: mp4, headers: { "content-type": "video/mp4; codecs=avc1" } } as never,
      PASS,
    );
    expect(result.key).toMatch(/\.mp4$/);
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "video/mp4" }),
    );
  });

  it("refuses a video whose body is not a real MP4 or WebM file", async () => {
    const { controller, storage } = make();
    const error = await controller
      .uploadMedia(
        "f1",
        { body: Buffer.from("text"), headers: { "content-type": "video/mp4" } } as never,
        PASS,
      )
      .catch((caught: unknown) => caught);
    expect((error as HttpException).getStatus()).toBe(400);
    expect((error as HttpException).message).toBe("That file is not a valid video.");
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("refuses a video body that is not a Buffer", async () => {
    const { controller } = make();
    const error = await controller
      .uploadMedia("f1", { body: "text", headers: { "content-type": "video/mp4" } } as never, PASS)
      .catch((caught: unknown) => caught);
    expect((error as HttpException).getStatus()).toBe(400);
  });

  it("refuses a video over CMS_MAX_VIDEO_BYTES", async () => {
    const { controller, storage } = make();
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypisom"),
      Buffer.alloc(1000),
    ]);
    const error = await controller
      .uploadMedia("f1", { body: mp4, headers: { "content-type": "video/mp4" } } as never, PASS)
      .catch((caught: unknown) => caught);
    expect((error as HttpException).getStatus()).toBe(400);
    expect((error as HttpException).message).toContain("The video must be under");
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 503 when storage fails", async () => {
    const { controller, storage } = make();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));
    expect(
      await status(controller.uploadMedia("f1", imageRequest({ image: PNG_URL }), PASS)),
    ).toMatchObject({
      status: 503,
    });
  });

  it("answers 404 for an unknown form before reading the body", async () => {
    const { controller, forms, storage } = make();
    forms.require.mockRejectedValue(new FormsError("That form does not exist.", 404));
    expect(
      await status(controller.uploadMedia("x", imageRequest({ image: PNG_URL }), PASS)),
    ).toMatchObject({
      status: 404,
    });
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("treats a missing content type as an image upload", async () => {
    const { controller } = make();
    const result = await controller.uploadMedia(
      "abc123",
      { body: { image: PNG_URL }, headers: {} } as never,
      PASS,
    );
    expect(result.key).toMatch(/\.png$/);
  });
});

describe("FormsAdminController responses", () => {
  it("passes only a well formed cursor and limit to the list", async () => {
    const { controller, responses } = make();
    await controller.listResponses("f1", "abc123", "50", PASS);
    expect(responses.list).toHaveBeenLastCalledWith("f1", "abc123", 50);
    await controller.listResponses("f1", "BAD CURSOR", "5000000", PASS);
    expect(responses.list).toHaveBeenLastCalledWith("f1", undefined, undefined);
    await controller.listResponses("f1", undefined, undefined, PASS);
    expect(responses.list).toHaveBeenLastCalledWith("f1", undefined, undefined);
    await controller.listResponses("f1", ["a"] as never, ["5"] as never, PASS);
    expect(responses.list).toHaveBeenLastCalledWith("f1", undefined, undefined);
  });

  it("runs the bulk and apply actions with the parsed body", async () => {
    const { controller, responses } = make();
    await controller.bulk("f1", { action: "star", ids: ["a"] }, PASS);
    expect(responses.bulk).toHaveBeenCalledWith("f1", { action: "star", ids: ["a"] });
    await controller.apply("f1", { updates: [{ answers: {}, id: "a" }] }, PASS);
    expect(responses.apply).toHaveBeenCalledTimes(1);
  });

  it("answers 400 for a bad bulk body and a bad apply body", async () => {
    const { controller } = make();
    expect(await status(controller.bulk("f1", { action: "star", ids: [] }, PASS))).toMatchObject({
      status: 400,
    });
    expect(await status(controller.apply("f1", { updates: [] }, PASS))).toMatchObject({
      status: 400,
    });
  });

  it("patches a response and wraps it", async () => {
    const { controller, responses } = make();
    expect(await controller.patchResponse("f1", "r1", { starred: true }, PASS)).toEqual({
      response: { id: "r1" },
    });
    expect(responses.patch).toHaveBeenCalledWith("f1", "r1", { starred: true });
    expect(await status(controller.patchResponse("f1", "r1", { mystery: 1 }, PASS))).toMatchObject({
      status: 400,
    });
  });
});

describe("FormsAdminController.file", () => {
  it("answers the link as JSON unless a download is asked for", async () => {
    const { controller, responses } = make();
    const res = { json: vi.fn(), send: vi.fn(), setHeader: vi.fn() };
    await controller.file("f1", "k", undefined, res as never, PASS);
    await controller.file("f1", "k", "0", res as never, PASS);
    expect(res.json).toHaveBeenCalledTimes(2);
    expect(responses.fileLink).toHaveBeenCalledWith("f1", "k");
    expect(res.send).not.toHaveBeenCalled();
  });

  it("streams the bytes with download headers that cannot run in a browser", async () => {
    const { controller, responses } = make();
    const res = { json: vi.fn(), send: vi.fn(), setHeader: vi.fn() };
    await controller.file("f1", "k", "1", res as never, PASS);
    expect(responses.fileBytes).toHaveBeenCalledWith("f1", "k", 5000);
    const headers = Object.fromEntries(res.setHeader.mock.calls as [string, string][]);
    expect(headers).toEqual({
      "Cache-Control": "private, no-store",
      "Content-Disposition": "attachment; filename*=UTF-8''r%C3%A9%20sum%C3%A9.pdf",
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    });
    expect(res.send).toHaveBeenCalledWith(Buffer.from("bytes"));
  });

  it("answers the refusal of the service for a missing file", async () => {
    const { controller, responses } = make();
    responses.fileBytes.mockRejectedValue(new FormsError("File not found.", 404));
    const res = { json: vi.fn(), send: vi.fn(), setHeader: vi.fn() };
    expect(await status(controller.file("f1", "k", "1", res as never, PASS))).toMatchObject({
      status: 404,
    });
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe("FormsAdminController traffic", () => {
  it("clamps the range and the timezone offset", async () => {
    const { analytics, controller } = make();
    await controller.analytics("f1", "7d", "420", PASS);
    expect(analytics.analytics).toHaveBeenLastCalledWith("f1", "7d", 420);
    await controller.analytics("f1", "bogus", "99999", PASS);
    expect(analytics.analytics).toHaveBeenLastCalledWith("f1", "30d", 840);
    await controller.analytics("f1", undefined, "abc", PASS);
    expect(analytics.analytics).toHaveBeenLastCalledWith("f1", "30d", 0);
  });

  it("reads 200 visits by default and the given number otherwise", async () => {
    const { analytics, controller } = make();
    expect(await controller.visits("f1", undefined, PASS)).toEqual({ visits: [{ id: "v" }] });
    expect(analytics.visits).toHaveBeenLastCalledWith("f1", 200);
    await controller.visits("f1", "25", PASS);
    expect(analytics.visits).toHaveBeenLastCalledWith("f1", 25);
  });
});
