import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Papers live behind the same signed-URL flow as other CMS media, but PDF
// readers rely on HTTP range requests to page through large files without
// downloading them whole. Range headers are relayed to storage and the 206
// responses streamed back, so a 200 MB paper only ever moves the pages the
// reader actually opens.
const PAPER_KEY_PATTERN =
  /^(static\/publications\/(?:[\w-]+\/)*[\w-]+\.pdf|paper-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf)$/;

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!PAPER_KEY_PATTERN.test(key)) return new NextResponse(null, { status: 404 });

  // Seed publications ship with bundled papers under `static/<public-path>`.
  // Segments may only be plain word characters, so no dot segments or other
  // path tricks can survive, and the Location header stays root-relative.
  const staticPath = key.match(/^static\/((?:[\w-]+\/)*[\w-]+\.pdf)$/)?.[1];
  if (staticPath) {
    return new NextResponse(null, { headers: { location: `/${staticPath}` }, status: 307 });
  }

  const response = await cmsApi(`/cms/publications/paper/${encodeURIComponent(key)}`, {
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
    "content-type": source.headers.get("content-type") ?? "application/pdf",
    "x-content-type-options": "nosniff",
  });
  const contentRange = source.headers.get("content-range");
  const contentLength = source.headers.get("content-length");
  if (contentRange) headers.set("content-range", contentRange);
  if (contentLength) headers.set("content-length", contentLength);
  return new NextResponse(source.body, { headers, status: range ? source.status : 200 });
}
