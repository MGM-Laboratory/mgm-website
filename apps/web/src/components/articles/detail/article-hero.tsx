import Link from "next/link";
import { Fragment, type CSSProperties } from "react";

import type { ArticleDetailData, DetailAuthor } from "./detail-data";
import { MaskedWords } from "./article-story";

/**
 * The article's hero, top to bottom: the date and reading time, the title,
 * the short description, the categories (links back to the filtered list)
 * and the authors (links to their member pages).
 *
 * The title is split into glyphs inside word masks for the entrance (each
 * letter rises into place); the real text stays one accessible string. The
 * split copy is decoration only, so kerning inside the display face is the
 * one thing traded for the rise.
 */

/** A four-pointed sparkle, the page's small ornament. */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16">
      <path d="M8 0c.5 4.4 3.6 7.5 8 8-4.4.5-7.5 3.6-8 8-.5-4.4-3.6-7.5-8-8 4.4-.5 7.5-3.6 8-8Z" />
    </svg>
  );
}

/** The title as glyphs in word masks (decoration; the h1 carries the text). */
export function TitleGlyphs({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  let glyph = 0;
  return (
    <span aria-hidden="true" className="ad-title-glyphs">
      {words.map((word, wordIndex) => (
        // The space sits between the masks: inside one it would collapse.
        <Fragment key={wordIndex}>
          <span className="ad-tw">
            {Array.from(word).map((char, charIndex) => {
              const index = glyph;
              glyph += 1;
              return (
                <span className="ad-tg" key={charIndex} style={{ "--g": index } as CSSProperties}>
                  {char}
                </span>
              );
            })}
          </span>
          {wordIndex < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

function Portrait({ author }: { author: DetailAuthor }) {
  const position = author.photoPosition;
  return (
    <span className="ad-portrait" data-accent={author.accent}>
      <span aria-hidden="true" className="ad-portrait-initials">
        {author.initials}
      </span>
      {author.photoUrl ? (
        // Member portraits come from the member media route (see
        // components/members): a plain image, like the directory's.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="ad-portrait-img"
          decoding="async"
          src={author.photoUrl}
          style={
            position
              ? {
                  objectPosition: `${position.x}% ${position.y}%`,
                  scale: position.zoom && position.zoom !== 1 ? String(position.zoom) : undefined,
                }
              : undefined
          }
        />
      ) : null}
    </span>
  );
}

export function ArticleHero({
  data,
  titleShown,
}: {
  data: ArticleDetailData;
  titleShown: boolean;
}) {
  return (
    <header className="ad-hero">
      <p className="ad-meta" data-enter="meta">
        <Sparkle className="ad-meta-star" />
        <time dateTime={data.date}>{data.dateLabel}</time>
        <span aria-hidden="true" className="ad-meta-dot" />
        <span>{data.minutes} min read</span>
      </p>

      <h1
        className="ad-title"
        data-article-title=""
        data-enter="title"
        style={titleShown ? { opacity: 1 } : undefined}
      >
        <span className="sr-only">{data.title}</span>
        <TitleGlyphs text={data.title} />
      </h1>

      <div className="ad-hero-body">
        {data.subtitle ? (
          <p className="ad-subtitle" data-enter="subtitle">
            <MaskedWords text={data.subtitle} />
          </p>
        ) : null}

        {data.categories.length ? (
          <ul aria-label="Categories" className="ad-chips" data-enter="chips">
            {data.categories.map((category, index) => (
              <li key={category.slug} style={{ "--i": index } as CSSProperties}>
                <Link
                  className="ad-chip"
                  data-ad-magnetic=""
                  href={`/articles?category=${encodeURIComponent(category.slug)}`}
                >
                  <span aria-hidden="true" className="ad-chip-dot" />
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {data.authors.length ? (
          <div className="ad-authors" data-enter="authors">
            <p className="ad-authors-label">Written by</p>
            <ul className="ad-author-list">
              {data.authors.map((author) => (
                <li key={author.slug}>
                  <Link className="ad-author" data-ad-magnetic="" href={`/member/${author.slug}`}>
                    <Portrait author={author} />
                    <span className="ad-author-text">
                      <span className="ad-author-name">{author.name}</span>
                      <span className="ad-author-role">{author.role}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </header>
  );
}
