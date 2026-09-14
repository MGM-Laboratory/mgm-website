import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMMUTABLE_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  // Seed initiatives ship with bundled cover art under `static/<public-path>`.
  const staticPath = key.match(/^static\/([\w-]+\/[\w.-]+)$/)?.[1];
  if (staticPath) {
    return NextResponse.redirect(new URL(`/${staticPath}`, request.url));
  }

  const response = await cmsApi(`/cms/research/media/${encodeURIComponent(key)}`, {
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
