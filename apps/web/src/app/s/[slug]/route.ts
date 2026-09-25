import type { NextRequest } from "next/server";

import { handleShortlinkGet, handleShortlinkPost } from "@/lib/shortlinks-http";

// Every hit records a visit and (usually) redirects, so this must never be
// cached or prerendered.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return handleShortlinkGet(request, slug);
}

export async function POST(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return handleShortlinkPost(request, slug);
}
