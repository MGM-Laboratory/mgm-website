import { describe, expect, it } from "vitest";

import { MAX_PROFILE_JSON_LENGTH, memberProfileSchema } from "./member-profile.schema.js";

describe("memberProfileSchema", () => {
  it("accepts a profile with web, mail and phone links and an empty link", () => {
    const profile = {
      bio: "Hello",
      links: [
        { label: "Site", url: "https://example.org/me" },
        { label: "Mail", url: "mailto:me@example.org" },
        { label: "Phone", url: "tel:+6200000" },
        { label: "Empty", url: "" },
      ],
      certificates: [{ title: "A", credentialUrl: "http://example.org/c" }],
    };

    expect(memberProfileSchema.safeParse(profile).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<b>x</b>",
    "vbscript:x",
    "//evil.example",
    "example.org",
  ])("refuses the link %s", (url) => {
    const result = memberProfileSchema.safeParse({ links: [{ label: "X", url }] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["links", 0, "url"]);
  });

  it("refuses an unsafe certificate URL and names the field", () => {
    const result = memberProfileSchema.safeParse({
      certificates: [{ title: "A", credentialUrl: "javascript:alert(1)" }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["certificates", 0, "credentialUrl"]);
  });

  it("ignores a links value that is not a list and values that are not strings", () => {
    expect(
      memberProfileSchema.safeParse({ links: "javascript:x", certificates: [null, 1] }).success,
    ).toBe(true);
  });

  it("refuses a profile above the size cap", () => {
    const result = memberProfileSchema.safeParse({ bio: "x".repeat(MAX_PROFILE_JSON_LENGTH) });

    expect(result.success).toBe(false);
  });
});
