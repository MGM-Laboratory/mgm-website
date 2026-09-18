"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import type { GameHeroCanvasProps } from "./console-canvas";

const GameHeroCanvas = dynamic<GameHeroCanvasProps>(() => import("./console-canvas"), {
  ssr: false,
});

// Same reasoning as the homepage lanyard and the /website hero: a perpetual
// R3F render loop is exactly the "decorative loop" animation-system.md says
// to skip entirely under reduced motion, so reduced motion never mounts the
// Canvas — it gets a static SVG snapshot of the assembled cluster instead.
function useReducedMotion() {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = (matches: boolean) => setReduced(matches);
    sync(mq.matches);
    const onChange = (e: MediaQueryListEvent) => sync(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function StaticClusterSnapshot() {
  return (
    <svg viewBox="0 0 400 400" className="size-full" aria-hidden>
      <path
        d="M300 60L255 140H285L240 220L340 120H305L340 60Z"
        fill="var(--brand-green)"
        opacity="0.9"
      />
      <rect x="40" y="90" width="150" height="70" rx="18" fill="var(--brand-blue)" />
      <circle cx="30" cy="125" r="28" fill="var(--brand-blue)" />
      <circle cx="200" cy="125" r="28" fill="var(--brand-blue)" />
      <rect x="80" y="180" width="140" height="80" rx="10" fill="var(--brand-red)" opacity="0.85" />
      <rect x="230" y="260" width="70" height="16" rx="8" fill="var(--brand-yellow)" />
      <circle cx="265" cy="300" r="26" fill="var(--brand-yellow)" />
      <path
        d="M120 330L100 365H115L95 400L145 355H125L145 330Z"
        fill="var(--brand-green)"
        opacity="0.6"
      />
    </svg>
  );
}

export function GameHeroVisual({ sectionEl }: { sectionEl: HTMLElement | null }) {
  const reduced = useReducedMotion();

  if (reduced === null) return null;

  if (reduced) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-70">
        <StaticClusterSnapshot />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      <GameHeroCanvas sectionEl={sectionEl} reducedMotion={false} />
    </div>
  );
}
