import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ key: string }> };

const MEDIA_KEY =
  /^form-[a-z0-9]{1,40}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp|gif|mp4|webm)$/;

// A 302 to the object's short-lived signed URL rather than a proxied body:
// the browser then talks to storage directly, Range requests included, which
// Safari needs to play video.
export async function GET(_request: Request, { params }: Context) {
  const { key } = await params;
  if (!MEDIA_KEY.test(key)) return new NextResponse(null, { status: 404 });
  try {
    const response = await cmsApi(`/forms/media/${encodeURIComponent(key)}`, {
      redirect: "manual",
    });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) {
      return new NextResponse(null, { status: response.status === 200 ? 404 : response.status });
    }
    const redirect = NextResponse.redirect(location, 302);
    // The signed URL lives 15 minutes; browsers may reuse the hop for 5.
    redirect.headers.set("cache-control", "private, max-age=300");
    return redirect;
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
