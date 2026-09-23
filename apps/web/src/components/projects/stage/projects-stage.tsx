"use client";

import { useEffect } from "react";

import { startDomReaction } from "@/components/projects/stage/dom-reaction";
import { startSmoothScroll } from "@/components/projects/stage/smooth-scroller";
import { resetStage, setStageMode } from "@/components/projects/stage/stage-registry";

/**
 * Decides how /projects renders its covers and runs the page-level scroll
 * machinery. Covers render in the DOM for now, playing their DOM opening
 * and reacting physically to the scroll speed; fine-pointer, full-motion
 * visitors also get Lenis wheel smoothing (touch keeps native scrolling).
 * Reduced motion keeps everything static. Renders nothing.
 */
export function ProjectsStage() {
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    let cancelled = false;
    let stopScroll: (() => void) | null = null;
    let stopReaction: (() => void) | null = null;
    if (motion && fine) {
      void startSmoothScroll().then((stop) => {
        if (cancelled) stop();
        else stopScroll = stop;
      });
    }
    setStageMode("dom");
    if (motion) stopReaction = startDomReaction();

    return () => {
      cancelled = true;
      stopScroll?.();
      stopReaction?.();
      // Module state outlives this visit; the next one starts undecided
      // (the covers' effects run before this host's on the next mount, so
      // resetting here, not on mount, is what keeps them from reading a
      // stale mode).
      resetStage();
    };
  }, []);

  return null;
}
