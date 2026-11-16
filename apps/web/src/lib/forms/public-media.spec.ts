// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import type { FormMedia } from "@repo/shared";
import { describe, expect, it } from "vitest";

import {
  embedSrc,
  focalPosition,
  formMediaSrc,
  formPosterSrc,
  vimeoId,
  youtubeId,
  youtubeThumb,
} from "./public-media";

const media = (patch: Partial<FormMedia>) => ({ kind: "image", ...patch }) as FormMedia;

describe("formMediaSrc and formPosterSrc", () => {
  it("serves an upload through the media route and passes a link through", () => {
    expect(formMediaSrc(undefined)).toBeUndefined();
    expect(formMediaSrc({ key: "a/b c.png" })).toBe("/api/forms/media/a%2Fb%20c.png");
    expect(formMediaSrc({ url: "https://x.test/a.png" })).toBe("https://x.test/a.png");
    expect(formMediaSrc({ key: "k", url: "https://x.test/a.png" })).toBe("/api/forms/media/k");
    expect(formMediaSrc({})).toBeUndefined();
  });

  it("serves a poster only when it has a key", () => {
    expect(formPosterSrc(undefined)).toBeUndefined();
    expect(formPosterSrc(media({}))).toBeUndefined();
    expect(formPosterSrc(media({ posterKey: "p/1.jpg" }))).toBe("/api/forms/media/p%2F1.jpg");
  });
});

describe("youtubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=5", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("reads %s", (url, id) => {
    expect(youtubeId(url)).toBe(id);
  });

  it("rejects look-alike hosts, bad ids, other sites and non links", () => {
    expect(youtubeId(undefined)).toBeNull();
    expect(youtubeId("")).toBeNull();
    expect(youtubeId("not a url")).toBeNull();
    expect(youtubeId("https://evilyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://vimeo.com/123456789")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch?v=<script>alert(1)</script>")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch")).toBeNull();
    expect(youtubeId("https://youtu.be/")).toBeNull();
  });
});

describe("vimeoId", () => {
  it("reads Vimeo links", () => {
    expect(vimeoId("https://vimeo.com/123456789")).toBe("123456789");
    expect(vimeoId("https://www.vimeo.com/123456789/abcdef")).toBe("123456789");
    expect(vimeoId("https://player.vimeo.com/video/123456789?h=1")).toBe("123456789");
  });

  it("rejects look-alike hosts, short ids and non links", () => {
    expect(vimeoId(undefined)).toBeNull();
    expect(vimeoId("nope")).toBeNull();
    expect(vimeoId("https://evilvimeo.com/123456789")).toBeNull();
    expect(vimeoId("https://vimeo.com/1234")).toBeNull();
    expect(vimeoId("https://vimeo.com/channels/staffpicks")).toBeNull();
    expect(vimeoId("https://youtube.com/123456789")).toBeNull();
  });
});

describe("embedSrc", () => {
  it("builds the privacy friendly players", () => {
    expect(embedSrc(media({ kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" }))).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0",
    );
    expect(embedSrc(media({ kind: "vimeo", url: "https://vimeo.com/123456789" }))).toBe(
      "https://player.vimeo.com/video/123456789?autoplay=1&dnt=1",
    );
  });

  it("returns null for a bad link or a kind without a player", () => {
    expect(embedSrc(media({ kind: "youtube", url: "https://evil.test/x" }))).toBeNull();
    expect(embedSrc(media({ kind: "vimeo", url: "https://evil.test/x" }))).toBeNull();
    expect(embedSrc(media({ kind: "video", url: "https://x.test/a.mp4" }))).toBeNull();
  });
});

describe("youtubeThumb and focalPosition", () => {
  it("builds a thumbnail only for a YouTube item", () => {
    expect(youtubeThumb(media({ kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" }))).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
    expect(
      youtubeThumb(media({ kind: "vimeo", url: "https://youtu.be/dQw4w9WgXcQ" })),
    ).toBeUndefined();
    expect(youtubeThumb(media({ kind: "youtube", url: "bad" }))).toBeUndefined();
  });

  it("reads the focal point in percent with a centered default", () => {
    expect(focalPosition(undefined)).toBeUndefined();
    expect(focalPosition(media({}))).toBe("50% 50%");
    expect(focalPosition(media({ focalX: 20, focalY: 0 }))).toBe("20% 0%");
  });
});
