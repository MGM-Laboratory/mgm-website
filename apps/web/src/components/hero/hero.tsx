"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { setupParallax } from "@/lib/parallax";
import { hasAppAlreadyBooted } from "@/lib/app-boot";
import { SITE_HEADER_HEIGHT } from "@/components/site-header";
import { SeeWorkButton } from "@/components/hero/see-work-button";

import {
  ArrowConnector,
  Circle,
  DomesMotif,
  Dot,
  FansMotif,
  LeavesMotif,
  LogoMark,
  PlusMotif,
  RingMotif,
  Square,
  ToggleChip,
  TriangleShape,
  XMark,
} from "./shapes";

if (typeof window !== "undefined") {
  gsap.registerPlugin(SplitText, DrawSVGPlugin, MotionPathPlugin, ScrollTrigger, ScrollSmoother);
}

// If the entrance timeline never reaches onComplete for any reason (a
// thrown error mid-build, fonts.ready never resolving), this guarantees the
// scroll indicator still shows up rather than never appearing at all.
const REVEAL_FAILSAFE_MS = 12000;

// SSR runs useEffect; the browser prefers useLayoutEffect so the reveal
// timeline is wired up before first paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const headlineType =
  "font-display font-medium leading-[0.95] tracking-tight text-foreground text-[clamp(2.75rem,6.5vw,5rem)]";
const headline = cn("reveal-hidden opacity-0", headlineType);

// Shapes read a little larger and taller than the headline type, like the
// reference composition.
const shapeBoxClass = "w-[clamp(4rem,8vw,6.5rem)]";
const shapeHeightClass = "h-[clamp(4rem,8vw,6.5rem)]";

const MEDIA_I_INDEX = 3; // "Media," -> M(0) e(1) d(2) i(3) a(4) ,(5)

function startIdleLoops(): gsap.core.Animation[] {
  const loops: gsap.core.Animation[] = [];

  // A small number of clear, long-running motions preserves the hero's
  // energy without continuously repainting every decorative element.
  loops.push(
    gsap.to(".shape-circle-yellow", {
      y: -6,
      duration: 1.6,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    }),
    gsap.to(".shape-square", {
      rotate: 6,
      duration: 2.2,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    }),
    gsap.to(".hero-logo", {
      scale: 1.05,
      transformOrigin: "50% 50%",
      duration: 2.6,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    }),
    gsap.to(".corner-pattern", {
      rotate: 360,
      duration: 44,
      ease: "none",
      repeat: -1,
      transformOrigin: "50% 50%",
    }),
  );

  return loops;
}

