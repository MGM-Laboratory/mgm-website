"use client";

import { ImageIcon } from "lucide-react";
import Link from "next/link";

import { articleCoverUrl, type CmsArticleRecord } from "@/lib/article-cms";
import { useArticleRecords } from "@/hooks/use-article-records";
import { ShowcaseSection } from "./showcase-section";

const HOMEPAGE_LIMIT = 10;

export function ArticlesSection({ initialRecords = [] }: { initialRecords?: CmsArticleRecord[] }) {
  const { articles } = useArticleRecords(initialRecords);
  const shown = articles.slice(0, HOMEPAGE_LIMIT);

  return (
    <ShowcaseSection
      id="articles"
      title="Articles"
      intro="Notes on research, design, and engineering from the lab."
      seeMoreHref="/articles"
      emptyMessage="No articles yet — the lab's first notes are on their way."
      count={shown.length}
    >
      {shown.map((record) => {
        const cover = articleCoverUrl(record.article.coverKey);
        return (
          <article key={record.slug} className="reveal-card w-[320px] shrink-0 opacity-0">
            <Link
              className="group block"
              href={`/articles/${record.slug}`}
              title={record.article.title}
            >
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="block aspect-[4/3] w-full rounded-xl object-cover transition group-hover:opacity-90"
                  src={cover}
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-[var(--surface-muted)]">
                  <ImageIcon className="size-10 text-foreground/25" strokeWidth={1.5} />
                </div>
              )}
              {record.article.categories[0] ? (
                <p className="mt-3 text-xs font-medium tracking-wide text-foreground/45 uppercase">
                  {record.article.categories[0]}
                </p>
              ) : null}
              <h3 className="mt-1 font-display font-medium text-foreground transition group-hover:text-brand-blue">
                {record.article.title}
              </h3>
            </Link>
          </article>
        );
      })}
    </ShowcaseSection>
  );
}
