import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-session";
import { apiBaseUrl } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The configured ceiling mirrors the API's own limit so an oversize upload
// fails here, before any bytes cross to the API. Falls back to 500 MB when
// unset, matching the API default.
const maxVideoBytes = () => Number(process.env.CMS_MAX_VIDEO_BYTES ?? 524_288_000);

export async function POST(request: Request) {
  const gate = await requireAdminPermission("home", "write");
  if (gate.status !== 200) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType !== "video/mp4" && contentType !== "video/webm") {
    return NextResponse.json(
      { message: "The video must be an MP4 or WebM file." },
      { status: 400 },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength && contentLength > maxVideoBytes()) {
    return NextResponse.json(
      { message: `The video must be under ${Math.floor(maxVideoBytes() / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  // The video body is streamed through untouched — no buffering, so the
  // upload stays memory-flat no matter how large the file is.
  const response = await fetch(`${apiBaseUrl()}/cms/home/video`, {
    body: request.body,
    headers: {
      "content-type": contentType,
      "x-cms-passphrase": process.env.ADMIN_PASSPHRASE ?? "",
    },
    method: "POST",
    // Node's fetch requires an explicit duplex mode for streamed bodies.
    duplex: "half",
  } as RequestInit);
  return NextResponse.json(await response.json(), { status: response.status });
}
