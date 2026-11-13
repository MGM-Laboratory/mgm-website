import { expect, test } from "@playwright/test";

import { vimeoId, youtubeId } from "../src/lib/forms/public-media";

test.describe("form media links", () => {
  test("reads the id of a YouTube link on youtube.com or one of its subdomains", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("rejects a host that only ends with the name of YouTube", () => {
    expect(youtubeId("https://evilyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://notyoutube-nocookie.com/embed/dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  test("reads the id of a Vimeo link on vimeo.com or its player subdomain", () => {
    expect(vimeoId("https://vimeo.com/123456789")).toBe("123456789");
    expect(vimeoId("https://www.vimeo.com/123456789")).toBe("123456789");
    expect(vimeoId("https://player.vimeo.com/video/123456789")).toBe("123456789");
  });

  test("rejects a host that only ends with the name of Vimeo", () => {
    expect(vimeoId("https://evilvimeo.com/123456789")).toBeNull();
    expect(vimeoId("https://vimeo.com.evil.example/123456789")).toBeNull();
  });
});
