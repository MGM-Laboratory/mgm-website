import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMMUTABLE_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const response = await cmsApi(`/cms/members/media/${encodeURIComponent(key)}`, {
    redirect: "manual",
  });
  const location = response.headers.get("location");
  if (!location) return new NextResponse(null, { status: response.status });
  const source = await fetch(location, { cache: "no-store" });
  if (!source.ok || !source.body) return new NextResponse(null, { status: source.status });

  const headers = new Headers({
    "cache-control": IMMUTABLE_MEDIA_CACHE_CONTROL,
    "content-type": source.headers.get("content-type") ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  const contentLength = source.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  return new NextResponse(source.body, { headers });
}
