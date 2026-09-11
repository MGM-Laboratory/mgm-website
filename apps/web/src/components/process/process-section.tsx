"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { PatternTile, type PatternKind, type PatternTone } from "./pattern-tile";

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
    { word: "Code.", kind: "fans", bg: "canvas", fg: "red" },
  ],
  [
    { word: "Iterate.", kind: "domes", bg: "canvas", fg: "red" },
    { word: "Grow.", kind: "quads", bg: "canvas", fg: "green" },
  ],
];

// Purely decorative — the pattern-as-signature strip from the design
// system, no words attached, just a wide band of the brand's motifs.
const MOSAIC: Step[] = [
  { word: "", kind: "circle", bg: "canvas", fg: "yellow" },
  { word: "", kind: "arcs", bg: "canvas", fg: "red" },
  { word: "", kind: "fans", bg: "green", fg: "canvas" },
  { word: "", kind: "x", bg: "canvas", fg: "blue" },
  { word: "", kind: "circle", bg: "canvas", fg: "red" },
  { word: "", kind: "x", bg: "yellow", fg: "canvas" },
  { word: "", kind: "quads", bg: "canvas", fg: "green" },
  { word: "", kind: "circle", bg: "canvas", fg: "red" },
  { word: "", kind: "square", bg: "canvas", fg: "yellow" },
  { word: "", kind: "clover", bg: "canvas", fg: "red" },
  { word: "", kind: "leaves", bg: "canvas", fg: "green" },
  { word: "", kind: "plus", bg: "canvas", fg: "yellow" },
  { word: "", kind: "plus", bg: "yellow", fg: "canvas" },
  { word: "", kind: "clover", bg: "canvas", fg: "blue" },
  { word: "", kind: "arcs", bg: "canvas", fg: "green" },
  { word: "", kind: "x", bg: "canvas", fg: "blue" },
  { word: "", kind: "circle", bg: "canvas", fg: "yellow" },
  { word: "", kind: "x", bg: "canvas", fg: "blue" },
];

const wordType =
  "font-display font-semibold tracking-tight text-foreground text-[clamp(1.75rem,3vw_+_1rem,2.5rem)]";
const tileClass = "process-tile size-10 shrink-0 rounded-lg sm:size-12";

export function ProcessSection() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

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

    const mosaicTiles = gsap.utils.toArray<HTMLElement>(".mosaic-tile", root);
    if (mosaicTiles.length) {
      const mosaicTl = gsap.timeline({
        scrollTrigger: { trigger: ".mosaic-strip", start: "top 88%", once: true },
      });
      mosaicTl.fromTo(
        mosaicTiles,
        { opacity: 0, scale: 0, rotate: -14 },
        { opacity: 1, scale: 1, rotate: 0, duration: 0.4, ease: "back.out(2.2)", stagger: 0.035 },
      );
      if (mosaicTl.scrollTrigger) triggers.push(mosaicTl.scrollTrigger);
    }

    return () => {
      triggers.forEach((t) => t.kill());
    };
  }, []);

  return (
    <section
      id="process"
      ref={rootRef}
      className="relative bg-[var(--surface-muted)] px-6 py-20 sm:px-10 sm:py-28 lg:px-16"
    >
      <noscript>
        <style>{".reveal-hidden{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto flex max-w-4xl flex-col gap-5 sm:gap-7">
        {ROWS.map((row, ri) => (
          <div
            key={ri}
            className="process-row flex flex-wrap items-center gap-x-10 gap-y-5 sm:gap-x-14"
          >
            {row.map((step) => (
              <div
                key={step.word}
                className="process-item reveal-hidden flex items-center gap-3 opacity-0 sm:gap-4"
              >
                <span className={wordType}>{step.word}</span>
                <PatternTile kind={step.kind} bg={step.bg} fg={step.fg} className={tileClass} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mosaic-strip mx-auto mt-16 flex max-w-5xl flex-wrap justify-center gap-1.5 sm:mt-24">
        {MOSAIC.map((tile, i) => (
          <PatternTile
            key={i}
            kind={tile.kind}
            bg={tile.bg}
            fg={tile.fg}
            className="mosaic-tile reveal-hidden size-9 shrink-0 opacity-0 sm:size-12"
          />
        ))}
      </div>
    </section>
  );
}
