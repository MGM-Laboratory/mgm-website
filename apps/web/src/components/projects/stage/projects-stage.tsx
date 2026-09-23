"use client";

import { useEffect } from "react";

import { startSmoothScroll } from "@/components/projects/stage/smooth-scroller";
import { resetStage, setStageMode } from "@/components/projects/stage/stage-registry";

/**
 * Decides how /projects renders its covers and runs the page-level scroll
 * machinery. Covers render in the DOM for now; fine-pointer, full-motion
 * visitors get Lenis wheel smoothing (touch keeps native scrolling,
 * reduced motion keeps unsmoothed scrolling). Renders nothing.
 */
export function ProjectsStage() {
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    let cancelled = false;
    let stopScroll: (() => void) | null = null;
    if (motion && fine) {
      void startSmoothScroll().then((stop) => {
        if (cancelled) stop();
        else stopScroll = stop;
      });
    }
    setStageMode("dom");

    return () => {
      cancelled = true;
      stopScroll?.();
      // Module state outlives this visit; the next one starts undecided
      // (the covers' effects run before this host's on the next mount, so
      // resetting here, not on mount, is what keeps them from reading a
      // stale mode).
      resetStage();
    };
  }, []);

  return null;
}
