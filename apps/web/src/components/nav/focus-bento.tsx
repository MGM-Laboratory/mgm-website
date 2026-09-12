"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavBentoLink } from "@/data/nav";
import { CompetencyMotifShape } from "@/components/sections/competency-motif";

const CARD_BG: Record<string, string> = {
  blue: "bg-brand-blue",
  red: "bg-brand-red",
  yellow: "bg-brand-yellow",
  green: "bg-brand-green",
};

const CARD_TEXT: Record<string, string> = {
  blue: "text-white",
  red: "text-white",
  green: "text-white",
  yellow: "text-[var(--ink)]",
};

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// 2x2 flip cards — same recipe as the homepage's Core Competencies cards
// (perspective on the static outer link, preserve-3d on the inner, both
// faces backface-hidden, back pre-rotated 180deg, GSAP flips `rotationY`),
// and the same four brand colors/icon motifs — Focus names that same set
// of four areas.
export function FocusBento({
  items,
  registerRef,
  onNavigate,
}: {
  items: NavBentoLink[];
  registerRef: (index: number, el: HTMLAnchorElement | null) => void;
  onNavigate: () => void;
}) {
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tlRefs = useRef<(gsap.core.Timeline | null)[]>([]);

  useLayoutEffect(() => {
    const d = reducedMotion() ? 0 : 1;
    items.forEach((_, i) => {
      const inner = innerRefs.current[i];
      if (!inner) return;
      const tl = gsap.timeline({ paused: true });
      tl.to(inner, { rotationY: 180, duration: 0.6 * d, ease: "back.out(1.6)" });
      tlRefs.current[i] = tl;
    });
    return () => {
      tlRefs.current.forEach((tl) => tl?.kill());
      tlRefs.current = [];
    };
  }, [items]);

  // Not skipped under reduced motion (unlike a purely decorative burst) —
  // the timeline's own durations are already collapsed to 0 above, so this
  // still runs, just instantly, keeping the back/reveal content reachable.
  function play(i: number) {
    tlRefs.current[i]?.play();
  }
  function reverse(i: number) {
    tlRefs.current[i]?.reverse();
  }

  return (
    <div className="grid grid-cols-2 gap-[0.4em] pt-[0.15em] pb-[0.3em] text-[clamp(0.65rem,1.7dvh,0.95rem)]">
      {items.map((item, i) => (
        <Link
          key={item.href}
          ref={(el) => registerRef(i, el)}
          href={item.href}
          onClick={onNavigate}
          onMouseEnter={() => play(i)}
          onMouseLeave={() => reverse(i)}
          onFocus={() => play(i)}
          onBlur={() => reverse(i)}
          className="group relative block h-[clamp(2.4rem,7dvh,4.2rem)] rounded-xl [perspective:900px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <div
            ref={(el) => {
              innerRefs.current[i] = el;
            }}
            className="relative h-full w-full rounded-xl [transform-style:preserve-3d]"
          >
            <div
              className={cn(
                "absolute inset-0 overflow-hidden rounded-xl p-[0.35em] [backface-visibility:hidden]",
                CARD_BG[item.color] ?? "bg-brand-blue",
              )}
            >
              {item.motif && (
                <CompetencyMotifShape
                  motif={item.motif}
                  stroke="rgba(255,255,255,0.32)"
                  className="-right-3 -bottom-3 size-[2.6em]"
                />
              )}
              <span
                className={cn(
                  "relative z-10 text-[1em] leading-tight font-semibold",
                  CARD_TEXT[item.color] ?? "text-white",
                )}
              >
                {item.label}
              </span>
            </div>
            <div
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center gap-[0.35em] overflow-hidden rounded-xl p-[0.3em] text-center [backface-visibility:hidden] [transform:rotateY(180deg)]",
                CARD_BG[item.color] ?? "bg-brand-blue",
                CARD_TEXT[item.color] ?? "text-white",
              )}
            >
              {item.motif && (
                <CompetencyMotifShape
                  motif={item.motif}
                  stroke="rgba(255,255,255,0.18)"
                  className="-top-4 -left-4 size-16 rotate-12"
                />
              )}
              <span className="relative z-10 text-[0.9em] font-semibold">{item.label}</span>
              <span className="relative z-10 inline-flex items-center gap-1 rounded-full bg-white/20 px-[0.6em] py-[0.15em] text-[0.55em] font-medium">
                Explore
                <ArrowRight className="size-[0.8em]" />
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
