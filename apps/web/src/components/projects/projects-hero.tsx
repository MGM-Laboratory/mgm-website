"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

import { Circle, Square, TriangleShape } from "@/components/hero/shapes";
import { startHeroPlay } from "@/components/projects/hero-play";
import { CompetencyMotifShape } from "@/components/sections/competency-motif";
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

// Each letter's slot is frozen at its Hanken Grotesk 500 advance plus the
// 0.05em tracking, straight from the server HTML: the idle play swells
// letters' weight, and a frozen slot means a heavier letter never shoves
// its neighbours (or the whole word) sideways. The glyph is centered in
// its slot, so a heavier one grows evenly both ways.
const SLOT_EM: Record<string, number> = {
  P: 0.6066,
  R: 0.6526,
  O: 0.7978,
  J: 0.6032,
  E: 0.6326,
  C: 0.7558,
  T: 0.636,
};
const HERO_CHARS = HERO_TITLE.split("");
const HERO_SLOTS = HERO_CHARS.map((char) => SLOT_EM[char]);
// Letters lean and squash about the ink centre on the baseline (the slot
// centre minus half the trailing tracking), so they stay planted on it.
const GLYPH_PIVOT = "calc(50% - 0.025em) 0.9235em";

// The lab's Bauhaus shapes, in their brand colors.
const RESIDENTS = [
  { key: "disc", shape: <Circle className="size-full" /> },
  { key: "triangle", shape: <TriangleShape className="size-full" /> },
  { key: "square", shape: <Square className="size-full" /> },
  {
    key: "ring",
    shape: (
      <CompetencyMotifShape motif="ring" stroke="var(--brand-red)" className="inset-0 size-full" />
    ),
  },
];

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
    const arrowShaft = q(".projects-hero-arrow-shaft");
    const arrowArms = q(".projects-hero-arrow-arms");

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
      // No play: the eye stays a still, centered dot.
      gsap.set(q(".projects-hero-pupil"), { autoAlpha: 1 });
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
    let stopPlay: (() => void) | undefined;
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
            stopPlay = startHeroPlay(root, { slots: HERO_SLOTS, count });
          },
        });

        // The counter object is tweened as part of the timeline (not in a
        // separate tween) so killing the timeline also stops the count.
        const counter = { value: 0 };

        // Each letter rises out of the mask tilted 30deg and levels off
        // as it lands, the way lusion's title enters.
        tl.fromTo(
          chars,
          { yPercent: 100, rotation: 30, opacity: 0 },
          { yPercent: 0, rotation: 0, opacity: 1, duration: 0.85, stagger: 0.06 },
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
          // The corner arrow fades in and draws itself from the top-left
          // corner: the shaft runs down to the tip, then the head's arms
          // spring out of it.
          .fromTo(arrow, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.95)
          .fromTo(
            arrowShaft,
            { drawSVG: "0%" },
            { drawSVG: "100%", duration: 0.45, ease: "power2.in" },
            0.95,
          )
          // Half the arms path is one arm's length, which (with the dash
          // restarting per subpath) draws both arms in full.
          .fromTo(
            arrowArms,
            { drawSVG: "0% 0%" },
            { drawSVG: "0% 50%", duration: 0.35, ease: "power3.out" },
            1.35,
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
      stopPlay?.();
    };
  }, [count]);

  return (
    <section ref={rootRef} className="relative pt-[4em] pb-[clamp(2.5rem,7vh,5rem)] md:pt-[12vh]">
      {/* The entrance's pieces start hidden in the server HTML (opacity
          only, GSAP owns their transforms), so a fresh load never flashes
          the finished title before the entrance hides and replays it. */}
      <noscript>
        <style>
          {
            ".projects-hero-char,.projects-hero-number,.projects-hero-arrow{opacity:1 !important}.projects-hero-pupil{visibility:visible !important}"
          }
        </style>
      </noscript>
      <div className="projects-hero-wrap relative">
        {/* The rise mask (overflow-hidden) is lifted once the entrance is
            over, so hopping letters can leave the line box. nowrap: no
            weight swell may ever wrap the T onto a second line. */}
        <h1
          className="relative overflow-hidden font-display text-[17vw] leading-[1.15em] font-medium tracking-[0.05em] whitespace-nowrap text-[#0e1116] select-none [-webkit-touch-callout:none] dark:text-white"
          aria-label="Projects"
        >
          {/* The residents: Bauhaus shapes that live behind the word and
              peek through its gaps and counters. First in the DOM, so the
              (positioned) letters paint over them; their own mask ends at
              the baseline, so they never show below the word. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 block h-[0.9235em] overflow-hidden"
          >
            {RESIDENTS.map(({ key, shape }) => (
              <span
                key={key}
                className="projects-hero-resident absolute bottom-0 left-0 block size-[0.42em]"
              >
                <span className="projects-hero-resident-body invisible relative block size-full">
                  {shape}
                </span>
              </span>
            ))}
          </span>
          {HERO_CHARS.map((char, index) => (
            // Two layers with separate owners: the entrance moves the outer
            // slot, the idle play moves the inner glyph.
            <span
              aria-hidden="true"
              className="projects-hero-char relative inline-flex justify-center opacity-0 will-change-transform"
              style={{ width: `${SLOT_EM[char]}em` }}
              key={index}
            >
              <span
                className="projects-hero-glyph relative inline-block"
                style={{ transformOrigin: GLYPH_PIVOT }}
              >
                {char}
                {char === "O" && (
                  // The eye: a brand-blue pupil at the O's ink centre, with
                  // separate layers for looking, dilating and blinking.
                  <span className="projects-hero-pupil-look pointer-events-none absolute top-[0.575em] left-[calc(50%_-_0.025em)] block size-0">
                    <span className="projects-hero-pupil-dilate absolute -top-[0.07em] -left-[0.07em] block size-[0.14em]">
                      <span className="projects-hero-pupil invisible block size-full rounded-full bg-brand-blue" />
                    </span>
                  </span>
                )}
              </span>
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
          {/* The idle play's re-roll: per-digit columns that drop through
              the count's own mask. */}
          <span
            aria-hidden="true"
            className="projects-hero-number-roll invisible absolute inset-0 flex items-start justify-end tabular-nums"
          />
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
            {/* The shaft is its own path: browsers restart the dash pattern
                at every subpath, so DrawSVG could never zip the shaft into
                the tip on one combined path. It stops just inside the
                corner, so the arms alone draw the ink's outer edges. The
                arms share one path (one antialiased union at the corner),
                and each grows out of the tip as its own subpath. */}
            <g stroke="currentColor" strokeLinecap="round" strokeWidth="2">
              <path
                className="projects-hero-arrow-path projects-hero-arrow-shaft"
                d="M2 2 35.3 35.3"
              />
              <path
                className="projects-hero-arrow-path projects-hero-arrow-arms"
                d="M36 36V6.046M36 36H6.046"
              />
            </g>
          </svg>
        </a>
      </div>
    </section>
  );
}
