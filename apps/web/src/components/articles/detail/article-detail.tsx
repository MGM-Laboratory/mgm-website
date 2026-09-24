"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { clearArticleArrival, peekArticleArrival } from "@/lib/article-transition";
import { projectThemeCss } from "@/lib/project-themes";

import { ArticleHero } from "./article-hero";
import type { ArticleDetailData } from "./detail-data";
import { ArticleController } from "./detail-controller";
import { NextThreshold } from "./next-threshold-view";

type PrefetchKind = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>["kind"];
// Next's PrefetchKind.FULL (a string enum it doesn't export publicly): the
// article is a dynamic page, so only a full prefetch carries its payload.
const FULL_PREFETCH = "full" as unknown as PrefetchKind;

// Layout effects on purpose: the controller must set the arrival frame
// before the first paint, and its smooth scroller must stop in the commit
// that leaves the page (docs/animation-system.md gotcha #13).
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Without JavaScript every piece shows at once (the entrance and the reveals
// need the controller). With reduced motion the stylesheet never hides them.
//
// The articles routes have a loading state, so the server streams the page
// after it: React sends the finished page in a hidden container and a small
// script moves it into place. Without scripts nothing moves it, so the
// hidden containers are shown where they are (after the header and the
// empty loading slot, which reads the same). In Tailwind's first layer: its
// base layer hides [hidden] with !important, and only an important rule in
// an earlier layer outranks that.
const NO_SCRIPT_CSS = `@layer theme{body>div[hidden][id^="S:"]{display:block!important}}[data-article-detail] [data-enter],[data-article-detail] [data-ad-reveal],[data-article-detail] [data-ad-reveal] *,[data-article-detail] .ad-cover img{opacity:1!important;transform:none!important;clip-path:none!important;mask-image:none!important;-webkit-mask-image:none!important;animation:none!important}[data-article-detail] .ad-rail,[data-article-detail] .ad-readbar{display:none!important}`;

/**
 * The article page (/articles/[slug]) on the client: the hero, the cover
 * frame, the story (rendered on the server and passed in) and the
 * next-article threshold, all inside the movable content wrapper the
 * articles transitions slide and fade (`[data-article-content]`).
 *
 * Everything that moves lives in `ArticleController` (a plain class, created
 * in a layout effect), so the markup stays declarative and the page renders
 * fully on the server.
 *
 * Arrival: a transition that brings this page in leaves a note
 * (lib/article-transition.ts). It is read while rendering, so the first
 * frame already matches the transition's last one: after the next-article
 * hand-off the title is already in place.
 */
export function ArticleDetail({
  data,
  children,
}: {
  data: ArticleDetailData;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [arrival] = useState(() => peekArticleArrival(pathname));
  const rootRef = useRef<HTMLDivElement>(null);
  const routerRef = useRef(router);

  useIsomorphicLayoutEffect(() => {
    routerRef.current = router;
  });

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const controller = new ArticleController({
      root,
      data,
      pathname,
      arrival,
      navigate: (href) => routerRef.current.push(href),
      prefetch: (href) => routerRef.current.prefetch(href, { kind: FULL_PREFETCH }),
    });
    controller.start();
    clearArticleArrival(pathname);
    return () => controller.dispose();
    // One controller per page instance: the page is keyed by slug.
  }, []);

  const nextCss = useMemo(
    () => (data.next ? projectThemeCss(data.next.themeId, "[data-next-world]") : ""),
    [data.next],
  );

  return (
    <div
      className="ad-root"
      data-article-detail=""
      data-article-slug={data.slug}
      data-article-theme={data.themeId}
      data-arrival={arrival?.kind}
      ref={rootRef}
    >
      {nextCss ? <style>{nextCss}</style> : null}
      <div className="ad-content" data-article-content="">
        <ArticleHero data={data} titleShown={arrival?.kind === "next"} />
        <figure className="ad-cover" data-ad-cover="">
          <div className="ad-cover-frame" data-ad-cover-frame="">
            {data.coverUrl ? (
              // The cover is either bundled seed art or a signed CMS asset,
              // both outside the image loader; the world reads the same
              // same-origin bytes for its WebGL copy.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="ad-cover-img"
                data-ad-cover-img=""
                decoding="async"
                fetchPriority="high"
                src={data.coverUrl}
              />
            ) : (
              <span aria-hidden="true" className="ad-cover-empty" />
            )}
          </div>
        </figure>
        {children}
        {data.next ? <NextThreshold next={data.next} /> : <div className="ad-end" />}
      </div>
      <div aria-hidden="true" className="ad-readbar">
        <span data-ad-read-bar="" />
      </div>
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
    </div>
  );
}
