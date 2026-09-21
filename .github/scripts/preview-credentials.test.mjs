import assert from "node:assert/strict";
import test from "node:test";
import { assertIsolatedCredentials, verifySuperadmin } from "./preview-credentials.mjs";
import { assertPreviewEnvironment, PRODUCTION_ENVIRONMENT_ID } from "./railway-api.mjs";

test("production IDs fail before any network call", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Network must not be called");
  });
  await assert.rejects(
    assertPreviewEnvironment("token", 75, PRODUCTION_ENVIRONMENT_ID),
    /Refusing/,
  );
  await assert.rejects(assertPreviewEnvironment("token", 75, ""), /Refusing/);
});

test("only a synchronized preview credential with isolated storage can be announced", () => {
  const production = {
    ADMIN_PASSPHRASE: "production",
    AWS_S3_BUCKET: "prod",
    AWS_ACCESS_KEY_ID: "prod-key",
    DATABASE_URL: "postgresql://production",
    REDIS_URL: "redis://production",
  };
  const preview = {
    ADMIN_PASSPHRASE: "fresh",
    AWS_S3_BUCKET: "preview",
    AWS_ACCESS_KEY_ID: "preview-key",
    AWS_SECRET_ACCESS_KEY: "preview-secret",
    PREVIEW_STORAGE_ENVIRONMENT_ID: "preview-id",
    DATABASE_URL: "${{Postgres.DATABASE_URL}}",
    REDIS_URL: "${{Redis.REDIS_URL}}",
  };
  assert.equal(assertIsolatedCredentials(preview, preview, production, "preview-id"), "fresh");
  for (const overrides of [
    { ADMIN_PASSPHRASE: "production" },
    { AWS_S3_BUCKET: "prod" },
    { AWS_ACCESS_KEY_ID: "prod-key" },
    { AWS_SECRET_ACCESS_KEY: undefined },
    { PREVIEW_STORAGE_ENVIRONMENT_ID: "other-id" },
  ]) {
    assert.throws(() =>
      assertIsolatedCredentials({ ...preview, ...overrides }, preview, production, "preview-id"),
    );
  }
  assert.throws(() =>
    assertIsolatedCredentials(preview, { ADMIN_PASSPHRASE: "old" }, production, "preview-id"),
  );
});

test("superadmin verification checks both real login and the superadmin-only route", async (t) => {
  process.env.API_DOMAIN = "preview-api.up.railway.app";
  process.env.WEB_DOMAIN = "preview-web.up.railway.app";
  t.after(() => {
    delete process.env.API_DOMAIN;
    delete process.env.WEB_DOMAIN;
  });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/login"))
      return new Response(null, {
        status: 303,
        headers: {
          location: "/admin",
          "set-cookie": "mgm_admin_session=superadmin.1.time.signature; HttpOnly",
        },
      });
    return Response.json({ records: [] });
  });
  await verifySuperadmin("fresh");
  assert.equal(requests.length, 3);
  assert.equal(requests[0].options.headers["x-cms-passphrase"], "fresh");
  assert.equal(requests[2].options.headers.Cookie, "mgm_admin_session=superadmin.1.time.signature");
});

test("a successful managed-admin login is never announced as superadmin", async (t) => {
  process.env.API_DOMAIN = "preview-api.up.railway.app";
  process.env.WEB_DOMAIN = "preview-web.up.railway.app";
  t.after(() => {
    delete process.env.API_DOMAIN;
    delete process.env.WEB_DOMAIN;
  });
  t.mock.method(globalThis, "fetch", async (url) =>
    url.endsWith("/login")
      ? new Response(null, {
          status: 303,
          headers: {
            location: "/admin",
            "set-cookie": "mgm_admin_session=admin-uuid.1.time.signature",
          },
        })
      : Response.json({ records: [] }),
  );
  await assert.rejects(verifySuperadmin("admin"), /superadmin session/);
});

test("non-Railway domains are refused before any network call", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Network must not be called");
  });
  process.env.API_DOMAIN = "api.example.com";
  process.env.WEB_DOMAIN = "preview-web.up.railway.app";
  t.after(() => {
    delete process.env.API_DOMAIN;
    delete process.env.WEB_DOMAIN;
  });
  await assert.rejects(verifySuperadmin("fresh"), /non-Railway api domain/);

  process.env.API_DOMAIN = "preview-api.up.railway.app";
  process.env.WEB_DOMAIN = "https://web.example.com";
  await assert.rejects(verifySuperadmin("fresh"), /non-Railway web domain/);
});
