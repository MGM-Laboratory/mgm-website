import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMMUTABLE_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

// Author portraits are minted by the photo upload endpoint; the key shape is
// verified here before anything is asked of storage.
const AUTHOR_PHOTO_KEY_PATTERN =
  /^author-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|webp)$/;

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!AUTHOR_PHOTO_KEY_PATTERN.test(key)) return new NextResponse(null, { status: 404 });

  const response = await cmsApi(`/cms/publications/media/${encodeURIComponent(key)}`, {
    redirect: "manual",
  });
  const location = response.headers.get("location");
  const source = location ? await fetch(location, { cache: "no-store" }) : response;
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
