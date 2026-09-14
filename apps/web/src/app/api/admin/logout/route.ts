import { NextResponse } from "next/server";

import { clearAdminSession } from "@/lib/admin-session";

function publicOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.slice(0, -1);

  return host ? `${protocol}://${host}` : requestUrl.origin;
}

export async function POST(request: Request) {
  await clearAdminSession();
  // request.url points at the container's internal address behind the
  // Railway proxy; the forwarded headers carry the public origin.
  return NextResponse.redirect(new URL("/admin/login", publicOrigin(request)), 303);
}
