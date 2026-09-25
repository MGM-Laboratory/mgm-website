import { describe, expect, it } from "vitest";

import {
  SLUG_PATTERN,
  checkLongUrl,
  expiryFromOption,
  guardedLookup,
  hashPassphrase,
  linkStatus,
  normalizeHostname,
  parseUserAgent,
  randomSlug,
  verifyPassphrase,
  zoneCandidates,
} from "./shortlinks.utils.js";

describe("randomSlug", () => {
  it("produces codes of the requested length from the unambiguous alphabet", () => {
    const slug = randomSlug(6);
    expect(slug).toHaveLength(6);
    expect(slug).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/);
  });

  it("never emits the ambiguous glyphs", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(randomSlug(8)).not.toMatch(/[0O1lI]/);
    }
  });

  it("is usable as a custom short code", () => {
    expect(SLUG_PATTERN.test(randomSlug(4))).toBe(true);
  });
});

describe("normalizeHostname", () => {
  it("lowercases and strips scheme, port, path and trailing dots", () => {
    expect(normalizeHostname("HTTPS://Mgm.Li:443/x?y")).toBe("mgm.li");
    expect(normalizeHostname("mgm.li.")).toBe("mgm.li");
    expect(normalizeHostname("  labmgm.org/s  ")).toBe("labmgm.org");
  });
});

describe("zoneCandidates", () => {
  it("returns longest-first candidates down to two labels", () => {
    expect(zoneCandidates("short.mgm.li")).toEqual(["short.mgm.li", "mgm.li"]);
    expect(zoneCandidates("mgm.li")).toEqual(["mgm.li"]);
    // A multi-label public suffix resolves through its own full name.
    expect(zoneCandidates("foo.co.uk")).toEqual(["foo.co.uk", "co.uk"]);
  });
});

describe("passphrases", () => {
  it("hashes and verifies with a fresh salt", async () => {
    const { salt, hash } = await hashPassphrase("sesame");
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(await verifyPassphrase("sesame", salt, hash)).toBe(true);
    expect(await verifyPassphrase("nope", salt, hash)).toBe(false);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassphrase("sesame", "zz", "zz")).toBe(false);
  });
});

describe("parseUserAgent", () => {
  it("classifies common clients", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      ),
    ).toEqual({ browser: "Chrome", os: "Windows", device: "Desktop" });
    expect(
      parseUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ browser: "Safari", os: "iOS", device: "Mobile" });
    expect(parseUserAgent("curl/8.7.1")).toEqual({
      browser: "cURL",
      os: "Other",
      device: "Desktop",
    });
    expect(parseUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)")).toEqual({
      browser: "Bot",
      os: "Other",
      device: "Desktop",
    });
  });

  it("falls back safely on empty input", () => {
    expect(parseUserAgent("")).toEqual({ browser: "Other", os: "Other", device: "Desktop" });
  });
});

describe("expiryFromOption", () => {
  it("maps the fixed choices", () => {
    expect(expiryFromOption("never")).toEqual({ expiresAt: null, maxClicks: null });
    expect(expiryFromOption("once")).toEqual({ expiresAt: null, maxClicks: 1 });
    const before = Date.now();
    const day = expiryFromOption("24h");
    expect(day.maxClicks).toBeNull();
    expect(day.expiresAt!.getTime()).toBeGreaterThan(before + 23 * 60 * 60 * 1000);
  });
});

describe("linkStatus", () => {
  const base = { expiresAt: null, maxClicks: null, clickCount: 0, longUrlStatus: null };
  it("derives each state", () => {
    expect(linkStatus(base)).toBe("available");
    expect(linkStatus({ ...base, expiresAt: new Date(Date.now() - 1000) })).toBe("expired");
    expect(linkStatus({ ...base, maxClicks: 1, clickCount: 1 })).toBe("consumed");
    expect(linkStatus({ ...base, longUrlStatus: "error" })).toBe("error");
  });

  it("lets expiry win over a failing destination", () => {
    expect(
      linkStatus({ ...base, expiresAt: new Date(Date.now() - 1000), longUrlStatus: "error" }),
    ).toBe("expired");
  });
});

describe("checkLongUrl", () => {
  it("rejects non-http schemes and broken URLs", async () => {
    expect(await checkLongUrl("javascript:alert(1)")).toBe("error");
    expect(await checkLongUrl("not a url")).toBe("error");
  });

  it("rejects private and loopback targets before any request", async () => {
    expect(await checkLongUrl("http://127.0.0.1:5432/")).toBe("error");
    expect(await checkLongUrl("http://10.0.0.5/")).toBe("error");
    expect(await checkLongUrl("https://[::1]/")).toBe("error");
    expect(await checkLongUrl("http://localhost/")).toBe("error");
  });

  it("reports error for hosts that do not resolve", async () => {
    expect(await checkLongUrl("https://nonexistent.invalid/")).toBe("error");
  });
});

describe("guardedLookup", () => {
  it("answers the single-address shape", async () => {
    const { address, family } = await new Promise<{ address: unknown; family: number | undefined }>(
      (resolve, reject) => {
        guardedLookup("iana.org", {}, (error, address, family) =>
          error ? reject(error) : resolve({ address, family }),
        );
      },
    );
    expect(typeof address).toBe("string");
    expect(family).toBeGreaterThan(0);
  });

  it("answers with an address array when node asks with all: true", async () => {
    const { address } = await new Promise<{ address: unknown }>((resolve, reject) => {
      guardedLookup("iana.org", { all: true } as never, (error, address) =>
        error ? reject(error) : resolve({ address }),
      );
    });
    expect(Array.isArray(address)).toBe(true);
    expect((address as unknown[]).length).toBeGreaterThan(0);
  });

  it("refuses private addresses with EACCES", async () => {
    const error = await new Promise<Error | null>((resolve) => {
      guardedLookup("localhost", {}, (lookupError) => resolve(lookupError));
    });
    expect(error).toBeInstanceOf(Error);
    expect((error as NodeJS.ErrnoException).code).toBe("EACCES");
  });
});