function buildEntranceTimeline(
  mediaSplit: SplitText,
  gameSplit: SplitText,
  mobileSplit: SplitText,
) {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  const iChar = mediaSplit.chars[MEDIA_I_INDEX];
  const MEDIA_CHAR_DURATION = 0.7;
  const MEDIA_CHAR_STAGGER = 0.055;
  // The moment the "i" itself lands (mid-stagger), not when the whole word
  // finishes — the spin-back kicks off immediately off that, independent of
  // the rest of the timeline.
  const iOwnFinish = MEDIA_I_INDEX * MEDIA_CHAR_STAGGER + MEDIA_CHAR_DURATION;

  tl.addLabel("media")
    .set(".line-media", { opacity: 1 }, "media")
    .fromTo(
      mediaSplit.chars,
      {
        opacity: 0,
        y: (i: number) => (i % 2 === 0 ? -70 : 70),
        rotate: (i: number) => (i === MEDIA_I_INDEX ? 0 : gsap.utils.random(-28, 28)),
        // The "i" tumbles toward the camera a clean 180deg (top edge
        // swinging under) so its dot/stem land reading as "!".
        rotateX: (i: number) => (i === MEDIA_I_INDEX ? 180 : 0),
        scale: 0.4,
      },
      {
        opacity: 1,
        y: 0,
        rotate: 0,
        rotateX: (i: number) => (i === MEDIA_I_INDEX ? 180 : 0),
        scale: 1,
        duration: MEDIA_CHAR_DURATION,
        ease: "back.out(2.4)",
        stagger: MEDIA_CHAR_STAGGER,
      },
      "media",
    )
    // The "!" spins back into an "i" the instant its own entrance lands —
    // spawned as its own free-running tween so nothing else in the timeline
    // waits on it. A few decelerating spins (not just the one flip), easing
    // down like a coin settling, instead of a single snap.
    .call(
      () => {
        gsap.to(iChar, {
          rotateX: 360 * 4,
          transformOrigin: "50% 50%",
          duration: 1.6,
          ease: "power2.out",
          onComplete: () => gsap.set(iChar, { rotateX: 0 }),
        });
      },
      [],
      `media+=${iOwnFinish}`,
    )
    // Row 1 shapes — each with its own entrance personality
    .fromTo(
      ".shape-square",
      { opacity: 0, scale: 0, rotate: -14 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.4, ease: "back.out(2.6)" },
      "media+=0.35",
    )
    .fromTo(
      ".shape-toggle",
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.6)" },
      "-=0.2",
    )
    .to(
      ".toggle-switch [data-part='knob']",
      { attr: { cx: 175 }, duration: 0.45, ease: "power2.inOut" },
      "+=0.05",
    )
    .to(
      ".toggle-switch [data-part='track']",
      { attr: { fill: "#f94141" }, duration: 0.45, ease: "power2.inOut" },
      "<",
    )
    .fromTo(
      ".shape-triangle",
      { opacity: 0, scale: 0, rotate: -140 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.5, ease: "back.out(2)" },
      "-=0.3",
    )
    .fromTo(
      ".shape-circle-yellow",
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.8)" },
      "-=0.25",
    )
    .fromTo(
      ".shape-x",
      { opacity: 0, scale: 0, rotate: -50 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.3, ease: "back.out(3.2)" },
      "-=0.15",
    )
    .fromTo(
      ".shape-circle-red",
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.8)" },
      "-=0.15",
    )
    // GAME — reveals mirrored ("emaG", right-to-left) then turns to face forward.
    // No pause after row 1's last shape — starts the instant it lands.
    .addLabel("game")
    .set(".line-game", { opacity: 1, scaleX: -1 }, "game")
    .fromTo(
      gameSplit.chars,
      {
        opacity: 0,
        y: (i: number) => (i % 2 === 0 ? -70 : 70),
        rotate: () => gsap.utils.random(-24, 24),
        scale: 0.4,
      },
      {
        opacity: 1,
        y: 0,
        rotate: 0,
        scale: 1,
        // Tuned so every letter (5 chars, this stagger) has landed at
        // ~0.5s after "game" starts — that's the instant row 2's shapes
        // below launch, so this duration directly sets that gap.
        duration: 0.35,
        ease: "back.out(2.4)",
        stagger: 0.04,
      },
      "game",
    )
    // The instant every letter has landed (still mirrored, ~0.5s in) — the
    // flip and row 2's shapes both fire from here in parallel, instead of
    // making the shapes wait for the flip/bounce polish to play out first.
    .addLabel("gameTyped")
    .to(".line-game", { scaleX: 1, duration: 0.22, ease: "power2.inOut" }, "gameTyped")
    .to(".line-game", { scale: 1.06, duration: 0.08, ease: "power1.out" }, "-=0.03")
    .to(".line-game", { scale: 1, duration: 0.12, ease: "back.out(3)" })
    // Row 2 shapes — right-to-left, closest to GAME first, launching the
    // moment GAME is done typing rather than waiting on its flip.
    .addLabel("shapesB", "gameTyped")
    .fromTo(
      ".domes-motif-wrap",
      { opacity: 0, scale: 0, rotate: -140 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.5, ease: "back.out(2.2)" },
      "shapesB",
    )
    .fromTo(
      ".fans-motif-wrap",
      { opacity: 0, scale: 0, rotate: 90 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.5, ease: "back.out(2.4)" },
      "-=0.25",
    )
    .fromTo(
      ".leaves-motif-wrap",
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2.6)" },
      "-=0.25",
    )
    // Arrow — a spark draws the line as it travels, then a simple arrowhead lands
    .addLabel("arrow", "+=0.2")
    .fromTo(".hero-arrow-wrap", { opacity: 0 }, { opacity: 1, duration: 0.2 }, "arrow")
    .fromTo(
      ".arrow-connector [data-part='arrow-path']",
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 1, ease: "power2.inOut" },
      "arrow",
    )
    .fromTo(
      ".arrow-connector [data-part='arrow-spark']",
      {
        opacity: 1,
        motionPath: {
          path: ".arrow-connector [data-part='arrow-path']",
          align: ".arrow-connector [data-part='arrow-path']",
          alignOrigin: [0.5, 0.5],
          start: 0,
          end: 0,
        },
      },
      {
        motionPath: {
          path: ".arrow-connector [data-part='arrow-path']",
          align: ".arrow-connector [data-part='arrow-path']",
          alignOrigin: [0.5, 0.5],
          start: 0,
          end: 1,
        },
        duration: 1,
        ease: "power2.inOut",
      },
      "arrow",
    )
    // ...staying fully visible until 75% of the way along, then fading out.
    .to(
      ".arrow-connector [data-part='arrow-spark']",
      { opacity: 0, ease: "power1.in", duration: 0.25 },
      "arrow+=0.75",
    )
    .fromTo(
      ".arrow-connector [data-part='arrow-head']",
      { opacity: 0 },
      { opacity: 1, duration: 0.2 },
      "-=0.1",
    )
    // Outro — "& Mobile Laboratory", the logo assembling, tagline, and the last flourishes
    .addLabel("outro", "+=0.15")
    .set(".line-mobile", { opacity: 1 }, "outro")
    .fromTo(
      mobileSplit.chars,
      { opacity: 0, y: 50, rotateX: -90, transformOrigin: "50% 100%" },
      { opacity: 1, y: 0, rotateX: 0, duration: 0.55, ease: "back.out(1.8)", stagger: 0.022 },
      "outro",
    )
    .fromTo(
      ".hero-logo [data-part='shard-1']",
      { opacity: 0, scale: 0.3, x: -40, y: -55, rotate: -140 },
      { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, duration: 0.55, ease: "back.out(1.9)" },
      "outro+=0.28",
    )
    .fromTo(
      ".hero-logo [data-part='shard-2']",
      { opacity: 0, scale: 0.3, x: -55, y: 45, rotate: 120 },
      { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, duration: 0.55, ease: "back.out(1.9)" },
      "-=0.4",
    )
    .fromTo(
      ".hero-logo [data-part='shard-3']",
      { opacity: 0, scale: 0.3, x: 55, y: 45, rotate: -120 },
      { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, duration: 0.55, ease: "back.out(1.9)" },
      "-=0.4",
    )
    .to(".hero-logo", { scale: 1.12, duration: 0.14, ease: "power1.out" }, "+=0.02")
    .to(".hero-logo", { scale: 1, duration: 0.25, ease: "back.out(3)" })
    .fromTo(
      ".hero-cta",
      { opacity: 0, y: 16, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(2.2)" },
      "-=0.5",
    )
    .fromTo(
      ".bg-motif",
      { opacity: 0, scale: 0.4 },
      { opacity: 1, scale: 1, duration: 0.5, stagger: 0.06, ease: "back.out(2)" },
      "-=0.4",
    )
    .fromTo(
      ".corner-pattern",
      { opacity: 0, scale: 0.6, rotate: -30 },
      { opacity: 0.6, scale: 1, rotate: 0, duration: 0.6, ease: "back.out(2)" },
      "-=0.3",
    );

  return tl;
}

