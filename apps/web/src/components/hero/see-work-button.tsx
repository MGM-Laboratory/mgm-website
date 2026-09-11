"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ArrowRight } from "lucide-react";

import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";
import { SITE_HEADER_HEIGHT } from "@/components/site-header";

// Every shape's whole trajectory is hand-tuned and fixed, not randomized —
// matched frame-by-frame against a recording of gsap.com's own "Get GSAP"
// button: shapes pop in at the gap in a narrow column (not a wide burst),
// rise fast then decelerate like they're fighting gravity, and fade out on
// their own near the top of that rise — the whole thing plays out once and
// finishes regardless of whether the pointer is still hovering. `at`
// staggers them into the same rhythm as that reference: some launch solo,
// two launch together as a pair, one closes it out alone.
const FLAIRS: {
  kind: PatternKind;
  tone: PatternTone;
  size: number;
  x: number;
  y: number;
  rotate: number;
  scale: number;
  duration: number;
  fadeDuration: number;
  at: number;
}[] = [
  {
    kind: "fans",
    tone: "red",
    size: 26,
    x: -25,
    y: -190,
    rotate: -160,
    scale: 1.05,
    duration: 0.9,
    fadeDuration: 0.35,
    at: 0,
  },
  {
    kind: "circle",
    tone: "blue",
    size: 28,
    x: 12,
    y: -230,
    rotate: 120,
    scale: 0.8,
    duration: 0.85,
    fadeDuration: 0.3,
    at: 0.16,
  },
  {
    kind: "leaves",
    tone: "green",
    size: 32,
    x: -18,
    y: -212,
    rotate: -80,
    scale: 1,
    duration: 0.95,
    fadeDuration: 0.35,
    at: 0.16,
  },
  {
    kind: "x",
    tone: "yellow",
    size: 22,
    x: 32,
    y: -172,
    rotate: 200,
    scale: 0.85,
    duration: 0.8,
    fadeDuration: 0.3,
    at: 0.32,
  },
  {
    kind: "clover",
    tone: "red",
    size: 26,
    x: -6,
    y: -248,
    rotate: 50,
    scale: 1.15,
    duration: 1,
    fadeDuration: 0.4,
    at: 0.48,
  },
];

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function SeeWorkButton() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const flairRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flairTimelines = useRef<(gsap.core.Timeline | null)[]>([]);
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

    // A quick pulse, not a hover-held state — it spreads and snaps back on
    // its own, the same way the reference's "Get"/"GSAP" words do.
    gsap.to(a, { x: -20, duration: 0.35, ease: "power3.out", overwrite: true });
    gsap.to(b, { x: 20, duration: 0.35, ease: "power3.out", overwrite: true });
    gsap.to(a, { x: 0, duration: 0.4, ease: "power2.inOut", delay: 0.35, overwrite: true });
    gsap.to(b, { x: 0, duration: 0.4, ease: "power2.inOut", delay: 0.35, overwrite: true });

    FLAIRS.forEach((f, i) => {
      const el = flairRefs.current[i];
      if (!el) return;

      // A one-shot sequence per shape: pop in at the gap, rise while
      // decelerating (gravity), fade out before the rise finishes. Killed
      // and rebuilt fresh on every hover so re-entering mid-flight resets
      // cleanly instead of fighting the previous run.
      flairTimelines.current[i]?.kill();
      const tl = gsap.timeline({ delay: f.at });
      tl.set(el, { opacity: 0, scale: 0, x: 0, y: 0, rotate: 0 })
        .to(el, { opacity: 1, scale: f.scale, duration: 0.16, ease: "back.out(2)" }, 0)
        .to(el, { x: f.x, y: f.y, rotate: f.rotate, duration: f.duration, ease: "power2.out" }, 0)
        .to(
          el,
          { opacity: 0, duration: f.fadeDuration, ease: "power1.in" },
          Math.max(f.duration - f.fadeDuration, 0),
        );
      flairTimelines.current[i] = tl;
    });
  }

  function handleLeave() {
    // The flair shapes are a fire-and-forget sequence (see handleEnter) —
    // they finish and fade on their own, so only the word pulse needs a
    // safety reset here in case the pointer leaves mid-pulse.
    gsap.to([wordARef.current, wordBRef.current], {
      x: 0,
      duration: 0.3,
      ease: "power2.out",
      overwrite: true,
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
          right as it opens, then each shape rises and fades along its own
          fixed path from there. */}
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
