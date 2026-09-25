import { afterEach, describe, expect, it } from "vitest";

import { decryptToken, encryptToken, hasEncryptionKey } from "./shortlinks.providers.js";

const ORIGINAL_KEY = process.env.SHORTLINKS_ENCRYPTION_KEY;
const TEST_KEY = "ab".repeat(32);

describe("Cloudflare token encryption", () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.SHORTLINKS_ENCRYPTION_KEY;
    else process.env.SHORTLINKS_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it("round-trips a token", () => {
    process.env.SHORTLINKS_ENCRYPTION_KEY = TEST_KEY;
    const token = "a-secret-cloudflare-token";
    const stored = encryptToken(token);
    expect(stored).not.toContain(token);
    expect(decryptToken(stored)).toBe(token);
  });

  it("rejects a tampered or truncated authentication tag", () => {
    process.env.SHORTLINKS_ENCRYPTION_KEY = TEST_KEY;
    const stored = encryptToken("token").split(".");
    const tampered = stored[2].slice(0, -2) + (stored[2].endsWith("ab") ? "00" : "ab");
    expect(decryptToken([stored[0], stored[1].slice(0, -2), tampered].join("."))).toBeNull();
    expect(decryptToken([stored[0], stored[1].slice(0, -4), stored[2]].join("."))).toBeNull();
  });

  it("refuses to encrypt without a key and to decrypt garbage", () => {
    delete process.env.SHORTLINKS_ENCRYPTION_KEY;
    expect(hasEncryptionKey()).toBe(false);
    expect(() => encryptToken("token")).toThrow();
    process.env.SHORTLINKS_ENCRYPTION_KEY = TEST_KEY;
    expect(decryptToken("not-a-real-ciphertext")).toBeNull();
  });
});
