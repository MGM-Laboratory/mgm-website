"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ArrowRight } from "lucide-react";

import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";
import { SITE_HEADER_HEIGHT } from "@/components/site-header";

const FLAIR_KINDS: PatternKind[] = [
  "fans",
  "square",
  "circle",
  "leaves",
  "plus",
  "clover",
  "x",
  "quads",
];
const FLAIR_TONES: PatternTone[] = ["red", "yellow", "blue", "green"];

// Fixed per-flair kind/tone/size — only their flung position, rotation and
// scale randomize per hover (below). Keeping the roster itself static
// avoids picking randomly at render time, which would mismatch between
// server and client.
const FLAIRS = Array.from({ length: 8 }, (_, i) => ({
  kind: FLAIR_KINDS[i % FLAIR_KINDS.length],
  tone: FLAIR_TONES[i % FLAIR_TONES.length],
  size: 22 + ((i * 7) % 5) * 6,
}));

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function SeeWorkButton() {
  const flairRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordARef = useRef<HTMLSpanElement>(null);
  const wordBRef = useRef<HTMLSpanElement>(null);

  function handleEnter() {
    if (reducedMotion()) return;
    gsap.to(wordARef.current, { x: -7, duration: 0.35, ease: "power3.out" });
    gsap.to(wordBRef.current, { x: 7, duration: 0.35, ease: "power3.out" });
    flairRefs.current.forEach((el, i) => {
      if (!el) return;
      gsap.to(el, {
        opacity: 1,
        scale: gsap.utils.random(0.8, 1.3),
        x: gsap.utils.random(-120, 120),
        y: gsap.utils.random(-95, -15),
        rotate: gsap.utils.random(-200, 200),
        duration: gsap.utils.random(0.6, 0.95),
        ease: "back.out(1.7)",
        delay: i * 0.03,
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
    <div className="hero-cta reveal-hidden relative mt-10 inline-flex opacity-0 sm:mt-14">
      {/* Hidden at rest — bursts outward from the button's own footprint
          on hover, retracts on leave. */}
      <div className="pointer-events-none absolute inset-0">
        {FLAIRS.map((f, i) => (
          <div
            key={i}
            ref={(el) => {
              flairRefs.current[i] = el;
            }}
            className="absolute top-1/2 left-1/2 opacity-0"
            style={{
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
        <span className="cta-ring-spin absolute inset-0 rounded-full" aria-hidden />
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
