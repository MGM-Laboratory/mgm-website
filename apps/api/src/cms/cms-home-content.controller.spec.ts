import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsHomeContentController } from "./cms-home-content.controller.js";

const PASS = "the-admin-passphrase";
const VIDEO_KEY = "home-video-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.mp4";

function makeController() {
  const home = {
    get: vi.fn().mockResolvedValue({ videoMode: "none" }),
    save: vi.fn(async (data: unknown) => data),
    videoKeyMatches: vi.fn().mockResolvedValue(true),
  };
  const storage = {
    uploadFile: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue("https://files.example.test/signed"),
  };
  const config = {
    getOrThrow: vi.fn((name: string) => (name === "CMS_MAX_VIDEO_BYTES" ? 1024 : PASS)),
  };
  const controller = new CmsHomeContentController(home as never, storage as never, config as never);
  return { controller, home, storage };
}

function mp4Request(size = 64, contentType = "video/mp4") {
  const body = Buffer.alloc(size);
  body.write("ftyp", 4, "ascii");
  return { request: { headers: { "content-type": contentType }, body } as never, body };
}

describe("CmsHomeContentController get and save", () => {
  it("returns the home content", async () => {
    const { controller } = makeController();

    await expect(controller.get()).resolves.toEqual({ record: { videoMode: "none" } });
  });

  it("answers 401 for a save with no or a wrong passphrase", async () => {
    const { controller, home } = makeController();

    await expect(controller.save({ videoMode: "none" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.save({ videoMode: "none" }, "wrong")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(home.save).not.toHaveBeenCalled();
  });

  it("saves valid content with the passphrase", async () => {
    const { controller, home } = makeController();

    await expect(
      controller.save({ videoMode: "upload", videoKey: VIDEO_KEY, videoName: " demo.mp4 " }, PASS),
    ).resolves.toEqual({
      record: { videoMode: "upload", videoKey: VIDEO_KEY, videoName: "demo.mp4" },
    });
    expect(home.save).toHaveBeenCalledTimes(1);
  });

  it("reads an old url mode as none when saving", async () => {
    const { controller, home } = makeController();

    await controller.save({ videoMode: "youtube", videoUrl: "https://youtu.be/x" }, PASS);

    expect(home.save).toHaveBeenCalledWith({ videoMode: "none" });
  });

  it("rejects an invalid body and saves nothing", async () => {
    const { controller, home } = makeController();

    await expect(controller.save({ videoMode: "upload", videoKey: "" }, PASS)).rejects.toThrow();
    await expect(controller.save({ videoSize: -1 }, PASS)).rejects.toThrow();
    expect(home.save).not.toHaveBeenCalled();
  });
});

describe("CmsHomeContentController video", () => {
  it("redirects the saved video to a signed url", async () => {
    const { controller, storage } = makeController();
    const response = { redirect: vi.fn() };

    await controller.video(VIDEO_KEY, response as never);

    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(VIDEO_KEY, 3600);
    expect(response.redirect).toHaveBeenCalledWith("https://files.example.test/signed");
  });

  it("answers 400 for a key outside the home video namespace", async () => {
    const { controller, home } = makeController();

    await expect(controller.video("demo-x.mp4", { redirect: vi.fn() } as never)).rejects.toThrow(
      "Unknown video key",
    );
    expect(home.videoKeyMatches).not.toHaveBeenCalled();
  });

  it("answers 400 for a video that is no longer the saved one", async () => {
    const { controller, home, storage } = makeController();
    home.videoKeyMatches.mockResolvedValue(false);

    await expect(controller.video(VIDEO_KEY, { redirect: vi.fn() } as never)).rejects.toThrow(
      "Video not found",
    );
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();
  });
});

describe("CmsHomeContentController uploadVideo", () => {
  it("answers 401 with no or a wrong passphrase", async () => {
    const { controller, storage } = makeController();

    await expect(controller.uploadVideo(mp4Request().request)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.uploadVideo(mp4Request().request, "wrong")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("stores an MP4 and a WebM under a home video key", async () => {
    const { controller, storage } = makeController();
    const mp4 = mp4Request();

    const stored = await controller.uploadVideo(mp4.request, PASS);

    expect(stored.size).toBe(64);
    expect(stored.key).toMatch(/^home-video-[0-9a-f-]{36}\.mp4$/);
    expect(storage.uploadFile).toHaveBeenCalledWith({
      body: mp4.body,
      contentType: "video/mp4",
      key: stored.key,
    });

    const webmBody = Buffer.alloc(16);
    webmBody.set([0x1a, 0x45, 0xdf, 0xa3], 0);
    const webm = await controller.uploadVideo(
      { headers: { "content-type": "video/webm" }, body: webmBody } as never,
      PASS,
    );
    expect(webm.key).toMatch(/\.webm$/);
  });

  it("answers 400 for a wrong type, a body over the limit and a file that is not a video", async () => {
    const { controller, storage } = makeController();

    await expect(
      controller.uploadVideo(mp4Request(64, "text/plain").request, PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.uploadVideo(mp4Request(2048).request, PASS)).rejects.toThrow(
      "The video must be under",
    );
    await expect(
      controller.uploadVideo(
        { headers: { "content-type": "video/mp4" }, body: Buffer.alloc(64) } as never,
        PASS,
      ),
    ).rejects.toThrow("That file is not a valid video.");
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 when video storage is not configured", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));

    await expect(controller.uploadVideo(mp4Request().request, PASS)).rejects.toThrow(
      "Video storage is not configured",
    );
  });
});
