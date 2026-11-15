import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  isValidVideo,
  parseVideoUploadBody,
  redirectToSignedVideoUrl,
} from "./video-validation.util.js";

const MB = 1024 * 1024;

function mp4(size = 32) {
  const buffer = Buffer.alloc(size);
  buffer.write("ftyp", 4, "ascii");
  return buffer;
}

function webm(size = 16) {
  const buffer = Buffer.alloc(size);
  buffer.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return buffer;
}

function request(contentType: string | undefined, body: unknown) {
  return { headers: contentType === undefined ? {} : { "content-type": contentType }, body };
}

describe("isValidVideo", () => {
  it("accepts an MP4 with the ftyp marker and a WebM with the EBML marker", () => {
    expect(isValidVideo(mp4(), "video/mp4")).toBe(true);
    expect(isValidVideo(webm(), "video/webm")).toBe(true);
  });

  it("refuses a short buffer, a wrong marker and an unknown type", () => {
    expect(isValidVideo(mp4(11), "video/mp4")).toBe(false);
    expect(isValidVideo(Buffer.alloc(32), "video/mp4")).toBe(false);
    expect(isValidVideo(webm().subarray(0, 3), "video/webm")).toBe(false);
    expect(isValidVideo(Buffer.alloc(16), "video/webm")).toBe(false);
    expect(isValidVideo(mp4(), "video/webm")).toBe(false);
    expect(isValidVideo(webm(), "video/mp4")).toBe(false);
    expect(isValidVideo(mp4(), "video/quicktime")).toBe(false);
  });
});

describe("parseVideoUploadBody", () => {
  it("returns the buffer and the extension of an MP4", () => {
    const body = mp4();

    expect(parseVideoUploadBody(request("video/mp4", body) as never, MB)).toEqual({
      body,
      contentType: "video/mp4",
      extension: "mp4",
    });
  });

  it("reads the content type without its parameters and in any case", () => {
    const result = parseVideoUploadBody(request(" Video/WebM; codecs=vp9 ", webm()) as never, MB);

    expect(result).toMatchObject({ contentType: "video/webm", extension: "webm" });
  });

  it("names the noun that the caller gave in the error", () => {
    expect(() =>
      parseVideoUploadBody(request("text/plain", mp4()) as never, MB, "demo video"),
    ).toThrow("The demo video must be an MP4 or WebM file.");
    expect(() => parseVideoUploadBody(request("text/plain", mp4()) as never, MB)).toThrow(
      "The video must be an MP4 or WebM file.",
    );
  });

  it.each([
    ["no content type", undefined, mp4()],
    ["an unsupported content type", "video/ogg", mp4()],
    ["a body that is a string", "video/mp4", "ftypftypftyp"],
    ["a body that is an array", "video/mp4", [1, 2, 3]],
    ["no body", "video/mp4", undefined],
    ["an empty buffer", "video/mp4", Buffer.alloc(0)],
  ])("answers 400 for %s", (_name, contentType, body) => {
    expect(() => parseVideoUploadBody(request(contentType, body) as never, MB)).toThrow(
      BadRequestException,
    );
  });

  it("answers 400 when the body is over the size limit", () => {
    expect(() => parseVideoUploadBody(request("video/mp4", mp4(2 * MB)) as never, MB)).toThrow(
      "The video must be under 1 MB.",
    );
  });

  it("answers 400 when the magic bytes do not match the content type", () => {
    expect(() => parseVideoUploadBody(request("video/mp4", Buffer.alloc(32)) as never, MB)).toThrow(
      "That file is not a valid video.",
    );
    expect(() => parseVideoUploadBody(request("video/webm", mp4()) as never, MB)).toThrow(
      "That file is not a valid video.",
    );
  });
});

describe("redirectToSignedVideoUrl", () => {
  it("redirects to a signed url that lasts an hour", async () => {
    const response = { redirect: vi.fn() };
    const storage = { getSignedDownloadUrl: vi.fn().mockResolvedValue("https://files.test/v") };

    await redirectToSignedVideoUrl(response as never, storage as never, "demo-x.mp4");

    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith("demo-x.mp4", 3600);
    expect(response.redirect).toHaveBeenCalledWith("https://files.test/v");
  });

  it("answers 400 when storage cannot sign", async () => {
    const response = { redirect: vi.fn() };
    const storage = { getSignedDownloadUrl: vi.fn().mockRejectedValue(new Error("no bucket")) };

    await expect(
      redirectToSignedVideoUrl(response as never, storage as never, "demo-x.mp4"),
    ).rejects.toThrow("Media storage is not configured in this environment.");
    expect(response.redirect).not.toHaveBeenCalled();
  });
});
