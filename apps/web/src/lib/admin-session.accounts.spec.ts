// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

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

const { cmsApi } = vi.hoisted(() => ({ cmsApi: vi.fn<(path: string) => Promise<Response>>() }));
vi.mock("@/lib/cms-api", () => ({ cmsApi }));

const COOKIE_NAME = "mgm_admin_session";
const SECRET = "s".repeat(64);

function cookieFor(accountId: string, version: number, issuedAt = Date.now()) {
  const payload = `${accountId}.${version}.${issuedAt}`;
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}

function account(extra: Record<string, unknown> = {}) {
  return {
    slug: "ada",
    name: "Ada",
    role: "admin",
    active: true,
    expiresAt: null,
    sessionVersion: 3,
    permissions: { articles: ["read", "write"] },
    ...extra,
  };
}

async function load() {
  vi.resetModules();
  return import("./admin-session");
}

beforeEach(() => {
  jar.clear();
  cookieOptions.clear();
  cmsApi.mockReset();
  vi.stubEnv("ADMIN_PASSPHRASE", "the-admin-login-value");
  vi.stubEnv("SESSION_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a signed in admin account", () => {
  it("is read from the API on every request and keeps its own permissions", async () => {
    jar.set(COOKIE_NAME, cookieFor("ada", 3));
    cmsApi.mockImplementation(async () => Response.json({ record: account() }));
    const { getAdminSession, hasAdminSession } = await load();

    expect(await getAdminSession()).toEqual({
      accountId: "ada",
      role: "admin",
      name: "Ada",
      permissions: { articles: ["read", "write"] },
    });
    expect(cmsApi).toHaveBeenCalledWith("/cms/admins/ada");
    expect(await hasAdminSession()).toBe(true);
    expect(cmsApi).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["the account was removed", () => Response.json({}, { status: 404 })],
    ["the answer has no record", () => Response.json({})],
    ["the record is not an admin", () => Response.json({ record: account({ role: "viewer" }) })],
    ["the account is switched off", () => Response.json({ record: account({ active: false }) })],
    [
      "the account has expired",
      () => Response.json({ record: account({ expiresAt: "2000-01-01T00:00:00.000Z" }) }),
    ],
    [
      "the session version moved on",
      () => Response.json({ record: account({ sessionVersion: 4 }) }),
    ],
  ])("is refused when %s", async (_name, answer) => {
    jar.set(COOKIE_NAME, cookieFor("ada", 3));
    cmsApi.mockImplementation(async () => answer());
    const { getAdminSession, hasAdminSession } = await load();

    expect(await getAdminSession()).toBeNull();
    expect(await hasAdminSession()).toBe(false);
  });

  it("is still valid before its expiry date", async () => {
    jar.set(COOKIE_NAME, cookieFor("ada", 3));
    cmsApi.mockResolvedValue(
      Response.json({
        record: account({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
      }),
    );
    const { getAdminSession } = await load();

    expect((await getAdminSession())?.accountId).toBe("ada");
  });
});

describe("cookie parsing", () => {
  it.each([
    ["no cookie", undefined],
    ["a cookie with missing parts", "ada.3"],
    ["an account id that is not a slug", `Bad_Id.3.${Date.now()}.sig`],
    ["a version that is not a number", `ada.x.${Date.now()}.sig`],
    ["a signature that does not match", `ada.3.${Date.now()}.${"A".repeat(43)}`],
  ])("refuses %s", async (_name, value) => {
    if (value) jar.set(COOKIE_NAME, value);
    const { getAdminSession } = await load();

    expect(await getAdminSession()).toBeNull();
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("refuses a signed cookie whose time is not a number", async () => {
    const payload = "ada.3.later";
    jar.set(
      COOKIE_NAME,
      `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`,
    );
    const { getAdminSession } = await load();

    expect(await getAdminSession()).toBeNull();
  });
});

describe("creating and clearing the session", () => {
  it("sets a signed http only cookie that reads back", async () => {
    cmsApi.mockResolvedValue(Response.json({ record: account({ sessionVersion: 7 }) }));
    const { createAdminSession, getAdminSession } = await load();

    await createAdminSession("ada", 7);

    expect(cookieOptions.get(COOKIE_NAME)).toMatchObject({
      httpOnly: true,
      maxAge: 43200,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    expect((await getAdminSession())?.accountId).toBe("ada");
  });

  it("marks the cookie secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { createAdminSession } = await load();

    await createAdminSession("superadmin", 1);

    expect(cookieOptions.get(COOKIE_NAME)?.secure).toBe(true);
  });

  it("will not sign without a configured secret", async () => {
    vi.stubEnv("SESSION_SECRET", "short");
    const { createAdminSession } = await load();

    await expect(createAdminSession("ada", 1)).rejects.toThrow("SESSION_SECRET is not set");
    expect(jar.size).toBe(0);
  });

  it("clears the cookie", async () => {
    jar.set(COOKIE_NAME, "x");
    const { clearAdminSession } = await load();

    await clearAdminSession();

    expect(jar.has(COOKIE_NAME)).toBe(false);
  });
});

describe("permission gates", () => {
  async function signedIn(record: Record<string, unknown> | "superadmin") {
    if (record === "superadmin") jar.set(COOKIE_NAME, cookieFor("superadmin", 1));
    else {
      jar.set(COOKIE_NAME, cookieFor("ada", 3));
      cmsApi.mockImplementation(async () => Response.json({ record }));
    }
    return load();
  }

  it("answers 401 without a session", async () => {
    const { requireAdminPermission, requireSuperadmin } = await load();

    expect(await requireAdminPermission("articles", "read")).toEqual({ status: 401 });
    expect(await requireSuperadmin()).toEqual({ status: 401 });
  });

  it("lets the superadmin do everything, including writes to the contact inbox", async () => {
    const { requireAdminPermission, requireSuperadmin } = await signedIn("superadmin");

    expect((await requireAdminPermission("members", "delete")).status).toBe(200);
    expect((await requireAdminPermission("contact-inquiries", "delete")).status).toBe(200);
    expect((await requireSuperadmin()).status).toBe(200);
  });

  it("lets an admin do what its permissions list and nothing more", async () => {
    const { requireAdminPermission, requireSuperadmin } = await signedIn(account());

    expect((await requireAdminPermission("articles", "write")).status).toBe(200);
    expect(await requireAdminPermission("articles", "delete")).toEqual({ status: 403 });
    expect(await requireAdminPermission("members", "read")).toEqual({ status: 403 });
    expect(await requireSuperadmin()).toEqual({ status: 403 });
  });

  it("keeps the contact inbox read only for an admin even with a write grant", async () => {
    const { requireAdminPermission } = await signedIn(
      account({ permissions: { "contact-inquiries": ["read", "write", "delete"] } }),
    );

    expect((await requireAdminPermission("contact-inquiries", "read")).status).toBe(200);
    expect(await requireAdminPermission("contact-inquiries", "write")).toEqual({ status: 403 });
    expect(await requireAdminPermission("contact-inquiries", "delete")).toEqual({ status: 403 });
  });
});
