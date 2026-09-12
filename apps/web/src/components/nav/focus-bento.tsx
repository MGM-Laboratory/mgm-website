"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";

import type { NavBentoLink } from "@/data/nav";

const CARD_BG = ["bg-brand-blue", "bg-brand-red", "bg-brand-yellow", "bg-brand-green"];

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// 2x2 flip cards — same recipe as the homepage's Core Competencies cards
// (perspective on the static outer link, preserve-3d on the inner, both
// faces backface-hidden, back pre-rotated 180deg, GSAP flips `rotationY`).
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
      tl.to(inner, { rotationY: 180, duration: 0.55 * d, ease: "back.out(1.7)" });
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
    <div className="grid grid-cols-2 gap-[0.3em] pt-[0.15em] pb-[0.3em] text-[clamp(0.6rem,1.6dvh,0.85rem)]">
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
          className="group relative block h-[clamp(1.9rem,5.2dvh,3rem)] rounded-lg [perspective:900px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <div
            ref={(el) => {
              innerRefs.current[i] = el;
            }}
            className="relative h-full w-full rounded-lg [transform-style:preserve-3d]"
          >
            <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--background)] p-[0.4em] text-center [backface-visibility:hidden]">
              <span className="text-[1em] leading-tight font-semibold text-foreground">
                {item.label}
              </span>
            </div>
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center gap-[0.2em] rounded-lg p-[0.3em] text-center text-white [backface-visibility:hidden] [transform:rotateY(180deg)] ${CARD_BG[i % CARD_BG.length]}`}
            >
              <span className="text-[0.9em] font-semibold">{item.label}</span>
              <span className="text-[0.72em] leading-tight text-white/85">{item.description}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
