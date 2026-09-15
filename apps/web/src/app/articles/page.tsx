import type { Metadata } from "next";
import Link from "next/link";

import { ArticleSearchBox } from "@/components/articles/article-search-box";
import {
  ARTICLE_PAGE_SIZES,
  ArticlePagination,
  DEFAULT_ARTICLE_PAGE_SIZE,
} from "@/components/articles/article-pagination";
import { CtaFooter } from "@/components/sections/cta-footer";
import {
  articleAuthors,
  articleCoverUrl,
  formatArticleDate,
  publishedArticles,
  type CmsArticleRecord,
} from "@/lib/article-cms";
import { ensureArticleCmsSeeded, ensureArticleFeed } from "@/lib/article-cms-seed";
import { highlightSnippet, searchArticles } from "@/lib/article-search";
import { mergeMemberRecords } from "@/lib/member-cms";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";
import { MEMBERS } from "@/data/members";

export const metadata: Metadata = {
  title: "Articles | MGM Laboratory",
  description: "Writing from MGM Laboratory on research, design, and engineering.",
};

export const revalidate = 0;

async function readRecords() {
  try {
    return publishedArticles(await ensureArticleFeed());
  } catch {
    return [] as CmsArticleRecord[];
  }
}

async function readFullRecords() {
  try {
    return publishedArticles(await ensureArticleCmsSeeded());
  } catch {
    return [] as CmsArticleRecord[];
  }
}

