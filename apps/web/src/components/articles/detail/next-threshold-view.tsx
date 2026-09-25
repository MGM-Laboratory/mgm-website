import Link from "next/link";

import type { DetailNext } from "./detail-data";
import { Sparkle, TitleGlyphs } from "./article-hero";

/**
 * The end of the article: a screen-tall threshold to the next one. "Next
 * article", its title (set exactly like the hero title, in the same box, so
 * the hand-off can carry it into the next page's hero slot), "(Keep
 * scrolling)" and a progress bar. Scrolling on past the end pulls the next
 * article's colour up as a dome; a click or Enter on it (it is a real link)
 * plays the same hand-off.
 *
 * `data-article-next` tells the articles transitions to leave this link to
 * the page's own hand-off (next-threshold.ts).
 */
export function NextThreshold({ next }: { next: DetailNext }) {
  return (
    <Link
      aria-label={`Next article: ${next.title}`}
      className="ad-next"
      data-article-next=""
      draggable={false}
      href={`/articles/${next.slug}`}
      prefetch={false}
    >
      {next.coverUrl ? (
        // The next article's cover, waiting faintly in the fog behind its title.
        <span aria-hidden="true" className="ad-next-ghost">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" decoding="async" loading="lazy" src={next.coverUrl} />
        </span>
      ) : null}
      <span aria-hidden="true" className="ad-next-inner" data-ad-next-inner="">
        <span className="ad-next-label" data-ad-next-label="">
          <span className="ad-next-label-in">
            <Sparkle className="ad-next-star" />
            Next article
          </span>
        </span>
        {/* Set exactly like the hero title (glyphs included), so the copy
            the hand-off carries lands on the next page's title pixel for pixel. */}
        <span className="ad-title ad-next-title" data-ad-next-title="">
          <TitleGlyphs text={next.title} />
        </span>
        <span className="ad-next-foot">
          <span className="ad-next-hint" data-ad-next-hint="">
            <span className="ad-next-hint-in">
              {/* Reduced motion has no pull: the threshold is a plain link. */}
              <span className="ad-next-hint-pull">(Keep scrolling)</span>
              <span className="ad-next-hint-plain">(Read it next)</span>
            </span>
          </span>
          <span className="ad-next-bar">
            <span className="ad-next-bar-fill" data-ad-next-bar="" />
          </span>
          {/* Shown only by the flood's copy, when the next page is slow to
              arrive: a small book turning its pages, and "(Loading)". */}
          <span className="ad-next-loading">
            <span className="ad-book">
              <span className="ad-book-page" />
              <span className="ad-book-page" />
            </span>
            <span className="ad-next-loading-text">(Loading)</span>
          </span>
        </span>
      </span>
    </Link>
  );
}
