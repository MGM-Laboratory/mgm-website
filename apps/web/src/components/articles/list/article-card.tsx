"use client";

import Link from "next/link";
import { ArrowDownRight } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";

import { getWorldMode, onWorldState } from "@/components/articles/world/world-registry";
import type { ArticleCardData } from "@/lib/article-index";

const subscribeWorldMode = (onChange: () => void) => onWorldState(() => onChange());
const serverWorldMode = () => "pending" as const;

/**
 * One article in the list: a real link with the cover (5:2), the title and
 * a short description on one line each, and a southeast arrow.
 *
 * With the library world running, the world draws this card (its picture
 * and its text strip bend with the river, cards-layer.ts) and the DOM copy
 * turns transparent, keeping the link, focus ring, accessible name and hit
 * area where the card rests. Without it, this is the card: CSS plays the
 * hover (the cover zooms, the light sweeps, the title rolls, the arrow
 * slips out and back in, the rule draws itself in the accent colour).
 *
 * The slot around the link is what `content-visibility: auto` applies to,
 * padded so the DOM hover and the focus ring are never clipped by its paint
 * containment; the world measures the slot while the card is far away.
 *
 * While the world draws the cards the DOM picture is not rendered at all:
 * the world decodes its own covers, only for cards near the screen, and a
 * lazy <img> would otherwise start a download for every card a fast scroll
 * passes (the whole archive's covers, queued ahead of everything else).
 * The server markup keeps it, for no-JS and the DOM list.
 */
export function ArticleCard({ article, index }: { article: ArticleCardData; index: number }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const { slug, coverUrl, title, subtitle } = article;
  const worldMode = useSyncExternalStore(subscribeWorldMode, getWorldMode, serverWorldMode);

  useEffect(() => {
    const slot = slotRef.current;
    const link = linkRef.current;
    const cover = coverRef.current;
    const meta = metaRef.current;
    const titleElement = titleRef.current;
    const subtitleElement = subtitleRef.current;
    const arrowElement = arrowRef.current;
    if (!slot || !link || !cover || !meta || !titleElement || !subtitleElement || !arrowElement)
      return;

    let unregister: (() => void) | null = null;
    let listenersOff: (() => void) | null = null;
    const offWorld = onWorldState((_mode, world) => {
      unregister?.();
      listenersOff?.();
      unregister = listenersOff = null;
      if (!world) return;
      unregister = world.cards.register({
        slug,
        element: link,
        slot,
        cover,
        meta,
        titleElement,
        subtitleElement,
        arrowElement,
        coverUrl,
        title,
        subtitle,
        index,
      });
      // Touch has no hover: a tap plays the press (cards-layer.ts), never a sticky hover.
      const enter = (event: PointerEvent) => {
        if (event.pointerType !== "touch") world.cards.setHovered(slug, "pointer");
      };
      const leave = () => world.cards.setHovered(null, "pointer");
      const focus = () => {
        if (link.matches(":focus-visible")) world.cards.setHovered(slug, "focus");
      };
      const blur = () => world.cards.setHovered(null, "focus");
      link.addEventListener("pointerenter", enter);
      link.addEventListener("pointerleave", leave);
      link.addEventListener("focus", focus);
      link.addEventListener("blur", blur);
      listenersOff = () => {
        link.removeEventListener("pointerenter", enter);
        link.removeEventListener("pointerleave", leave);
        link.removeEventListener("focus", focus);
        link.removeEventListener("blur", blur);
      };
    });
    return () => {
      offWorld();
      unregister?.();
      listenersOff?.();
    };
  }, [slug, coverUrl, title, subtitle, index]);

  return (
    <div
      className="article-slot"
      data-article-slot=""
      ref={slotRef}
      style={{ "--card-i": index } as CSSProperties}
    >
      <Link
        aria-label={subtitle ? `${title}. ${subtitle}` : title}
        className="article-card"
        data-article-card=""
        data-article-slug={slug}
        data-article-theme={article.themeId}
        href={`/articles/${slug}`}
        ref={linkRef}
      >
        <div className="article-card-cover" data-card-cover="" ref={coverRef}>
          {coverUrl && worldMode !== "gl" ? (
            // The world decodes the same URL for its texture (same origin,
            // immutable), so this stays a plain image, never /_next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="article-card-image"
              decoding="async"
              fetchPriority={index < 2 ? "high" : "low"}
              loading={index < 4 ? "eager" : "lazy"}
              src={coverUrl}
            />
          ) : null}
          <span aria-hidden="true" className="article-card-sweep" />
        </div>
        <div className="article-card-meta" data-card-meta="" ref={metaRef}>
          <div className="article-card-lines">
            <h2 className="article-card-title" data-card-title="" ref={titleRef}>
              <span aria-hidden="true" className="article-card-roll">
                <span>{title}</span>
                <span>{title}</span>
              </span>
              <span className="sr-only">{title}</span>
            </h2>
            <p className="article-card-subtitle" data-card-subtitle="" ref={subtitleRef}>
              {subtitle}
            </p>
          </div>
          <span aria-hidden="true" className="article-card-arrow" data-card-arrow="" ref={arrowRef}>
            <ArrowDownRight className="article-card-arrow-out" strokeWidth={2.25} />
            <ArrowDownRight className="article-card-arrow-in" strokeWidth={2.25} />
          </span>
          <span aria-hidden="true" className="article-card-rule" />
        </div>
      </Link>
    </div>
  );
}

/**
 * A card-shaped placeholder for a batch in flight: shimmering paper in the
 * world (registered as a placeholder sheet), a shimmering skeleton in the
 * DOM list. Hidden from assistive technology; the live region announces
 * the loading instead.
 */
export function ArticleCardPlaceholder({ index }: { index: number }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const subtitleRef = useRef<HTMLSpanElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const slot = slotRef.current;
    const cover = coverRef.current;
    const meta = metaRef.current;
    const titleElement = titleRef.current;
    const subtitleElement = subtitleRef.current;
    const arrowElement = arrowRef.current;
    if (!slot || !cover || !meta || !titleElement || !subtitleElement || !arrowElement) return;
    let unregister: (() => void) | null = null;
    const offWorld = onWorldState((_mode, world) => {
      unregister?.();
      unregister = null;
      if (!world) return;
      unregister = world.cards.register({
        // '#' never appears in an article slug.
        slug: `#placeholder-${index}`,
        element: slot,
        slot,
        cover,
        meta,
        titleElement,
        subtitleElement,
        arrowElement,
        title: "",
        subtitle: "",
        index,
        placeholder: true,
      });
    });
    return () => {
      offWorld();
      unregister?.();
    };
  }, [index]);

  return (
    <div
      aria-hidden="true"
      className="article-slot is-placeholder"
      data-article-placeholder=""
      ref={slotRef}
      style={{ "--card-i": index } as CSSProperties}
    >
      <div className="article-card">
        <div className="article-card-cover" ref={coverRef} />
        <div className="article-card-meta" ref={metaRef}>
          <div className="article-card-lines">
            <span className="article-card-title" ref={titleRef}>
              <span className="article-card-bone is-title" />
            </span>
            <span className="article-card-subtitle" ref={subtitleRef}>
              <span className="article-card-bone is-subtitle" />
            </span>
          </div>
          <span className="article-card-arrow" ref={arrowRef} />
        </div>
      </div>
    </div>
  );
}
