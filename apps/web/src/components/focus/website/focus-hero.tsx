"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { LoaderBars } from "./hero/loader-bars";
import type { SphereHeroSceneProps } from "./hero/sphere-hero-scene";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const SphereHeroScene = dynamic<SphereHeroSceneProps>(() => import("./hero/sphere-hero-scene"), {
  ssr: false,
});

function subscribeNoop() {
  return () => {};
}

// Avoids a hydration mismatch the same way theme-toggle.tsx does — the
// server always renders the "not ready yet" branch.
function useMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// The reference hero holds its loading state for a beat before cutting to
// the full scene — long enough to register, even though nothing here is
// actually being waited on (see loader-bars.tsx).
const ENTRANCE_DELAY_MS = 950;

export function FocusHero() {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  // A state-backed callback ref rather than a plain ref: the scene needs the
  // section element as a prop, and reading `ref.current` straight in JSX
  // during render isn't allowed — this re-renders once the node exists instead.
  const [sectionEl, setSectionEl] = useState<HTMLElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const [showLoader, setShowLoader] = useState(true);
  const [play, setPlay] = useState(false);
  const [reduced, setReduced] = useState(false);

  useLayoutEffect(() => {
    const isReduced = reducedMotion();

    if (isReduced) {
      gsap.set([headlineRef.current, footRef.current], { opacity: 1, clipPath: "none" });
      queueMicrotask(() => {
        setReduced(true);
        setShowLoader(false);
        setPlay(true);
      });
      return;
    }

    gsap.set(headlineRef.current, { opacity: 0.12, clipPath: "inset(0 100% 0 0)" });
    gsap.set(footRef.current, { opacity: 0, y: 16 });

    const timer = window.setTimeout(() => {
      setShowLoader(false);
      setPlay(true);
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .to(headlineRef.current, { opacity: 1, clipPath: "inset(0 0% 0 0)", duration: 0.55 })
        .to(footRef.current, { opacity: 1, y: 0, duration: 0.5 }, "-=0.25");
    }, ENTRANCE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  // Exit half that lives in the DOM: dims the headline/foot block back down
  // as the section scrolls past, mirroring the sphere field's own shrink-away
  // (sphere-hero-scene.tsx) against the same trigger and range.
  useLayoutEffect(() => {
    if (!sectionEl || reduced) return undefined;

    const tl = gsap.timeline({
      scrollTrigger: { trigger: sectionEl, start: "top top", end: "+=55%", scrub: true },
    });
    tl.to([headlineRef.current, footRef.current], {
      opacity: 0.1,
      filter: "brightness(0.4)",
      ease: "power1.in",
    });
    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, [sectionEl, reduced]);

  const dark = mounted ? resolvedTheme === "dark" : true;

  return (
    <section
      ref={setSectionEl}
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background px-6"
    >
      {mounted && (
        <SphereHeroScene sectionEl={sectionEl} play={play} reducedMotion={reduced} dark={dark} />
      )}

      {showLoader && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <LoaderBars />
        </div>
      )}

      <div className="relative z-10 w-full max-w-[1600px]">
        <h1
          ref={headlineRef}
          className="pointer-events-none text-center font-display font-semibold tracking-tight text-foreground uppercase opacity-0 [text-wrap:balance] text-[clamp(3.5rem,14vw,11rem)] leading-[0.92]"
        >
          Website
        </h1>

        <div
          ref={footRef}
          className="relative z-10 mx-auto mt-8 flex max-w-3xl flex-col items-center gap-6 text-center opacity-0 sm:mt-12 sm:flex-row sm:items-end sm:justify-between sm:text-left"
        >
          <div className="max-w-md">
            <p className="font-mono text-xs font-semibold tracking-wide text-brand-blue uppercase">
              Focus — Website Development
            </p>
            <p className="mt-3 text-foreground/60">
              &quot;We know React&quot; is table stakes. What actually changes how fast something
              ships is everything else — already running, before you&apos;ve opened your laptop.
            </p>
          </div>

          <Link
            href="#stack"
            className="group inline-flex shrink-0 items-center gap-2.5 rounded-full bg-brand-blue px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-blue/90"
          >
            Scroll to see the stack
            <span aria-hidden="true" className="transition-transform group-hover:translate-y-0.5">
              ↓
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
