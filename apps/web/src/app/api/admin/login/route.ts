import { NextResponse } from "next/server";

import { createAdminSession, isValidPassphrase } from "@/lib/admin-session";

export async function POST(request: Request) {
  const form = await request.formData();
  const passphrase = String(form.get("passphrase") ?? "");
  const origin = new URL(request.url).origin;

  if (!isValidPassphrase(passphrase)) {
    return NextResponse.redirect(new URL("/admin/login?error=1", origin), 303);
  }

  await createAdminSession();
  return NextResponse.redirect(new URL("/admin", origin), 303);
}
