import { NextResponse } from "next/server";

import { ARTICLE_BATCH_MAX, ARTICLE_BATCH_SIZE, readArticleIndexQuery } from "@/lib/article-index";
import { readArticleIndex } from "@/lib/article-index-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One batch of the /articles index: `?offset=&limit=` plus the list's own
 * `?category=` and `?q=`. The page renders the first batch itself; the list
 * asks here for the rest as the visitor nears the end of what is loaded.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = readArticleIndexQuery({
    category: params.get("category"),
    q: params.get("q"),
  });
  const offset = Math.max(0, Math.floor(Number(params.get("offset")) || 0));
  const requested = Math.floor(Number(params.get("limit")) || ARTICLE_BATCH_SIZE);
  const limit = Math.min(Math.max(requested, 1), ARTICLE_BATCH_MAX);

  try {
    const result = await readArticleIndex(query, { offset, limit, reuse: true });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json(
      { items: [], total: 0, offset, nextOffset: null, categories: [], all: 0 },
      { headers: { "cache-control": "no-store" }, status: 503 },
    );
  }
}
