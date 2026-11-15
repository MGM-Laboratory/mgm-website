import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { StorageConfigurationError } from "../storage/storage.service.js";
import { ContactController } from "./contact.controller.js";

function makeController() {
  const contact = { send: vi.fn(async () => undefined) };
  const storage = {
    getSignedDownloadUrl: vi.fn(async () => "https://signed.example/file"),
    uploadFile: vi.fn(async () => ({ key: "x" })),
  };
  return {
    contact,
    controller: new ContactController(contact as never, storage as never),
    storage,
  };
}

function upload(body: unknown, contentType = "image/png") {
  return { body, headers: { "content-type": contentType } } as never;
}

const KEY_FORMAT = /^contact-[0-9a-f-]{36}/;

describe("ContactController.uploadAttachment", () => {
  it("rejects an array body, a string body and an empty buffer", async () => {
    const { controller } = makeController();
    for (const body of [[1, 2], "text", undefined, Buffer.alloc(0)]) {
      await expect(controller.uploadAttachment(upload(body), "a.png")).rejects.toThrow(
        "No file received.",
      );
    }
  });

  it("rejects a body over the size limit", async () => {
    const { controller, storage } = makeController();
    const big = Buffer.alloc(25 * 1024 * 1024 + 1);
    await expect(controller.uploadAttachment(upload(big), "a.png")).rejects.toThrow(
      "Attachments must be under 25 MB.",
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("stores the file under a generated key that keeps a clean name and extension", async () => {
    const { controller, storage } = makeController();
    const result = await controller.uploadAttachment(
      upload(Buffer.from("abc")),
      encodeURIComponent("Résumé Final (v2).PDF"),
    );
    expect(result.size).toBe(3);
    expect(result.key).toMatch(KEY_FORMAT);
    expect(result.key.endsWith("-resume-final-v2.pdf")).toBe(true);
    expect(storage.uploadFile).toHaveBeenCalledWith({
      body: expect.any(Buffer),
      contentType: "image/png",
      key: result.key,
    });
  });

  it("falls back to the raw header for a malformed percent sequence", async () => {
    const { controller } = makeController();
    const result = await controller.uploadAttachment(upload(Buffer.from("a")), "100%.txt");
    expect(result.key.endsWith(".txt")).toBe(true);
  });

  it("leaves out the name part when nothing usable is left and the extension when there is none", async () => {
    const { controller } = makeController();
    const noName = await controller.uploadAttachment(upload(Buffer.from("a")), "###.png");
    expect(noName.key).toMatch(/^contact-[0-9a-f-]{36}\.png$/);
    const noExt = await controller.uploadAttachment(upload(Buffer.from("a")), "");
    expect(noExt.key).toMatch(/^contact-[0-9a-f-]{36}$/);
  });

  it("caps the name part at 60 characters", async () => {
    const { controller } = makeController();
    const result = await controller.uploadAttachment(
      upload(Buffer.from("a")),
      `${"a".repeat(200)}.png`,
    );
    const name = result.key.replace(/^contact-[0-9a-f-]{36}-/, "").replace(/\.png$/, "");
    expect(name).toHaveLength(60);
  });

  it("stores a page or a script as plain bytes", async () => {
    const { controller, storage } = makeController();
    await controller.uploadAttachment(
      upload(Buffer.from("<script>"), "text/html; charset=utf-8"),
      "a.html",
    );
    expect(
      (storage.uploadFile.mock.calls[0] as unknown as [{ contentType: string }])[0].contentType,
    ).toBe("application/octet-stream");
  });

  it("defaults the content type when the request has none", async () => {
    const { controller, storage } = makeController();
    await controller.uploadAttachment({ body: Buffer.from("a"), headers: {} } as never, "a.bin");
    expect(
      (storage.uploadFile.mock.calls[0] as unknown as [{ contentType: string }])[0].contentType,
    ).toBe("application/octet-stream");
  });

  it("answers 400 when storage is not configured and rethrows other failures", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValueOnce(new StorageConfigurationError("no bucket"));
    await expect(controller.uploadAttachment(upload(Buffer.from("a")), "a.png")).rejects.toThrow(
      BadRequestException,
    );
    const failure = new Error("s3 down");
    storage.uploadFile.mockRejectedValueOnce(failure);
    await expect(controller.uploadAttachment(upload(Buffer.from("a")), "a.png")).rejects.toBe(
      failure,
    );
  });
});

describe("ContactController.attachment", () => {
  it("rejects a key that does not match the contact pattern", async () => {
    const { controller, storage } = makeController();
    await expect(
      controller.attachment("../etc/passwd", { redirect: vi.fn() } as never),
    ).rejects.toThrow("Unknown attachment key");
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("redirects to a signed URL that lives fifteen minutes", async () => {
    const { controller, storage } = makeController();
    const response = { redirect: vi.fn(() => "redirected") };
    const key = "contact-123e4567-e89b-12d3-a456-426614174000-file.pdf";
    expect(await controller.attachment(key, response as never)).toBe("redirected");
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(key, 900);
    expect(response.redirect).toHaveBeenCalledWith("https://signed.example/file");
  });
});

describe("ContactController.submit", () => {
  it("answers 400 with field errors for an invalid message", async () => {
    const { contact, controller } = makeController();
    const error = await controller
      .submit({ body: { email: "nope", message: "", name: "" } } as never)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse() as {
      errors: Record<string, string[]>;
      message: string;
    };
    expect(body.message).toBe("Validation failed");
    expect(Object.keys(body.errors).sort()).toEqual(["email", "message", "name"]);
    expect(contact.send).not.toHaveBeenCalled();
  });

  it("passes the parsed payload on and answers ok", async () => {
    const { contact, controller } = makeController();
    const result = await controller.submit({
      body: { email: " a@example.org ", message: " hi ", name: " Ayu " },
    } as never);
    expect(result).toEqual({ ok: true });
    expect(contact.send).toHaveBeenCalledWith({
      email: "a@example.org",
      message: "hi",
      name: "Ayu",
    });
  });
});
