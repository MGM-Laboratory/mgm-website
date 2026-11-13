import { describe, expect, it } from "vitest";

import { MEMBER_MEDIA_KEY_PATTERN } from "./member-media-key.js";

const UUID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("MEMBER_MEDIA_KEY_PATTERN", () => {
  it.each([
    `member-ade-nugroho-${UUID}.jpg`,
    `member-ade-nugroho--${UUID}.jpg`,
    `member--x-${UUID}.webp`,
    `member-1731500000000-${UUID}.png`,
    `member-a-${UUID}.jpeg`,
  ])("accepts %s", (key) => {
    expect(MEMBER_MEDIA_KEY_PATTERN.test(key)).toBe(true);
  });

  it.each([
    `member-a-${UUID}.JPG`,
    `member-a-${UUID}.svg`,
    `member-a-${UUID}.jpg%00`,
    `member-a-${UUID}.jpg\n`,
    `member-a-${UUID.toUpperCase()}.jpg`,
    `member-a-${UUID}`,
    `../member-a-${UUID}.jpg`,
    `member-a/b-${UUID}.jpg`,
    `member-a.b-${UUID}.jpg`,
    `cv-${UUID}.pdf`,
    `contact-${UUID}.jpg`,
  ])("rejects %s", (key) => {
    expect(MEMBER_MEDIA_KEY_PATTERN.test(key)).toBe(false);
  });
});
