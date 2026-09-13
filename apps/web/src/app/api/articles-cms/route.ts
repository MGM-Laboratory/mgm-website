import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { ensureArticleCmsSeeded } from "@/lib/article-cms-seed";
import { publishedArticles } from "@/lib/article-cms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECORDS_CACHE_CONTROL = "private, no-cache, max-age=0, must-revalidate";

export async function GET(request: Request) {
  try {
    // Drafts stay out of the public feed entirely; the admin workspace reads
    // them through its own authenticated proxy.
    const records = publishedArticles(await ensureArticleCmsSeeded());
    const payload = JSON.stringify({ records });
    const etag = `W/\"${createHash("sha256").update(payload).digest("base64url")}\"`;
    const headers = { "cache-control": RECORDS_CACHE_CONTROL, etag, vary: "Accept-Encoding" };
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { headers, status: 304 });
    }
    return new NextResponse(payload, {
      headers: { ...headers, "content-type": "application/json; charset=utf-8" },
    });
  } catch {
    return NextResponse.json(
      { records: [] },
      { headers: { "cache-control": "no-store" }, status: 503 },
    );
  }
}
