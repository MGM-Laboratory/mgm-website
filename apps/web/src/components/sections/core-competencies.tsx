"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { COMPETENCIES, type CompetencyColor } from "@/data/competencies";
import { CompetencyCardShape, CompetencyMotifShape } from "./competency-motif";

// Blue, red, and green match the shared brand tokens exactly, but this
// card's yellow is a one-off, more saturated shade the reference design
// uses only here — not the site-wide --brand-yellow used everywhere else
// (mosaic tiles, hero shapes, the CTA ring), so it's kept local to this
// card instead of overwriting that shared value.
const CARD_BG: Record<CompetencyColor, string> = {
  blue: "bg-brand-blue",
  red: "bg-brand-red",
  yellow: "bg-[#FFBC00]",
  green: "bg-brand-green",
};

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function CoreCompetenciesSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const frontMotifRefs = useRef<(HTMLDivElement | null)[]>([]);
  const backRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hoverTimelines = useRef<(gsap.core.Timeline | null)[]>([]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.12 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  // Each card gets its own paused timeline (built once) driving the flip,
  // the lift, the front motif's exit spin, and the back content's staggered
  // entrance together — played forward on hover/focus, reversed on
  // leave/blur, so it reads as one continuous physical motion rather than
  // two separate transitions. Under reduced motion the same timeline still
  // runs (so the back content stays reachable), just with every duration
  // collapsed to an instant swap.
  useLayoutEffect(() => {
    const reduced = reducedMotion();
    const idleLoops: gsap.core.Animation[] = [];

    COMPETENCIES.forEach((_, i) => {
      const link = linkRefs.current[i];
      const inner = innerRefs.current[i];
      const frontMotif = frontMotifRefs.current[i];
      const back = backRefs.current[i];
      if (!link || !inner || !frontMotif || !back) return;

      const d = reduced ? 0 : 1;
      const tl = gsap.timeline({ paused: true, defaults: { overwrite: "auto" } });
      tl.to(link, { y: -10, boxShadow: "0 24px 48px -20px rgba(0,0,0,0.35)", duration: 0.4 * d }, 0)
        .to(inner, { rotationY: 180, duration: 0.7 * d, ease: "back.out(1.5)" }, 0)
        // Scale only, no rotate — this shape is clipped by the card's own
        // edge on purpose (its ring's gap, the X's cut corners), so
        // rotating it would swing that cut to an arbitrary, broken-looking
        // spot mid-hover instead of staying anchored to the card.
        .to(frontMotif, { scale: 1.06, duration: 0.7 * d, ease: "power2.out" }, 0)
        .fromTo(
          back,
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.4 * d, ease: "back.out(2)" },
          reduced ? 0 : 0.32,
        );
      hoverTimelines.current[i] = tl;

      if (!reduced) {
        idleLoops.push(
          gsap.to(frontMotif, {
            scale: 1.02,
            duration: 2.6,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            delay: i * 0.25,
          }),
        );
      }
    });

    return () => {
      hoverTimelines.current.forEach((tl) => tl?.kill());
      hoverTimelines.current = [];
      idleLoops.forEach((loop) => loop.kill());
    };
  }, []);

  function play(i: number) {
    hoverTimelines.current[i]?.play();
  }

  function reverse(i: number) {
    hoverTimelines.current[i]?.reverse();
  }

  return (
    <section ref={rootRef} className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
          Core Competencies
        </h2>
        <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">
          Where MGM Laboratory concentrates its work — research, design, and engineering under one
          roof.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-7 sm:grid-cols-4">
          {COMPETENCIES.map((c, i) => (
            <Link
              key={c.title}
              href={c.href}
              ref={(el) => {
                linkRefs.current[i] = el;
              }}
              onMouseEnter={() => play(i)}
              onMouseLeave={() => reverse(i)}
              onFocus={() => play(i)}
              onBlur={() => reverse(i)}
              className="reveal-card group relative block aspect-[279/472] rounded-3xl opacity-0 [perspective:1400px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
              style={{ boxShadow: "0 0 0 0 rgba(0,0,0,0)" }}
            >
              <div
                ref={(el) => {
                  innerRefs.current[i] = el;
                }}
                className="relative h-full w-full rounded-3xl [transform-style:preserve-3d]"
              >
                {/* Front */}
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col justify-between overflow-hidden rounded-3xl p-6 [backface-visibility:hidden]",
                    CARD_BG[c.color],
                  )}
                >
                  <h3 className="relative z-10 text-lg font-semibold text-white">{c.title}</h3>
                  <div
                    ref={(el) => {
                      frontMotifRefs.current[i] = el;
                    }}
                    className="pointer-events-none absolute inset-0"
                  >
                    <CompetencyCardShape motif={c.motif} className="h-full w-full" />
                  </div>
                </div>

                {/* Back */}
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col justify-between overflow-hidden rounded-3xl p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]",
                    CARD_BG[c.color],
                  )}
                >
                  <CompetencyMotifShape
                    motif={c.motif}
                    stroke="rgba(255,255,255,0.16)"
                    className="-top-6 -left-6 size-28 rotate-12"
                  />
                  <div
                    ref={(el) => {
                      backRefs.current[i] = el;
                    }}
                    className="relative z-10 opacity-0"
                  >
                    <h3 className="text-lg font-semibold text-white">{c.title}</h3>
                    <p className="mt-2 text-sm text-white/80">{c.description}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-white/30">
                      Explore
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
