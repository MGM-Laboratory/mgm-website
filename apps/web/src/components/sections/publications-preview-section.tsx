"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import {
  publicationTypeLabel,
  type CmsPublicationRecord,
  type PublicationAuthor,
} from "@/lib/publication-cms";

function authorSummary(authors: readonly PublicationAuthor[]) {
  if (!authors.length) return undefined;
  const names = authors.map((author) => author.name);
  if (names.length <= 2) return names.join(" & ");
  return `${names[0]} et al.`;
}

/**
 * Unlike the Projects/Articles rows (a horizontal "Netflix" track), this
 * preview scrolls locally in its own bounded, vertically-scrolling panel —
 * per the brief, publications get their own scroll space instead of another
 * side-scroller.
 */
export function PublicationsPreviewSection({
  records,
}: Readonly<{
  records: readonly CmsPublicationRecord[];
}>) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <section
      id="publications"
      ref={rootRef}
      className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16"
    >
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
              Publications
            </h2>
            <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">
              Peer-reviewed papers and scholarly writing from the lab.
            </p>
          </div>
          <Link
            href="/publications"
            className="reveal-card shrink-0 text-sm font-medium whitespace-nowrap text-foreground/60 opacity-0 transition-colors hover:text-brand-blue"
          >
            See more →
          </Link>
        </div>

        {records.length ? (
          <div className="reveal-card mt-10 max-h-[26rem] overflow-y-auto rounded-2xl border border-[var(--line)] opacity-0 [mask-image:linear-gradient(to_bottom,transparent,black_16px,black_calc(100%-16px),transparent)]">
            <div className="divide-y divide-[var(--line)]">
              {records.map((record) => {
                const { publication } = record;
                const authors = authorSummary(publication.authors);
                const venue = [publicationTypeLabel(publication.type), publication.journal]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Link
                    key={record.slug}
                    href={`/publications/${record.slug}`}
                    className="group flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--surface-muted)]"
                  >
                    <div className="min-w-0">
                      {venue ? (
                        <p className="truncate text-xs font-medium tracking-wide text-foreground/45 uppercase">
                          {venue}
                        </p>
                      ) : null}
                      <h3 className="mt-1 truncate font-display font-medium text-foreground transition group-hover:text-brand-blue">
                        {publication.title}
                      </h3>
                      {authors ? (
                        <p className="mt-1 truncate text-sm text-foreground/60">{authors}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs font-medium whitespace-nowrap text-foreground/40">
                      {publication.date.slice(0, 4)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="reveal-card mt-10 rounded-2xl border border-[var(--line)] px-8 py-16 text-center opacity-0">
            <p className="text-foreground/60">
              No publications yet — the lab&apos;s first papers are on their way.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
