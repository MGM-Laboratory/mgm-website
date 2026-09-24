"use client";

import Link from "next/link";
import { ArrowDownRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { onWorldState } from "@/components/articles/world/world-registry";
import type { ArticleCardData } from "@/lib/article-index";

/**
 * One article in the list: a real link with the cover (5:2), the title and
 * a short description on one line each, and a southeast arrow.
 *
 * With the library world running, the world draws this card (its picture
 * and its text strip bend with the river) and the DOM copy turns
 * transparent, keeping the link, focus ring, accessible name and hit area
 * where the card rests (globals.css, "articles world"). Without it, this is
 * the card: CSS plays the hover (the cover zooms, the title rolls, the arrow
 * slips out and back in, the strip lights up).
 */
export function ArticleCard({ article, index }: { article: ArticleCardData; index: number }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const link = linkRef.current;
    const cover = coverRef.current;
    const meta = metaRef.current;
    const titleElement = titleRef.current;
    const subtitleElement = subtitleRef.current;
    const arrowElement = arrowRef.current;
    if (!link || !cover || !meta || !titleElement || !subtitleElement || !arrowElement) return;

    let unregister: (() => void) | null = null;
    let hoverOff: (() => void) | null = null;
    const offWorld = onWorldState((_mode, world) => {
      unregister?.();
      hoverOff?.();
      unregister = hoverOff = null;
      if (!world) return;
      unregister = world.cards.register({
        slug: article.slug,
        element: link,
        cover,
        meta,
        titleElement,
        subtitleElement,
        arrowElement,
        coverUrl: article.coverUrl,
        title: article.title,
        subtitle: article.subtitle,
        index,
      });
      const enter = () => world.cards.setHovered(article.slug, "pointer");
      const leave = () => world.cards.setHovered(null, "pointer");
      const focus = () => {
        if (link.matches(":focus-visible")) world.cards.setHovered(article.slug, "focus");
      };
      link.addEventListener("pointerenter", enter);
      link.addEventListener("pointerleave", leave);
      link.addEventListener("focus", focus);
      link.addEventListener("blur", leave);
      hoverOff = () => {
        link.removeEventListener("pointerenter", enter);
        link.removeEventListener("pointerleave", leave);
        link.removeEventListener("focus", focus);
        link.removeEventListener("blur", leave);
      };
    });
    return () => {
      offWorld();
      unregister?.();
      hoverOff?.();
    };
  }, [article, index]);

  return (
    <Link
      aria-label={article.subtitle ? `${article.title}. ${article.subtitle}` : article.title}
      className="article-card group"
      data-article-card=""
      data-article-slug={article.slug}
      data-article-theme={article.themeId}
      href={`/articles/${article.slug}`}
      ref={linkRef}
    >
      <div className="article-card-cover" data-card-cover="" ref={coverRef}>
        {article.coverUrl ? (
          // The world decodes the same URL for its texture (same origin,
          // immutable), so this stays a plain image, never /_next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="article-card-image"
            decoding="async"
            fetchPriority={index < 2 ? "high" : "low"}
            loading={index < 4 ? "eager" : "lazy"}
            src={article.coverUrl}
          />
        ) : null}
      </div>
      <div className="article-card-meta" data-card-meta="" ref={metaRef}>
        <div className="article-card-lines">
          <h2 className="article-card-title" data-card-title="" ref={titleRef}>
            <span className="article-card-roll" aria-hidden="true">
              <span>{article.title}</span>
              <span>{article.title}</span>
            </span>
            <span className="sr-only">{article.title}</span>
          </h2>
          <p className="article-card-subtitle" data-card-subtitle="" ref={subtitleRef}>
            {article.subtitle}
          </p>
        </div>
        <span aria-hidden="true" className="article-card-arrow" data-card-arrow="" ref={arrowRef}>
          <ArrowDownRight className="article-card-arrow-out" strokeWidth={2.25} />
          <ArrowDownRight className="article-card-arrow-in" strokeWidth={2.25} />
        </span>
      </div>
    </Link>
  );
}
