"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A hand-rolled snap-scroll carousel: no library, just `overflow-x-auto` +
 * `snap-x` and scroll-position-derived dot indicators. Kept as a sibling of
 * the card's title link rather than nested inside it — a `<Link>` wrapping
 * interactive prev/next controls is invalid HTML and would hijack clicks.
 */
export function ProjectThumbnailCarousel({
  alt,
  className,
  images,
}: {
  alt: string;
  className?: string;
  images: string[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (!images.length) {
    return (
      <div className={cn("grid place-items-center bg-[var(--surface-muted)]", className)}>
        <span className="font-display text-2xl font-semibold text-[var(--ink-3)]">MGM</span>
      </div>
    );
  }

  const scrollToIndex = (index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ behavior: "smooth", left: index * scroller.clientWidth });
  };

  const onScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const index = Math.round(scroller.scrollLeft / Math.max(1, scroller.clientWidth));
    setActive(Math.min(images.length - 1, Math.max(0, index)));
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
        onScroll={onScroll}
        ref={scrollerRef}
      >
        {images.map((src, index) => (
          // Carousel media is CMS-uploaded content, outside the image loader.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={index === 0 ? alt : ""}
            className="h-full w-full shrink-0 snap-center object-cover"
            key={`${src}-${index}`}
            src={src}
          />
        ))}
      </div>
      {images.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {images.map((_, index) => (
            <button
              aria-label={`Show image ${index + 1} of ${images.length}`}
              className={cn(
                "pointer-events-auto h-1.5 rounded-full bg-white/60 shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-all",
                index === active ? "w-5 bg-white" : "w-1.5 hover:bg-white/85",
              )}
              key={index}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                scrollToIndex(index);
              }}
              type="button"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
