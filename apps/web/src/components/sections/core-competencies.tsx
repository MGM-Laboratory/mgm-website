"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { COMPETENCIES, type CompetencyColor } from "@/data/competencies";
import { CompetencyMotifShape } from "./competency-motif";
import { ScrollStack, ScrollStackItem } from "./scroll-stack";

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

// DESIGN_SYSTEM.md §2.3: brand yellow never carries white text — every
// other fill stays white-on-color.
const CARD_TEXT: Record<CompetencyColor, string> = {
  blue: "text-white",
  red: "text-white",
  yellow: "text-[var(--ink)]",
  green: "text-white",
};
const CARD_SUBTEXT: Record<CompetencyColor, string> = {
  blue: "text-white/85",
  red: "text-white/85",
  yellow: "text-[var(--ink)]/70",
  green: "text-white/85",
};
const CARD_PILL: Record<CompetencyColor, string> = {
  blue: "bg-white/20 group-hover:bg-white/30 text-white",
  red: "bg-white/20 group-hover:bg-white/30 text-white",
  yellow: "bg-[var(--ink)]/10 group-hover:bg-[var(--ink)]/15 text-[var(--ink)]",
  green: "bg-white/20 group-hover:bg-white/30 text-white",
};
const MOTIF_STROKE: Record<CompetencyColor, string> = {
  blue: "rgba(255,255,255,0.16)",
  red: "rgba(255,255,255,0.16)",
  yellow: "rgba(14,17,22,0.14)",
  green: "rgba(255,255,255,0.16)",
};

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function CoreCompetenciesSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const motifRefs = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.12 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  // A slow, subtle breathing loop on each card's corner motif — its own
  // node, never touched by ScrollStack's transform writes on the card
  // itself, so the two animations can't stack onto each other (see
  // docs/animation-system.md §Gotchas 1).
  useLayoutEffect(() => {
    if (reducedMotion()) return;
    const loops = motifRefs.current
      .filter((el): el is HTMLDivElement => el !== null)
      .map((el, i) =>
        gsap.to(el, {
          scale: 1.04,
          duration: 3,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: i * 0.3,
        }),
      );
    return () => loops.forEach((loop) => loop.kill());
  }, []);

  return (
    <section ref={rootRef} className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-3xl">
        <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
          Core Competencies
        </h2>
        <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">
          Where MGM Laboratory concentrates its work — research, design, and engineering under one
          roof.
        </p>

        <ScrollStack className="mt-14">
          {COMPETENCIES.map((c, i) => (
            <ScrollStackItem
              key={c.title}
              href={c.href}
              className={cn(
                "group overflow-hidden rounded-3xl p-8 shadow-[0_20px_50px_-20px_rgba(14,17,22,0.35)] transition-colors sm:p-10",
                "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground",
                CARD_BG[c.color],
              )}
            >
              <div
                ref={(el) => {
                  motifRefs.current[i] = el;
                }}
                className="pointer-events-none absolute -top-10 -right-10 size-48 rotate-6 sm:size-64"
              >
                <CompetencyMotifShape
                  motif={c.motif}
                  stroke={MOTIF_STROKE[c.color]}
                  className="h-full w-full"
                />
              </div>

              <div
                className={cn(
                  "relative z-10 flex min-h-52 flex-col justify-between",
                  CARD_TEXT[c.color],
                )}
              >
                <h3 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {c.title}
                </h3>
                <div>
                  <p className={cn("max-w-md text-base sm:text-lg", CARD_SUBTEXT[c.color])}>
                    {c.description}
                  </p>
                  <span
                    className={cn(
                      "mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors",
                      CARD_PILL[c.color],
                    )}
                  >
                    Explore
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </div>
            </ScrollStackItem>
          ))}
        </ScrollStack>
      </div>
    </section>
  );
}
