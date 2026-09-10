"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

import { cn } from "@/lib/utils";

import {
  ArrowConnector,
  Circle,
  Dot,
  DoubleChevron,
  Hourglass,
  LogoMark,
  PlusMotif,
  RingMotif,
  SparkleStar,
  Square,
  ToggleChip,
  TriangleShape,
  XMark,
} from "./shapes";

if (typeof window !== "undefined") {
  gsap.registerPlugin(SplitText, DrawSVGPlugin, MotionPathPlugin);
}

// SSR runs useEffect; the browser prefers useLayoutEffect so the reveal
// timeline is wired up before first paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const headlineType =
  "font-display font-extrabold leading-[0.95] tracking-tight text-foreground text-[clamp(2.5rem,6.2vw,4.75rem)]";
const headline = cn("reveal-hidden opacity-0", headlineType);

function setupParallax(root: HTMLElement) {
  if (!window.matchMedia("(pointer: fine)").matches) return () => {};

  const els = Array.from(root.querySelectorAll<HTMLElement>(".parallax-el"));
  if (!els.length) return () => {};

  const setters = els.map((el) => ({
    depth: Number(el.dataset.depth ?? 1),
    x: gsap.quickTo(el, "x", { duration: 0.7, ease: "power3.out" }),
    y: gsap.quickTo(el, "y", { duration: 0.7, ease: "power3.out" }),
  }));

  function onMove(e: MouseEvent) {
    const relX = e.clientX / window.innerWidth - 0.5;
    const relY = e.clientY / window.innerHeight - 0.5;
    for (const { x, y, depth } of setters) {
      x(relX * 20 * depth);
      y(relY * 14 * depth);
    }
  }

  window.addEventListener("mousemove", onMove);
  return () => window.removeEventListener("mousemove", onMove);
}

