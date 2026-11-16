import { HttpException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { FormsPublicController } from "./forms-public.controller.js";
import { FormsError } from "./forms.common.js";

const KEY = "form-abc123-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";

function make() {
  const forms = { mediaServable: vi.fn(async () => true) };
  const publicForms = {
    publicForm: vi.fn(async () => ({ slug: "s" })),
    recordEvent: vi.fn(async () => ({ ok: true })),
    submit: vi.fn(async () => ({ ok: true })),
    unlock: vi.fn(async () => ({ token: "t" })),
    upload: vi.fn(async (..._args: unknown[]) => ({ key: "k" })),
  };
  const storage = { getSignedDownloadUrl: vi.fn(async () => "https://signed.example/m") };
  return {
    controller: new FormsPublicController(forms as never, publicForms as never, storage as never),
    forms,
    publicForms,
    storage,
  };
}

const request = (extra: Record<string, unknown> = {}) =>
  ({ headers: { "user-agent": "ua" }, ip: "203.0.113.9", ...extra }) as never;

async function status(work: Promise<unknown>) {
  const error = await work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return error instanceof HttpException ? error.getStatus() : error;
}

describe("FormsPublicController", () => {
  it("serves the public form with the token header only when it is a non empty string", async () => {
    const { controller, publicForms } = make();
    await controller.publicForm("s", "tok");
    expect(publicForms.publicForm).toHaveBeenLastCalledWith("s", "tok");
    await controller.publicForm("s", "");
    expect(publicForms.publicForm).toHaveBeenLastCalledWith("s", undefined);
    await controller.publicForm("s");
    expect(publicForms.publicForm).toHaveBeenLastCalledWith("s", undefined);
  });

  it("unlocks with the parsed passphrase and refuses a missing one", async () => {
    const { controller, publicForms } = make();
    expect(await controller.unlock("s", { passphrase: "p" })).toEqual({ token: "t" });
    expect(publicForms.unlock).toHaveBeenCalledWith("s", "p");
    expect(await status(controller.unlock("s", {}))).toBe(400);
  });

  it("turns a service refusal into its status", async () => {
    const { controller, publicForms } = make();
    publicForms.unlock.mockRejectedValue(new FormsError("Wrong passphrase.", 401));
    expect(await status(controller.unlock("s", { passphrase: "p" }))).toBe(401);
  });

  it("records an event with the visit details and token", async () => {
    const { controller, publicForms } = make();
    await controller.event("s", { sessionId: "sess", type: "view" }, request(), "tok");
    expect(publicForms.recordEvent).toHaveBeenCalledWith(
      "s",
      { sessionId: "sess", type: "view" },
      { ip: "203.0.113.9", referer: null, userAgent: "ua" },
      "tok",
    );
  });

  it("refuses a progress event that names no question", async () => {
    const { controller } = make();
    expect(
      await status(controller.event("s", { sessionId: "sess", type: "progress" }, request())),
    ).toBe(400);
  });

  it("hands the raw upload body, type and file name to the service", async () => {
    const { controller, publicForms } = make();
    const body = Buffer.from("abc");
    await controller.upload(
      "s",
      { fieldId: "doc", sessionId: "sess" },
      request({ body, headers: { "content-type": "application/pdf", "x-file-name": "a.pdf" } }),
      "tok",
    );
    expect(publicForms.upload).toHaveBeenCalledWith(
      "s",
      { fieldId: "doc", sessionId: "sess" },
      { body, contentType: "application/pdf", fileName: "a.pdf" },
      "tok",
    );
  });

  it("uses an empty content type and no file name when the headers are missing", async () => {
    const { controller, publicForms } = make();
    await controller.upload(
      "s",
      { fieldId: "doc", sessionId: "sess" },
      request({ body: Buffer.alloc(0) }),
    );
    expect(publicForms.upload.mock.calls[0][2]).toMatchObject({
      contentType: "",
      fileName: undefined,
    });
  });

  it("refuses an upload query without a session", async () => {
    const { controller } = make();
    expect(await status(controller.upload("s", { fieldId: "doc" }, request()))).toBe(400);
  });

  it("submits the parsed answers with the visit details", async () => {
    const { controller, publicForms } = make();
    await controller.submit("s", { answers: { a: 1 }, sessionId: "sess" }, request(), "tok");
    expect(publicForms.submit).toHaveBeenCalledWith(
      "s",
      { answers: { a: 1 }, sessionId: "sess" },
      expect.objectContaining({ ip: "203.0.113.9" }),
      "tok",
    );
    expect(await status(controller.submit("s", { answers: {} }, request()))).toBe(400);
  });
});

describe("FormsPublicController.media", () => {
  it("answers 404 for a key that does not match the pattern without a lookup", async () => {
    const { controller, forms } = make();
    const response = { redirect: vi.fn() };
    await expect(controller.media("../x", response as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(forms.mediaServable).not.toHaveBeenCalled();
  });

  it("answers 404 for a key that no form serves", async () => {
    const { controller, forms, storage } = make();
    forms.mediaServable.mockResolvedValue(false);
    await expect(controller.media(KEY, { redirect: vi.fn() } as never)).rejects.toThrow(
      "Unknown media key",
    );
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("redirects to a signed URL of fifteen minutes", async () => {
    const { controller, storage } = make();
    const response = { redirect: vi.fn() };
    await controller.media(KEY, response as never);
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(KEY, 900);
    expect(response.redirect).toHaveBeenCalledWith("https://signed.example/m");
  });

  it("answers 404 when storage cannot sign", async () => {
    const { controller, storage } = make();
    storage.getSignedDownloadUrl.mockRejectedValue(new Error("no bucket"));
    await expect(controller.media(KEY, { redirect: vi.fn() } as never)).rejects.toThrow(
      "Media storage is not configured in this environment.",
    );
  });
});
