"use client";

import { useEffect } from "react";

import type { LoaderViewProps } from "@/components/loader/site-loader";
import { LOADER_COPY } from "@/data/story";

/**
 * The loader's visuals (a stub: the loader package replaces this file, and
 * only this file). It gets the core's snapshot and calls `onExited` when its
 * exit has played; the core hides the loader then (or after
 * `LOADER_TIMING.exitTimeoutMs` if it never does). Everything here is
 * decorative: the core already exposes the progress bar and the live
 * region to assistive technology.
 */

const EXIT_MS = 420;

function StarMark() {
  const points: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 30 : 30 * 0.314;
    points.push(`${(32 + Math.cos(a) * r).toFixed(2)},${(32 + Math.sin(a) * r).toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 64 64" className="site-loader-star size-14" aria-hidden>
      <polygon points={points.join(" ")} fill="var(--brand-blue)" />
    </svg>
  );
}

export function LoaderView({ state, onExited }: LoaderViewProps) {
  const leaving = state.phase === "leaving";
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onExited, state.reducedMotion ? 0 : EXIT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [leaving, onExited, state.reducedMotion]);

  const percent = Math.round(state.progress * 100);
  const status =
    LOADER_COPY.statuses.at(Math.floor(state.elapsed / 2500) % LOADER_COPY.statuses.length) ??
    LOADER_COPY.statuses[0];
  return (
    <div className="flex flex-col items-center gap-7 px-6 text-center">
      <StarMark />
      <div className="w-[min(18rem,70vw)]">
        <div className="h-[3px] overflow-hidden rounded-full bg-foreground/10">
          <div
            className="site-loader-bar h-full rounded-full bg-brand-blue"
            style={{ width: `${Math.max(4, percent)}%` }}
          />
        </div>
        <div className="mt-3 flex items-baseline justify-between font-mono text-xs text-foreground/70">
          <span>{status}</span>
          <span>{String(percent).padStart(2, "0")}%</span>
        </div>
      </div>
    </div>
  );
}
