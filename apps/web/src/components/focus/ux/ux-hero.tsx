"use client";

import { useLayoutEffect, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowDown } from "lucide-react";

import { AttentionCanvas } from "./hero/attention-canvas";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function UxHero() {
  const [sectionEl, setSectionEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!sectionEl) return;
    const d = reducedMotion() ? 0 : 1;
    const targets = gsap.utils.toArray<HTMLElement>(".hero-reveal", sectionEl);
    gsap.set(targets, { opacity: 0, y: 28 });
    gsap.to(targets, {
      opacity: 1,
      y: 0,
      duration: 0.8 * d,
      ease: "power3.out",
      stagger: 0.12 * d,
      delay: 0.15 * d,
    });
  }, [sectionEl]);

  useLayoutEffect(() => {
    if (!sectionEl || reducedMotion()) return undefined;
    const targets = gsap.utils.toArray<HTMLElement>(".hero-reveal", sectionEl);
    const tl = gsap.timeline({
      scrollTrigger: { trigger: sectionEl, start: "top top", end: "+=60%", scrub: true },
    });
    tl.to(targets, { opacity: 0.12, y: -24, filter: "blur(3px)", duration: 1 }, 0);
    return () => {
      tl.kill();
    };
  }, [sectionEl]);

  return (
    <section
      ref={setSectionEl}
      className="relative flex min-h-[100dvh] flex-col justify-center overflow-hidden bg-[var(--surface-muted)] px-6 py-24 sm:px-10 lg:px-16"
    >
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        <div className="w-full max-w-xl">
          <p className="hero-reveal font-mono text-xs font-semibold tracking-[0.14em] text-foreground/60 uppercase opacity-0">
            Focus — HCI / UX
          </p>
          <h1 className="hero-reveal mt-4 font-display text-[clamp(2.75rem,6vw,4.75rem)] leading-[0.98] font-semibold tracking-tight text-foreground opacity-0">
            We notice things
            <br />
            you didn&apos;t.
          </h1>
          <p className="hero-reveal mt-6 max-w-xl text-lg text-foreground/70 opacity-0">
            Eye tracking, heart rate, recorded sessions — every interface we ship starts with
            watching a real person use it, not a guess about what they&apos;ll click.
          </p>
          <a
            href="#research"
            className="hero-reveal group mt-9 inline-flex items-center gap-2 text-sm font-medium text-foreground opacity-0"
          >
            <span className="border-b border-foreground/30 pb-0.5 transition-colors group-hover:border-foreground">
              See how we work
            </span>
            <ArrowDown
              className="size-4 transition-transform group-hover:translate-y-0.5"
              strokeWidth={2.25}
            />
          </a>
          <p className="hero-reveal mt-5 text-xs text-foreground/45 opacity-0">
            Move your cursor over the panel on the right. We&apos;re watching.
          </p>
        </div>

        {/* Same split-hero reasoning as the /website Focus page: the visual
            gets its own confined box, never full-bleed behind the copy, so
            nothing collides on a narrow viewport. */}
        <div className="relative hidden h-[26rem] w-full max-w-lg shrink-0 lg:block">
          <AttentionCanvas />
        </div>
      </div>
    </section>
  );
}
