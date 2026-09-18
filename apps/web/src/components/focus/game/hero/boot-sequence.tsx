"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

const BAR_COLORS = [
  "var(--brand-green)",
  "var(--brand-blue)",
  "var(--brand-yellow)",
  "var(--brand-red)",
  "var(--brand-green)",
];

// A brief "press start" mood beat before the hero settles — on-brand
// (Geist Mono, brand-colored bars, Bauhaus-flat) rather than a retro-pixel
// pastiche, and short on purpose: there's nothing to actually wait for, so
// it reads as a flourish, not a real loading state.
export function BootSequence({ onComplete }: { onComplete: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const bars = barsRef.current.filter((el): el is HTMLSpanElement => el !== null);
    if (!root || !bars.length) return undefined;

    const tl = gsap.timeline({ onComplete });
    tl.to(bars, {
      scaleY: () => gsap.utils.random(0.3, 1),
      duration: 0.13,
      repeat: 3,
      yoyo: true,
      stagger: { each: 0.03, repeat: 3, yoyo: true },
      ease: "power1.inOut",
    }).to(root, { opacity: 0, duration: 0.22, ease: "power1.in" }, "+=0.05");

    return () => {
      tl.kill();
    };
  }, [onComplete]);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-20 flex items-center justify-center gap-4 bg-[var(--surface-muted)]"
    >
      <span className="font-mono text-xs tracking-[0.2em] text-foreground/50 uppercase">
        Loading
      </span>
      <div className="flex h-8 items-end gap-1.5">
        {BAR_COLORS.map((color, i) => (
          <span
            key={i}
            ref={(el) => {
              barsRef.current[i] = el;
            }}
            className="h-full w-1.5 origin-bottom rounded-full"
            style={{ backgroundColor: color, transform: "scaleY(0.3)" }}
          />
        ))}
      </div>
    </div>
  );
}
