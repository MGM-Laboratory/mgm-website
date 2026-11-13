import { notFound as renderNotFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleShortlinkCatchAll } from "@/lib/shortlinks-http";

// The catch-all answers only paths nothing else in the app matches, which
// is exactly what custom short domains need: their short codes live at the
// domain root. On the site's own hosts it just answers 404 like before.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string[] }> };

// A browser that follows a dead link gets the site's own 404 page. Any other
// caller (a script, a probe) keeps the JSON answer.
function notFound(request: NextRequest) {
  if (request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
    renderNotFound();
  }
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}

export async function GET(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return (await handleShortlinkCatchAll(request, slug)) ?? notFound(request);
}

export async function POST(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return (await handleShortlinkCatchAll(request, slug)) ?? notFound(request);
}
