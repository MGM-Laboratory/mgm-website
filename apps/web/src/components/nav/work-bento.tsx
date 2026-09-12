"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { BookOpen, FlaskConical, LayoutGrid, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavBentoLink } from "@/data/nav";

const CARD_BG = ["bg-brand-green", "bg-brand-blue", "bg-brand-red"];
const ICONS: LucideIcon[] = [LayoutGrid, BookOpen, FlaskConical];

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// Deliberately a different mechanic than Focus's 3D flip: an accent panel
// slides up from the bottom to cover the card while it lifts on its own
// shadow, instead of rotating — same "reveal a description" idea, a
// different axis of motion so the two dropdowns don't feel identical.
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
    <div className="grid grid-cols-2 auto-rows-[clamp(1.9rem,5.2dvh,3rem)] gap-[0.3em] pt-[0.15em] pb-[0.3em] text-[clamp(0.6rem,1.6dvh,0.85rem)]">
      {items.map((item, i) => {
        const Icon = ICONS[i % ICONS.length];
        return (
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
              "group relative block overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--background)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
              i === 0 && "col-span-2",
            )}
          >
            <div className="absolute inset-0 flex items-center justify-between gap-[0.3em] px-[0.4em]">
              <span className="text-[1em] font-semibold text-foreground">{item.label}</span>
              <Icon className="size-[1em] shrink-0 text-foreground/25" />
            </div>
            <div
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              className={cn(
                "absolute inset-0 flex flex-col justify-center gap-[0.1em] px-[0.4em] text-white",
                CARD_BG[i % CARD_BG.length],
              )}
            >
              <span className="text-[0.95em] font-semibold">{item.label}</span>
              <span className="line-clamp-1 text-[0.75em] text-white/85">{item.description}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
