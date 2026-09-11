"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ArrowRight } from "lucide-react";

import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";
import { SITE_HEADER_HEIGHT } from "@/components/site-header";

// Every shape's whole trajectory is hand-tuned and fixed, not randomized —
// the burst plays out identically every hover, the way gsap.com's own
// "Get GSAP" button flair does. `at` staggers them into the same rhythm as
// that reference: some launch solo, two launch together as a pair, one
// closes it out alone.
const FLAIRS: {
  kind: PatternKind;
  tone: PatternTone;
  size: number;
  x: number;
  y: number;
  rotate: number;
  scale: number;
  duration: number;
  at: number;
}[] = [
  {
    kind: "fans",
    tone: "red",
    size: 26,
    x: -85,
    y: -60,
    rotate: -160,
    scale: 1.05,
    duration: 0.7,
    at: 0,
  },
  {
    kind: "circle",
    tone: "blue",
    size: 30,
    x: -18,
    y: -108,
    rotate: 120,
    scale: 0.8,
    duration: 0.65,
    at: 0.14,
  },
  {
    kind: "leaves",
    tone: "green",
    size: 34,
    x: 48,
    y: -88,
    rotate: -80,
    scale: 1,
    duration: 0.75,
    at: 0.14,
  },
  {
    kind: "x",
    tone: "yellow",
    size: 22,
    x: 102,
    y: -38,
    rotate: 200,
    scale: 0.85,
    duration: 0.6,
    at: 0.27,
  },
  {
    kind: "clover",
    tone: "red",
    size: 28,
    x: 14,
    y: -132,
    rotate: 50,
    scale: 1.15,
    duration: 0.8,
    at: 0.4,
  },
];

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function SeeWorkButton() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const flairRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordARef = useRef<HTMLSpanElement>(null);
  const wordBRef = useRef<HTMLSpanElement>(null);

  function handleEnter() {
    if (reducedMotion()) return;
    const wrap = wrapRef.current;
    const a = wordARef.current;
    const b = wordBRef.current;
    if (!wrap || !a || !b) return;

    // Measured before the words move — the widening gap between them is
    // where the shapes launch from, as if it's flinging them out.
    const wrapRect = wrap.getBoundingClientRect();
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    const originX = (aRect.right + bRect.left) / 2 - wrapRect.left;
    const originY = (aRect.top + aRect.bottom) / 2 - wrapRect.top;
    gsap.set(
      flairRefs.current.filter((el): el is HTMLDivElement => !!el),
      { left: originX, top: originY },
    );

    gsap.to(a, { x: -20, duration: 0.4, ease: "power3.out", overwrite: true });
    gsap.to(b, { x: 20, duration: 0.4, ease: "power3.out", overwrite: true });

    FLAIRS.forEach((f, i) => {
      const el = flairRefs.current[i];
      if (!el) return;
      gsap.to(el, {
        opacity: 1,
        scale: f.scale,
        x: f.x,
        y: f.y,
        rotate: f.rotate,
        duration: f.duration,
        ease: "back.out(1.7)",
        delay: f.at,
        overwrite: true,
      });
    });
  }

  function handleLeave() {
    gsap.to([wordARef.current, wordBRef.current], {
      x: 0,
      duration: 0.3,
      ease: "power2.out",
      overwrite: true,
    });
    flairRefs.current.forEach((el) => {
      if (!el) return;
      gsap.to(el, { opacity: 0, scale: 0, duration: 0.3, ease: "power2.in", overwrite: true });
    });
  }

  function handleClick() {
    const target = document.getElementById("projects");
    if (!target) return;
    const smoother = ScrollSmoother.get();
    if (smoother) smoother.scrollTo(target, true, `top ${SITE_HEADER_HEIGHT}px`);
    else target.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div
      ref={wrapRef}
      className="hero-cta reveal-hidden relative mt-10 inline-flex opacity-0 sm:mt-14"
    >
      {/* Hidden at rest — repositioned onto the gap between the two words
          right as it opens, then bursts outward along each shape's own
          fixed path from there, retracting together on leave. */}
      <div className="pointer-events-none absolute inset-0">
        {FLAIRS.map((f, i) => (
          <div
            key={i}
            ref={(el) => {
              flairRefs.current[i] = el;
            }}
            className="absolute opacity-0"
            style={{
              left: 0,
              top: 0,
              width: f.size,
              height: f.size,
              marginLeft: -f.size / 2,
              marginTop: -f.size / 2,
            }}
          >
            <FlairShape kind={f.kind} tone={f.tone} className="h-full w-full" />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="relative z-10 inline-flex rounded-full transition-transform duration-300 hover:scale-[1.03]"
      >
        {/* Same smooth flow rendered twice, one half-cycle out of phase
            between the top and bottom half of the ring, so they read as
            unsynced without distorting the animation itself. */}
        <span className="cta-ring-spin cta-ring-spin--top" aria-hidden />
        <span className="cta-ring-spin cta-ring-spin--bottom" aria-hidden />
        <span className="relative m-[3px] inline-flex items-center gap-2 rounded-full bg-[var(--surface-muted)] px-6 py-3 text-sm font-semibold text-foreground sm:px-7 sm:py-3.5 sm:text-base">
          <span ref={wordARef} className="inline-block">
            See
          </span>
          <span ref={wordBRef} className="inline-flex items-center gap-1.5">
            our work
            <ArrowRight className="size-4" strokeWidth={2.25} />
          </span>
        </span>
      </button>
    </div>
  );
}
