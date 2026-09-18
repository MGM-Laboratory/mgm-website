"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import type { MobileHeroCanvasProps } from "./orbit-canvas";

const MobileHeroCanvas = dynamic<MobileHeroCanvasProps>(() => import("./orbit-canvas"), {
  ssr: false,
});

// Same reasoning as the /website hero and the homepage lanyard: a perpetual
// R3F render loop is a decorative loop, so reduced motion never mounts the
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
      <rect x="40" y="60" width="120" height="230" rx="16" fill="var(--brand-red)" opacity="0.15" />
      <rect
        x="52"
        y="72"
        width="96"
        height="206"
        rx="10"
        fill="var(--surface, #fff)"
        stroke="var(--brand-red)"
        strokeWidth="2"
      />
      <rect
        x="220"
        y="120"
        width="110"
        height="210"
        rx="16"
        fill="var(--brand-blue)"
        opacity="0.15"
      />
      <rect
        x="231"
        y="131"
        width="88"
        height="188"
        rx="10"
        fill="var(--surface, #fff)"
        stroke="var(--brand-blue)"
        strokeWidth="2"
      />
      <path d="M330 40V110H370" fill="none" stroke="var(--brand-yellow)" strokeWidth="14" />
      <path d="M60 340V310H100" fill="none" stroke="var(--brand-red)" strokeWidth="10" />
    </svg>
  );
}

export function MobileHeroVisual({ sectionEl }: { sectionEl: HTMLElement | null }) {
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
      <MobileHeroCanvas sectionEl={sectionEl} reducedMotion={false} />
    </div>
  );
}
