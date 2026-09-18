"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowDown } from "lucide-react";

import { BootSequence } from "./hero/boot-sequence";
import { GameHeroVisual } from "./hero/game-hero-visual";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function GameHero() {
  const [sectionEl, setSectionEl] = useState<HTMLElement | null>(null);
  // `null` = not yet determined (server render can't touch `window`, so this
  // can't be resolved in a lazy initializer the way `hero-lanyard.tsx` does
  // for a plain boolean). Reduced motion skips the boot beat entirely — it's
  // a decorative loop's one-shot cousin, and there's no real loading behind
  // it to preserve — so the boot overlay only ever mounts once motion is
  // positively confirmed, never speculatively.
  const [booting, setBooting] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    // Deferred a tick so this doesn't setState synchronously inside the
    // effect body (react-hooks/set-state-in-effect) — still resolves before
    // the next paint either way.
    queueMicrotask(() => setBooting(!reducedMotion()));
  }, []);

  const handleBootComplete = useCallback(() => setBooting(false), []);

  useLayoutEffect(() => {
    if (!sectionEl || booting !== false) return;
    const d = reducedMotion() ? 0 : 1;
    const targets = gsap.utils.toArray<HTMLElement>(".hero-reveal", sectionEl);
    gsap.set(targets, { opacity: 0, y: 28 });
    gsap.to(targets, {
      opacity: 1,
      y: 0,
      duration: 0.8 * d,
      ease: "power3.out",
      stagger: 0.12 * d,
    });
  }, [sectionEl, booting]);

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
      {booting === true ? <BootSequence onComplete={handleBootComplete} /> : null}

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        <div className="w-full max-w-xl">
          <p className="hero-reveal font-mono text-xs font-semibold tracking-[0.14em] text-brand-green uppercase opacity-0">
            Focus — Game &amp; New Media
          </p>
          <h1 className="hero-reveal mt-4 font-display text-[clamp(2.75rem,6vw,4.75rem)] leading-[0.98] font-semibold tracking-tight text-foreground opacity-0">
            Press start.
            <br />
            Build another world.
          </h1>
          <p className="hero-reveal mt-6 max-w-xl text-lg text-foreground/70 opacity-0">
            Games, XR, and everything in between — VR, AR, MR, every engine, every console we could
            get our hands on, and a studio built to actually ship the thing you prototyped.
          </p>
          <a
            href="#platforms"
            className="hero-reveal group mt-9 inline-flex items-center gap-2 text-sm font-medium text-foreground opacity-0"
          >
            <span className="border-b border-foreground/30 pb-0.5 transition-colors group-hover:border-foreground">
              See the setup
            </span>
            <ArrowDown
              className="size-4 transition-transform group-hover:translate-y-0.5"
              strokeWidth={2.25}
            />
          </a>
        </div>

        {/* Desktop-only, same reasoning as the homepage lanyard and the
            /website hero cluster: no room to avoid colliding with the copy
            on a narrow viewport. */}
        <div className="relative hidden h-[26rem] w-full max-w-lg shrink-0 lg:block">
          <GameHeroVisual sectionEl={sectionEl} />
        </div>
      </div>
    </section>
  );
}
