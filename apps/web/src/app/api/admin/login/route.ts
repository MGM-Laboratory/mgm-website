import { NextResponse } from "next/server";

import {
  createAdminSession,
  isValidPassphrase,
  missingSessionSettings,
  sessionsAreConfigured,
  SUPERADMIN_ACCOUNT_ID,
} from "@/lib/admin-session";
import type { CmsAdminRecord } from "@/lib/admin-permissions";
import { apiBaseUrl } from "@/lib/cms-api";
import { API_WRITE_TIMEOUT_MS, fetchWithTimeout } from "@/lib/fetch-timeout";

/**
 * A redirect back into the admin panel. The Location is relative so it
 * resolves against the request's own origin: forwarded host headers are
 * attacker-controlled and the container's internal address (behind the
 * reverse proxy) is unreachable from a browser, so neither is consulted.
 */
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { location: path } });
}

export async function POST(request: Request) {
  // Without the session secret no cookie can be signed, so say that and not "wrong passphrase"
  if (!sessionsAreConfigured()) {
    console.error(`admin login: not set up, missing ${missingSessionSettings().join(" and ")}`);
    return new NextResponse("The admin sign in is not set up on this server.", { status: 503 });
  }
  const form = await request.formData();
  const passphrase = String(form.get("passphrase") ?? "");

  // The environment passphrase logs in as the superadmin.
  if (isValidPassphrase(passphrase)) {
    await createAdminSession(SUPERADMIN_ACCOUNT_ID, 1);
    return redirectTo("/admin");
  }

  // Otherwise the passphrase belongs to a managed admin account. The verify
  // endpoint is public by design, so this fetch deliberately sends no
  // x-cms-passphrase header.
  const response = await fetchWithTimeout(
    `${apiBaseUrl()}/cms/admins/verify`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    },
    API_WRITE_TIMEOUT_MS,
  );
  if (response.ok) {
    const { account } = (await response.json()) as { account?: CmsAdminRecord };
    if (account?.slug) {
      await createAdminSession(account.slug, account.sessionVersion);
      return redirectTo("/admin");
    }
  }

  return redirectTo("/admin/login?error=1");
}
