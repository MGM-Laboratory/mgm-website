import { describe, expect, it } from "vitest";

import { formSlugSchema } from "@repo/shared";

import {
  FORM_SLUG_ALPHABET,
  documentMediaKeys,
  formAvailability,
  formMediaKey,
  formTokenSecret,
  formUploadKey,
  imageDimensions,
  mediaKeyFormId,
  normalizeTags,
  parseFormSlug,
  randomFormSlug,
  referrerHost,
  sanitizeFileName,
  signFormToken,
  slugCandidates,
  slugify,
  sniffImage,
  storedUploadType,
  submissionTiming,
  uploadExtension,
  uploadKeyFormId,
  verifyFormToken,
} from "./forms.utils.js";

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("form slugs", () => {
  it("mints readable slugs that pass the shared schema", () => {
    for (let i = 0; i < 200; i += 1) {
      const slug = randomFormSlug();
      expect(slug).toHaveLength(8);
      expect([...slug].every((char) => FORM_SLUG_ALPHABET.includes(char))).toBe(true);
      expect(formSlugSchema.safeParse(slug).success).toBe(true);
    }
    expect(FORM_SLUG_ALPHABET).not.toMatch(/[01ilo]/);
  });

  it("normalizes and validates custom slugs", () => {
    expect(parseFormSlug("  Spring-Survey ")).toEqual({ ok: true, slug: "spring-survey" });
    expect(parseFormSlug("admin").ok).toBe(false);
    expect(parseFormSlug("bad--slug").ok).toBe(false);
    expect(parseFormSlug("-lead").ok).toBe(false);
    expect(parseFormSlug("has space").ok).toBe(false);
    expect(parseFormSlug("a".repeat(81)).ok).toBe(false);
  });

  it("slugifies titles and offers numbered alternatives within the cap", () => {
    expect(slugify("Café Survey — 2026!")).toBe("cafe-survey-2026");
    expect(slugify("---")).toBe("");
    expect(slugCandidates("event")[0]).toBe("event-2");
    const long = "a".repeat(80);
    for (const candidate of slugCandidates(long)) {
      expect(candidate.length).toBeLessThanOrEqual(80);
      expect(formSlugSchema.safeParse(candidate).success).toBe(true);
    }
  });
});

describe("unlock tokens", () => {
  const secret = formTokenSecret("admin-secret");
  const now = 1_790_000_000_000;

  it("verifies a token for the same form and passphrase", () => {
    const token = signFormToken(secret, "form1", "hash-a", now);
    expect(verifyFormToken(secret, "form1", "hash-a", token, now + 1000)).toBe(true);
  });

  it("refuses another form, a changed passphrase, another secret, and tampering", () => {
    const token = signFormToken(secret, "form1", "hash-a", now);
    expect(verifyFormToken(secret, "form2", "hash-a", token, now)).toBe(false);
    expect(verifyFormToken(secret, "form1", "hash-b", token, now)).toBe(false);
    expect(verifyFormToken(formTokenSecret("other"), "form1", "hash-a", token, now)).toBe(false);
    const [expiry, signature] = token.split(".");
    expect(
      verifyFormToken(secret, "form1", "hash-a", `${Number(expiry) + 1}.${signature}`, now),
    ).toBe(false);
    expect(verifyFormToken(secret, "form1", "hash-a", "garbage", now)).toBe(false);
    expect(verifyFormToken(secret, "form1", "hash-a", undefined, now)).toBe(false);
  });

  it("expires after 12 hours", () => {
    const token = signFormToken(secret, "form1", "hash-a", now);
    expect(verifyFormToken(secret, "form1", "hash-a", token, now + 12 * 3600_000 - 1)).toBe(true);
    expect(verifyFormToken(secret, "form1", "hash-a", token, now + 12 * 3600_000)).toBe(false);
  });
});

describe("storage keys", () => {
  it("mints upload keys only that form can claim", () => {
    const key = formUploadKey("clx123abc", "pdf");
    expect(key).toMatch(/^formfile-clx123abc-[0-9a-f-]{36}\.pdf$/);
    expect(uploadKeyFormId(key)).toBe("clx123abc");
    expect(uploadKeyFormId(key.replace("formfile-", "form-"))).toBeNull();
    expect(uploadKeyFormId("formfile-clx123abc-../../etc.pdf")).toBeNull();
    expect(uploadKeyFormId("cv-1234.pdf")).toBeNull();
  });

  it("keeps design media keys apart from respondent uploads", () => {
    const key = formMediaKey("clx123abc", "webp");
    expect(mediaKeyFormId(key)).toBe("clx123abc");
    expect(mediaKeyFormId(formUploadKey("clx123abc", "png"))).toBeNull();
    expect(mediaKeyFormId(key.replace(".webp", ".svg"))).toBeNull();
  });

  it("finds every media key a document references", () => {
    const cover = formMediaKey("f1", "png");
    const poster = formMediaKey("f1", "jpg");
    const document = {
      design: { cover: { media: { kind: "image", key: cover } } },
      fields: [{ media: { kind: "video", key: "https://example.com", posterKey: poster } }],
    };
    expect(documentMediaKeys(document).sort()).toEqual([cover, poster].sort());
  });
});

