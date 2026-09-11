"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";

type Competency = {
  title: string;
  color: "blue" | "red" | "yellow" | "green";
  motif: "ring" | "bracket" | "cross" | "chevron";
};

const COMPETENCIES: Competency[] = [
  { title: "Website Development", color: "blue", motif: "ring" },
  { title: "Mobile Development", color: "red", motif: "bracket" },
  { title: "UX Research & Design", color: "yellow", motif: "cross" },
  { title: "Interactive Media", color: "green", motif: "chevron" },
];

const CARD_BG: Record<Competency["color"], string> = {
  blue: "bg-brand-blue",
  red: "bg-brand-red",
  yellow: "bg-brand-yellow",
  green: "bg-brand-green",
};

function CardMotif({ motif }: { motif: Competency["motif"] }) {
  const stroke = "var(--pattern-canvas)";
  switch (motif) {
    case "ring":
      return (
        <svg viewBox="0 0 100 100" className="absolute -right-4 -bottom-4 size-32" aria-hidden>
          <circle cx="50" cy="50" r="34" fill="none" stroke={stroke} strokeWidth="16" />
        </svg>
      );
    case "bracket":
      return (
        <svg viewBox="0 0 100 100" className="absolute -right-4 -bottom-4 size-32" aria-hidden>
          <path d="M20 20V80H80V60H45V20Z" fill={stroke} />
        </svg>
      );
    case "cross":
      return (
        <svg viewBox="0 0 100 100" className="absolute -right-4 -bottom-4 size-32" aria-hidden>
          <path
            d="M20 20L80 80M80 20L20 80"
            stroke={stroke}
            strokeWidth="16"
            strokeLinecap="round"
          />
        </svg>
      );
    case "chevron":
      return (
        <svg viewBox="0 0 100 100" className="absolute -right-4 -bottom-4 size-32" aria-hidden>
          <path d="M20 85L60 20H80L40 85Z" fill={stroke} />
        </svg>
      );
  }
}

export function CoreCompetenciesSection() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.12 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <section ref={rootRef} className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
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

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {COMPETENCIES.map((c) => (
            <div
              key={c.title}
              className={cn(
                "reveal-card relative flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-2xl p-6 opacity-0",
                CARD_BG[c.color],
              )}
            >
              <h3 className="relative z-10 text-lg font-semibold text-white">{c.title}</h3>
              <CardMotif motif={c.motif} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
