"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  clearArticleArrival,
  isArticleCoverActive,
  markArticlePageReady,
  peekArticleArrival,
  waitForArticleReveal,
} from "@/lib/article-transition";
import { isRouteCoverActive, waitForRouteReveal } from "@/lib/route-reveal";

import { Sparkle } from "./article-hero";
import { releaseFlood } from "./next-flood";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * The article page's "not found": a quiet card in the library, with the way
 * back to the archive and home. It answers the articles transitions like
 * any article page (ready at once, entrance held under a cover) and ends a
 * next-article hand-off that brought the visitor here.
 */
export function ArticleMissing() {
  const pathname = usePathname();
  const [held] = useState(() => Boolean(peekArticleArrival(pathname)));
  const rootRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    markArticlePageReady(pathname);
    clearArticleArrival(pathname);
    releaseFlood(0.6);
    if (!root) return;
    let cancelled = false;
    if (held || isRouteCoverActive() || isArticleCoverActive()) {
      root.dataset.waiting = "";
      void Promise.all([waitForRouteReveal(), waitForArticleReveal()]).then(() => {
        if (!cancelled) delete root.dataset.waiting;
      });
    }
    return () => {
      cancelled = true;
    };
  }, [held, pathname]);

  return (
    <div className="ad-missing" data-article-missing="" ref={rootRef}>
      <div className="ad-missing-card">
        <p className="ad-missing-eyebrow">
          <Sparkle className="ad-meta-star" />
          Lost in the stacks
        </p>
        <h1 className="ad-missing-title">This page isn&rsquo;t on any shelf.</h1>
        <p className="ad-missing-text">
          The article you were looking for has moved, been retired, or was never written. The rest
          of the archive is right where it was.
        </p>
        <div className="ad-missing-actions">
          <Link className="ad-missing-primary" href="/articles">
            Back to the archive
          </Link>
          <Link className="ad-missing-secondary" href="/">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
