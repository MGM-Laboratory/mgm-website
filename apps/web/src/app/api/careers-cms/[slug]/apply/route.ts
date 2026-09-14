import { NextResponse } from "next/server";

import { apiBaseUrl } from "@/lib/cms-api";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The configured ceiling mirrors the API's own limit so an oversize upload
// fails here, before any bytes cross to the API. One extra megabyte covers
// the multipart framing around a full-size CV. Falls back to 100 MB when
// unset, matching the API default.
const maxCvBytes = () => Number(process.env.CMS_MAX_CV_BYTES ?? 104_857_600);

export async function POST(request: Request, { params }: Context) {
  const { slug } = await params;

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data(\s*;|$)/i.test(contentType)) {
    return NextResponse.json(
      { message: "The application must be submitted as a form." },
      { status: 400 },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength && contentLength > maxCvBytes() + 1024 * 1024) {
    return NextResponse.json(
      { message: `The CV must be under ${Math.floor(maxCvBytes() / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  // The multipart body is streamed through untouched — no buffering, so the
  // upload stays memory-flat no matter how large the CV is. The content-type
  // header carries the multipart boundary and must arrive verbatim.
  const response = await fetch(`${apiBaseUrl()}/cms/jobs/${encodeURIComponent(slug)}/apply`, {
    body: request.body,
    headers: { "content-type": contentType },
    method: "POST",
    // Node's fetch requires an explicit duplex mode for streamed bodies.
    duplex: "half",
  } as RequestInit);
  return NextResponse.json(await response.json(), { status: response.status });
}
