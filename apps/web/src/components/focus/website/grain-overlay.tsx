"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * A static film-grain texture (SVG feTurbulence, not animated — cheap, no
 * rAF loop) laid over a section for a tactile, less-flat surface. Each
 * instance needs its own filter id since `url(#id)` only resolves the
 * first match in the document.
 */
export function GrainOverlay({ className }: Readonly<{ className?: string }>) {
  const filterId = useId();
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full opacity-[0.06] mix-blend-overlay",
        className,
      )}
    >
      <filter id={filterId}>
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.85"
          numOctaves={2}
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${filterId})`} />
    </svg>
  );
}
