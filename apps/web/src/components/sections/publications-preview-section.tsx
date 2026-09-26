"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";

import { HOME_CHAPTERS } from "@/components/home-extras/chapters";
import { KineticHeading } from "@/components/home-extras/kinetic-heading";
import { SeeMoreLink } from "@/components/home-extras/see-more-link";
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
      className="bg-background px-6 py-10 sm:px-10 sm:py-14 lg:px-16"
    >
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-5">
          <div>
            <KineticHeading
              chapter={HOME_CHAPTERS.publications}
              text="On the record"
              className="font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground"
            />
            <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">
              Peer-reviewed papers and scholarly writing from the lab. The careful, citable version
              of what we learn.
            </p>
          </div>
          <div className="reveal-card shrink-0 opacity-0">
            <SeeMoreLink href="/publications">All publications</SeeMoreLink>
          </div>
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
                  // Hover or focus: a blue bar grows down the left edge, the
                  // text slides in after it with a little overshoot, and an
                  // arrow draws itself (shaft, then head) beside the year.
                  // CSS only, nothing here is touched by GSAP.
                  <Link
                    key={record.slug}
                    href={`/publications/${record.slug}`}
                    className="group relative flex items-start justify-between gap-4 px-5 py-4 transition-colors duration-300 outline-none hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.04]"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-3 left-0 w-[3px] origin-top scale-y-0 rounded-full bg-brand-blue transition-transform duration-300 ease-out group-hover:scale-y-100 group-focus-visible:scale-y-100 motion-reduce:transition-none"
                    />
                    <div className="min-w-0 transition-transform duration-500 ease-[cubic-bezier(.2,.9,.25,1.3)] group-hover:translate-x-2 group-focus-visible:translate-x-2 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-focus-visible:translate-x-0">
                      {venue ? (
                        <p className="truncate text-xs font-medium tracking-wide text-foreground/60 uppercase">
                          {venue}
                        </p>
                      ) : null}
                      <h3 className="mt-1 truncate font-display font-medium text-foreground transition group-hover:text-brand-blue group-focus-visible:text-brand-blue">
                        {publication.title}
                      </h3>
                      {authors ? (
                        <p className="mt-1 truncate text-sm text-foreground/60">{authors}</p>
                      ) : null}
                    </div>
                    <span className="flex shrink-0 items-center gap-2 text-xs font-medium whitespace-nowrap text-foreground/60">
                      {publication.date.slice(0, 4)}
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.25}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-4 text-brand-blue"
                      >
                        <path
                          d="M4 12H19"
                          pathLength={1}
                          className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-300 ease-out group-hover:[stroke-dashoffset:0] group-focus-visible:[stroke-dashoffset:0] motion-reduce:transition-none"
                        />
                        <path
                          d="M13 6L19 12L13 18"
                          pathLength={1}
                          className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-200 ease-out group-hover:[stroke-dashoffset:0] group-hover:delay-200 group-focus-visible:[stroke-dashoffset:0] group-focus-visible:delay-200 motion-reduce:transition-none motion-reduce:group-hover:delay-0"
                        />
                      </svg>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="reveal-card mt-10 rounded-2xl border border-[var(--line)] px-8 py-16 text-center opacity-0">
            <p className="text-foreground/60">
              No publications to show right now. Please check back soon.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
