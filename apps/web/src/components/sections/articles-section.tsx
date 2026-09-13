"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { articleCoverUrl, type CmsArticleRecord } from "@/lib/article-cms";
import { useArticleRecords } from "@/hooks/use-article-records";

const FALLBACK_ARTICLES = [
  { title: "Designing for touch-first research tools", tag: "UX Research" },
  { title: "Shipping a mobile prototype in a week", tag: "Mobile" },
  { title: "What makes an interface feel alive", tag: "Web" },
  { title: "Notes from our latest usability study", tag: "UX Research" },
  { title: "Building an interactive media pipeline", tag: "Interactive Media" },
  { title: "A faster path from idea to prototype", tag: "Web" },
];

export function ArticlesSection({ initialRecords = [] }: { initialRecords?: CmsArticleRecord[] }) {
  const { articles } = useArticleRecords(initialRecords);
  const rootRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("All");

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.08 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  const filters = useMemo(() => {
    const categories = new Set(articles.flatMap((article) => article.article.categories));
    return ["All", ...Array.from(categories)];
  }, [articles]);

  const shown = articles.slice(0, 6);
  const visible =
    filter === "All" ? shown : shown.filter((a) => a.article.categories.includes(filter));

  return (
    <section ref={rootRef} className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
            Articles
          </h2>
          <div className="reveal-card flex items-center gap-6 opacity-0">
            <p className="max-w-md text-foreground/60">
              Notes on research, design, and engineering from the lab.
            </p>
            <Link
              className="shrink-0 text-sm font-medium text-foreground/60 transition-colors hover:text-brand-blue"
              href="/articles"
            >
              View all →
            </Link>
          </div>
        </div>

        {articles.length ? (
          <div className="reveal-card mt-8 flex flex-wrap gap-2 opacity-0">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-colors",
                  f === filter
                    ? "border-brand-blue text-brand-blue"
                    : "border-[var(--line)] text-foreground/60 hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        ) : null}

        {/* Not part of the scroll-in reveal — the grid changes contents
            when the filter above changes, so it stays plainly visible
            rather than being tied to a one-time scroll animation. */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {(articles.length ? visible : FALLBACK_ARTICLES).map((item) => {
            const record = item as CmsArticleRecord;
            const isRecord = "article" in item && "slug" in item;
            return (
              <article key={isRecord ? record.slug : (item as { title: string }).title}>
                {isRecord ? (
                  <Link
                    className="group block"
                    href={`/articles/${record.slug}`}
                    title={record.article.title}
                  >
                    {articleCoverUrl(record.article.coverKey) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="block aspect-[4/3] w-full rounded-xl object-cover transition group-hover:opacity-90"
                        src={articleCoverUrl(record.article.coverKey)}
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
                ) : (
                  <>
                    <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-[var(--surface-muted)]">
                      <ImageIcon className="size-10 text-foreground/25" strokeWidth={1.5} />
                    </div>
                    <p className="mt-3 text-xs font-medium tracking-wide text-foreground/45 uppercase">
                      {(item as { tag: string }).tag}
                    </p>
                    <h3 className="mt-1 font-display font-medium text-foreground">
                      {(item as { title: string }).title}
                    </h3>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
