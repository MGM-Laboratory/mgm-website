import type { Metadata } from "next";

import { ArticlesIndex } from "@/components/articles/list/articles-index";
import { ARTICLE_BATCH_SIZE, readArticleIndexQuery } from "@/lib/article-index";
import { readArticleIndex } from "@/lib/article-index-server";

export const metadata: Metadata = {
  title: "Articles | MGM Laboratory",
  description: "Writing from MGM Laboratory on research, design, and engineering.",
};

// The CMS is the source of truth: a publish must reach the list at once.
export const revalidate = 0;

type ArticlesSearchParams = Promise<{
  category?: string | string[];
  q?: string | string[];
}>;

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: ArticlesSearchParams;
}) {
  const query = readArticleIndexQuery(await searchParams);
  const result = await readArticleIndex(query, { limit: ARTICLE_BATCH_SIZE }).catch(() => ({
    items: [],
    total: 0,
    offset: 0,
    nextOffset: null,
    categories: [],
    all: 0,
  }));

  return (
    <>
      {/* Without JavaScript the world never runs: show the DOM cards as they are. */}
      <noscript>
        <style>{`.article-card-cover,.article-card-meta,.article-card-meta>*{opacity:1!important}[data-entrance] :is([data-title-char],[data-entrance-piece]){visibility:visible!important}.articles-top{display:none}`}</style>
      </noscript>
      <ArticlesIndex
        initial={{
          items: result.items,
          total: result.total,
          nextOffset: result.nextOffset,
          categories: result.categories,
          all: result.all,
        }}
        initialQuery={query}
      />
    </>
  );
}
