"use client";

import { useEffect, useLayoutEffect } from "react";

import type { CoverEngine } from "@/components/projects/stage/cover-engine";
import { startDomReaction } from "@/components/projects/stage/dom-reaction";
import { startSmoothScroll } from "@/components/projects/stage/smooth-scroller";
import {
  getStageMode,
  onStageModeChange,
  resetStage,
  setStageMode,
} from "@/components/projects/stage/stage-registry";
import { waitForProjectsIntro } from "@/lib/projects-intro";
import { onReducedMotion } from "@/lib/reduced-motion";

// A layout effect on purpose: its cleanup runs in the same commit that
// swaps the route, before the route-change handler resets the scroll to
// the top. As a passive effect, a still-gliding Lenis outlived that reset
// by a commit and dragged the next page back to the old scroll position.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

let webgl2Supported: boolean | null = null;

/**
 * three@0.186 is WebGL2-only, so probe for a hardware-accelerated WebGL2
 * context before paying for the import (a software rasteriser would run
 * a full-screen canvas at a crawl: those visitors get the DOM covers).
 */
function supportsWebGL2() {
  if (webgl2Supported !== null) return webgl2Supported;
  try {
    const context = document
      .createElement("canvas")
      .getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    webgl2Supported = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2Supported = false;
  }
  return webgl2Supported;
}

/**
 * Decides how /projects renders its covers and runs whatever that needs:
 *
 * - Fine pointer + full motion + hardware WebGL2: the WebGL cover stage
 *   (cover-engine.ts, dynamically imported) plus Lenis wheel smoothing.
 *   three.js is fetched and parsed right away, in parallel with the hero's
 *   intro, but the renderer is only created, the shader compiled and the
 *   first covers uploaded once the intro has finished, so the intro never
 *   hitches. The grid waits a short moment for that before revealing the
 *   list. If the stage is later than that (a slow network, slow covers),
 *   the list reveals on time with DOM covers and the stage takes the cards
 *   over one by one once it is ready: off screen, or on screen only at a
 *   moment the swap can't show (cover-engine.ts attachAtRest).
 * - Fine pointer without WebGL2: DOM covers, still with smooth scrolling.
 * - Touch: DOM covers and native scrolling.
 * - Reduced motion: DOM covers, completely static (also when it is turned
 *   on mid-visit: everything above is torn down).
 *
 * "dom" is final: touch, reduced motion, no WebGL2, a stage that failed to
 * start, or a WebGL context lost later (the engine is then disposed and
 * every card handed back). With motion allowed, the DOM scroll reaction
 * runs throughout and moves every card the stage doesn't draw.
 * Renders nothing.
 */
export function ProjectsStage() {
  useIsomorphicLayoutEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    let cancelled = false;
    let reduced = false;
    let engine: CoverEngine | null = null;
    let stopScroll: (() => void) | null = null;
    let stopReaction: (() => void) | null = null;

    const disposeEngine = () => {
      engine?.dispose();
      engine = null;
    };
    const offMode = onStageModeChange((mode) => {
      if (mode === "dom") disposeEngine();
    });
    // Skips the cards the stage draws, so it covers every mode, including a
    // list that revealed before the stage was ready.
    if (motion) stopReaction = startDomReaction();

    // Reduced motion turned on mid-visit: native scrolling, no WebGL stage
    // (every card handed back to its DOM cover, which goes static itself)
    // and no scroll reaction, for the rest of the visit.
    const offReduced = motion
      ? onReducedMotion(() => {
          reduced = true;
          stopScroll?.();
          stopScroll = null;
          stopReaction?.();
          stopReaction = null;
          setStageMode("dom");
        })
      : null;

    if (!motion) {
      setStageMode("dom");
    } else {
      if (fine) {
        void startSmoothScroll().then((stop) => {
          if (cancelled || reduced) stop();
          else stopScroll = stop;
        });
      }

      if (!fine || !supportsWebGL2()) {
        setStageMode("dom");
      } else {
        import("@/components/projects/stage/cover-engine")
          .then(async ({ CoverEngine }) => {
            if (cancelled || getStageMode() === "dom") return;
            const created = new CoverEngine({ onContextLost: () => setStageMode("dom") });
            engine = created;
            created.warm();
            await waitForProjectsIntro();
            if (cancelled || engine !== created) return;
            const ready = await created.prepare();
            if (cancelled || engine !== created) return;
            if (!ready) {
              setStageMode("dom");
              return;
            }
            created.start();
            setStageMode("gl");
          })
          .catch(() => {
            if (!cancelled) setStageMode("dom");
          });
      }
    }

    return () => {
      cancelled = true;
      offMode();
      offReduced?.();
      disposeEngine();
      stopScroll?.();
      stopReaction?.();
      // Module state outlives this visit; the next one starts undecided.
      // (On mount this host's layout effect runs before the covers',
      // since it is their earlier sibling: the registry is still empty
      // then, so nothing here may expect registered cards.)
      resetStage();
    };
  }, []);

  return null;
}
