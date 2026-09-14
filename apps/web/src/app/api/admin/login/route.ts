import { NextResponse } from "next/server";

import { createAdminSession, isValidPassphrase, SUPERADMIN_ACCOUNT_ID } from "@/lib/admin-session";
import type { CmsAdminRecord } from "@/lib/admin-permissions";
import { apiBaseUrl } from "@/lib/cms-api";

function publicOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.slice(0, -1);

  return host ? `${protocol}://${host}` : requestUrl.origin;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const passphrase = String(form.get("passphrase") ?? "");
  const origin = publicOrigin(request);

  // The environment passphrase logs in as the superadmin.
  if (isValidPassphrase(passphrase)) {
    await createAdminSession(SUPERADMIN_ACCOUNT_ID, 1);
    return NextResponse.redirect(new URL("/admin", origin), 303);
  }

  // Otherwise the passphrase belongs to a managed admin account. The verify
  // endpoint is public by design, so this fetch deliberately sends no
  // x-cms-passphrase header.
  const response = await fetch(`${apiBaseUrl()}/cms/admins/verify`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  if (response.ok) {
    const { account } = (await response.json()) as { account?: CmsAdminRecord };
    if (account?.slug) {
      await createAdminSession(account.slug, account.sessionVersion);
      return NextResponse.redirect(new URL("/admin", origin), 303);
    }
  }

  return NextResponse.redirect(new URL("/admin/login?error=1", origin), 303);
}
