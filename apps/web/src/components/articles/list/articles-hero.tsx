"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ArticleCategory } from "@/lib/article-index";
import { cn } from "@/lib/utils";

/**
 * The list's fixed head, over the library: the "Articles" title, the search
 * field and the category pills, the way unseen.co's title and filter bar
 * float over its river of cards (the cards fold away behind them).
 *
 * Filters are URL state (`?category=`, `?q=`, see articles-index.tsx), so a
 * filtered list survives going into an article and back, a reload and a
 * shared link. Its height is published as `--articles-head` so the grid
 * starts just below it.
 */
export function ArticlesHero({
  activeCategory,
  all,
  categories,
  onCategory,
  onQuery,
  query,
  total,
}: {
  activeCategory?: string;
  all: number;
  categories: ArticleCategory[];
  onCategory: (slug: string | null) => void;
  onQuery: (q: string) => void;
  query: string;
  total: number;
}) {
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        "--articles-head",
        `${Math.ceil(head.getBoundingClientRect().bottom)}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(head);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--articles-head");
    };
  }, []);

  return (
    <div className="articles-head" data-articles-head="" ref={headRef}>
      <h1 className="articles-title">Articles</h1>
      <div className="articles-search">
        <Search aria-hidden className="articles-search-icon" strokeWidth={2.25} />
        <input
          aria-label="Search articles"
          autoComplete="off"
          className="articles-search-input"
          enterKeyHint="search"
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              onQuery("");
            }
          }}
          placeholder="Search the archive"
          spellCheck={false}
          type="search"
          value={query}
        />
        {query ? (
          <button
            aria-label="Clear search"
            className="articles-search-clear"
            onClick={() => onQuery("")}
            type="button"
          >
            <X aria-hidden className="size-4" strokeWidth={2.25} />
          </button>
        ) : null}
      </div>
      <div aria-label="Categories" className="articles-pills" role="group">
        <button
          aria-pressed={!activeCategory}
          className={cn("articles-pill", !activeCategory && "is-active")}
          onClick={() => onCategory(null)}
          type="button"
        >
          All <span className="articles-pill-count">{all}</span>
        </button>
        {categories.map((category) => (
          <button
            aria-pressed={activeCategory === category.slug}
            className={cn("articles-pill", activeCategory === category.slug && "is-active")}
            key={category.slug}
            onClick={() => onCategory(activeCategory === category.slug ? null : category.slug)}
            type="button"
          >
            {category.name} <span className="articles-pill-count">{category.count}</span>
          </button>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {total} {total === 1 ? "article" : "articles"}
      </p>
    </div>
  );
}
