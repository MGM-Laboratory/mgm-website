import { NextResponse } from "next/server";

import { gateAdminRequest } from "@/lib/admin-proxy";

import { formPath, forwardBody, streamUpload } from "../../_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const maxVideoBytes = () => Number(process.env.CMS_MAX_VIDEO_BYTES ?? 524_288_000);

// Images arrive as JSON data URLs; MP4/WebM videos stream through raw so
// memory stays flat whatever the size.
export async function POST(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("forms", "write");
  if (!gate.ok) return gate.response;
  const path = formPath((await params).id, "/media");
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!contentType.startsWith("video/")) return forwardBody(request, path, "POST");

  if (contentType !== "video/mp4" && contentType !== "video/webm") {
    return NextResponse.json(
      { message: "The video must be an MP4 or WebM file." },
      { status: 400 },
    );
  }
  const length = Number(request.headers.get("content-length"));
  if (length && length > maxVideoBytes()) {
    return NextResponse.json(
      { message: `The video must be under ${Math.floor(maxVideoBytes() / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }
  return streamUpload(request, path, { "content-type": contentType });
}
