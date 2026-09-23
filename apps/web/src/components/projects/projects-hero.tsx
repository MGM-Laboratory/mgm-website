"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

import { hasAppAlreadyBooted } from "@/lib/app-boot";
import { scrollPageTo } from "@/lib/page-scroll";
import { beginProjectsIntro, finishProjectsIntro } from "@/lib/projects-intro";
import { waitForRouteReveal } from "@/lib/route-reveal";
import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";

if (typeof window !== "undefined") {
  gsap.registerPlugin(DrawSVGPlugin);
}

// SSR runs useEffect; the browser prefers useLayoutEffect so the reveal
// timeline is wired up before first paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const HERO_TITLE = "PROJECT";

const INTRO_LOCK_OWNER = "projects-intro";
// The display-font wait never holds the entrance longer than this.
const FONT_WAIT_MS = 1500;
// The intro lets go of the page no matter what after the curtain's 8 s
// ceiling, the font wait and the entrance itself have all had their time:
// a list gated on a signal that never fires is a page-high blank.
const INTRO_FAILSAFE_MS = 13000;

// Ink alignment, in pure CSS so the server HTML is already right. The
// title's font size is 17vw; Hanken Grotesk's ascent is 1.000em, descent
// 0.303em and flat cap height 0.697em, so with a 1.15em line box the cap
// top sits (1.15 - 1.303) / 2 + (1 - 0.697) = 0.2265em below the box top
// and the baseline the same distance above its bottom.
const TITLE_CAP_INSET = "3.8505vw"; // 17vw * 0.2265
// Geist Mono 500 at line-height 1: ascent 1.005em, descent 0.295em, flat
// digit tops (1, 4, 5, 7) 0.710em, so a flat digit's ink starts 0.145em
// below the line box top. Round digits overshoot that by 0.016em, exactly
// as the O and C overshoot the title's cap line.
const COUNT_DIGIT_TOP_EM = 0.145;
// Geist Mono 500 right side bearing per digit (0.6em advance minus ink):
// the last digit decides how far the ink stops short of the box edge.
const DIGIT_RIGHT_BEARING_EM = [
  0.048, 0.056, 0.048, 0.048, 0.036, 0.056, 0.046, 0.058, 0.046, 0.046,
];

function countInkOffsets(count: number) {
  const bearing = DIGIT_RIGHT_BEARING_EM[Math.abs(count) % 10];
  return {
    top: `calc(${TITLE_CAP_INSET} - ${COUNT_DIGIT_TOP_EM}em)`,
    right: `-${bearing}em`,
  };
}

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
 *
 * The entrance plays alone: from mount until it completes, the page is held
 * at the top with scrolling locked and the project list waits
 * (lib/projects-intro.ts); the grid fades the list in once the intro ends.
 */
