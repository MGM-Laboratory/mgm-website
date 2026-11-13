import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleShortlinkCatchAll } from "@/lib/shortlinks-http";
import { renderSiteNotFound } from "@/lib/shortlinks-pages";

// The catch-all answers only paths nothing else in the app matches, which
// is exactly what custom short domains need: their short codes live at the
// domain root. On the site's own hosts it just answers 404 like before.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string[] }> };

// A browser that follows a dead link gets a 404 page. Any other caller (a
// script, a probe, a POST) keeps the JSON answer. The body depends on the
// Accept header, so the answer says so for any cache in front of the site.
function notFound(request: NextRequest) {
  const headers = { vary: "Accept" };
  if (request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
    return new Response(renderSiteNotFound(), {
      status: 404,
      headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    });
  }
  return NextResponse.json({ error: "Not Found" }, { status: 404, headers });
}

export async function GET(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return (await handleShortlinkCatchAll(request, slug)) ?? notFound(request);
}

export async function POST(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return (await handleShortlinkCatchAll(request, slug)) ?? notFound(request);
}
