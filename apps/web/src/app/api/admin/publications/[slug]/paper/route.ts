import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-session";
import { apiBaseUrl } from "@/lib/cms-api";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The configured ceiling mirrors the API's own limit so an oversize upload
// fails here, before any bytes cross to the API. Falls back to 200 MB when
// unset, matching the API default.
const maxPaperBytes = () => Number(process.env.CMS_MAX_PAPER_BYTES ?? 209_715_200);

export async function POST(request: Request, { params }: Context) {
  const gate = await requireAdminPermission("publications", "write");
  if (gate.status !== 200) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status },
    );
  }
  const { slug } = await params;

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/pdf(\s*;|$)/i.test(contentType)) {
    return NextResponse.json({ message: "The paper must be a PDF file." }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength && contentLength > maxPaperBytes()) {
    return NextResponse.json(
      { message: `The paper must be under ${Math.floor(maxPaperBytes() / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  // The PDF body is streamed through untouched — no buffering, so the upload
  // stays memory-flat no matter how large the file is.
  const response = await fetch(
    `${apiBaseUrl()}/cms/publications/${encodeURIComponent(slug)}/paper`,
    {
      body: request.body,
      headers: {
        "content-type": "application/pdf",
        "x-cms-passphrase": process.env.ADMIN_PASSPHRASE ?? "",
      },
      method: "POST",
      // Node's fetch requires an explicit duplex mode for streamed bodies.
      duplex: "half",
    } as RequestInit,
  );
  return NextResponse.json(await response.json(), { status: response.status });
}