export function ProjectsHero({ count }: { count: number }) {
  const rootRef = useRef<HTMLElement>(null);
  // The arrow link only works once the entrance is over (or skipped): a
  // native anchor jump mid-intro would scroll a page that is meant to be
  // held at the top.
  const enteredRef = useRef(false);

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

    enteredRef.current = false;
    const reduced = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (reduced) {
      // Nothing to wait for: the list shows at once and nothing is locked.
      finishProjectsIntro();
      gsap.set(chars, { yPercent: 0, opacity: 1 });
      gsap.set(numberWrap, { yPercent: 0, opacity: 1 });
      gsap.set(arrow, { opacity: 1 });
      gsap.set(arrowPath, { drawSVG: "100%" });
      if (numberText) numberText.textContent = String(count);
      enteredRef.current = true;
      return;
    }

    // Hide the pre-hydration state right away so nothing peeks through the
    // curtain while an internal navigation's reveal is still playing.
    gsap.set(chars, { yPercent: 100, opacity: 0 });
    gsap.set(numberWrap, { yPercent: 110, opacity: 0 });
    gsap.set(arrow, { opacity: 0 });
    gsap.set(arrowPath, { drawSVG: "0%" });
    // Start the count from a real 0 (not the SSR-rendered total) so the
    // first counter update never snaps the number backwards.
    if (numberText) numberText.textContent = "0";

    let cancelled = false;
    let tl: gsap.core.Timeline | null = null;
    let fontTimer = 0;
    let failsafeTimer = 0;

    // The intro: the list waits and the page is held at the top, locked.
    // An empty list has nothing to hold back, so it never locks.
    let introOpen = false;
    // Browser scroll restoration can land after hydration on a mid-page
    // reload, and overflow: hidden does not stop programmatic scrolling,
    // so every scroll while the intro holds the page snaps it back.
    const pinTop = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const endIntro = () => {
      if (!introOpen) return;
      introOpen = false;
      window.clearTimeout(failsafeTimer);
      window.removeEventListener("scroll", pinTop);
      releaseScrollLock(INTRO_LOCK_OWNER);
      finishProjectsIntro();
    };
    if (count > 0) {
      introOpen = true;
      beginProjectsIntro();
      acquireScrollLock(INTRO_LOCK_OWNER);
      scrollPageTo(0, { duration: 0 });
      pinTop();
      window.addEventListener("scroll", pinTop, { passive: true });
      failsafeTimer = window.setTimeout(endIntro, INTRO_FAILSAFE_MS);
    } else {
      finishProjectsIntro();
    }

    const play = () => {
      if (cancelled) return;
      // Wait for the display font so the rise never starts on fallback
      // glyphs that then swap mid-animation; bounded so a slow font load
      // can never hold the entrance hostage.
      const fontsReady = "fonts" in document ? document.fonts.ready : Promise.resolve();
      const deadline = new Promise<void>((resolve) => {
        fontTimer = window.setTimeout(resolve, FONT_WAIT_MS);
      });
      void Promise.race([fontsReady, deadline]).then(() => {
        if (cancelled) return;
        window.clearTimeout(fontTimer);

        tl = gsap.timeline({
          defaults: { ease: "power3.out" },
          // The handoff order matters: the page unlocks and the list is
          // released first, so the hero's idle play never runs over a
          // page that still looks frozen.
          onComplete: () => {
            if (cancelled) return;
            endIntro();
            enteredRef.current = true;
          },
        });

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
      });
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
      window.clearTimeout(fontTimer);
      // Leaving mid-intro (or Strict Mode's rehearsal unmount) must never
      // strand the lock or a list that waits for an intro nobody will end.
      endIntro();
      tl?.kill();
    };
  }, [count]);

  return (
    <section ref={rootRef} className="relative pt-[4em] pb-[clamp(2.5rem,7vh,5rem)] md:pt-[12vh]">
      {/* The entrance's pieces start hidden in the server HTML (opacity
          only, GSAP owns their transforms), so a fresh load never flashes
          the finished title before the entrance hides and replays it. */}
      <noscript>
        <style>
          {".projects-hero-char,.projects-hero-number,.projects-hero-arrow{opacity:1 !important}"}
        </style>
      </noscript>
      <div className="relative">
        <h1
          className="overflow-hidden font-display text-[17vw] leading-[1.15em] font-medium tracking-[0.05em] text-[#0e1116] dark:text-white"
          aria-label="Projects"
        >
          {HERO_TITLE.split("").map((char, index) => (
            <span
              aria-hidden="true"
              className="projects-hero-char inline-block opacity-0 will-change-transform"
              key={index}
            >
              {char}
            </span>
          ))}
        </h1>

        {/* Digits' flat ink top on the title's cap line, ink right edge on
            the card grid's right edge (the content box). */}
        <span
          className="projects-hero-number absolute overflow-hidden font-mono opacity-0 text-[clamp(0.875rem,4vw,4rem)] leading-none font-medium text-[#0e1116] dark:text-white"
          style={countInkOffsets(count)}
        >
          <span className="sr-only">{count} projects</span>
          <span aria-hidden="true" className="projects-hero-number-text inline-block tabular-nums">
            {count}
          </span>
        </span>

        {/* The link's font size IS the arrow's size, so its offsets can be
            em: the stroke's ink sits 1/38 inside the 38-unit viewBox, and
            the ink's bottom lands on the title's baseline. */}
        <a
          href="#projects"
          aria-label="Jump to the project list"
          onClick={(event) => {
            if (!enteredRef.current) event.preventDefault();
          }}
          className="projects-hero-arrow-link absolute block size-[1em] rounded-md text-[clamp(1.5rem,4vw,4rem)] text-[#0e1116] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)] dark:text-white"
          style={{ right: "calc(-1em / 38)", bottom: `calc(${TITLE_CAP_INSET} - 1em / 38)` }}
        >
          {/* `block` drops the inline-svg descender gap, so the glyph sits
              exactly in the link's box. */}
          <svg
            aria-hidden="true"
            className="projects-hero-arrow block size-full opacity-0"
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
        </a>
      </div>
    </section>
  );
}
