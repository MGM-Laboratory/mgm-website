"use client";

import Link from "next/link";
import { ArticleCover } from "@/components/articles/article-cover";

import { articleCoverUrl, type CmsArticleRecord } from "@/lib/article-cms";
import { useArticleRecords } from "@/hooks/use-article-records";
import { HOME_CHAPTERS } from "@/components/home-extras/chapters";
import { ShowcaseSection } from "./showcase-section";

const HOMEPAGE_LIMIT = 10;

export function ArticlesSection({ initialRecords = [] }: { initialRecords?: CmsArticleRecord[] }) {
  const { articles } = useArticleRecords(initialRecords);
  const shown = articles.slice(0, HOMEPAGE_LIMIT);

  return (
    <ShowcaseSection
      compact
      chapter={HOME_CHAPTERS.articles}
      id="articles"
      title="Notes from the lab"
      intro="Stories and notes on research, design, and engineering, written in plain words."
      seeMoreHref="/articles"
      seeMoreLabel="All articles"
      emptyMessage="No articles to show right now. New notes are on their way."
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
              <ArticleCover src={cover} className="aspect-[4/3] rounded-xl" />
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
