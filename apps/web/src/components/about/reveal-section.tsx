"use client";

import { useLayoutEffect, useRef } from "react";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";

// A thin, reusable version of the fade-up-on-scroll wiring already used by
// CoreCompetenciesSection / ProcessSection — one timeline-level ScrollTrigger
// per instance (never tween-level; see animation-system.md gotcha #4), reduced
// motion resolved synchronously inside fadeUpOnScroll itself. Mark any child
// that should animate in with `reveal-item opacity-0`.
export function RevealSection({
  className,
  stagger = 0.1,
  y,
  children,
}: {
  className?: string;
  stagger?: number;
  y?: number;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-item", { stagger, y });
    return () => tween?.scrollTrigger?.kill();
  }, [stagger, y]);

  return (
    <div ref={rootRef} className={className}>
      <noscript>
        <style>{".reveal-item{opacity:1 !important}"}</style>
      </noscript>
      {children}
    </div>
  );
}
