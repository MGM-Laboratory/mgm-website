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
import { visitorAddress } from "@/lib/forms/visitor-ip";
import { clearLoginFailures, loginAllowed, recordLoginFailure } from "@/lib/login-limit";
import { provenVisitorHeaders } from "@/lib/visitor-headers";

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
  // Ten wrong passphrases a minute for each visitor, for the superadmin passphrase and for the managed accounts alike
  const visitor = visitorAddress(request) ?? "unknown";
  if (!loginAllowed(visitor)) {
    return new NextResponse("Too many sign in attempts. Wait a minute and try again.", {
      status: 429,
      headers: { "retry-after": "60" },
    });
  }
  const form = await request.formData();
  const passphrase = String(form.get("passphrase") ?? "");

  // The environment passphrase logs in as the superadmin.
  if (isValidPassphrase(passphrase)) {
    clearLoginFailures(visitor);
    await createAdminSession(SUPERADMIN_ACCOUNT_ID, 1);
    return redirectTo("/admin");
  }

  // Otherwise the passphrase belongs to a managed admin account. The verify endpoint is public by design. The visitor headers
  // make the API count the guess for this visitor and not for the address of this web server, and the passphrase in them only
  // proves that the headers come from this server.
  const response = await fetchWithTimeout(
    `${apiBaseUrl()}/cms/admins/verify`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...provenVisitorHeaders(request) },
      body: JSON.stringify({ passphrase }),
    },
    API_WRITE_TIMEOUT_MS,
  );
  if (response.ok) {
    const { account } = (await response.json()) as { account?: CmsAdminRecord };
    if (account?.slug) {
      clearLoginFailures(visitor);
      await createAdminSession(account.slug, account.sessionVersion);
      return redirectTo("/admin");
    }
  }

  recordLoginFailure(visitor);
  return redirectTo("/admin/login?error=1");
}
