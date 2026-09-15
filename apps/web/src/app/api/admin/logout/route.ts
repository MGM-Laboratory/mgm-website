import { NextResponse } from "next/server";

import { clearAdminSession } from "@/lib/admin-session";

export async function POST() {
  await clearAdminSession();
  // A relative Location keeps the redirect on the request's own origin and
  // removes any dependence on forwarded host headers, which behind the
  // Railway proxy would otherwise redirect to the container's internal
  // address or whatever host an attacker claims.
  return new NextResponse(null, { status: 303, headers: { location: "/admin/login" } });
}
