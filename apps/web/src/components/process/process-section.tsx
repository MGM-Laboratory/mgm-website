"use client";

import { useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";

import { PROCESS_COPY, PROCESS_ROWS } from "@/data/process-magnets";

import { Magnet } from "./magnet";

/**
 * "How we think": the process words as fridge magnets on a board. The
 * server renders every magnet at home in the poster's reading order, and
 * the board's behaviour (magnet-board.ts: dragging, throwing, flipping, the
 * entrance and the idle life) loads once the section comes near the
 * viewport, so none of it weighs on the first paint.
 */
export function ProcessSection() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let dispose: (() => void) | null = null;
    // Whatever goes wrong while loading, the words must never stay hidden.
    const reveal = () => {
      for (const el of root.querySelectorAll<HTMLElement>(".process-item")) el.style.opacity = "1";
    };
    let idle = 0;
    let idleIsCallback = false;
    const cancelPending = () => {
      if (!idle) return;
      if (idleIsCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      idle = 0;
    };
    let requested = false;
    const load = () => {
      if (requested) return;
      requested = true;
      observer.disconnect();
      // Near the viewport, but still after whatever the browser is busy
      // with (the hero's entrance on a first load).
      const run = () => {
        idle = 0;
        start();
      };
      idleIsCallback = typeof window.requestIdleCallback === "function";
      idle = idleIsCallback
        ? window.requestIdleCallback(run, { timeout: 900 })
        : window.setTimeout(run, 60);
    };
    const start = () => {
      import("./magnet-board")
        .then(({ createMagnetBoard }) => {
          if (cancelled) return;
          try {
            dispose = createMagnetBoard(root);
          } catch {
            reveal();
          }
        })
        .catch(() => {
          if (!cancelled) reveal();
        });
    };
    // A keyboard visitor tabbing in before the board has loaded: show the
    // magnets now and load straight away (the board then skips its throw).
    const onFocusIn = () => {
      if (requested && !idle) return;
      cancelPending();
      requested = true;
      observer.disconnect();
      reveal();
      start();
    };
    root.addEventListener("focusin", onFocusIn);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(root);
    return () => {
      cancelled = true;
      root.removeEventListener("focusin", onFocusIn);
      observer.disconnect();
      cancelPending();
      dispose?.();
    };
  }, []);

  return (
    <section
      id="process"
      ref={rootRef}
      aria-labelledby="process-heading"
      className="relative flex flex-col overflow-x-clip bg-[var(--surface-muted)] px-6 pt-16 pb-8 [--magnet-shadow:0.3] sm:px-10 sm:pt-20 sm:pb-12 lg:px-16 dark:[--magnet-shadow:0.7]"
      data-magnet-board
    >
      <noscript>
        <style>{".reveal-hidden{opacity:1 !important}"}</style>
      </noscript>

      <h2
        id="process-heading"
        className="mb-10 flex items-center gap-3 text-xs font-semibold tracking-[0.12em] text-foreground/60 uppercase sm:mb-12"
      >
        <span className="font-mono">{PROCESS_COPY.chapterNumber}</span>
        <span aria-hidden className="h-px w-8 bg-current opacity-50" />
        {PROCESS_COPY.chapter}
      </h2>

      <div className="flex max-w-5xl flex-col gap-10 sm:gap-14" data-magnet-rows>
        {PROCESS_ROWS.map((row, ri) => (
          <div
            key={ri}
            className="process-row flex flex-wrap items-center gap-x-12 gap-y-10 sm:gap-x-16 sm:gap-y-14"
          >
            {row.map((step) => (
              <Magnet
                key={step.word}
                index={
                  PROCESS_ROWS.slice(0, ri).reduce((n, r) => n + r.length, 0) + row.indexOf(step)
                }
                step={step}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center sm:mt-10" data-magnet-controls>
        <span className="inline-flex" data-magnet-reset-wrap>
          <button
            className="invisible inline-flex h-10 items-center gap-2 rounded-full border border-foreground/15 px-4 text-sm font-medium text-foreground opacity-0 transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            data-magnet-reset
            type="button"
          >
            <RotateCcw aria-hidden className="size-4" data-part="reset-icon" strokeWidth={2.25} />
            {PROCESS_COPY.reset}
          </button>
        </span>
      </div>
    </section>
  );
}
