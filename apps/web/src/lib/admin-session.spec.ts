import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
const cookieOptions = new Map<string, Record<string, unknown>>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      jar.set(name, value);
      cookieOptions.set(name, options);
    },
    delete: (name: string) => jar.delete(name),
  }),
}));

const COOKIE_NAME = "mgm_admin_session";
const SECRET = "s".repeat(64);
const ADMIN_KEY = "the-admin-login-value";

function signWith(key: string, payload: string) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

async function load() {
  vi.resetModules();
  return import("./admin-session");
}

describe("the admin session", () => {
  beforeEach(() => {
    jar.clear();
    cookieOptions.clear();
    vi.stubEnv("ADMIN_PASSPHRASE", ADMIN_KEY);
    vi.stubEnv("SESSION_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("the settings", () => {
    it("are complete with a passphrase and a long secret", async () => {
      const session = await load();

      expect(session.sessionsAreConfigured()).toBe(true);
      expect(session.missingSessionSettings()).toEqual([]);
    });

    it.each([
      ["no secret", "", ADMIN_KEY, ["SESSION_SECRET (at least 32 characters)"]],
      ["a short secret", "x".repeat(31), ADMIN_KEY, ["SESSION_SECRET (at least 32 characters)"]],
      ["no passphrase", SECRET, "", ["ADMIN_PASSPHRASE"]],
      ["neither", "", "", ["SESSION_SECRET (at least 32 characters)", "ADMIN_PASSPHRASE"]],
    ])("are incomplete with %s", async (_name, secret, adminKey, missing) => {
      vi.stubEnv("SESSION_SECRET", secret);
      vi.stubEnv("ADMIN_PASSPHRASE", adminKey);
      const session = await load();

      expect(session.sessionsAreConfigured()).toBe(false);
      expect(session.missingSessionSettings()).toEqual(missing);
    });

    it("name the missing setting and never its value", async () => {
      vi.stubEnv("SESSION_SECRET", "short-secret-value");
      const session = await load();

      expect(session.missingSessionSettings().join(" ")).not.toContain("short-secret-value");
    });
  });

  describe("the passphrase", () => {
    it("is compared with ADMIN_PASSPHRASE and not with SESSION_SECRET", async () => {
      const session = await load();

      expect(session.isValidPassphrase(ADMIN_KEY)).toBe(true);
      expect(session.isValidPassphrase(SECRET)).toBe(false);
      expect(session.isValidPassphrase("")).toBe(false);
    });

    it("never matches when no passphrase is configured", async () => {
      vi.stubEnv("ADMIN_PASSPHRASE", "");
      const session = await load();

      expect(session.isValidPassphrase("")).toBe(false);
    });
  });

  describe("the cookie", () => {
    it("is signed with SESSION_SECRET and reads back as the superadmin", async () => {
      const session = await load();

      await session.createAdminSession(session.SUPERADMIN_ACCOUNT_ID, 1);
      const cookie = jar.get(COOKIE_NAME) ?? "";
      const [accountId, version, issuedAt, signature] = cookie.split(".");

      expect(signature).toBe(signWith(SECRET, `${accountId}.${version}.${issuedAt}`));
      expect(signature).not.toBe(signWith(ADMIN_KEY, `${accountId}.${version}.${issuedAt}`));
      expect(cookieOptions.get(COOKIE_NAME)).toMatchObject({ httpOnly: true, sameSite: "lax" });
      expect(await session.getAdminSession()).toMatchObject({
        accountId: "superadmin",
        role: "superadmin",
      });
    });

    it("is refused when it was signed with the passphrase", async () => {
      const session = await load();
      const payload = `superadmin.1.${Date.now()}`;
      jar.set(COOKIE_NAME, `${payload}.${signWith(ADMIN_KEY, payload)}`);

      expect(await session.getAdminSession()).toBeNull();
    });

    it("is refused when it was signed with an empty key and no secret is set", async () => {
      vi.stubEnv("SESSION_SECRET", "");
      const session = await load();
      const payload = `superadmin.1.${Date.now()}`;
      jar.set(COOKIE_NAME, `${payload}.${signWith("", payload)}`);

      expect(await session.getAdminSession()).toBeNull();
    });

    it("is refused after twelve hours", async () => {
      const session = await load();
      const payload = `superadmin.1.${Date.now() - 12 * 60 * 60 * 1000 - 1}`;
      jar.set(COOKIE_NAME, `${payload}.${signWith(SECRET, payload)}`);

      expect(await session.getAdminSession()).toBeNull();
    });

    it("is refused for another session version of the superadmin", async () => {
      const session = await load();
      const payload = `superadmin.2.${Date.now()}`;
      jar.set(COOKIE_NAME, `${payload}.${signWith(SECRET, payload)}`);

      expect(await session.getAdminSession()).toBeNull();
    });

    it("is refused when the secret changed after it was signed", async () => {
      const first = await load();
      await first.createAdminSession(first.SUPERADMIN_ACCOUNT_ID, 1);
      vi.stubEnv("SESSION_SECRET", "n".repeat(64));
      const second = await load();

      expect(await second.getAdminSession()).toBeNull();
    });

    it("is never read, and never made, while the settings are incomplete", async () => {
      vi.stubEnv("SESSION_SECRET", "");
      const second = await load();
      const payload = `superadmin.1.${Date.now()}`;
      jar.set(COOKIE_NAME, `${payload}.${signWith("", payload)}`);

      expect(await second.getAdminSession()).toBeNull();
      jar.clear();
      await expect(second.createAdminSession(second.SUPERADMIN_ACCOUNT_ID, 1)).rejects.toThrow(
        "SESSION_SECRET is not set",
      );
      expect(jar.size).toBe(0);
    });
  });
});
