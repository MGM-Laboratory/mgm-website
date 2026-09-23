"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

import { hasAppAlreadyBooted } from "@/lib/app-boot";
import { waitForRouteReveal } from "@/lib/route-reveal";

if (typeof window !== "undefined") {
  gsap.registerPlugin(DrawSVGPlugin);
}

// SSR runs useEffect; the browser prefers useLayoutEffect so the reveal
// timeline is wired up before first paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const HERO_TITLE = "PROJECT";

/**
 * The lusion-style list hero: a huge "PROJECT" headline whose characters
 * rise into view one by one behind a mask, the total project count sliding
 * up beside it while counting from 0, and the corner arrow drawing itself
 * in last.
 *
 * The entrance must be SEEN, so it never plays behind the page-transition
 * curtain: a fresh page load plays it immediately, while internal navigation
 * waits for the curtain's reveal to finish (waitForRouteReveal) before
 * starting. Only reduced motion jumps straight to the end state.
 */
export function ProjectsHero({ count }: { count: number }) {
  const rootRef = useRef<HTMLElement>(null);

  // Captured synchronously during render, not read inside the layout
  // effect: by the time the effect runs, the root layout's boot tracker
  // has already marked the app booted, which would make this always read
  // as "internal navigation". Same pattern as the homepage hero.
  const skipEntranceForInternalNavRef = useRef<boolean | null>(null);
  if (skipEntranceForInternalNavRef.current === null) {
    skipEntranceForInternalNavRef.current = hasAppAlreadyBooted();
  }

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const q = gsap.utils.selector(root);
    const chars = q(".projects-hero-char");
    const numberWrap = q(".projects-hero-number");
    const numberText = q(".projects-hero-number-text")[0];
    const arrow = q(".projects-hero-arrow");
    const arrowPath = q(".projects-hero-arrow-path");

    const reduced = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (reduced) {
      gsap.set(chars, { yPercent: 0, opacity: 1 });
      gsap.set(numberWrap, { yPercent: 0, opacity: 1 });
      gsap.set(arrow, { opacity: 1 });
      gsap.set(arrowPath, { drawSVG: "100%" });
      if (numberText) numberText.textContent = String(count);
      return;
    }

    // Hide the pre-hydration state right away so nothing peeks through the
    // curtain while an internal navigation's reveal is still playing.
    gsap.set(chars, { yPercent: 100, opacity: 0 });
    gsap.set(numberWrap, { yPercent: 110, opacity: 0 });
    gsap.set(arrow, { opacity: 0 });
    gsap.set(arrowPath, { drawSVG: "0%" });

    let cancelled = false;
    let tl: gsap.core.Timeline | null = null;

    const play = () => {
      if (cancelled) return;

      tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // The counter object is tweened as part of the timeline (not in a
      // separate tween) so killing the timeline also stops the count.
      const counter = { value: 0 };

      tl.fromTo(
        chars,
        { yPercent: 100, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.85, stagger: 0.06 },
        0.1,
      )
        // The count slides up from behind its own mask, then counts from 0.
        .fromTo(
          numberWrap,
          { yPercent: 110, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 0.65 },
          0.4,
        )
        .to(
          counter,
          {
            value: count,
            duration: 1.1,
            ease: "power2.out",
            onUpdate: () => {
              if (numberText) numberText.textContent = String(Math.round(counter.value));
            },
          },
          0.5,
        )
        // The corner arrow fades in and draws itself from the top-left corner.
        .fromTo(arrow, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.95)
        .fromTo(
          arrowPath,
          { drawSVG: "0%" },
          { drawSVG: "100%", duration: 0.75, ease: "power2.inOut" },
          0.95,
        );
    };

    if (skipEntranceForInternalNavRef.current === true) {
      // Arrived behind the transition curtain: play once it has fully
      // revealed the page, so the entrance is actually visible.
      waitForRouteReveal().then(play);
    } else {
      // Fresh page load (hard reload resets the boot tracker): play now.
      play();
    }

    return () => {
      cancelled = true;
      tl?.kill();
    };
  }, [count]);

  return (
    <section ref={rootRef} className="relative pt-[4em] pb-[clamp(2.5rem,7vh,5rem)] md:pt-[12vh]">
      <div className="relative">
        <h1
          className="overflow-hidden font-display text-[17vw] leading-[1.15em] font-medium tracking-[0.05em] text-[#0e1116] dark:text-white"
          aria-label="Projects"
        >
          {HERO_TITLE.split("").map((char, index) => (
            <span
              aria-hidden="true"
              className="projects-hero-char inline-block will-change-transform"
              key={index}
            >
              {char}
            </span>
          ))}
        </h1>

        <span className="projects-hero-number absolute top-0 right-0 overflow-hidden font-mono text-[clamp(0.875rem,4vw,4rem)] leading-none font-medium text-[#0e1116] dark:text-white">
          <span className="projects-hero-number-text inline-block tabular-nums">{count}</span>
        </span>

        <svg
          aria-hidden="true"
          className="projects-hero-arrow absolute bottom-0 right-0 size-[clamp(1.5rem,4vw,4rem)] text-[#0e1116] dark:text-white"
          viewBox="0 0 38 38"
          fill="none"
        >
          <path
            className="projects-hero-arrow-path"
            d="m2 2 34 34m0 0V6.046M36 36H6.046"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </div>
    </section>
  );
}
