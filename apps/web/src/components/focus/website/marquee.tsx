"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";

import { cn } from "@/lib/utils";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

/**
 * A continuous horizontal ticker. Same measured-offset technique as the
 * footer's wordmark strip (cta-footer.tsx) — sliding by the second copy's
 * own `offsetLeft` rather than a flat -50% is what lands back on the seam
 * with no jump regardless of tracking/gap rounding. Edges fade via
 * `mask-image` rather than stacked gradient divs (one property, same
 * result). The visible track is `aria-hidden` (it's a duplicated, looping
 * presentation of `items`); the real list lives once in the wrapper's
 * `aria-label` so screen readers get the content without the loop noise.
 */
export function Marquee({
  items,
  className,
  itemClassName,
  speed = 90,
  reverse = false,
  pauseOnHover = false,
  fadeEdges = true,
  renderItem,
}: Readonly<{
  items: string[];
  className?: string;
  itemClassName?: string;
  speed?: number;
  reverse?: boolean;
  pauseOnHover?: boolean;
  fadeEdges?: boolean;
  renderItem?: (item: string) => ReactNode;
}>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || reducedMotion()) return undefined;
    const secondCopy = track.children[1] as HTMLElement | undefined;
    const shiftPx = secondCopy ? secondCopy.offsetLeft : track.scrollWidth / 2;
    gsap.set(track, { x: reverse ? -shiftPx : 0 });
    const tween = gsap.to(track, {
      x: reverse ? 0 : -shiftPx,
      duration: shiftPx / speed,
      ease: "none",
      repeat: -1,
    });
    tweenRef.current = tween;
    return () => {
      tween.kill();
      tweenRef.current = null;
    };
  }, [items, speed, reverse]);

  return (
    <div
      className={cn(
        "overflow-hidden",
        fadeEdges &&
          "[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
        className,
      )}
      aria-label={`Includes: ${items.join(", ")}`}
      onMouseEnter={pauseOnHover ? () => tweenRef.current?.pause() : undefined}
      onMouseLeave={pauseOnHover ? () => tweenRef.current?.resume() : undefined}
    >
      <div ref={trackRef} aria-hidden="true" className="flex w-max items-center whitespace-nowrap">
        {[0, 1].map((copy) => (
          <span key={copy} className="flex shrink-0 items-center">
            {items.map((item, i) => (
              <span key={i} className={cn("shrink-0", itemClassName)}>
                {renderItem ? renderItem(item) : item}
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
