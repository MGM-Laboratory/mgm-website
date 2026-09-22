import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/articles/article-body";
import { ArticleCover } from "@/components/articles/article-cover";
import { CtaFooter } from "@/components/sections/cta-footer";
import {
  articleCoverUrl,
  articleAuthors,
  formatArticleDate,
  publishedArticles,
  type CmsArticleRecord,
} from "@/lib/article-cms";
import { ensureArticleFeed, fetchArticleRecord } from "@/lib/article-cms-seed";
import { mergeMemberRecords } from "@/lib/member-cms";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";
import { MEMBERS } from "@/data/members";

type ArticlePageProps = { params: Promise<{ slug: string }> };

// Articles resolve entirely at request time: the CMS is the source of truth
// and admin publishes must reach the public page immediately.
export const revalidate = 0;

async function readRecord(slug: string) {
  try {
    return await fetchArticleRecord(slug);
  } catch {
    return undefined;
  }
}

async function readFeed() {
  try {
    return publishedArticles(await ensureArticleFeed());
  } catch {
    return [] as CmsArticleRecord[];
  }
}

async function readMembers() {
  try {
    return mergeMemberRecords(MEMBERS, await ensureMemberCmsSeeded());
  } catch {
    return [...MEMBERS];
  }
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const record = await readRecord(slug);
  if (!record) return { title: "Article not found | MGM Laboratory" };
  return {
    title: `${record.article.title} | MGM Laboratory`,
    description: record.article.subtitle || undefined,
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  // The document itself comes from the single-record endpoint while the
  // related-articles strip below reuses the light feed. Authors resolve
  // against the merged member directory, so members added through the CMS
  // (like new bylines) light up without redeploys.
  const [record, feed, members] = await Promise.all([readRecord(slug), readFeed(), readMembers()]);
  if (!record) notFound();

  const { article } = record;
  const authors = articleAuthors(record, members);
  const coverUrl = articleCoverUrl(article.coverKey);
  const others = feed.filter((item) => item.slug !== slug).slice(0, 3);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <article className="mx-auto max-w-[1200px] pt-[91px] pb-16">
          <header className="px-6 text-center sm:px-10 lg:px-0">
            <p className="text-base text-[#b2b2b5]">{formatArticleDate(article.date)}</p>
            <h1 className="mt-[19px] font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-[#313131] dark:text-[#f0f0ee]">
              {article.title}
            </h1>
            {article.subtitle ? (
              <p className="mx-auto mt-[22px] max-w-[900px] font-display text-[clamp(1.5rem,3vw,2.5rem)] leading-[1.15] font-normal text-[#313131] dark:text-[#f0f0ee]">
                {article.subtitle}
              </p>
            ) : null}
            {article.categories.length ? (
              <div className="mt-[25px] flex flex-wrap items-center justify-center gap-[9px]">
                {article.categories.map((category) => (
                  <span
                    className="text-[11px] font-medium tracking-[0.12em] text-[#464646] uppercase dark:text-[#b9bcc6]"
                    key={category}
                  >
                    {category}
                  </span>
                ))}
              </div>
            ) : null}
          </header>

          {coverUrl ? (
            <div className="mx-6 mt-[58px] overflow-hidden rounded-[24px] sm:mx-10 lg:mx-0">
              {/* CMS media stays a plain image: the cover is either bundled
                  seed art or a signed CMS asset, both outside the image loader. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="block w-full aspect-[1200/482] object-cover" src={coverUrl} />
            </div>
          ) : null}

          <div className="mt-[58px] grid grid-cols-[128px_minmax(0,1fr)] gap-x-[111px] px-6 sm:px-10 lg:px-[55px] max-lg:grid-cols-1 max-lg:gap-x-0 max-lg:gap-y-8">
            {authors.length ? (
              <aside className="min-w-0">
                <p className="text-[11px] font-medium tracking-[0.12em] text-[#a7a7a7] uppercase">
                  {authors.length === 1 ? "Author" : "Authors"}
                </p>
                <div className="mt-[11px]">
                  {authors.map((member) => (
                    <Link
                      className="block text-[1.1875rem] leading-[23px] text-[#3f3f3f] underline decoration-transparent underline-offset-4 transition hover:text-brand-blue hover:decoration-brand-blue/50 dark:text-[#d6d6d1]"
                      href={`/member/${member.slug}`}
                      key={member.slug}
                    >
                      {member.name}
                    </Link>
                  ))}
                </div>
              </aside>
            ) : (
              <div aria-hidden="true" />
            )}
            <ArticleBody blocks={record.content} />
          </div>
        </article>

        {others.length ? (
          <section className="mx-auto w-full max-w-[1200px] px-6 pb-40 sm:px-10 lg:px-[55px]">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white">
                Other articles
              </h2>
              <Link
                className="text-base text-[#464646] transition hover:text-brand-blue dark:text-[#b9bcc6]"
                href="/articles"
              >
                View More
              </Link>
            </div>
            <div className="mt-[35px] grid grid-cols-1 gap-[25px] sm:grid-cols-3">
              {others.map((other) => (
                <Link
                  className="group block min-w-0"
                  href={`/articles/${other.slug}`}
                  key={other.slug}
                >
                  <ArticleCover
                    className="rounded-xl"
                    src={articleCoverUrl(other.article.coverKey)}
                  />
                  <h3 className="mt-[25px] font-display text-[1.5rem] leading-snug font-medium text-[#919191] transition group-hover:text-[#0e1116] dark:text-[#8b8f9a] dark:group-hover:text-white">
                    {other.article.title}
                  </h3>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <CtaFooter />
    </div>
  );
}
