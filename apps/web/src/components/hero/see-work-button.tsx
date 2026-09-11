"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ArrowRight } from "lucide-react";

import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";
import { SITE_HEADER_HEIGHT } from "@/components/site-header";

// Every shape's whole trajectory is hand-tuned and fixed, not randomized.
// Each pops in above the gap in front of the button (a higher z-index than
// it, so the launch is actually visible), follows a real projectile arc —
// one tween with yoyo/repeat so the fall mirrors the rise exactly:
// decelerating up to the peak, accelerating back down — and drops behind
// the button (z-index flipped below it right at the peak) to disappear
// into the gap it came from. `xDrift` throws every shape a little to the
// right — constant horizontal velocity for the whole flight (no easing on
// it, the way real projectile motion doesn't) — with the drift amount
// varied per shape so they land spread across the right side instead of
// stacking on top of each other. `at` staggers the launches: some solo,
// two together as a pair, one closing it out alone.
//
// Kinds are picked deliberately from the ones built from a small number of
// smooth, simple curves (a ring, a cross, a star, corner arcs, a square) —
// the four-petal kinds (leaves/clover/quads) read fine sitting still in a
// tile, but a big one spinning through arbitrary in-between angles looks
// like a broken blob instead of a clean icon, since their petals meet at a
// single cusp point rather than flowing continuously.
//
// Sizes are kept small on purpose — a shape only reads as "tucked away
// behind the button" if it's fully covered by the button's own opaque
// pill once it lands there, so oversized shapes would still peek out at
// the moment the z-index flips behind it.
const FLAIRS: {
  kind: PatternKind;
  tone: PatternTone;
  size: number;
  x: number;
  xDrift: number;
  peakY: number;
  rotate: number;
  scale: number;
  riseDuration: number;
  at: number;
}[] = [
  {
    kind: "fans",
    tone: "red",
    size: 18,
    x: -25,
    xDrift: 40,
    peakY: -80,
    rotate: 220,
    scale: 1.05,
    riseDuration: 0.42,
    at: 0,
  },
  {
    kind: "circle",
    tone: "blue",
    size: 18,
    x: -10,
    xDrift: 35,
    peakY: -100,
    rotate: -200,
    scale: 0.85,
    riseDuration: 0.46,
    at: 0.16,
  },
  {
    kind: "arcs",
    tone: "green",
    size: 20,
    x: 5,
    xDrift: 35,
    peakY: -90,
    rotate: 180,
    scale: 1,
    riseDuration: 0.44,
    at: 0.16,
  },
  {
    kind: "x",
    tone: "yellow",
    size: 15,
    x: 12,
    xDrift: 30,
    peakY: -72,
    rotate: -220,
    scale: 0.85,
    riseDuration: 0.4,
    at: 0.32,
  },
  {
    kind: "square",
    tone: "red",
    size: 17,
    x: -10,
    xDrift: 40,
    peakY: -112,
    rotate: 160,
    scale: 1.1,
    riseDuration: 0.48,
    at: 0.48,
  },
];

// The z-index each shape sits at while airborne (above the button, z-10,
// so the launch out of the gap is visible) vs. once it's falling back
// through the button's own height (below it, so it visibly tucks away
// instead of popping out the other side).
const FLAIR_Z_FRONT = 20;
const FLAIR_Z_BEHIND = 5;

// The button's own side padding never changes — instead of sliding the
// words apart with a transform (which would just push them closer to a
// fixed-width button's edges), the flex gap between them grows, and
// because the button is sized to its content, the pill itself widens to
// match, keeping the padding constant on both sides.
const REST_GAP = 8;
const PEAK_GAP = 34;

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function SeeWorkButton() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const flairRefs = useRef<(HTMLDivElement | null)[]>([]);
  const masterTimeline = useRef<gsap.core.Timeline | null>(null);
  const isAnimating = useRef(false);
  const contentRef = useRef<HTMLSpanElement>(null);
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

    // The gap stays open for the whole show — it only closes once the
    // very last shape has landed back behind the button. Widening the
    // flex gap (rather than sliding the words with a transform) lets the
    // inline-flex button grow to fit it, so the padding on either side
    // never changes.
    const showDuration = Math.max(...FLAIRS.map((f) => f.at + f.riseDuration * 2));
    master
      .to(contentRef.current, { gap: PEAK_GAP, duration: 0.35, ease: "power3.out" }, 0)
      .to(contentRef.current, { gap: REST_GAP, duration: 0.4, ease: "power2.inOut" }, showDuration);

    FLAIRS.forEach((f, i) => {
      const el = flairRefs.current[i];
      if (!el) return;
      const popAt = f.at;
      const peakAt = f.at + f.riseDuration;
      const totalDuration = f.riseDuration * 2;
      master
        .set(el, { opacity: 0, scale: 0, x: f.x, y: 0, rotate: 0, zIndex: FLAIR_Z_FRONT }, popAt)
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
        .to(el, { rotate: f.rotate, duration: totalDuration, ease: "none" }, popAt)
        // Tucks behind the button right at the peak, so it's in front for
        // the whole rise and behind for the whole fall.
        .set(el, { zIndex: FLAIR_Z_BEHIND }, peakAt);

      if (f.xDrift) {
        // Constant velocity, no ease — real projectile motion doesn't
        // accelerate sideways, only vertically (gravity). Spans the whole
        // flight so it lands off to one side instead of straight down.
        master.to(el, { x: f.x + f.xDrift, duration: totalDuration, ease: "none" }, popAt);
      }
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
          right as it opens, then each shape rises in front of the button
          and falls back behind it along its own path, some straight,
          some drifting sideways like an angled throw. */}
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
        <span
          ref={contentRef}
          className="relative m-[3px] inline-flex items-center rounded-full bg-[var(--surface-muted)] px-6 py-3 text-sm font-semibold text-foreground sm:px-7 sm:py-3.5 sm:text-base"
          style={{ gap: REST_GAP }}
        >
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
