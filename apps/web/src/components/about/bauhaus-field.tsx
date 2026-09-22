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

// "clover" and "quads" are both a small 4-blob cluster — different path data,
// same silhouette at a glance. Rejecting only an exact `kind` repeat still
// let one land right after the other, reading as the same shape twice.
// Grouping them here (everything else keeps its own family) is what the
// adjacency check in placeColumn actually needs to reject against.
const VISUAL_FAMILY: Record<PatternKind, string> = {
  fans: "fans",
  square: "square",
  arcs: "arcs",
  circle: "circle",
  leaves: "leaves",
  plus: "plus",
  clover: "cluster",
  domes: "domes",
  quads: "cluster",
  x: "x",
};

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

// Both the hero heading and every story row below it are centered in a
// max-w-3xl column, so "keep clear of the text" means the same thing at
// every scroll depth: stay within this margin of the left or right edge,
// never the middle. Comfortably inside the column's own natural gutter
// even at a wide desktop viewport, where that gutter is at its narrowest.
const EDGE_MARGIN = 14;

// One independent, deliberately-spaced column per edge, instead of scoring
// every shape's position independently — the earlier approach let shapes
// land close together purely by chance (worst on the right edge, which
// visibly clustered). Walking down a single column and growing the gap
// after every shape guarantees no two shapes on the same edge ever crowd
// each other, and the growing gap is what makes density fall off with
// depth, rather than a probability curve that could still roll a cluster.
//
// Bigger shapes need more room than smaller ones, which the `size * 0.6`
// term already bakes into the step forward — so a bigger base size range
// (this field's shapes read larger than the original pass) doesn't
// reintroduce the crowding that same growing-gap trick was built to fix. A
// smaller starting gap is what actually packs more shapes into the hero's
// own top stretch specifically, since the gap is still small there before
// its own 1.24x-per-shape growth takes over further down.
//
// Picking kind/tone independently at random for every shape let the same
// icon or color land back-to-back purely by chance (four different colors,
// ten shapes — a repeat is one in four, or one in ten, on any given step) —
// visibly a run of three yellow shapes stacked down the same edge, or
// "clover" immediately followed by "quads" (different kind, same 4-blob
// silhouette — see VISUAL_FAMILY). Each pick is rerolled against only the
// *immediately previous* shape on this same edge, so a run like that can no
// longer happen, without touching how kind/tone vary further down the
// column.
function placeColumn(rand: () => number, onLeftEdge: boolean, startY: number): Shape[] {
  const shapes: Shape[] = [];
  let y = startY;
  let gap = 2.5 + rand() * 1.5;
  let i = 0;
  let prevFamily: string | null = null;
  let prevTone: PatternTone | null = null;

  while (y < 96) {
    const density = Math.max(1 - y / 100, 0.15);
    const size = 2.4 + rand() * 4.6 * density;
    const fromEdge = 2 + rand() * (EDGE_MARGIN - 2);

    let kind = KINDS[Math.floor(rand() * KINDS.length)];
    while (VISUAL_FAMILY[kind] === prevFamily) kind = KINDS[Math.floor(rand() * KINDS.length)];
    let tone = TONES[Math.floor(rand() * TONES.length)];
    while (tone === prevTone) tone = TONES[Math.floor(rand() * TONES.length)];

    shapes.push({
      kind,
      tone,
      top: round(y, 2),
      left: round(onLeftEdge ? fromEdge : 100 - fromEdge, 2),
      size: round(size, 2),
      rotate: Math.round(rand() * 360),
      depth: round(0.4 + rand() * 0.9, 2),
      hideOnMobile: i % 2 === 0,
    });
    prevFamily = VISUAL_FAMILY[kind];
    prevTone = tone;
    y += gap + size * 0.6;
    gap *= 1.24;
    i++;
  }
  return shapes;
}

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

