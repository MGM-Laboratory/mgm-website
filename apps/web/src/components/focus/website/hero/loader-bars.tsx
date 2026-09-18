"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

// The reference hero (Shopify Editions Summer '24) opens on a small cluster
// of vertical bars pulsing like an equalizer while assets decode, then cuts
// to the full scene. We have nothing to actually wait on, so the bars just
// hold the screen for a fixed beat before the caller swaps them for the
// headline + sphere field — see ENTRANCE_DELAY_MS in ../focus-hero.tsx.
const BAR_COLORS = [
  "var(--ink-4, #9aa1ad)",
  "var(--brand-blue)",
  "var(--brand-yellow)",
  "var(--brand-red)",
  "var(--ink-4, #9aa1ad)",
  "var(--ink-4, #9aa1ad)",
  "var(--brand-blue)",
  "var(--ink-4, #9aa1ad)",
  "var(--ink-4, #9aa1ad)",
];

export function LoaderBars({ className }: Readonly<{ className?: string }>) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (reduced) return;

    const bars = gsap.utils.toArray<HTMLElement>(".loader-bar", root);
    const tween = gsap.to(bars, {
      scaleY: () => gsap.utils.random(0.3, 1),
      duration: 0.35,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
      stagger: { each: 0.05, repeat: -1, yoyo: true },
    });
    return () => {
      tween.kill();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={className}
      style={{ display: "flex", alignItems: "center", gap: "5px", height: "38px" }}
    >
      {BAR_COLORS.map((color, i) => (
        <span
          key={i}
          className="loader-bar"
          style={{
            display: "block",
            width: "4px",
            height: "100%",
            borderRadius: "2px",
            background: color,
            transformOrigin: "center",
          }}
        />
      ))}
    </div>
  );
}
