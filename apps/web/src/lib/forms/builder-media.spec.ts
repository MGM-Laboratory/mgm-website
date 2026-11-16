import type { FormMedia } from "@repo/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { formMediaUrl } from "@/lib/forms/admin-api";

import {
  localPreviews,
  mediaPreviewUrl,
  parseVideoLink,
  previewIsImage,
  rememberPreview,
  vimeoThumb,
  youtubeThumb,
} from "./builder-media";

const media = (patch: Partial<FormMedia>) => ({ kind: "image", ...patch }) as FormMedia;

beforeEach(() => {
  localPreviews.clear();
});

describe("parseVideoLink", () => {
  it("normalizes YouTube and Vimeo share links", () => {
    expect(parseVideoLink("  https://youtu.be/dQw4w9WgXcQ  ")).toEqual({
      kind: "youtube",
      id: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(parseVideoLink("https://vimeo.com/123456789")).toEqual({
      kind: "vimeo",
      id: "123456789",
      url: "https://vimeo.com/123456789",
    });
  });

  it("returns nothing for empty text or another site", () => {
    expect(parseVideoLink("")).toBeUndefined();
    expect(parseVideoLink("   ")).toBeUndefined();
    expect(parseVideoLink("https://example.com/video")).toBeUndefined();
  });
});

describe("thumbnails", () => {
  it("only builds a URL for a well formed id", () => {
    expect(youtubeThumb("dQw4w9WgXcQ")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(youtubeThumb("bad id/../")).toBeUndefined();
    expect(youtubeThumb("abc")).toBeUndefined();
    expect(vimeoThumb("123456789")).toBe("https://vumbnail.com/123456789.jpg");
    expect(vimeoThumb("12ab")).toBeUndefined();
    expect(vimeoThumb("1".repeat(16))).toBeUndefined();
  });
});

describe("mediaPreviewUrl", () => {
  it("prefers a session upload, then the media route for a stored key", () => {
    rememberPreview("k1", "data:image/png;base64,AAAA");
    expect(mediaPreviewUrl(media({ key: "k1" }))).toBe("data:image/png;base64,AAAA");
    expect(mediaPreviewUrl(media({ key: "k2" }))).toBe(formMediaUrl("k2"));
    const own = new Map([["k3", "data:own"]]);
    expect(mediaPreviewUrl(media({ key: "k3" }), own)).toBe("data:own");
  });

  it("uses a plain URL, a video thumbnail, or nothing", () => {
    expect(mediaPreviewUrl(media({}))).toBeUndefined();
    expect(mediaPreviewUrl(media({ url: "https://x.test/a.png" }))).toBe("https://x.test/a.png");
    expect(mediaPreviewUrl(media({ kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" }))).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
    expect(mediaPreviewUrl(media({ kind: "vimeo", url: "https://vimeo.com/123456789" }))).toBe(
      "https://vumbnail.com/123456789.jpg",
    );
    expect(mediaPreviewUrl(media({ kind: "youtube", url: "https://example.com" }))).toBeUndefined();
    // The link decides the thumbnail, whatever kind the item says
    expect(mediaPreviewUrl(media({ kind: "vimeo", url: "https://youtu.be/dQw4w9WgXcQ" }))).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });
});

describe("previewIsImage", () => {
  it("is false only for a video file", () => {
    expect(previewIsImage(media({ kind: "video" }))).toBe(false);
    expect(previewIsImage(media({ kind: "image" }))).toBe(true);
    expect(previewIsImage(media({ kind: "youtube" }))).toBe(true);
  });
});
