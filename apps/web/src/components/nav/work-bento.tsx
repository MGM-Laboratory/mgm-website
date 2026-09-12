"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavBentoLink } from "@/data/nav";
import { FlairShape } from "@/components/process/pattern-tile";

const CARD_BG: Record<string, string> = {
  blue: "bg-brand-blue",
  red: "bg-brand-red",
  yellow: "bg-[#FFBC00]",
  green: "bg-brand-green",
};

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// Deliberately a different mechanic than Focus's 3D flip: an accent panel
// slides up from the bottom to cover the card while it lifts on its own
// shadow, instead of rotating — same "reveal more" idea, a different axis
// of motion so the two dropdowns don't feel identical.
// items[0] (Projects) spans both columns; the other two sit side by side.
export function WorkBento({
  items,
  registerRef,
  onNavigate,
}: {
  items: NavBentoLink[];
  registerRef: (index: number, el: HTMLAnchorElement | null) => void;
  onNavigate: () => void;
}) {
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const watermarkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tlRefs = useRef<(gsap.core.Timeline | null)[]>([]);

  useLayoutEffect(() => {
    const d = reducedMotion() ? 0 : 1;
    items.forEach((_, i) => {
      const link = linkRefs.current[i];
      const panel = panelRefs.current[i];
      if (!link || !panel) return;
      // The panel mounts inside the accordion's still-collapsed (height:0)
      // clip, so it has no rendered height yet when this effect runs —
      // relying on GSAP to infer "currently at translate-y-full" from the
      // Tailwind class at that point resolves the percentage against a
      // zero-height box. Giving GSAP the starting value explicitly (once
      // the accordion is later open and the card has real height) avoids
      // that, the same fix boxShadow's implicit "none" start needed.
      gsap.set(panel, { yPercent: 100 });
      const tl = gsap.timeline({ paused: true, defaults: { overwrite: "auto" } });
      tl.to(
        link,
        { y: -4, boxShadow: "0 14px 28px -16px rgba(0,0,0,0.35)", duration: 0.35 * d },
        0,
      ).to(panel, { yPercent: 0, duration: 0.45 * d, ease: "power3.out" }, 0);
      const watermark = watermarkRefs.current[i];
      if (watermark) {
        tl.fromTo(
          watermark,
          { scale: 0.85, rotate: -6 },
          { scale: 1, rotate: 0, duration: 0.5 * d, ease: "back.out(1.6)" },
          0.05,
        );
      }
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
    <div className="grid grid-cols-2 auto-rows-[clamp(2.4rem,7dvh,4.2rem)] gap-[0.4em] pt-[0.15em] pb-[0.3em] text-[clamp(0.65rem,1.7dvh,0.95rem)]">
      {items.map((item, i) => (
        <Link
          key={item.href}
          ref={(el) => {
            linkRefs.current[i] = el;
            registerRef(i, el);
          }}
          href={item.href}
          onClick={onNavigate}
          onMouseEnter={() => play(i)}
          onMouseLeave={() => reverse(i)}
          onFocus={() => play(i)}
          onBlur={() => reverse(i)}
          style={{ boxShadow: "0 0 0 0 rgba(0,0,0,0)" }}
          className={cn(
            "group relative block overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--background)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
            i === 0 && "col-span-2",
          )}
        >
          <div className="absolute inset-0 flex items-center px-[0.4em]">
            {item.pattern && (
              <FlairShape
                kind={item.pattern}
                tone={item.color}
                className="pointer-events-none absolute -top-2 -right-2 size-[2.2em] opacity-20"
              />
            )}
            <span className="text-[1em] font-semibold text-foreground">{item.label}</span>
          </div>
          <div
            ref={(el) => {
              panelRefs.current[i] = el;
            }}
            className={cn(
              "absolute inset-0 flex flex-col items-start justify-center gap-[0.35em] overflow-hidden px-[0.4em] text-white",
              CARD_BG[item.color] ?? "bg-brand-blue",
            )}
          >
            {item.pattern && (
              <div
                ref={(el) => {
                  watermarkRefs.current[i] = el;
                }}
                className="pointer-events-none absolute -top-3 -right-3 size-[2.8em] opacity-25"
              >
                <FlairShape kind={item.pattern} tone="white" className="h-full w-full" />
              </div>
            )}
            <span className="relative z-10 text-[0.95em] font-semibold">{item.label}</span>
            <span className="relative z-10 inline-flex items-center gap-1 rounded-full bg-white/20 px-[0.6em] py-[0.15em] text-[0.55em] font-medium">
              View
              <ArrowRight className="size-[0.8em]" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
