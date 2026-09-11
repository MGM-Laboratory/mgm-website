"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ArrowRight } from "lucide-react";

import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";
import { SITE_HEADER_HEIGHT } from "@/components/site-header";

// Every shape's whole trajectory is hand-tuned and fixed, not randomized.
// Each one pops in at the gap and travels straight up its own narrow lane
// then straight back down it — a real projectile arc (one tween with
// yoyo/repeat, so the fall is the exact mirror of the rise: decelerating
// up to the peak, accelerating back down), never drifting sideways. It
// lands back exactly where it started, under the button's own solid
// background (a higher z-index), which is what hides it — no fade, no
// snapping sideways to get there. `at` staggers them: some launch solo,
// two launch together as a pair, one closes it out alone.
const FLAIRS: {
  kind: PatternKind;
  tone: PatternTone;
  size: number;
  x: number;
  peakY: number;
  rotate: number;
  scale: number;
  riseDuration: number;
  at: number;
}[] = [
  {
    kind: "fans",
    tone: "red",
    size: 26,
    x: -32,
    peakY: -80,
    rotate: 260,
    scale: 1.05,
    riseDuration: 0.42,
    at: 0,
  },
  {
    kind: "circle",
    tone: "blue",
    size: 28,
    x: -12,
    peakY: -100,
    rotate: -220,
    scale: 0.8,
    riseDuration: 0.46,
    at: 0.16,
  },
  {
    kind: "leaves",
    tone: "green",
    size: 32,
    x: 14,
    peakY: -90,
    rotate: 200,
    scale: 1,
    riseDuration: 0.44,
    at: 0.16,
  },
  {
    kind: "x",
    tone: "yellow",
    size: 22,
    x: 34,
    peakY: -70,
    rotate: -260,
    scale: 0.85,
    riseDuration: 0.4,
    at: 0.32,
  },
  {
    kind: "clover",
    tone: "red",
    size: 26,
    x: 0,
    peakY: -110,
    rotate: 180,
    scale: 1.15,
    riseDuration: 0.48,
    at: 0.48,
  },
];

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function SeeWorkButton() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const flairRefs = useRef<(HTMLDivElement | null)[]>([]);
  const masterTimeline = useRef<gsap.core.Timeline | null>(null);
  const isAnimating = useRef(false);
  const wordARef = useRef<HTMLSpanElement>(null);
  const wordBRef = useRef<HTMLSpanElement>(null);

  function handleEnter() {
    if (reducedMotion()) return;
    // Ignore hovers while a cycle is already running — it plays out fully
    // regardless of the pointer leaving and re-entering in the meantime.
    if (isAnimating.current) return;

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

    isAnimating.current = true;
    const master = gsap.timeline({
      onComplete: () => {
        isAnimating.current = false;
      },
    });

    // The words pull apart to open the gap, then close back over it — a
    // single timeline so the "close" tween can't overwrite the "open" one
    // before it ever plays.
    master
      .to(a, { x: -20, duration: 0.35, ease: "power3.out" }, 0)
      .to(b, { x: 20, duration: 0.35, ease: "power3.out" }, 0)
      .to(a, { x: 0, duration: 0.4, ease: "power2.inOut" }, 0.35)
      .to(b, { x: 0, duration: 0.4, ease: "power2.inOut" }, 0.35);

    FLAIRS.forEach((f, i) => {
      const el = flairRefs.current[i];
      if (!el) return;
      const popAt = f.at;
      const totalDuration = f.riseDuration * 2;
      master
        .set(el, { opacity: 0, scale: 0, x: f.x, y: 0, rotate: 0 }, popAt)
        .to(el, { opacity: 1, scale: f.scale, duration: 0.16, ease: "back.out(2)" }, popAt)
        // One tween, mirrored by yoyo — the fall is the rise played
        // backwards, so decelerating up becomes accelerating down for
        // free, with no seam between two separately-eased tweens.
        .to(
          el,
          { y: f.peakY, duration: f.riseDuration, ease: "power2.out", yoyo: true, repeat: 1 },
          popAt,
        )
        // A steady, continuous tumble — unrelated to gravity, so it
        // doesn't need to ease at all — spanning the full up-and-down trip.
        .to(el, { rotate: f.rotate, duration: totalDuration, ease: "none" }, popAt);
    });

    masterTimeline.current = master;
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
          right as it opens, then each shape rises and falls straight back
          down its own lane, disappearing behind the button (z-index)
          rather than fading out. */}
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