function startIdleLoops(): gsap.core.Animation[] {
  const loops: gsap.core.Animation[] = [];

  // Toggle chip — the yellow ring keeps sliding off <-> on.
  loops.push(
    gsap
      .timeline({ repeat: -1, repeatDelay: 1.5, delay: 0.7, yoyo: true })
      .to(".toggle-switch [data-part='knob']", {
        attr: { cx: 160 },
        duration: 0.55,
        ease: "power2.inOut",
      }),
  );

  loops.push(
    gsap.to(".shape-circle-yellow", {
      y: -6,
      duration: 1.6,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    }),
    gsap.to(".shape-circle-red", {
      y: -6,
      duration: 1.9,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      delay: 0.3,
    }),
    gsap.to(".shape-triangle", { rotate: 360, duration: 24, ease: "none", repeat: -1 }),
    gsap.to(".shape-x", { rotate: 8, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1 }),
    gsap.to(".sparkle-star", {
      rotate: 22,
      scale: 1.08,
      transformOrigin: "50% 50%",
      duration: 1.3,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    }),
    gsap.to(".double-chevron", { x: 6, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: -1 }),
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

  // Hourglass occasionally "turns over".
  loops.push(
    gsap.to(".hourglass-shape", {
      rotate: 180,
      duration: 0.7,
      ease: "back.inOut(1.6)",
      repeat: -1,
      repeatDelay: 3.2,
      transformOrigin: "50% 50%",
    }),
  );

  const sparkTl = gsap.timeline({ repeat: -1, repeatDelay: 0.9 });
  sparkTl
    .set(".arrow-connector [data-part='arrow-spark']", { opacity: 0 })
    .to(".arrow-connector [data-part='arrow-spark']", { opacity: 1, duration: 0.2 })
    .to(
      ".arrow-connector [data-part='arrow-spark']",
      {
        motionPath: {
          path: ".arrow-connector [data-part='arrow-path']",
          align: ".arrow-connector [data-part='arrow-path']",
          alignOrigin: [0.5, 0.5],
        },
        duration: 2.2,
        ease: "power1.inOut",
      },
      "<",
    )
    .to(".arrow-connector [data-part='arrow-spark']", { opacity: 0, duration: 0.3 }, "-=0.3");
  loops.push(sparkTl);

  gsap.utils.toArray<HTMLElement>(".bg-motif").forEach((el, i) => {
    loops.push(
      gsap.to(el, {
        y: gsap.utils.random(-16, -9),
        x: gsap.utils.random(-9, 9),
        rotate: gsap.utils.random(-14, 14),
        duration: gsap.utils.random(3, 5),
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: i * 0.2,
      }),
    );
  });

  return loops;
}

function buildEntranceTimeline(mediaSplit: SplitText, mobileSplit: SplitText) {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

  tl.addLabel("media")
    .set(".line-media", { opacity: 1 }, "media")
    .fromTo(
      mediaSplit.chars,
      {
        opacity: 0,
        y: (i: number) => (i % 2 === 0 ? -70 : 70),
        rotate: () => gsap.utils.random(-28, 28),
        scale: 0.4,
      },
      {
        opacity: 1,
        y: 0,
        rotate: 0,
        scale: 1,
        duration: 0.7,
        ease: "back.out(2.4)",
        stagger: 0.055,
      },
      "media",
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
      { attr: { cx: 160 }, duration: 0.45, ease: "power2.inOut" },
      "+=0.05",
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
    // GAME — pops in already flipped, then rights itself with a horizontal flip
    .addLabel("game", "+=0.2")
    .fromTo(
      ".game-flip",
      { opacity: 0, scale: 0.5, y: -30 },
      { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(2.2)" },
      "game",
    )
    .to(".game-flip-inner", { rotateY: 180, duration: 0.7, ease: "power2.inOut" }, "+=0.4")
    .to(".game-flip", { scale: 1.08, duration: 0.16, ease: "power1.out" }, "-=0.05")
    .to(".game-flip", { scale: 1, duration: 0.22, ease: "back.out(3)" })
    // Row 2 shapes — lead GAME, animate in after it lands
    .addLabel("shapesB", "+=0.15")
    .set(".double-chevron", { opacity: 1 }, "shapesB")
    .fromTo(
      ".double-chevron [data-part='chevron-1']",
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.35, ease: "back.out(2.4)" },
      "shapesB",
    )
    .fromTo(
      ".double-chevron [data-part='chevron-2']",
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.35, ease: "back.out(2.4)" },
      "-=0.2",
    )
    .fromTo(
      ".sparkle-tile",
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: 0.1 },
      "shapesB+=0.2",
    )
    .fromTo(
      ".sparkle-star",
      { opacity: 0, scale: 0, rotate: -100 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.5, ease: "back.out(2.6)" },
      "<",
    )
    .fromTo(
      ".hourglass-shape",
      { opacity: 0, scale: 0, rotate: -180 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.55, ease: "back.out(1.8)" },
      "shapesB+=0.35",
    )
    // Arrow — finds its way, then settles with a little impact
    .addLabel("arrow", "+=0.2")
    .fromTo(
      ".hero-arrow-wrap",
      { opacity: 0, scale: 0.85 },
      { opacity: 1, scale: 1, duration: 0.3, ease: "power2.out" },
      "arrow",
    )
    .fromTo(
      ".arrow-connector [data-part='arrow-path']",
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 0.9, ease: "power2.inOut" },
      "arrow+=0.05",
    )
    .fromTo(
      ".arrow-connector [data-part='arrow-head']",
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)" },
      "-=0.15",
    )
    .to(".arrow-connector [data-part='arrow-head']", {
      rotate: -10,
      duration: 0.09,
      yoyo: true,
      repeat: 3,
      ease: "power1.inOut",
    })
    .fromTo(
      ".arrow-connector [data-part='arrow-spark']",
      { opacity: 0, scale: 0.6 },
      { opacity: 1, scale: 1.8, duration: 0.22, ease: "power1.out" },
      "-=0.25",
    )
    .to(".arrow-connector [data-part='arrow-spark']", {
      opacity: 0,
      duration: 0.35,
      ease: "power1.in",
    })
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
    .fromTo(".hero-tagline", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 }, "-=0.5")
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
  const rootRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let mediaSplit: SplitText | undefined;
    let mobileSplit: SplitText | undefined;
    const mm = gsap.matchMedia();

    document.fonts.ready.then(() => {
      if (cancelled) return;

      mediaSplit = SplitText.create(".line-media", { type: "chars", charsClass: "media-char" });
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

          if (reduced) {
            gsap.set(revealTargets, { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 });
            gsap.set([mediaSplit!.chars, mobileSplit!.chars], {
              opacity: 1,
              x: 0,
              y: 0,
              rotate: 0,
              rotateX: 0,
              scale: 1,
            });
            gsap.set(".game-flip-inner", { rotateY: 180 });
            gsap.set(".toggle-switch [data-part='knob']", { attr: { cx: 160 } });
            gsap.set(".arrow-connector [data-part='arrow-path']", { drawSVG: "100%" });
            gsap.set(".hero-logo [data-part^='shard-']", { opacity: 1 });
            return;
          }

          const tl = buildEntranceTimeline(mediaSplit!, mobileSplit!);
          let idleLoops: gsap.core.Animation[] = [];

          tl.eventCallback("onComplete", () => {
            idleLoops = startIdleLoops();
          });

          const removeParallax = setupParallax(root);

          if (process.env.NODE_ENV !== "production") {
            Object.assign(window, {
              __heroTl: tl,
              __heroReplay: () => {
                idleLoops.forEach((loop) => loop.kill());
                idleLoops = [];
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
      window.removeEventListener("keydown", onKeydown);
      mm.revert();
      mediaSplit?.revert();
      mobileSplit?.revert();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="hero relative flex flex-1 flex-col bg-[var(--surface-muted)] px-6 py-14 sm:px-10 sm:py-20 lg:px-16"
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

      <div
        className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 sm:gap-4"
        aria-hidden="true"
      >
        {/* Media, */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
          <span className={cn("line-media", headline)}>Media,</span>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="parallax-el" data-depth="0.7">
              <div className="shape-square reveal-hidden opacity-0 w-[clamp(2.75rem,5.5vw,4.25rem)]">
                <Square className="w-full" />
              </div>
            </div>
            <div className="parallax-el" data-depth="0.85">
              <div className="shape-toggle reveal-hidden opacity-0 w-[clamp(4.25rem,8.5vw,6.75rem)]">
                <ToggleChip className="w-full" />
              </div>
            </div>
            <div className="parallax-el" data-depth="0.6">
              <div className="shape-triangle reveal-hidden opacity-0 w-[clamp(2.75rem,5.5vw,4.25rem)]">
                <TriangleShape className="w-full" />
              </div>
            </div>
            <div className="parallax-el" data-depth="0.9">
              <div className="shape-circle-yellow reveal-hidden opacity-0 w-[clamp(2.75rem,5.5vw,4.25rem)]">
                <Circle className="w-full" color="var(--brand-yellow)" />
              </div>
            </div>
            <div className="parallax-el" data-depth="1">
              <div className="shape-x reveal-hidden opacity-0 w-[clamp(2rem,4vw,3rem)] text-foreground">
                <XMark className="w-full" />
              </div>
            </div>
            <div className="parallax-el" data-depth="0.75">
              <div className="shape-circle-red reveal-hidden opacity-0 w-[clamp(2.75rem,5.5vw,4.25rem)]">
                <Circle className="w-full" color="var(--brand-red)" />
              </div>
            </div>
          </div>
        </div>

        {/* Game, with the shapes that lead it */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="parallax-el" data-depth="0.7">
              <div className="double-chevron reveal-hidden opacity-0 w-[clamp(3.5rem,7vw,5.5rem)]">
                <DoubleChevron className="w-full" />
              </div>
            </div>
            <div className="parallax-el" data-depth="0.9">
              <div className="sparkle-tile reveal-hidden opacity-0 rounded-md bg-white/70 p-2 dark:bg-white/5">
                <div className="sparkle-star w-[clamp(2rem,4vw,3rem)]">
                  <SparkleStar className="w-full" />
                </div>
              </div>
            </div>
            <div className="parallax-el" data-depth="0.6">
              <div className="hourglass-shape reveal-hidden opacity-0 w-[clamp(2.5rem,5vw,3.75rem)]">
                <Hourglass className="w-full" />
              </div>
            </div>
          </div>
          <div className="game-flip reveal-hidden opacity-0 relative inline-block [perspective:1100px]">
            <span aria-hidden className={cn("invisible block", headlineType)}>
              Game,
            </span>
            <div className="game-flip-inner absolute inset-0 [transform-style:preserve-3d]">
              <span
                className={cn(
                  "game-face absolute inset-0 flex items-center [backface-visibility:hidden] [transform:rotate(180deg)]",
                  headlineType,
                )}
              >
                Game,
              </span>
              <span
                className={cn(
                  "game-face absolute inset-0 flex items-center [backface-visibility:hidden] [transform:rotateY(180deg)]",
                  headlineType,
                )}
              >
                Game,
              </span>
            </div>
          </div>
        </div>

        {/* Arrow, finding its way down to the closing line */}
        <div className="hero-arrow-row flex justify-start py-1">
          <div
            className="hero-arrow-wrap reveal-hidden opacity-0 parallax-el w-[clamp(12rem,26vw,20rem)]"
            data-depth="0.5"
          >
            <ArrowConnector className="arrow-connector w-full text-foreground" />
          </div>
        </div>

        {/* & Mobile Laboratory, and the mark */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-4">
          <span className={cn("line-mobile [perspective:600px]", headline)}>
            &amp; Mobile Laboratory
          </span>
          <div className="parallax-el" data-depth="0.4">
            <LogoMark className="hero-logo w-[clamp(2.5rem,5.5vw,4rem)]" />
          </div>
        </div>
      </div>

      <p className="hero-tagline reveal-hidden opacity-0 mx-auto mt-10 max-w-md text-center text-sm text-foreground/60 sm:mt-14">
        A calm, premium product surface — built for MGM Laboratory.
      </p>

      <div className="corner-pattern reveal-hidden opacity-0 pointer-events-none absolute -right-6 -bottom-6 dark:hidden">
        <svg width="120" height="120" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="40" fill="none" stroke="var(--brand-blue)" strokeWidth="20" />
        </svg>
      </div>
    </div>
  );
}
