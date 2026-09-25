"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";

import { FilterSheet } from "@/components/articles/list/filter-sheet";
import type { ArticleCategory } from "@/lib/article-index";

const TITLE = "Articles";

/**
 * The list's fixed head, over the library: the "Articles" title, the search
 * field and beside it a "Filter" button that opens the categories in a
 * sheet (filter-sheet.tsx), the way unseen.co's title and filter float
 * over its river of cards (the cards fold away just under it). On phones
 * and short landscape screens the head is compact: a smaller title.
 *
 * Filters are URL state (`?category=`, `?q=`, see articles-index.tsx), so a
 * filtered list survives going into an article and back, a reload and a
 * shared link. The head's bottom is published as `--articles-head`: the
 * grid starts under it and the world folds the cards just below it.
 *
 * The title's letters and the search row are the entrance's pieces
 * (list-entrance.ts): hidden (visibility only) while the page waits for
 * its entrance, never the head itself, which the transitions move.
 */
export function ArticlesHero({
  activeCategory,
  all,
  categories,
  onCategory,
  onQuery,
  onSubmit,
  query,
  searching,
}: {
  activeCategory?: string;
  all: number;
  categories: ArticleCategory[];
  onCategory: (slug: string | null) => void;
  onQuery: (q: string) => void;
  onSubmit: () => void;
  query: string;
  searching: boolean;
}) {
  const headRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty("--articles-head");
    };
  }, []);

  // "/" jumps to the search from anywhere on the list.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="articles-head" data-articles-head="" ref={headRef}>
      <h1
        className="articles-title"
        data-entrance-piece="title"
        onAnimationEnd={(event) => {
          // The last letter's bob ends the wave; the next hover starts a new one.
          const last = event.currentTarget.querySelector(".articles-title-char:last-child");
          if (last?.contains(event.target as Node)) delete event.currentTarget.dataset.bob;
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return;
          event.currentTarget.dataset.bob = "";
        }}
        tabIndex={-1}
      >
        <span className="sr-only">{TITLE}</span>
        <span aria-hidden="true" className="articles-title-line">
          {[...TITLE].map((char, index) => (
            <span
              className="articles-title-char"
              data-title-char=""
              key={index}
              style={{ "--char-i": index } as CSSProperties}
            >
              <span className="articles-title-glyph">{char}</span>
            </span>
          ))}
        </span>
      </h1>

      <div className="articles-controls" data-entrance-piece="search">
        <div className="articles-search" data-searching={searching ? "" : undefined}>
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
              } else if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
                inputRef.current?.blur();
              }
            }}
            placeholder="Search articles"
            ref={inputRef}
            spellCheck={false}
            type="search"
            value={query}
          />
          <kbd aria-hidden="true" className="articles-search-key">
            /
          </kbd>
          {query ? (
            <button
              aria-label="Clear search"
              className="articles-search-clear"
              onClick={() => {
                onQuery("");
                inputRef.current?.focus();
              }}
              type="button"
            >
              <X aria-hidden className="size-4" strokeWidth={2.25} />
            </button>
          ) : null}
          <span aria-hidden="true" className="articles-search-glint" />
        </div>
        <FilterSheet
          active={activeCategory}
          all={all}
          categories={categories}
          onPick={onCategory}
        />
      </div>
    </div>
  );
}
