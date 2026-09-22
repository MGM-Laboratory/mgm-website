"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { useFadeUpOnScroll } from "@/lib/scroll-reveal";
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

// The yellow card's saturated, light background reads poorly with the same
// white text every other card uses — switched to black just for that card.
const CARD_TEXT: Record<CompetencyColor, string> = {
  blue: "text-white",
  red: "text-white",
  yellow: "text-black",
  green: "text-white",
};
const CARD_TEXT_MUTED: Record<CompetencyColor, string> = {
  blue: "text-white/80",
  red: "text-white/80",
  yellow: "text-black/70",
  green: "text-white/80",
};
const CARD_PILL: Record<CompetencyColor, string> = {
  blue: "bg-white/20 text-white group-hover:bg-white/30",
  red: "bg-white/20 text-white group-hover:bg-white/30",
  yellow: "bg-black/10 text-black group-hover:bg-black/15",
  green: "bg-white/20 text-white group-hover:bg-white/30",
};

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function CoreCompetenciesSection() {
  const rootRef = useFadeUpOnScroll<HTMLDivElement>(".reveal-card", { stagger: 0.12 });
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const frontMotifRefs = useRef<(HTMLDivElement | null)[]>([]);
  const backFaceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const backContentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hoverTimelines = useRef<(gsap.core.Timeline | null)[]>([]);

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
      const card = cardRefs.current[i];
      const inner = innerRefs.current[i];
      const frontMotif = frontMotifRefs.current[i];
      const back = backContentRefs.current[i];
      if (!card || !inner || !frontMotif || !back) return;

      const d = reduced ? 0 : 1;
      const tl = gsap.timeline({ paused: true, defaults: { overwrite: "auto" } });
      // `card`'s y/opacity and `frontMotif`'s scale are also driven by
      // animations outside this timeline (the section's scroll-triggered
      // entrance on `card`, the idle loop on `frontMotif`) — a plain
      // `.to()` takes "current value" as its implicit start, and if hover
      // fires while one of those is still mid-flight, `overwrite: "auto"`
      // cuts it off right there, so reversing on mouseleave returned to
      // that half-finished value forever instead of the card's true rest
      // state (seen as a card stuck lower than the others, sometimes
      // invisible if caught early enough that opacity hadn't animated up
      // yet). `.fromTo()` forces the real baseline every time this plays,
      // fixing that — but it renders its "from" the instant the tween is
      // *created* by default (`immediateRender: true`), regardless of this
      // timeline's own `paused: true`. Under reduced motion every duration
      // here collapses to 0, so that eager render (a real, if brief, "from"
      // state under normal motion) and the tween's "complete" state become
      // the same instant — every card snapped straight to its hovered
      // position on mount, before any hover. There's no race to protect
      // against under reduced motion in the first place, though (the
      // entrance is a synchronous `gsap.set()` there, not an animation —
      // see fadeUpOnScroll — so it's always already resolved before any
      // hover could occur), so it's safe to turn `immediateRender` off
      // specifically for that case rather than needing the `.fromTo()`
      // protection at all.
      tl.fromTo(
        card,
        { y: 0, opacity: 1 },
        {
          y: -10,
          opacity: 1,
          boxShadow: "0 24px 48px -20px rgba(0,0,0,0.35)",
          duration: 0.4 * d,
          immediateRender: !reduced,
        },
        0,
      )
        .to(inner, { rotationY: 180, duration: 0.7 * d, ease: "back.out(1.5)" }, 0)
        // Scale only, no rotate — this shape is clipped by the card's own
        // edge on purpose (its ring's gap, the X's cut corners), so
        // rotating it would swing that cut to an arbitrary, broken-looking
        // spot mid-hover instead of staying anchored to the card.
        .fromTo(
          frontMotif,
          { scale: 1 },
          { scale: 1.06, duration: 0.7 * d, ease: "power2.out", immediateRender: !reduced },
          0,
        )
        .fromTo(
          back,
          { opacity: 0, y: 14 },
          {
            opacity: 1,
            y: 0,
            duration: 0.4 * d,
            ease: "back.out(2)",
            immediateRender: !reduced,
          },
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

  // The back face starts `inert` (and its trigger reports `aria-expanded:
  // false`) so its "Explore" link doesn't sit invisibly in the page's tab
  // order while closed — opening lifts that gate on whichever mechanism
  // opened it (mouse, keyboard focus, or a touch tap, which focuses a real
  // <button> the same way keyboard focus does).
  function setOpen(i: number, open: boolean) {
    const backFace = backFaceRefs.current[i];
    const trigger = triggerRefs.current[i];
    if (backFace) {
      backFace.inert = !open;
      backFace.setAttribute("aria-hidden", open ? "false" : "true");
    }
    trigger?.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function play(i: number) {
    hoverTimelines.current[i]?.play();
    setOpen(i, true);
  }

  function reverse(i: number) {
    hoverTimelines.current[i]?.reverse();
    setOpen(i, false);
  }

  return (
    <section
      ref={rootRef}
      className="bg-background px-6 pt-8 pb-10 sm:px-10 sm:pt-10 sm:pb-14 lg:px-16"
    >
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
            <div
              key={c.title}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              onMouseEnter={() => play(i)}
              onMouseLeave={() => reverse(i)}
              onFocus={() => play(i)}
              onBlur={(e) => {
                // Focus moving to this same card's front trigger or one of
                // its now-reachable back-face links must not reverse the
                // flip out from under a keyboard user — only reverse when
                // focus actually leaves the card.
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                reverse(i);
              }}
              className="reveal-card group relative aspect-[279/472] rounded-3xl opacity-0 [perspective:1400px]"
              style={{ boxShadow: "0 0 0 0 rgba(0,0,0,0)" }}
            >
              <div
                ref={(el) => {
                  innerRefs.current[i] = el;
                }}
                className="relative h-full w-full rounded-3xl [transform-style:preserve-3d]"
              >
                {/* Front — a real <button> (not the old wrapping <Link>) so
                    it can be tapped/focused on its own: the back face now
                    holds real links, and a link can't nest inside a link. */}
                <button
                  type="button"
                  ref={(el) => {
                    triggerRefs.current[i] = el;
                  }}
                  aria-expanded="false"
                  aria-label={`${c.title} — show details and explore link`}
                  // Firefox bug 1201471: backface-visibility:hidden is ignored
                  // on a child that has no transform of its own, even inside a
                  // rotating preserve-3d parent — it only culls elements it
                  // considers "transformed". The back face gets this for free
                  // (its own static rotateY(180deg) counts), so the front face
                  // needs an explicit identity transform to qualify too, or
                  // Firefox renders both faces at once, mirrored and overlapping.
                  className="absolute inset-0 block w-full cursor-pointer rounded-3xl text-left [backface-visibility:hidden] [transform:rotateY(0deg)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
                >
                  {/* Firefox renders both faces at once if `overflow-hidden`
                      and `[backface-visibility:hidden]` land on the same
                      element — so the rounding/clipping/background live on
                      this inner wrapper instead of the face element itself. */}
                  <div
                    className={cn(
                      "relative flex h-full w-full flex-col justify-between overflow-hidden rounded-3xl p-6",
                      CARD_BG[c.color],
                    )}
                  >
                    <h3 className={cn("relative z-10 text-lg font-semibold", CARD_TEXT[c.color])}>
                      {c.title}
                    </h3>
                    <div
                      ref={(el) => {
                        frontMotifRefs.current[i] = el;
                      }}
                      className="pointer-events-none absolute inset-0"
                    >
                      <CompetencyCardShape motif={c.motif} className="h-full w-full" />
                    </div>
                  </div>
                </button>

                {/* Back */}
                <div
                  ref={(el) => {
                    backFaceRefs.current[i] = el;
                  }}
                  inert
                  aria-hidden="true"
                  className="absolute inset-0 rounded-3xl [backface-visibility:hidden] [transform:rotateY(180deg)]"
                >
                  <div
                    className={cn(
                      // Mobile cards are half a phone wide (2-col grid):
                      // the reduced padding plus the description being
                      // hidden below sm leaves the Explore pill room to fit
                      // without clipping, which is the bug in issue #74
                      // (the button was pushed out of the card by text that
                      // was too big and too long for that width).
                      "relative flex h-full w-full flex-col justify-between overflow-hidden rounded-3xl p-4 sm:p-6",
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
                        backContentRefs.current[i] = el;
                      }}
                      className="relative z-10 opacity-0"
                    >
                      <h3 className={cn("text-lg font-semibold", CARD_TEXT[c.color])}>{c.title}</h3>
                      <p className={cn("mt-2 hidden text-sm sm:block", CARD_TEXT_MUTED[c.color])}>
                        {c.description}
                      </p>
                      <Link
                        href={c.href}
                        className={cn(
                          "mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors",
                          CARD_PILL[c.color],
                        )}
                      >
                        Explore
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
