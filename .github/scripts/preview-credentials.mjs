import { ghPaginate, ghRequest } from "./gh-api.mjs";
import { isBotComment } from "./pr-comments.mjs";

export const PREVIEW_READY_MARKER = "<!-- ren-automation:preview-ready -->";

export async function invalidatePreviewAnnouncement(token, repo, prNumber) {
  // Every /preview posts a fresh announcement, so each earlier one must be
  // visibly retired: an upserted comment keeps its original position in the
  // conversation and reads as stale, which is exactly the bug where a new
  // deployment looked like it never announced anything. Replace the old
  // bodies instead of deleting them so the history stays legible.
  const comments = await ghPaginate(token, `/repos/${repo}/issues/${prNumber}/comments`);
  for (const comment of comments) {
    if (!isBotComment(comment)) continue;
    const isReady =
      comment.body?.includes(PREVIEW_READY_MARKER) ||
      comment.body?.includes(`Preview environment ready — PR #${prNumber}`);
    if (!isReady) continue;
    await ghRequest(token, `/repos/${repo}/issues/comments/${comment.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        body: "This preview credential has been superseded. Use the current preview status comment on this PR.",
      }),
    });
  }
}

export function assertIsolatedCredentials(preview, web, production, environmentId) {
  const passphrase = preview.ADMIN_PASSPHRASE;
  if (
    !passphrase ||
    passphrase === production.ADMIN_PASSPHRASE ||
    passphrase !== web.ADMIN_PASSPHRASE
  ) {
    throw new Error(
      "Preview superadmin credentials are missing, unsynchronized, or shared with production",
    );
  }
  // Empty preview keys must not slip through: a missing credential here would
  // silently fall back to whatever the S3 client resolves on its own, which
  // is exactly how a preview ends up talking to production storage.
  if (
    preview.PREVIEW_STORAGE_ENVIRONMENT_ID !== environmentId ||
    !preview.AWS_S3_BUCKET ||
    !preview.AWS_ACCESS_KEY_ID ||
    !preview.AWS_SECRET_ACCESS_KEY ||
    !production.AWS_S3_BUCKET ||
    !production.AWS_ACCESS_KEY_ID ||
    preview.AWS_S3_BUCKET === production.AWS_S3_BUCKET ||
    preview.AWS_ACCESS_KEY_ID === production.AWS_ACCESS_KEY_ID
  ) {
    throw new Error("Preview storage is not isolated from production");
  }
  // The preview app must resolve its own Railway services, never a copied
  // production URL. Keep these checks explicit so a future variable rename
  // cannot silently reconnect the preview to production's database/cache.
  if (
    preview.DATABASE_URL === production.DATABASE_URL ||
    preview.REDIS_URL === production.REDIS_URL
  ) {
    throw new Error("Preview database or Redis connection is shared with production");
  }
  if (!preview.DATABASE_URL || !preview.REDIS_URL) {
    throw new Error("Preview database or Redis connection is missing");
  }
  for (const key of ["DATABASE_URL", "REDIS_URL", "PGHOST", "REDISHOST"]) {
    if (preview[key] && production[key] && preview[key] === production[key]) {
      throw new Error(`Preview ${key} is still connected to production`);
    }
  }
  return passphrase;
}

// The domains come from the provision job's outputs, not from a commenter,
// but asserting the shape costs nothing and guarantees a misconfigured
// dispatch can never make these fetches hit an arbitrary host. The fetch
// call sites receive the URL this validator returns — never the raw caller
// input — so a taint-tracking analyzer sees a validated value at the sink.
const RAILWAY_DOMAIN = /^[a-z0-9-]+\.up\.railway\.app$/i;
function verifiedUrl(label, domain, path) {
  if (!RAILWAY_DOMAIN.test(domain ?? "")) {
    throw new Error(`Refusing to verify against a non-Railway ${label} domain: ${domain}`);
  }
  return `https://${domain}${path}`;
}

export async function verifySuperadmin(passphrase) {
  // Domains come from the pipeline environment (preview.yml sets them from
  // the provision job's Railway outputs) rather than from function
  // parameters, and are still shape-checked before any fetch.
  const apiDomain = process.env.API_DOMAIN;
  const webDomain = process.env.WEB_DOMAIN;
  // All targets are validated before the first network call, so a bad domain
  // fails closed without any fetch, and each fetch receives a validated URL.
  const apiUrl = verifiedUrl("api", apiDomain, "/api/cms/admins");
  const loginUrl = verifiedUrl("web", webDomain, "/api/admin/login");
  const adminsUrl = verifiedUrl("web", webDomain, "/api/admin/admins");
  const api = await fetch(apiUrl, {
    headers: { "x-cms-passphrase": passphrase },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!api.ok) throw new Error(`Preview API rejected superadmin access (${api.status})`);
  const login = await fetch(loginUrl, {
    method: "POST",
    body: new URLSearchParams({ passphrase }),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const cookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith("mgm_admin_session=superadmin."))
    ?.split(";")[0];
  if (login.status !== 303 || login.headers.get("location") !== "/admin" || !cookie)
    throw new Error("Preview web login did not create a superadmin session");
  const admins = await fetch(adminsUrl, {
    headers: { Cookie: cookie },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!admins.ok)
    throw new Error(`Preview web rejected its superadmin-only route (${admins.status})`);
}
