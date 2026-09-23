"use client";

import { useEffect } from "react";

import { startSmoothScroll } from "@/components/projects/stage/smooth-scroller";

/**
 * Runs the /projects page-level scroll machinery. For now: Lenis wheel
 * smoothing, for fine-pointer, full-motion visitors only (touch keeps
 * native scrolling, reduced motion keeps unsmoothed scrolling). Renders
 * nothing.
 */
export function ProjectsStage() {
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!motion || !fine) return;

    let cancelled = false;
    let stopScroll: (() => void) | null = null;
    void startSmoothScroll().then((stop) => {
      if (cancelled) stop();
      else stopScroll = stop;
    });

    return () => {
      cancelled = true;
      stopScroll?.();
    };
  }, []);

  return null;
}