function buildShapes(): Shape[] {
  const rand = mulberry32(20260917);
  return [...placeColumn(rand, true, rand() * 3), ...placeColumn(rand, false, 1 + rand() * 3)];
}

const SHAPES = buildShapes();

// A field that snaps into place once and then sits still reads as static —
// a slow, perpetual bob (every shape) plus a very slow continuous spin (on
// roughly a third of them, direction alternated by index) is what actually
// makes it feel alive at rest, not just on entrance or on mouse move.
// Desynced per shape via its own index rather than randomized, so it stays
// deterministic like the rest of the field. This targets the inner
// `.bauhaus-shape` element specifically — the outer `.parallax-el` wrapper
// already owns x/y for the mouse-parallax effect (setupParallax), so idle
// motion lives on a different element to avoid two GSAP instances fighting
// over the same transform property.
function startIdleLoops(shapeEls: HTMLElement[]): gsap.core.Tween[] {
  return shapeEls.flatMap((el, i) => {
    const loops = [
      gsap.to(el, {
        y: 8 + (i % 4) * 3,
        duration: 2.6 + (i % 5) * 0.4,
        delay: (i % 7) * 0.22,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      }),
    ];
    if (i % 3 === 0) {
      loops.push(
        gsap.to(el, {
          rotate: i % 6 === 0 ? "+=360" : "-=360",
          duration: 24 + (i % 5) * 5,
          ease: "none",
          repeat: -1,
        }),
      );
    }
    return loops;
  });
}

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

    // The shapes themselves are `hidden lg:block` (see the className below) -
    // scope the entrance timeline, idle loops, and parallax listener to the
    // same breakpoint with gsap.matchMedia() instead of setting them up
    // unconditionally. `display: none` doesn't stop GSAP from computing
    // transforms on hidden elements, so without this every mobile/tablet
    // visit still paid for the scroll-triggered entrance, the continuous
    // idle-loop tweens, and a mousemove-driven parallax listener for shapes
    // nobody can see. matchMedia also means a resize across the breakpoint
    // (rotating a tablet, resizing a desktop window) is handled for free -
    // GSAP reverts and re-runs the callback itself.
    const mm = gsap.matchMedia();

    mm.add("(min-width: 1024px)", () => {
      const shapeEls = gsap.utils.toArray<HTMLElement>(".bauhaus-shape", root);
      const reduced = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

      const rotateOf = (el: Element) => Number((el as HTMLElement).dataset.rotate ?? 0);

      if (reduced) {
        shapeEls.forEach((el) => gsap.set(el, { opacity: 1, scale: 1, rotate: rotateOf(el) }));
        return;
      }

      gsap.set(shapeEls, { opacity: 0, scale: 0.3, rotate: (i, el) => rotateOf(el) });
      // `once: false` + kill-on-complete instead of `once: true`: identical
      // visible behavior without the refresh-loop self-kill that crashes
      // when several triggers mount on a page already scrolled down (see
      // killTriggerOnComplete in lib/scroll-reveal.ts).
      const tl = gsap.timeline({ scrollTrigger: { trigger: root, start: "top 90%", once: false } });
      tl.to(shapeEls, {
        opacity: 1,
        scale: 1,
        duration: 0.7,
        ease: "back.out(1.8)",
        stagger: { each: 0.03, from: "random" },
      });

      let idleLoops: gsap.core.Tween[] = [];
      tl.eventCallback("onComplete", () => {
        tl.scrollTrigger?.kill();
        idleLoops = startIdleLoops(shapeEls);
      });

      const removeParallax = setupParallax(root, { duration: 0.9, xStrength: 14, yStrength: 10 });

      return () => {
        tl.kill();
        idleLoops.forEach((loop) => loop.kill());
        removeParallax();
      };
    });

    return () => mm.revert();
  }, []);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {SHAPES.map((shape, i) => (
        <div
          key={i}
          className="parallax-el absolute hidden lg:block"
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
      ))}
    </div>
  );
}
