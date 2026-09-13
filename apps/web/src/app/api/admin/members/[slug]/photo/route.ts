import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!(await hasAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const payload = (await request.json()) as { image?: unknown };
    if (typeof payload.image !== "string" || !payload.image.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Choose a valid PNG, JPEG, or WebP image." },
        { status: 400 },
      );
    }
    // Base64 is larger than the image itself. Keep a deliberate margin below
    // the API limit so an oversized request returns a clear message instead of
    // being rejected by an intermediary with an empty response body.
    if (payload.image.length > 5_600_000) {
      return NextResponse.json(
        { error: "This portrait is still too large. Re-crop it or use a smaller image." },
        { status: 413 },
      );
    }

    const { slug } = await params;
    const response = await cmsApi(`/cms/members/${encodeURIComponent(slug)}/photo`, {
      body: JSON.stringify(payload),
      method: "POST",
    });
    const body = await response.text();
    return new NextResponse(body, {
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
      status: response.status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Portrait upload could not be completed: ${error.message}`
            : "Portrait upload could not be completed. Please try again.",
      },
      { status: 502 },
    );
  }
}
