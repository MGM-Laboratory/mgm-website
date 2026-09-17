"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { setupParallax } from "@/lib/parallax";
import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";

type Shape = {
  kind: PatternKind;
  tone: PatternTone;
  top: number;
  left: number;
  size: number;
  rotate: number;
  depth: number;
  hideOnMobile: boolean;
  onLeftEdge: boolean;
};

const KINDS: PatternKind[] = [
  "fans",
  "square",
  "arcs",
  "circle",
  "leaves",
  "plus",
  "clover",
  "domes",
  "quads",
  "x",
];
const TONES: PatternTone[] = ["red", "yellow", "blue", "green"];

// A small deterministic PRNG (not Math.random) so this renders the exact
// same layout on the server and the client, and the exact same layout on
// every visit — no reshuffle on reload, no hydration mismatch.
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shapes thin out with depth on purpose: dense near the top (where the hero
// headline lives), tapering off by the bottom of the field instead of
// stopping dead at the hero's own edge.
//
// Every value is rounded to a short, fixed precision before it's used —
// the browser's CSSOM re-serializes a `style` attribute's numbers with its
// own (coarser) precision once it parses the initial HTML, so handing it a
// 15-decimal float made the client's first hydration pass compare against
// a subtly different string than what the server actually sent, tripping
// React's hydration-mismatch warning despite an identical visual result.
function round(n: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

// Every story row below the hero is centered in a max-w-3xl column, so
// "keep clear of the text" means the same thing at every scroll depth below
// the hero: stay within this margin of the left or right edge, never the
// middle. Comfortably inside the column's own natural gutter even at a wide
// desktop viewport, where that gutter is at its narrowest.
const EDGE_MARGIN = 14;

// The hero itself (unlike the story rows after it) is left-anchored at lg:,
// with the lanyard filling its right side — so right-edge shapes that would
// land within the hero's own vertical span are hidden there instead, rather
// than clashing with it. Measured as a percentage of this field's total
// height (hero + every story row combined): the hero is `min-h-[100dvh-4rem]`
// while the field spans much further down, so this is necessarily an
// approximation, padded a little past the hero's actual measured share.
const HERO_LANYARD_CLEAR_PERCENT = 34;

// One independent, deliberately-spaced column per edge, instead of scoring
// every shape's position independently — the earlier approach let shapes
// land close together purely by chance (worst on the right edge, which
// visibly clustered). Walking down a single column and growing the gap
// after every shape guarantees no two shapes on the same edge ever crowd
// each other, and the growing gap is what makes density fall off with
// depth, rather than a probability curve that could still roll a cluster.
function placeColumn(rand: () => number, onLeftEdge: boolean, startY: number): Shape[] {
  const shapes: Shape[] = [];
  let y = startY;
  let gap = 5 + rand() * 2;
  let i = 0;

  while (y < 96) {
    const density = Math.max(1 - y / 100, 0.15);
    const size = 1.6 + rand() * 3.2 * density;
    const fromEdge = 2 + rand() * (EDGE_MARGIN - 2);
    shapes.push({
      kind: KINDS[Math.floor(rand() * KINDS.length)],
      tone: TONES[Math.floor(rand() * TONES.length)],
      top: round(y, 2),
      left: round(onLeftEdge ? fromEdge : 100 - fromEdge, 2),
      size: round(size, 2),
      rotate: Math.round(rand() * 360),
      depth: round(0.4 + rand() * 0.9, 2),
      hideOnMobile: i % 2 === 0,
      onLeftEdge,
    });
    y += gap + size * 0.6;
    gap *= 1.24;
    i++;
  }
  return shapes;
}

function buildShapes(): Shape[] {
  const rand = mulberry32(20260917);
  return [...placeColumn(rand, true, rand() * 3), ...placeColumn(rand, false, 1 + rand() * 3)];
}

const SHAPES = buildShapes();

/**
 * A field of the site's own Bauhaus shape vocabulary, spanning whatever
 * container it's placed in (sized by that container's normal content, not
 * a hardcoded height) so it can back the hero and the section right after
 * it as one continuous passage instead of stopping at the hero's own edge.
 */
export function BauhausField() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const shapeEls = gsap.utils.toArray<HTMLElement>(".bauhaus-shape", root);
    const reduced = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

    const rotateOf = (el: Element) => Number((el as HTMLElement).dataset.rotate ?? 0);

    if (reduced) {
      shapeEls.forEach((el) => gsap.set(el, { opacity: 1, scale: 1, rotate: rotateOf(el) }));
      return;
    }

    gsap.set(shapeEls, { opacity: 0, scale: 0.3, rotate: (i, el) => rotateOf(el) });
    const tl = gsap.timeline({ scrollTrigger: { trigger: root, start: "top 90%", once: true } });
    tl.to(shapeEls, {
      opacity: 1,
      scale: 1,
      duration: 0.7,
      ease: "back.out(1.8)",
      stagger: { each: 0.03, from: "random" },
    });

    const removeParallax = setupParallax(root, { duration: 0.9, xStrength: 14, yStrength: 10 });

    return () => {
      tl.kill();
      removeParallax();
    };
  }, []);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {SHAPES.map((shape, i) => {
        const clearsForLanyard = !shape.onLeftEdge && shape.top < HERO_LANYARD_CLEAR_PERCENT;
        return (
          <div
            key={i}
            className={`parallax-el absolute ${shape.hideOnMobile ? "hidden sm:block" : ""} ${clearsForLanyard ? "lg:hidden" : ""}`}
            data-depth={shape.depth}
            style={{ top: `${shape.top}%`, left: `${shape.left}%` }}
          >
            <div
              className="bauhaus-shape opacity-0"
              data-rotate={shape.rotate}
              style={{ width: `${shape.size}rem`, height: `${shape.size}rem` }}
            >
              <FlairShape kind={shape.kind} tone={shape.tone} className="h-full w-full" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
