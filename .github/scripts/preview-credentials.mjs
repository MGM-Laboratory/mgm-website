import { ghPaginate, ghRequest } from "./gh-api.mjs";
import { isBotComment, upsertComment } from "./pr-comments.mjs";

export const PREVIEW_READY_MARKER = "<!-- ren-automation:preview-ready -->";

export async function invalidatePreviewAnnouncement(token, repo, prNumber) {
  const comments = await ghPaginate(token, `/repos/${repo}/issues/${prNumber}/comments`);
  for (const comment of comments) {
    if (!isBotComment(comment) || comment.body?.includes(PREVIEW_READY_MARKER)) continue;
    if (!comment.body?.includes(`Preview environment ready — PR #${prNumber}`)) continue;
    await ghRequest(token, `/repos/${repo}/issues/comments/${comment.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        body: "This preview credential has been superseded. Use the current preview status comment on this PR.",
      }),
    });
  }
  await upsertComment(
    token,
    repo,
    prNumber,
    PREVIEW_READY_MARKER,
    "## Preview is rebuilding\n\nThe previous password is being rotated. A verified superadmin password will appear here when deployment completes.",
  );
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
  if (
    preview.PREVIEW_STORAGE_ENVIRONMENT_ID !== environmentId ||
    !preview.AWS_S3_BUCKET ||
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

export async function verifySuperadmin(apiDomain, webDomain, passphrase) {
  const api = await fetch(`https://${apiDomain}/api/cms/admins`, {
    headers: { "x-cms-passphrase": passphrase },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!api.ok) throw new Error(`Preview API rejected superadmin access (${api.status})`);
  const login = await fetch(`https://${webDomain}/api/admin/login`, {
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
  const admins = await fetch(`https://${webDomain}/api/admin/admins`, {
    headers: { Cookie: cookie },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!admins.ok)
    throw new Error(`Preview web rejected its superadmin-only route (${admins.status})`);
}
