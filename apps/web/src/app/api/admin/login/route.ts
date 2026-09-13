import { NextResponse } from "next/server";

import { createAdminSession, isValidPassphrase } from "@/lib/admin-session";

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

  if (!isValidPassphrase(passphrase)) {
    return NextResponse.redirect(new URL("/admin/login?error=1", origin), 303);
  }

  await createAdminSession();
  return NextResponse.redirect(new URL("/admin", origin), 303);
}
