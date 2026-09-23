"use client";

import { useEffect } from "react";

import type { CoverEngine } from "@/components/projects/stage/cover-engine";
import { startDomReaction } from "@/components/projects/stage/dom-reaction";
import { startSmoothScroll } from "@/components/projects/stage/smooth-scroller";
import {
  getStageCards,
  getStageMode,
  onStageModeChange,
  resetStage,
  setStageMode,
} from "@/components/projects/stage/stage-registry";
import { waitForProjectsIntro } from "@/lib/projects-intro";

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
 *   list, and settles on the DOM covers if it takes longer.
 * - Fine pointer without WebGL2: DOM covers, still with smooth scrolling.
 * - Touch: DOM covers and native scrolling.
 * - Reduced motion: DOM covers, completely static.
 *
 * Whenever the mode ends up "dom" (including a lost WebGL context later),
 * the DOM scroll reaction takes over the cards' physical response.
 * Renders nothing.
 */
export function ProjectsStage() {
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    let cancelled = false;
    let engine: CoverEngine | null = null;
    let stopScroll: (() => void) | null = null;
    let stopReaction: (() => void) | null = null;

    const disposeEngine = () => {
      engine?.dispose();
      engine = null;
    };
    const fallBackToDom = () => {
      disposeEngine();
      if (motion && !stopReaction) stopReaction = startDomReaction();
    };
    const offMode = onStageModeChange((mode) => {
      if (mode === "dom") fallBackToDom();
    });

    if (!motion) {
      setStageMode("dom");
    } else {
      if (fine) {
        void startSmoothScroll().then((stop) => {
          if (cancelled) stop();
          else stopScroll = stop;
        });
      }

      if (!fine || !supportsWebGL2()) {
        setStageMode("dom");
      } else {
        // Textures have to be ready before a card scrolls in, so fetch
        // every cover now instead of waiting for native lazy loading.
        for (const card of getStageCards()) {
          if (card.image) card.image.loading = "eager";
        }
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

    if (getStageMode() === "dom") fallBackToDom();

    return () => {
      cancelled = true;
      offMode();
      disposeEngine();
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
