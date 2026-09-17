"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { setupParallax } from "@/lib/parallax";
import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";

// A hand-composed field of the site's own Bauhaus shape vocabulary, at the
// density DESIGN_SYSTEM.md's reference posters use and the rest of the site
// deliberately keeps restrained — reserved for this one moment. Every fill
// still comes from the closed four-color palette (no new hue), so boldness
// here is entirely a matter of scale, density, and motion, not color.
type Shape = {
  kind: PatternKind;
  tone: PatternTone;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  size: string;
  depth: number;
  rotate: number;
  hideOnMobile?: boolean;
};

// The hero's headline and two paragraphs run wide (the headline alone spans
// most of the section at its largest clamp size) — every non-anchor shape
// below is deliberately placed in the top strip (<16% from top), the bottom
// strip (<18% from bottom), or the right column (<18% from the right edge),
// the three regions the text column never reaches. The four large anchors
// bleed off the corners instead, which keeps them clear of text regardless.
const SHAPES: Shape[] = [
  // Large anchors — corners, mostly bleeding off-canvas
  {
    kind: "circle",
    tone: "red",
    top: "-8%",
    left: "-6%",
    size: "clamp(9rem,26vw,20rem)",
    depth: 0.5,
    rotate: 0,
  },
  {
    kind: "arcs",
    tone: "blue",
    bottom: "-10%",
    left: "-4%",
    size: "clamp(7rem,20vw,15rem)",
    depth: 0.65,
    rotate: 0,
  },
  {
    kind: "square",
    tone: "yellow",
    top: "10%",
    right: "3%",
    size: "clamp(6rem,15vw,11rem)",
    depth: 0.8,
    rotate: -6,
  },
  {
    kind: "fans",
    tone: "green",
    bottom: "4%",
    right: "-6%",
    size: "clamp(7rem,18vw,13rem)",
    depth: 0.55,
    rotate: 0,
  },
  // Top strip
  {
    kind: "domes",
    tone: "yellow",
    top: "6%",
    left: "58%",
    size: "clamp(3.5rem,7vw,5.5rem)",
    depth: 0.9,
    rotate: 18,
    hideOnMobile: true,
  },
  {
    kind: "leaves",
    tone: "blue",
    top: "4%",
    left: "74%",
    size: "clamp(3rem,6vw,4.5rem)",
    depth: 1,
    rotate: 0,
    hideOnMobile: true,
  },
  // Bottom strip
  {
    kind: "clover",
    tone: "green",
    bottom: "10%",
    left: "38%",
    size: "clamp(3rem,6vw,4.5rem)",
    depth: 0.75,
    rotate: 12,
  },
  {
    kind: "plus",
    tone: "red",
    bottom: "6%",
    left: "58%",
    size: "clamp(1.5rem,3vw,2rem)",
    depth: 1.15,
    rotate: 0,
  },
  {
    kind: "circle",
    tone: "yellow",
    bottom: "12%",
    left: "22%",
    size: "clamp(1.75rem,3.5vw,2.5rem)",
    depth: 1,
    rotate: 0,
    hideOnMobile: true,
  },
  // Right column
  {
    kind: "x",
    tone: "blue",
    top: "24%",
    right: "8%",
    size: "clamp(1.5rem,3vw,2.25rem)",
    depth: 1.2,
    rotate: 0,
    hideOnMobile: true,
  },
  {
    kind: "quads",
    tone: "red",
    top: "56%",
    right: "12%",
    size: "clamp(2.75rem,5.5vw,4rem)",
    depth: 1.1,
    rotate: -10,
    hideOnMobile: true,
  },
  {
    kind: "x",
    tone: "green",
    top: "76%",
    right: "18%",
    size: "clamp(1.5rem,3vw,2rem)",
    depth: 1.3,
    rotate: 0,
    hideOnMobile: true,
  },
];

export function BauhausField() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const shapeEls = gsap.utils.toArray<HTMLElement>(".bauhaus-shape", root);
    const reduced = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

    if (reduced) {
      shapeEls.forEach((el) => {
        gsap.set(el, { opacity: 1, scale: 1, rotate: Number(el.dataset.rotate ?? 0) });
      });
      return;
    }

    gsap.set(shapeEls, { opacity: 0, scale: 0.3 });
    const tl = gsap.timeline({
      scrollTrigger: { trigger: root, start: "top 90%", once: true },
    });
    tl.to(shapeEls, {
      opacity: 1,
      scale: 1,
      rotate: (i, el) => Number((el as HTMLElement).dataset.rotate ?? 0),
      duration: 0.7,
      ease: "back.out(1.8)",
      stagger: { each: 0.045, from: "random" },
    });

    const idleLoops: gsap.core.Animation[] = [];
    tl.eventCallback("onComplete", () => {
      shapeEls.forEach((el, i) => {
        idleLoops.push(
          gsap.to(el, {
            y: `+=${8 + (i % 3) * 4}`,
            duration: 2.4 + (i % 4) * 0.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            delay: i * 0.15,
          }),
        );
      });
    });

    const removeParallax = setupParallax(root, { duration: 0.8, xStrength: 24, yStrength: 16 });

    return () => {
      tl.kill();
      idleLoops.forEach((l) => l.kill());
      removeParallax();
    };
  }, []);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {SHAPES.map((shape, i) => (
        <div
          key={i}
          className={`parallax-el absolute ${shape.hideOnMobile ? "hidden sm:block" : ""}`}
          data-depth={shape.depth}
          style={{ top: shape.top, left: shape.left, right: shape.right, bottom: shape.bottom }}
        >
          <div
            className="bauhaus-shape opacity-0"
            data-rotate={shape.rotate}
            style={{ width: shape.size, height: shape.size }}
          >
            <FlairShape kind={shape.kind} tone={shape.tone} className="h-full w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