export function Hero() {
  // Captured synchronously during the first render, not read fresh inside
  // the fonts.ready callback below: by the time that promise resolves, the
  // root layout's own boot-tracking effect has long since fired (it isn't
  // a descendant of this component, so effect ordering wouldn't otherwise
  // protect it), which would make this always read as "already booted."
  // Reading it now, during render — before any effect in the tree, root
  // layout included, has had a chance to run — is what actually
  // distinguishes a fresh visit from an internal navigation back here.
  const skipEntranceForInternalNavRef = useRef<boolean | null>(null);
  if (skipEntranceForInternalNavRef.current === null) {
    skipEntranceForInternalNavRef.current = hasAppAlreadyBooted();
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const row1Ref = useRef<HTMLDivElement>(null);
  const row2Ref = useRef<HTMLDivElement>(null);
  const row3Ref = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<HTMLDivElement>(null);
  const arrowWrapRef = useRef<HTMLDivElement>(null);
  const shapesBGroupRef = useRef<HTMLDivElement>(null);
  const mobileTextRef = useRef<HTMLSpanElement>(null);

  // Rows 2 and 3 both match row 1's rendered width and right-align their
  // content, so GAME lines up under circle B and "& Mobile Laboratory"
  // lines up under GAME/circle B too. The arrow is measured to run from
  // row 2's mid-height to row 3's mid-height, and stretched as wide as it
  // can go without overlapping either the leaves shape or the closing
  // line's text — none of this is guessed at with fixed clamp values.
  useIsomorphicLayoutEffect(() => {
    const row1 = row1Ref.current;
    const row2 = row2Ref.current;
    const row3 = row3Ref.current;
    const bridge = bridgeRef.current;
    const arrowWrap = arrowWrapRef.current;
    const shapesBGroup = shapesBGroupRef.current;
    const mobileText = mobileTextRef.current;
    if (!row1 || !row2 || !row3 || !bridge || !arrowWrap || !shapesBGroup || !mobileText) return;

    function measure() {
      // Only ever WRITE a row's width if it actually needs to change —
      // writing on every call (even to the same value) can make a
      // ResizeObserver that also watches these rows re-fire indefinitely.
      const targetWidth = `${row1!.offsetWidth}px`;
      if (row2!.style.width !== targetWidth) row2!.style.width = targetWidth;
      if (row3!.style.width !== targetWidth) row3!.style.width = targetWidth;

      const bridgeRect = bridge!.getBoundingClientRect();
      const row2Rect = row2!.getBoundingClientRect();
      const row3Rect = row3!.getBoundingClientRect();
      const shapesBRect = shapesBGroup!.getBoundingClientRect();
      const mobileTextRect = mobileText!.getBoundingClientRect();
      const top = row2Rect.top + row2Rect.height / 2 - bridgeRect.top;
      const bottom = row3Rect.top + row3Rect.height / 2 - bridgeRect.top;
      const height = Math.max(bottom - top, 1);

      // The top arm reaches just short of the leaves shape; the bottom arm
      // reaches just short of the closing line's text — independently of
      // each other, so neither is held back by whichever is further away.
      const gap = 32;
      const topEndX = Math.max(shapesBRect.left - bridgeRect.left - gap, 48);
      const bottomEndX = Math.max(mobileTextRect.left - bridgeRect.left - gap, 48);
      const width = Math.max(topEndX, bottomEndX, 1);

      arrowWrap!.style.top = `${top}px`;
      arrowWrap!.style.height = `${height}px`;
      arrowWrap!.style.width = `${width}px`;

      const svg = arrowWrap!.querySelector("svg.arrow-connector");
      const path = arrowWrap!.querySelector("[data-part='arrow-path']");
      const head = arrowWrap!.querySelector("[data-part='arrow-head']");
      const spark = arrowWrap!.querySelector("[data-part='arrow-spark']");
      if (!svg || !path || !head || !spark) return;

      // Real pixel coordinates from here on — no scaling trick. The
      // horizontal arms sit exactly at y=0 (row 2's mid-height) and
      // y=height (row 3's mid-height); the vertical stays flush with the
      // shared left margin ("Media,"/"&"'s column), rounded at both ends.
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const r = 26;
      path.setAttribute(
        "d",
        `M${topEndX} 0H${r}A${r} ${r} 0 0 0 0 ${r}V${height - r}A${r} ${r} 0 0 0 ${r} ${height}H${bottomEndX}`,
      );
      const hs = 13;
      head.setAttribute(
        "d",
        `M${bottomEndX - hs} ${height - hs}L${bottomEndX} ${height}L${bottomEndX - hs} ${height + hs}`,
      );
      spark.setAttribute("cx", `${topEndX}`);
      spark.setAttribute("cy", "0");
    }

    measure();
    // Only row1 is observed: it's the sole driver of row2/row3's width, and
    // font/viewport reflows that move row2/row3 always move row1 too.
    const ro = new ResizeObserver(measure);
    ro.observe(row1);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // A reload (or a link) can land the browser scrolled past the hero —
    // browsers restore scroll position on reload before this effect runs,
    // so this read is reliable. Don't bother animating an entrance the user
    // isn't even looking at.
    const startedScrolled = window.scrollY > 40;
    // Navigating back to "/" from elsewhere in the app, rather than a fresh
    // visit or a reload — see the ref's own comment above for why this has
    // to be captured during render, not read here.
    const cameFromInternalNav = skipEntranceForInternalNavRef.current === true;

    // The user can scroll away at any point — the entrance timeline below
    // keeps playing regardless, entirely decoupled from scroll position.
    // This failsafe only guarantees the scroll indicator still shows up if
    // the animation setup below ever throws or fonts.ready never resolves.
    let failSafeTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      gsap.set(".scroll-indicator", { opacity: 1, y: 0 });
    }, REVEAL_FAILSAFE_MS);

    function reveal(animated: boolean) {
      if (failSafeTimer) {
        clearTimeout(failSafeTimer);
        failSafeTimer = undefined;
      }
      ScrollTrigger.refresh();
      if (animated) {
        gsap.fromTo(
          ".scroll-indicator",
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
        );
      } else {
        gsap.set(".scroll-indicator", { opacity: 1, y: 0 });
      }
    }

    let cancelled = false;
    let mediaSplit: SplitText | undefined;
    let gameSplit: SplitText | undefined;
    let mobileSplit: SplitText | undefined;
    const mm = gsap.matchMedia();

    document.fonts.ready
      .then(() => {
        if (cancelled) return;

        mediaSplit = SplitText.create(".line-media", { type: "chars", charsClass: "media-char" });
        gameSplit = SplitText.create(".line-game", { type: "chars", charsClass: "game-char" });
        mobileSplit = SplitText.create(".line-mobile", {
          type: "words, chars",
          charsClass: "mobile-char",
        });

        mm.add(
          {
            reduced: "(prefers-reduced-motion: reduce)",
            full: "(prefers-reduced-motion: no-preference)",
          },
          (context) => {
            const { reduced } = context.conditions as { reduced: boolean };
            const revealTargets = gsap.utils.toArray<HTMLElement>(".reveal-hidden", root);

            if (reduced || startedScrolled || cameFromInternalNav) {
              gsap.set(revealTargets, { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 });
              gsap.set([mediaSplit!.chars, gameSplit!.chars, mobileSplit!.chars], {
                opacity: 1,
                x: 0,
                y: 0,
                rotate: 0,
                rotateX: 0,
                scale: 1,
              });
              gsap.set(".line-game", { scaleX: 1 });
              gsap.set(".toggle-switch [data-part='knob']", { attr: { cx: 175 } });
              gsap.set(".toggle-switch [data-part='track']", { attr: { fill: "#f94141" } });
              gsap.set(".arrow-connector [data-part='arrow-path']", { drawSVG: "100%" });
              gsap.set(".hero-logo [data-part^='shard-']", { opacity: 1 });
              reveal(false);
              return;
            }

            const tl = buildEntranceTimeline(mediaSplit!, gameSplit!, mobileSplit!);
            let idleLoops: gsap.core.Animation[] = [];

            tl.eventCallback("onComplete", () => {
              idleLoops = startIdleLoops();
              reveal(true);
            });

            const removeParallax = setupParallax(root);

            if (process.env.NODE_ENV !== "production") {
              Object.assign(window, {
                __heroTl: tl,
                __heroReplay: () => {
                  idleLoops.forEach((loop) => loop.kill());
                  idleLoops = [];
                  gsap.set(".scroll-indicator", { opacity: 0, y: 14 });
                  tl.restart();
                },
              });
            }

            return () => {
              tl.kill();
              idleLoops.forEach((loop) => loop.kill());
              removeParallax();
            };
          },
        );
      })
      .catch((err) => {
        console.error("Hero entrance setup failed; revealing scroll indicator.", err);
        reveal(false);
      });

    function onKeydown(e: KeyboardEvent) {
      if (process.env.NODE_ENV === "production") return;
      if (
        e.key === "r" &&
        typeof (window as unknown as { __heroReplay?: () => void }).__heroReplay === "function"
      ) {
        (window as unknown as { __heroReplay: () => void }).__heroReplay();
      }
    }
    window.addEventListener("keydown", onKeydown);

    return () => {
      cancelled = true;
      if (failSafeTimer) clearTimeout(failSafeTimer);
      window.removeEventListener("keydown", onKeydown);
      mm.revert();
      mediaSplit?.revert();
      gameSplit?.revert();
      mobileSplit?.revert();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="hero relative flex flex-1 flex-col justify-center bg-[var(--surface-muted)] px-6 py-14 sm:px-10 sm:py-20 lg:px-16"
    >
      {/* Ambient background motifs — pure whitespace flourish, idle-floating */}
      <Dot className="bg-motif reveal-hidden opacity-0 absolute top-[10%] left-[5%] size-3 text-brand-yellow sm:size-4" />
      <PlusMotif className="bg-motif reveal-hidden opacity-0 absolute top-[16%] right-[8%] size-4 text-brand-blue sm:size-5" />
      <RingMotif className="bg-motif reveal-hidden opacity-0 absolute bottom-[22%] left-[4%] size-4 text-brand-red sm:size-5" />
      <Dot className="bg-motif reveal-hidden opacity-0 absolute top-[46%] right-[5%] size-3 text-brand-green sm:size-4" />
      <PlusMotif className="bg-motif reveal-hidden opacity-0 absolute bottom-[10%] right-[22%] size-3 text-brand-red sm:size-4" />

      {/* Progressive enhancement: without JS the reveal timeline never runs,
          so don't leave the hero blank. */}
      <noscript>
        <style>{".reveal-hidden{opacity:1 !important}"}</style>
      </noscript>

      <h1 className="sr-only">Media, Game &amp; Mobile Laboratory</h1>

      <div className="mx-auto flex w-fit max-w-full flex-col gap-3 sm:gap-4" aria-hidden="true">
        {/* Row 1 — Media, */}
        <div ref={row1Ref} className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
          <span className={cn("line-media [perspective:500px]", headline)}>Media,</span>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="parallax-el" data-depth="0.7">
              <div className={`shape-square reveal-hidden opacity-0 ${shapeBoxClass}`}>
                <Square className="w-full" />
              </div>
            </div>
            <div className="parallax-el" data-depth="0.85">
              <div
                className={`shape-toggle reveal-hidden opacity-0 aspect-[220/90] w-auto ${shapeHeightClass}`}
              >
                <ToggleChip className="h-full w-full" />
              </div>
            </div>
            <div className="parallax-el" data-depth="0.6">
              <div className={`shape-triangle reveal-hidden opacity-0 ${shapeBoxClass}`}>
                <TriangleShape className="w-full" />
              </div>
            </div>
            <div className="parallax-el" data-depth="0.9">
              <div className={`shape-circle-yellow reveal-hidden opacity-0 ${shapeBoxClass}`}>
                <Circle className="w-full" color="var(--brand-yellow)" />
              </div>
            </div>
            <div className="parallax-el" data-depth="1">
              <div className="shape-x reveal-hidden opacity-0 w-[clamp(2.25rem,4.5vw,3.5rem)] text-foreground">
                <XMark className="w-full" />
              </div>
            </div>
            <div className="parallax-el" data-depth="0.75">
              <div className={`shape-circle-red reveal-hidden opacity-0 ${shapeBoxClass}`}>
                <Circle className="w-full" color="var(--brand-red)" />
              </div>
            </div>
          </div>
        </div>

        {/* Row 2 (shapes + GAME, right-anchored) + Row 3, bridged by the arrow */}
        <div ref={bridgeRef} className="relative">
          <div
            ref={arrowWrapRef}
            className="hero-arrow-wrap reveal-hidden opacity-0 parallax-el absolute left-0 w-40"
            data-depth="0.5"
          >
            <ArrowConnector className="arrow-connector h-full w-full text-foreground" />
          </div>

          <div
            ref={row2Ref}
            className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3 sm:gap-x-6"
          >
            <div ref={shapesBGroupRef} className="flex flex-wrap items-center gap-5 sm:gap-8">
              <div className="parallax-el" data-depth="0.7">
                <div className={`leaves-motif-wrap reveal-hidden opacity-0 ${shapeBoxClass}`}>
                  <LeavesMotif className="w-full" />
                </div>
              </div>
              <div className="parallax-el" data-depth="0.9">
                <div className={`fans-motif-wrap reveal-hidden opacity-0 ${shapeBoxClass}`}>
                  <FansMotif className="w-full" />
                </div>
              </div>
              <div className="parallax-el" data-depth="0.6">
                <div className={`domes-motif-wrap reveal-hidden opacity-0 ${shapeBoxClass}`}>
                  <DomesMotif className="w-full" />
                </div>
              </div>
            </div>
            <span className={cn("line-game", headline)}>Game,</span>
          </div>

          <div
            ref={row3Ref}
            className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-4 sm:mt-4"
          >
            <span
              ref={mobileTextRef}
              className={cn("line-mobile text-right [perspective:600px]", headline)}
            >
              &amp; Mobile Laboratory
            </span>
            <div className="parallax-el" data-depth="0.4">
              <LogoMark className={`hero-logo ${shapeBoxClass}`} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <SeeWorkButton />
      </div>

      <div className="corner-pattern reveal-hidden opacity-0 pointer-events-none absolute -right-6 -bottom-6 z-10 dark:hidden">
        <svg width="120" height="120" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="40" fill="none" stroke="var(--brand-blue)" strokeWidth="20" />
        </svg>
      </div>

      <button
        type="button"
        aria-label="Scroll to next section"
        className="scroll-indicator reveal-hidden absolute bottom-1 left-1/2 z-10 -translate-x-1/2 text-foreground/50 opacity-0 transition-colors hover:text-foreground/80"
        onClick={() => {
          const target = document.getElementById("process");
          if (!target) return;
          const smoother = ScrollSmoother.get();
          if (smoother) smoother.scrollTo(target, true, `top ${SITE_HEADER_HEIGHT}px`);
          else target.scrollIntoView({ behavior: "smooth" });
        }}
      >
        <span data-part="content" className="flex flex-col items-center gap-1.5">
          <span className="text-xs font-medium tracking-wide">Scroll</span>
          <ArrowDown className="size-4" strokeWidth={2.25} />
        </span>
      </button>
    </div>
  );
}
