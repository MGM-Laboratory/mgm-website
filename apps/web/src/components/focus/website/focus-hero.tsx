"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function FocusHero() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = reducedMotion();
    const d = reduced ? 0 : 1;
    gsap
      .timeline({ defaults: { ease: "power3.out" } })
      .fromTo(
        ".hero-reveal",
        { opacity: reduced ? 1 : 0, y: reduced ? 0 : 18 },
        { opacity: 1, y: 0, duration: 0.6 * d, stagger: 0.1 * d },
      );
  }, []);

  return (
    <section className="relative overflow-hidden bg-background px-6 pt-28 pb-16 sm:px-10 sm:pt-36 sm:pb-20 lg:px-16">
      <div ref={rootRef} className="mx-auto max-w-3xl">
        <p className="hero-reveal font-mono text-xs font-semibold tracking-wide text-brand-blue uppercase opacity-0">
          Focus — Website Development
        </p>
        <h1 className="hero-reveal mt-4 font-display text-[clamp(2rem,4.5vw+1rem,3.5rem)] font-semibold tracking-tight text-foreground opacity-0">
          Bring the idea. Every tab&apos;s already open.
        </h1>
        <p className="hero-reveal mt-6 max-w-xl text-foreground/60 opacity-0">
          &quot;We know React&quot; is table stakes. What actually changes how fast something ships
          is everything else — the planning boards, the AI agents, the deploy pipeline, the uptime
          graphs — already running, before you&apos;ve opened your laptop.
        </p>
        <div className="hero-reveal mt-8 flex items-center gap-2.5 text-xs text-foreground/45 opacity-0">
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="size-2 rounded-full bg-brand-red" />
            <span className="size-2 rounded-full bg-brand-yellow" />
            <span className="size-2 rounded-full bg-brand-green" />
          </span>
          <span>same three dots on every window below — this isn&apos;t just decoration</span>
        </div>
      </div>
    </section>
  );
}
