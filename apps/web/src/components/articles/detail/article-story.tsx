import { Fragment, type CSSProperties, type ReactNode } from "react";

import {
  inlineText,
  type FigureVariant,
  type InlineContent,
  type InlineNode,
  type Story,
  type StoryBlock,
  type StoryImage,
  type StorySection,
  type StorySource,
  safeHref,
} from "./story-model";

/**
 * The article's story, rendered on the server (it is the bulk of the page
 * and needs no client code of its own): the article controller finds its
 * pieces through data attributes and animates them.
 *
 * Layout (detail.css): one grid with named columns. Paragraphs, lists and
 * headings sit in the text column (about 66 characters a line); figures
 * break out of it in three ways (full bleed with an inner parallax, inset
 * with the caption in the margin, offset toward the margin with the caption
 * on the other side), two pictures in a row form a diptych. On wide screens
 * a rail on the left keeps the section index and the reading progress in
 * view.
 *
 * Every animated piece is marked `data-ad-reveal` with its kind; without
 * JavaScript (or with reduced motion) everything simply shows.
 */

export function sectionAnchor(number: number) {
  return `section-${number}`;
}

export function twoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function renderNodes(nodes: InlineContent | undefined, keyPrefix: string): ReactNode {
  if (nodes === undefined) return null;
  if (typeof nodes === "string") return nodes;
  return nodes.map((node: InlineNode, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "link") {
      const href = node.href ? safeHref(node.href) : undefined;
      const external = Boolean(href && /^https?:/i.test(href));
      return (
        <a
          className="ad-link"
          data-ad-magnetic=""
          href={href}
          key={key}
          rel={external ? "noopener noreferrer" : undefined}
          target={external ? "_blank" : undefined}
        >
          {renderNodes(node.content, key)}
        </a>
      );
    }
    let text: ReactNode = node.text ?? "";
    const styles = node.styles ?? {};
    if (styles.code) text = <code className="ad-code">{text}</code>;
    if (styles.bold) text = <strong>{text}</strong>;
    if (styles.italic) text = <em>{text}</em>;
    if (styles.underline) text = <u>{text}</u>;
    if (styles.strike) text = <s>{text}</s>;
    return <span key={key}>{text}</span>;
  });
}

