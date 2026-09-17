"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { PatternTile, toneColor, type PatternKind, type PatternTone } from "./pattern-tile";
import { MosaicMarquee } from "./mosaic-marquee";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

type Step = { word: string; kind: PatternKind; bg: PatternTone; fg: PatternTone };

// Order matters — this is the exact queue the reveal animation plays as the
// user scrolls down, grouped into the same rows as the reference poster.
const ROWS: Step[][] = [
  [
    { word: "We.", kind: "fans", bg: "canvas", fg: "red" },
    { word: "Research.", kind: "square", bg: "canvas", fg: "yellow" },
  ],
  [
    { word: "Explore.", kind: "arcs", bg: "blue", fg: "canvas" },
    { word: "Build.", kind: "circle", bg: "red", fg: "canvas" },
    { word: "Design.", kind: "leaves", bg: "green", fg: "canvas" },
  ],
  [
    { word: "Test.", kind: "plus", bg: "red", fg: "canvas" },
    { word: "Learn.", kind: "clover", bg: "yellow", fg: "canvas" },
    { word: "Code.", kind: "fans", bg: "canvas", fg: "blue" },
  ],
  [
    { word: "Iterate.", kind: "square", bg: "canvas", fg: "blue" },
    { word: "Grow.", kind: "leaves", bg: "red", fg: "canvas" },
  ],
];

const wordType =
  "font-display font-semibold tracking-tight text-foreground text-[clamp(2.25rem,4vw_+_0.5rem,3.75rem)]";
// The tile's box matches the word's font-size exactly, so it reads as tall
// as the text sitting next to it rather than a bigger accent shape.
const tileWrapClass =
  "process-tile shrink-0 overflow-hidden rounded-md aspect-square w-[clamp(2.25rem,4vw_+_0.5rem,3.75rem)]";

// Every tile's outline is its own accent color (the one real brand color
// it uses, whichever of bg/fg isn't the canvas tone) — a canvas-background
// tile would otherwise blend straight into the section's identical
// background with no visible edge.
function accentOf(tile: { bg: PatternTone; fg: PatternTone }): PatternTone {
  return tile.bg === "canvas" ? tile.fg : tile.bg;
}

function TileOutline({
  children,
  accent,
  className,
}: {
  children: React.ReactNode;
  accent: PatternTone;
  className: string;
}) {
  return (
    <div className={className} style={{ border: `4px solid ${toneColor(accent)}` }}>
      {children}
    </div>
  );
}

export function ProcessSection() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      gsap.set(gsap.utils.toArray(".process-item", root), {
        opacity: 1,
        y: 0,
        scale: 1,
        rotate: 0,
      });
      return;
    }

    const triggers: ScrollTrigger[] = [];

    gsap.utils.toArray<HTMLElement>(".process-row", root).forEach((row) => {
      const items = gsap.utils.toArray<HTMLElement>(".process-item", row);
      const tl = gsap.timeline({
        scrollTrigger: { trigger: row, start: "top 82%", once: true },
      });
      tl.fromTo(
        items,
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.14 },
      ).fromTo(
        items.map((item) => item.querySelector(".process-tile")),
        { opacity: 0, scale: 0, rotate: -18 },
        {
          opacity: 1,
          scale: 1,
          rotate: 0,
          duration: 0.45,
          ease: "back.out(2.4)",
          stagger: 0.14,
        },
        "-=0.35",
      );
      if (tl.scrollTrigger) triggers.push(tl.scrollTrigger);
    });

    return () => {
      triggers.forEach((t) => t.kill());
    };
  }, []);

  return (
    <section
      id="process"
      ref={rootRef}
      className="relative bg-[var(--surface-muted)] px-6 pt-20 pb-14 sm:px-10 sm:pt-28 sm:pb-20 lg:px-16"
    >
      <noscript>
        <style>{".reveal-hidden{opacity:1 !important}"}</style>
      </noscript>

      <div className="flex max-w-5xl flex-col gap-6 sm:gap-8">
        {ROWS.map((row, ri) => (
          <div
            key={ri}
            className="process-row flex flex-wrap items-center gap-x-12 gap-y-6 sm:gap-x-16"
          >
            {row.map((step) => (
              <div
                key={step.word}
                className="process-item reveal-hidden flex items-center gap-4 opacity-0 sm:gap-5"
              >
                <span className={wordType}>{step.word}</span>
                <TileOutline accent={accentOf(step)} className={tileWrapClass}>
                  <PatternTile
                    kind={step.kind}
                    bg={step.bg}
                    fg={step.fg}
                    className="block h-full w-full"
                  />
                </TileOutline>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Negative margins cancel this section's own side padding so the
          marquee bleeds edge-to-edge with the viewport instead of stopping
          at the section's text margin. */}
      <div className="-mx-6 mt-16 sm:-mx-10 sm:mt-24 lg:-mx-16">
        <MosaicMarquee />
      </div>
    </section>
  );
}
