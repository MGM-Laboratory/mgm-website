"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import gsap from "gsap";

import type { HomeChapter } from "@/components/home-extras/chapters";
import { KineticHeading } from "@/components/home-extras/kinetic-heading";
import { Magnetic } from "@/components/home-extras/magnetic";
import { SeeMoreLink } from "@/components/home-extras/see-more-link";
import { motionAllowed } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";

const ARROW_BUTTON =
  "group flex size-9 items-center justify-center rounded-full border border-[var(--line)] text-foreground/60 transition-[color,border-color,opacity] hover:border-foreground/30 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] aria-disabled:opacity-40";

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
  chapter,
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
   * other sections — used on About, and on the homepage's own tightened row
   * stack (Core Competencies/Trusted By/Projects/Publications/Articles). */
  compact?: boolean;
  /** The homepage's chapter mark above the heading (components/home-extras/chapters.ts). */
  chapter?: HomeChapter;
}>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  // Which ends of the track are showing, so the arrow that can't go any
  // further says so (dimmed) and answers a press with a little bump.
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const max = track.scrollWidth - track.clientWidth;
      const start = track.scrollLeft <= 2;
      const end = track.scrollLeft >= max - 2;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    track.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(track);
    return () => {
      track.removeEventListener("scroll", onScroll);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [count]);

  function scrollTrack(dir: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const blocked = dir > 0 ? edges.end : edges.start;
    if (blocked) {
      // Already at the end: the row leans that way and springs back.
      if (!motionAllowed()) return;
      gsap.fromTo(
        track,
        { x: 0 },
        {
          keyframes: [
            { x: -dir * 14, duration: 0.12, ease: "power2.out" },
            { x: 0, duration: 0.6, ease: "elastic.out(1, 0.35)" },
          ],
        },
      );
      return;
    }
    track.scrollBy({ left: dir * 332, behavior: motionAllowed() ? "smooth" : "auto" });
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
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-5">
          <div>
            <KineticHeading
              chapter={chapter}
              text={title}
              className="font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground"
            />
            <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">{intro}</p>
          </div>
          <div className="reveal-card flex shrink-0 items-center gap-4 opacity-0">
            {seeMoreHref ? <SeeMoreLink href={seeMoreHref}>{seeMoreLabel}</SeeMoreLink> : null}
            {count ? (
              <div className="hidden gap-2 sm:flex">
                <Magnetic radius={40} strength={0.4} max={8}>
                  <button
                    type="button"
                    aria-label={`Scroll ${title} left`}
                    aria-disabled={edges.start || undefined}
                    onClick={() => scrollTrack(-1)}
                    className={ARROW_BUTTON}
                  >
                    <ArrowLeft
                      className="size-4 transition-transform duration-300 group-hover:-translate-x-0.5 motion-reduce:transition-none"
                      strokeWidth={2.25}
                    />
                  </button>
                </Magnetic>
                <Magnetic radius={40} strength={0.4} max={8}>
                  <button
                    type="button"
                    aria-label={`Scroll ${title} right`}
                    aria-disabled={edges.end || undefined}
                    onClick={() => scrollTrack(1)}
                    className={ARROW_BUTTON}
                  >
                    <ArrowRight
                      className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      strokeWidth={2.25}
                    />
                  </button>
                </Magnetic>
              </div>
            ) : null}
          </div>
        </div>

        {count > 0 && (
          <div
            ref={trackRef}
            className="mt-10 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]"
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
