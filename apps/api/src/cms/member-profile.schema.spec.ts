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

  it("refuses a link that is not a string, because the page turns an array into a string", () => {
    const result = memberProfileSchema.safeParse({
      links: [{ label: "X", url: ["javascript:alert(1)"] }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["links", 0, "url"]);
  });

  it("refuses a link with a space before the scheme, because the stored value is used as it is", () => {
    expect(
      memberProfileSchema.safeParse({ links: [{ label: "X", url: " https://example.org" }] })
        .success,
    ).toBe(false);
  });

  it("accepts an uppercase scheme", () => {
    expect(
      memberProfileSchema.safeParse({ links: [{ label: "X", url: "HTTPS://example.org" }] })
        .success,
    ).toBe(true);
  });

  it("refuses a links value that is not a list and an entry that is not an object", () => {
    expect(memberProfileSchema.safeParse({ links: "javascript:x" }).success).toBe(false);
    expect(memberProfileSchema.safeParse({ certificates: [null] }).success).toBe(false);
    expect(memberProfileSchema.safeParse({ links: [["javascript:x"]] }).success).toBe(false);
  });

  it("accepts a profile with no links and a list that is null", () => {
    expect(memberProfileSchema.safeParse({ bio: "Hello" }).success).toBe(true);
    expect(memberProfileSchema.safeParse({ links: null, certificates: undefined }).success).toBe(
      true,
    );
  });

  it("refuses a profile above the size cap and accepts one just below it", () => {
    // the JSON of {"bio":""} is 10 characters, so this body is exactly at the cap
    const atCap = { bio: "x".repeat(MAX_PROFILE_JSON_LENGTH - 10) };

    expect(JSON.stringify(atCap).length).toBe(MAX_PROFILE_JSON_LENGTH);
    expect(memberProfileSchema.safeParse(atCap).success).toBe(true);
    expect(
      memberProfileSchema.safeParse({ bio: "x".repeat(MAX_PROFILE_JSON_LENGTH - 9) }).success,
    ).toBe(false);
  });
});
