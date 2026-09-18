"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import type { WebsiteHeroCanvasProps } from "./orbit-canvas";

const WebsiteHeroCanvas = dynamic<WebsiteHeroCanvasProps>(() => import("./orbit-canvas"), {
  ssr: false,
});

// Same reasoning as AboutLanyard: a perpetual R3F render loop is exactly the
// "decorative loop" animation-system.md says to skip entirely under reduced
// motion, so reduced motion never mounts the Canvas at all — it renders a
// plain static SVG snapshot of the assembled cluster in the same slot.
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
      <circle cx="280" cy="140" r="70" fill="none" stroke="var(--brand-blue)" strokeWidth="24" />
      <rect x="40" y="70" width="150" height="104" rx="6" fill="var(--brand-blue)" opacity="0.15" />
      <rect
        x="52"
        y="82"
        width="126"
        height="80"
        rx="4"
        fill="var(--surface, #fff)"
        stroke="var(--brand-blue)"
        strokeWidth="2"
      />
      <rect x="70" y="150" width="150" height="90" rx="6" fill="var(--brand-red)" opacity="0.15" />
      <rect
        x="82"
        y="162"
        width="126"
        height="66"
        rx="4"
        fill="var(--surface, #fff)"
        stroke="var(--brand-red)"
        strokeWidth="2"
      />
      <circle cx="330" cy="290" r="34" fill="none" stroke="var(--brand-red)" strokeWidth="14" />
      <rect x="60" y="290" width="60" height="16" rx="8" fill="var(--brand-yellow)" />
    </svg>
  );
}

export function WebsiteHeroVisual({ sectionEl }: { sectionEl: HTMLElement | null }) {
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
      <WebsiteHeroCanvas sectionEl={sectionEl} reducedMotion={false} />
    </div>
  );
}
