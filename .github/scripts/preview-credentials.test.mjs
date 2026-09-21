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
  };
  const preview = {
    ADMIN_PASSPHRASE: "fresh",
    AWS_S3_BUCKET: "preview",
    AWS_ACCESS_KEY_ID: "preview-key",
    PREVIEW_STORAGE_ENVIRONMENT_ID: "preview-id",
  };
  assert.equal(assertIsolatedCredentials(preview, preview, production, "preview-id"), "fresh");
  for (const overrides of [
    { ADMIN_PASSPHRASE: "production" },
    { AWS_S3_BUCKET: "prod" },
    { AWS_ACCESS_KEY_ID: "prod-key" },
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
  await verifySuperadmin("api.example", "web.example", "fresh");
  assert.equal(requests.length, 3);
  assert.equal(requests[0].options.headers["x-cms-passphrase"], "fresh");
  assert.equal(requests[2].options.headers.Cookie, "mgm_admin_session=superadmin.1.time.signature");
});

test("a successful managed-admin login is never announced as superadmin", async (t) => {
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
  await assert.rejects(
    verifySuperadmin("api.example", "web.example", "admin"),
    /superadmin session/,
  );
});