describe("upload acceptance", () => {
  it("sniffs images by their magic bytes, not their name", () => {
    expect(sniffImage(PNG_1x1)?.type).toBe("image/png");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.extension).toBe("jpg");
    expect(sniffImage(Buffer.from("GIF89a......", "ascii"))?.type).toBe("image/gif");
    expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "ascii"))?.type).toBe("image/webp");
    expect(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImage(Buffer.from("%PDF-1.7"))).toBeNull();
  });

  it("reads the pixel size of a PNG", () => {
    expect(imageDimensions(PNG_1x1, "image/png")).toEqual({ width: 1, height: 1 });
  });

  it("never stores a type the categories don't know", () => {
    expect(storedUploadType("notes.txt", "text/html")).toBe("text/plain");
    expect(storedUploadType("paper.pdf", "application/pdf")).toBe("application/pdf");
    expect(storedUploadType("page.html", "text/html")).toBe("application/octet-stream");
    expect(storedUploadType("x.svg", "image/svg+xml")).toBe("application/octet-stream");
  });

  it("picks a plain extension for the key", () => {
    expect(uploadExtension("Report.PDF", "application/pdf")).toBe("pdf");
    expect(uploadExtension("weird.p d f", "application/pdf")).toBe("pdf");
    expect(uploadExtension("noext", "application/octet-stream")).toBe("bin");
  });

  it("decodes and cleans file names", () => {
    expect(sanitizeFileName(encodeURIComponent("CV Ana ü.pdf"))).toBe("CV Ana ü.pdf");
    expect(sanitizeFileName("../../etc/passwd")).toBe("....etcpasswd");
    expect(sanitizeFileName("%E0%A4%A")).toBe("%E0%A4%A");
    expect(sanitizeFileName(undefined)).toBe("file");
  });
});

describe("availability", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");

  it("is open by default", () => {
    expect(formAvailability("published", {}, 0, now)).toEqual({ open: true });
  });

  it("names the reason a form is unavailable", () => {
    expect(formAvailability("closed", {}, 0, now)).toEqual({ open: false, reason: "closed" });
    expect(formAvailability("published", { opensAt: "2026-09-27T00:00:00Z" }, 0, now)).toEqual({
      open: false,
      reason: "not_open_yet",
    });
    expect(formAvailability("published", { closesAt: "2026-09-26T12:00:00Z" }, 0, now)).toEqual({
      open: false,
      reason: "closed",
    });
    expect(formAvailability("published", { responseLimit: 3 }, 3, now)).toEqual({
      open: false,
      reason: "limit_reached",
    });
    expect(formAvailability("published", { responseLimit: 3 }, 2, now)).toEqual({ open: true });
  });
});

describe("submission timing", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");

  it("flags a filled honeypot", () => {
    expect(submissionTiming({ website: "http://spam" }, 3, now).spam).toBe(true);
  });

  it("flags a submission faster than minSeconds", () => {
    const fast = submissionTiming({ startedAt: new Date(now - 1500).toISOString() }, 3, now);
    expect(fast).toMatchObject({ spam: true, durationMs: 1500 });
    const slow = submissionTiming({ startedAt: new Date(now - 45_000).toISOString() }, 3, now);
    expect(slow).toMatchObject({ spam: false, durationMs: 45_000 });
  });

  it("ignores missing or future start times", () => {
    expect(submissionTiming({}, 3, now)).toEqual({
      spam: false,
      startedAt: null,
      durationMs: null,
    });
    const future = submissionTiming({ startedAt: new Date(now + 3600_000).toISOString() }, 3, now);
    expect(future).toEqual({ spam: false, startedAt: null, durationMs: null });
  });
});

describe("tags and referrers", () => {
  it("trims, de-duplicates and caps tags", () => {
    expect(normalizeTags([" vip ", "vip", "", "x".repeat(50)])).toEqual(["vip", "x".repeat(40)]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(20);
  });

  it("reduces referrers to hosts", () => {
    expect(referrerHost("https://www.google.com/search?q=x")).toBe("www.google.com");
    expect(referrerHost(null)).toBe("direct");
    expect(referrerHost("not a url")).toBe("other");
  });
});
