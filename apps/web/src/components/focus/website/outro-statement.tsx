"use client";

import { useLayoutEffect, useRef } from "react";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { GrainOverlay } from "./grain-overlay";

export function OutroStatement() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.08, y: 32 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <section className="relative overflow-hidden bg-background px-6 py-28 text-center sm:px-10 sm:py-36 lg:px-16">
      <GrainOverlay className="opacity-[0.04]" />
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>
      <div ref={rootRef} className="relative mx-auto max-w-4xl">
        <p className="reveal-card font-mono text-xs font-semibold tracking-wide text-brand-blue uppercase opacity-0">
          The point
        </p>
        <p className="reveal-card mt-4 font-display text-[clamp(2rem,6vw,4.5rem)] leading-[1.02] font-semibold tracking-tight text-foreground opacity-0">
          Six monitors. One desk. <span className="text-brand-red">Zero</span> excuses.
        </p>
      </div>
    </section>
  );
}
