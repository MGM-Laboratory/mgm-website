import type { Metadata } from "next";
import Link from "next/link";

import { CtaFooter } from "@/components/sections/cta-footer";
import {
  articleAuthors,
  articleCoverUrl,
  formatArticleDate,
  publishedArticles,
  type CmsArticleRecord,
} from "@/lib/article-cms";
import { ensureArticleFeed } from "@/lib/article-cms-seed";
import { mergeMemberRecords } from "@/lib/member-cms";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";
import { MEMBERS } from "@/data/members";

export const metadata: Metadata = {
  title: "Articles — MGM Laboratory",
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

export default async function ArticlesPage() {
  const [articles, members] = await Promise.all([
    readRecords(),
    ensureMemberCmsSeeded()
      .then((records) => mergeMemberRecords(MEMBERS, records))
      .catch(() => [...MEMBERS]),
  ]);

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
            Notes and write-ups from the lab — research findings, design decisions, and engineering
            lessons worth sharing.
          </p>
        </section>

        <section className="mx-auto w-full max-w-[1200px] px-[55px] pb-40">
          {articles.length ? (
            <div className="grid grid-cols-1 gap-x-[25px] gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((record) => {
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
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
