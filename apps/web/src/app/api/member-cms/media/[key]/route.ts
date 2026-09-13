import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const response = await cmsApi(`/cms/members/media/${encodeURIComponent(key)}`, {
    redirect: "manual",
  });
  const location = response.headers.get("location");
  if (!location) return new NextResponse(null, { status: response.status });
  return NextResponse.redirect(location, {
    headers: { "cache-control": "private, no-store" },
  });
}
