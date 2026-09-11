"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ArrowRight } from "lucide-react";

import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";
import { SITE_HEADER_HEIGHT } from "@/components/site-header";

const FLAIR_KINDS: PatternKind[] = ["fans", "circle", "leaves", "x", "clover"];
const FLAIR_TONES: PatternTone[] = ["red", "blue", "green", "yellow", "red"];

// Fixed per-flair kind/tone/size — only their flung position, rotation and
// scale randomize per hover (below). Keeping the roster itself static
// avoids picking randomly at render time, which would mismatch between
// server and client.
const FLAIRS = Array.from({ length: 5 }, (_, i) => ({
  kind: FLAIR_KINDS[i % FLAIR_KINDS.length],
  tone: FLAIR_TONES[i % FLAIR_TONES.length],
  size: 22 + ((i * 7) % 5) * 6,
}));

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
    const flairs = flairRefs.current.filter((el): el is HTMLDivElement => !!el);
    if (!wrap || !a || !b || !flairs.length) return;

    // Measured before the words move — the widening gap between them is
    // where the shapes launch from, as if it's flinging them out.
    const wrapRect = wrap.getBoundingClientRect();
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    const originX = (aRect.right + bRect.left) / 2 - wrapRect.left;
    const originY = (aRect.top + aRect.bottom) / 2 - wrapRect.top;
    gsap.set(flairs, { left: originX, top: originY });

    gsap.to(a, { x: -20, duration: 0.4, ease: "power3.out" });
    gsap.to(b, { x: 20, duration: 0.4, ease: "power3.out" });

    flairs.forEach((el) => {
      gsap.to(el, {
        opacity: 1,
        scale: gsap.utils.random(0.8, 1.3),
        x: gsap.utils.random(-120, 120),
        y: gsap.utils.random(-95, -15),
        rotate: gsap.utils.random(-200, 200),
        duration: gsap.utils.random(0.6, 0.95),
        ease: "back.out(1.7)",
        delay: gsap.utils.random(0, 0.22),
        overwrite: true,
      });
    });
  }

  function handleLeave() {
    gsap.to([wordARef.current, wordBRef.current], { x: 0, duration: 0.3, ease: "power2.out" });
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
          right as it opens, then bursts outward from there, retracting on
          leave. */}
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