type ArticlesSearchParams = Promise<{
  page?: string | string[];
  per?: string | string[];
  q?: string | string[];
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Keeps `?per=` on the published options and `?page=` inside the real range. */
function readWindow(
  total: number,
  searchParams: { page?: string | string[]; per?: string | string[] },
) {
  const requestedPer = Number(firstValue(searchParams.per));
  const perPage = (ARTICLE_PAGE_SIZES as readonly number[]).includes(requestedPer)
    ? requestedPer
    : DEFAULT_ARTICLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const requestedPage = Number(firstValue(searchParams.page));
  const page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;

  return { page, perPage, totalPages };
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: ArticlesSearchParams;
}) {
  const resolvedParams = await searchParams;
  const query = firstValue(resolvedParams.q)?.trim() ?? "";

  const [articles, members, fullRecords] = await Promise.all([
    readRecords(),
    ensureMemberCmsSeeded()
      .then((records) => mergeMemberRecords(MEMBERS, records))
      .catch(() => [...MEMBERS]),
    query ? readFullRecords() : Promise.resolve([] as CmsArticleRecord[]),
  ]);

  const { page, perPage } = readWindow(articles.length, resolvedParams);
  const visibleArticles = articles.slice((page - 1) * perPage, page * perPage);
  const searching = Boolean(query);
  const results = searching ? searchArticles(fullRecords, query) : [];

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1200px] px-[55px] pt-24 pb-20">
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-blue uppercase">
            Editorial
          </p>
          <h1 className="mt-3 font-display text-[clamp(2rem,4.5vw+1rem,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-[#0e1116] dark:text-white">
            Articles
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-7 text-[var(--ink-2)] dark:text-[#c3c7d1]">
            Notes and write-ups from the lab: research findings, design decisions, and engineering
            lessons worth sharing.
          </p>
          <div className="mt-8">
            <ArticleSearchBox initialQuery={query} />
          </div>
        </section>

        <section
          className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-[55px] pb-40"
          id="articles"
        >
          {searching ? (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--line)] pb-5">
                <p className="text-sm text-[var(--ink-2)] dark:text-[#c3c7d1]">
                  {results.length} result{results.length === 1 ? "" : "s"} for{" "}
                  <span className="font-semibold text-[var(--ink)] dark:text-white">“{query}”</span>
                </p>
                <Link
                  className="text-sm font-medium text-[var(--ink-3)] transition hover:text-brand-blue"
                  href="/articles"
                >
                  Clear search
                </Link>
              </div>

              {results.length ? (
                <div className="mt-10 grid grid-cols-1 gap-x-[25px] gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                  {results.map((result) => {
                    const record = fullRecords.find((item) => item.slug === result.slug);
                    const coverUrl = articleCoverUrl(result.coverKey);
                    const authors = record ? articleAuthors(record, members) : [];
                    return (
                      <Link
                        className="group block min-w-0"
                        href={`/articles/${result.slug}`}
                        key={result.slug}
                      >
                        {coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt=""
                            className="block w-full aspect-[370/230] object-cover transition group-hover:opacity-90"
                            src={coverUrl}
                          />
                        ) : (
                          <div className="grid aspect-[370/230] w-full place-items-center bg-[var(--surface-muted)]">
                            <span className="font-display text-3xl font-semibold text-[var(--ink-3)]">
                              MGM
                            </span>
                          </div>
                        )}
                        {result.categories.length ? (
                          <div className="mt-6 flex flex-wrap gap-x-[9px] gap-y-1">
                            {result.categories.map((category) => (
                              <span
                                className="text-[11px] font-medium tracking-[0.12em] text-[#464646] uppercase dark:text-[#b9bcc6]"
                                key={category}
                              >
                                {category}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <h2 className="mt-3 font-display text-[1.5rem] leading-snug font-medium text-[#0e1116] transition group-hover:text-brand-blue dark:text-white">
                          {result.title}
                        </h2>
                        <p className="mt-2 text-sm text-[#919191] dark:text-[#8b8f9a]">
                          {authors.map((member) => member.name).join(", ")}
                          {authors.length ? " · " : ""}
                          {formatArticleDate(result.date)}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-[var(--ink-2)] dark:text-[#c3c7d1]">
                          {highlightSnippet(result.snippet, query).map((segment, index) =>
                            segment.hit ? (
                              <mark
                                className="bg-brand-yellow-50 text-[var(--ink)] dark:bg-brand-yellow/25 dark:text-white"
                                key={index}
                              >
                                {segment.text}
                              </mark>
                            ) : (
                              segment.text
                            ),
                          )}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-[var(--line)] px-8 py-16 text-center">
                  <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
                    No articles match “{query}”
                  </p>
                  <p className="mt-2 text-[var(--ink-3)]">
                    Try a different keyword, or browse the full archive.
                  </p>
                </div>
              )}
            </div>
          ) : articles.length ? (
            <div className="grid grid-cols-1 gap-x-[25px] gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {visibleArticles.map((record) => {
                const coverUrl = articleCoverUrl(record.article.coverKey);
                const authors = articleAuthors(record, members);
                return (
                  <Link
                    className="group block min-w-0"
                    href={`/articles/${record.slug}`}
                    key={record.slug}
                  >
                    {coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="block w-full aspect-[370/230] object-cover transition group-hover:opacity-90"
                        src={coverUrl}
                      />
                    ) : (
                      <div className="grid aspect-[370/230] w-full place-items-center bg-[var(--surface-muted)]">
                        <span className="font-display text-3xl font-semibold text-[var(--ink-3)]">
                          MGM
                        </span>
                      </div>
                    )}
                    {record.article.categories.length ? (
                      <div className="mt-6 flex flex-wrap gap-x-[9px] gap-y-1">
                        {record.article.categories.map((category) => (
                          <span
                            className="text-[11px] font-medium tracking-[0.12em] text-[#464646] uppercase dark:text-[#b9bcc6]"
                            key={category}
                          >
                            {category}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <h2 className="mt-3 font-display text-[1.5rem] leading-snug font-medium text-[#0e1116] transition group-hover:text-brand-blue dark:text-white">
                      {record.article.title}
                    </h2>
                    <p className="mt-2 text-sm text-[#919191] dark:text-[#8b8f9a]">
                      {authors.map((member) => member.name).join(", ")}
                      {authors.length ? " · " : ""}
                      {formatArticleDate(record.article.date)}
                    </p>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--line)] px-8 py-16 text-center">
              <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
                No articles yet
              </p>
              <p className="mt-2 text-[var(--ink-3)]">
                The first write-ups from the lab are on their way.
              </p>
            </div>
          )}

          {!searching && articles.length ? (
            <ArticlePagination page={page} perPage={perPage} total={articles.length} />
          ) : null}
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
