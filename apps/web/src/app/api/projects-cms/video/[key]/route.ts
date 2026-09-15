import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Demo videos live behind the same signed-URL flow as other CMS media, but
// the <video> element relies on HTTP range requests to seek without
// downloading the whole file. Range headers are relayed to storage and the
// 206 responses streamed back, mirroring the publications paper viewer.
const VIDEO_KEY_PATTERN =
  /^demo-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/;

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!VIDEO_KEY_PATTERN.test(key)) return new NextResponse(null, { status: 404 });

  const response = await cmsApi(`/cms/projects/video/${encodeURIComponent(key)}`, {
    redirect: "manual",
  });
  const location = response.headers.get("location");
  if (!location) return new NextResponse(null, { status: response.status || 502 });

  const range = request.headers.get("range");
  const source = await fetch(location, {
    cache: "no-store",
    headers: range ? { range } : {},
  });
  if (!source.ok || !source.body) return new NextResponse(null, { status: source.status });

  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "private, no-cache",
    "content-type":
      source.headers.get("content-type") ?? (key.endsWith(".webm") ? "video/webm" : "video/mp4"),
    "x-content-type-options": "nosniff",
  });
  const contentRange = source.headers.get("content-range");
  const contentLength = source.headers.get("content-length");
  if (contentRange) headers.set("content-range", contentRange);
  if (contentLength) headers.set("content-length", contentLength);
  return new NextResponse(source.body, { headers, status: range ? source.status : 200 });
}