/** Plain text split into words, each in a mask that its inner span rises through. */
export function MaskedWords({ text, className }: { text: string; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span className={className}>
      {words.map((word, index) => (
        // The space sits between the masks: inside one it would collapse.
        <Fragment key={index}>
          <span className="ad-w">
            <span className="ad-wi" style={{ "--wi": index } as CSSProperties}>
              {word}
            </span>
          </span>
          {index < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

function hasLinks(content: InlineContent) {
  return typeof content !== "string" && content.some((node) => node.type === "link");
}

function Paragraph({ id, content }: { id: string; content: InlineContent }) {
  return (
    <p className="ad-p" data-ad-reveal="text">
      {renderNodes(content, id)}
    </p>
  );
}

function List({ block }: { block: Extract<StoryBlock, { kind: "list" }> }) {
  const Tag = block.ordered ? "ol" : "ul";
  return (
    <Tag className="ad-list" data-ad-reveal="list" data-ordered={block.ordered ? "" : undefined}>
      {block.items.map((item, index) => (
        <li
          className="ad-li"
          data-depth={item.depth > 0 ? Math.min(item.depth, 2) : undefined}
          key={item.id}
          style={{ "--i": index } as CSSProperties}
        >
          <span aria-hidden="true" className="ad-li-mark">
            {block.ordered ? twoDigits(index + 1) : <span className="ad-li-star" />}
          </span>
          <span className="ad-li-text">{renderNodes(item.content, item.id)}</span>
        </li>
      ))}
    </Tag>
  );
}

function Picture({ image, eager = false }: { image: StoryImage; eager?: boolean }) {
  return (
    <div className="ad-frame" data-ad-frame="">
      <div className="ad-media" data-ad-media="">
        {/* CMS media stays a plain image: body pictures are authored URLs
            (mostly Wikimedia), outside the image loader's allow list. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={image.caption}
          className="ad-img"
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          src={image.src}
        />
      </div>
    </div>
  );
}

function Caption({ image, index }: { image: StoryImage; index?: number }) {
  if (!image.caption) return null;
  return (
    <figcaption className="ad-caption">
      {index !== undefined ? (
        <span aria-hidden="true" className="ad-caption-num">
          Fig. {twoDigits(index + 1)}
        </span>
      ) : null}
      <span>{image.caption}</span>
    </figcaption>
  );
}

function Figure({
  image,
  variant,
  order,
}: {
  image: StoryImage;
  variant: FigureVariant;
  order: number;
}) {
  return (
    <figure
      className="ad-figure"
      data-ad-figure=""
      data-ad-reveal="figure"
      data-variant={variant}
      data-zoomable=""
    >
      <Picture image={image} />
      <Caption image={image} index={order} />
    </figure>
  );
}

function Diptych({ images, order }: { images: [StoryImage, StoryImage]; order: number }) {
  return (
    <div className="ad-diptych" data-ad-reveal="diptych">
      {images.map((image, index) => (
        <figure
          className="ad-figure"
          data-ad-figure=""
          data-variant="pair"
          data-zoomable=""
          key={image.id}
        >
          <Picture image={image} />
          <Caption image={image} index={order + index} />
        </figure>
      ))}
    </div>
  );
}

function Block({ block }: { block: StoryBlock }) {
  switch (block.kind) {
    case "paragraph":
      return <Paragraph content={block.content} id={block.id} />;
    case "subheading":
      return (
        <h3 className="ad-h3" data-ad-reveal="heading">
          {hasLinks(block.content) ? (
            renderNodes(block.content, block.id)
          ) : (
            <MaskedWords text={inlineText(block.content)} />
          )}
        </h3>
      );
    case "list":
      return <List block={block} />;
    case "figure":
      return <Figure image={block.image} order={block.order} variant={block.variant} />;
    case "diptych":
      return <Diptych images={block.images} order={block.order} />;
  }
}

function Section({ section, total }: { section: StorySection; total: number }) {
  const anchor = sectionAnchor(section.number);
  return (
    <section
      aria-labelledby={`${anchor}-title`}
      className="ad-section"
      data-ad-section={section.number}
      id={anchor}
    >
      <header className="ad-section-head" data-ad-reveal="heading">
        <p aria-hidden="true" className="ad-section-num">
          <span className="ad-section-num-now">{twoDigits(section.number)}</span>
          <span className="ad-section-num-of">/{twoDigits(total)}</span>
        </p>
        <h2 className="ad-h2" id={`${anchor}-title`} tabIndex={-1}>
          {hasLinks(section.heading) ? (
            renderNodes(section.heading, section.id)
          ) : (
            <MaskedWords text={section.headingText} />
          )}
        </h2>
      </header>
      {section.blocks.map((block) => (
        <Block block={block} key={block.id} />
      ))}
    </section>
  );
}

function linkLabel(href: string, label: string) {
  if (label && label !== href) return label;
  return href.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

function Sources({ sources, title }: { sources: StorySource[]; title: string }) {
  return (
    <section aria-labelledby="article-sources" className="ad-sources" data-ad-reveal="sources">
      <h2 className="ad-sources-title" id="article-sources">
        {title}
      </h2>
      <ol className="ad-sources-list">
        {sources.map((source, index) => (
          <li className="ad-source" key={source.id} style={{ "--i": index } as CSSProperties}>
            {inlineText(source.citation).trim() ? (
              <p className="ad-citation">
                {renderNodes(
                  typeof source.citation === "string"
                    ? source.citation
                    : source.citation.filter((node) => node.type !== "link"),
                  source.id,
                )}
              </p>
            ) : null}
            {source.links.length ? (
              <p className="ad-source-links">
                {source.links.map((link) => (
                  <a
                    className="ad-source-chip"
                    data-ad-magnetic=""
                    href={link.href}
                    key={link.href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <span className="ad-source-chip-kind">
                      {/doi\.org/i.test(link.href) ? "DOI" : "Link"}
                    </span>
                    <span className="ad-source-chip-label">
                      {linkLabel(link.href, link.label).replace(/^doi\.org\//i, "")}
                    </span>
                    <svg aria-hidden="true" className="ad-source-chip-arrow" viewBox="0 0 24 24">
                      <path d="M7 17 17 7M8 7h9v9" />
                    </svg>
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Rail({ sections }: { sections: StorySection[] }) {
  return (
    <aside aria-label="In this article" className="ad-rail" data-ad-rail="">
      <div className="ad-rail-inner">
        <p className="ad-rail-label">In this article</p>
        {sections.length ? (
          <ol className="ad-index">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  className="ad-index-link"
                  data-ad-index={section.number}
                  href={`#${sectionAnchor(section.number)}`}
                >
                  <span className="ad-index-num">{twoDigits(section.number)}</span>
                  <span className="ad-index-text">{section.headingText}</span>
                </a>
              </li>
            ))}
          </ol>
        ) : null}
        <div aria-hidden="true" className="ad-rail-progress">
          <span className="ad-rail-progress-fill" data-ad-progress="" />
        </div>
      </div>
    </aside>
  );
}

export function ArticleStory({ story }: { story: Story }) {
  return (
    <div className="ad-story" data-ad-story="">
      <Rail sections={story.sections} />
      {story.lede ? (
        <p className="ad-lede" data-ad-reveal="lede">
          {renderNodes(story.lede.content, story.lede.id)}
        </p>
      ) : null}
      {story.intro.map((block) => (
        <Block block={block} key={block.id} />
      ))}
      {story.sections.map((section) => (
        <Section key={section.id} section={section} total={story.sections.length} />
      ))}
      {story.sources.length ? <Sources sources={story.sources} title={story.sourcesTitle} /> : null}
    </div>
  );
}
