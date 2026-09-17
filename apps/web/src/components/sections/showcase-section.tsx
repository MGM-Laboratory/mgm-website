"use client";

import { useLayoutEffect, useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";

/**
 * A "Netflix row": header (title/intro/see-more/arrows) plus a
 * horizontally-scrolling track of cards. Cards are passed as `children`
 * rather than rendered from an `items`+render-prop pair — Server Components
 * (this section is used directly from page.tsx for some content) can pass
 * pre-rendered JSX as children to a Client Component, but not a function, so
 * this shape is what lets callers own their own card markup regardless of
 * whether that caller is a server or client component. `count` (not
 * `children.length`, which doesn't exist on React.ReactNode) drives the
 * empty-state check.
 */
export function ShowcaseSection({
  id,
  title,
  intro,
  count,
  children,
  seeMoreHref,
  seeMoreLabel = "See more",
  emptyMessage,
  compact = false,
}: Readonly<{
  id: string;
  title: string;
  intro: string;
  count: number;
  children: React.ReactNode;
  seeMoreHref?: string;
  seeMoreLabel?: string;
  emptyMessage?: string;
  /** Tighter vertical padding for pages that stack this directly between
   * other sections (e.g. About) — the homepage default is untouched. */
  compact?: boolean;
}>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  function scrollTrack(dir: 1 | -1) {
    trackRef.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  }

  return (
    <section
      id={id}
      ref={rootRef}
      className={cn(
        "bg-background px-6 sm:px-10 lg:px-16",
        compact ? "py-10 sm:py-14" : "py-20 sm:py-28",
      )}
    >
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
              {title}
            </h2>
            <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">{intro}</p>
          </div>
          <div className="reveal-card flex shrink-0 items-center gap-4 opacity-0">
            {seeMoreHref ? (
              <Link
                href={seeMoreHref}
                className="text-sm font-medium text-foreground/60 whitespace-nowrap transition-colors hover:text-brand-blue"
              >
                {seeMoreLabel} →
              </Link>
            ) : null}
            {count ? (
              <div className="hidden gap-2 sm:flex">
                <button
                  type="button"
                  aria-label={`Scroll ${title} left`}
                  onClick={() => scrollTrack(-1)}
                  className="flex size-9 items-center justify-center rounded-full border border-[var(--line)] text-foreground/60 transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-4" strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  aria-label={`Scroll ${title} right`}
                  onClick={() => scrollTrack(1)}
                  className="flex size-9 items-center justify-center rounded-full border border-[var(--line)] text-foreground/60 transition-colors hover:text-foreground"
                >
                  <ArrowRight className="size-4" strokeWidth={2.25} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {count > 0 && (
          <div
            ref={trackRef}
            className="mt-10 flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none]"
          >
            {children}
          </div>
        )}
        {count === 0 && emptyMessage && (
          <div className="reveal-card mt-10 rounded-2xl border border-[var(--line)] px-8 py-16 text-center opacity-0">
            <p className="text-foreground/60">{emptyMessage}</p>
          </div>
        )}
      </div>
    </section>
  );
}
