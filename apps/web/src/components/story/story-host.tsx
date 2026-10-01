"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ScrollSmoother } from "gsap/ScrollSmoother";

import { STORY_KEY, readBoot, reapplyBoot, updateBoot } from "@/components/loader/boot";
import { hardwareWebGL2 } from "@/components/reel/gl/webgl-probe";
import { StoryOverlay } from "@/components/story/story-overlay";
import { StoryWaiting } from "@/components/story/story-waiting";
// Types only: the engine and three.js stay in the dynamic import.
import type { StoryOverlayStore } from "@/components/story/engine/overlay-store";
import type { StoryFallbackReason } from "@/components/story/engine/director";
import type { StoryBuildPhase, StoryEngine } from "@/components/story/engine/story-engine";
import { beatAt, TIMELINE, type BeatId } from "@/components/story/engine/timeline";
import { motionAllowed, onReducedMotion } from "@/lib/reduced-motion";

/**
 * Starts and stops the WebGL story for the mounted homepage. Renders only a
 * marker (to find its section) and, once the engine runs, the overlay.
 *
 * - Only when the boot script chose the WebGL story (`readBoot().story`).
 * - The engine is built once per visit (`ensureStoryEngine`, lazily
 *   imported, never in a first chunk) and attached while `/` is mounted.
 *   Layout effects, so the director lets go in the same commit that leaves
 *   the page, before the root layout's scroll reset (gotcha #13).
 * - While the engine is on the way, a small "Shuffling the deck" with the
 *   build's progress shows over the section (`story-waiting.tsx`).
 * - Start failsafes: 10 s of visible time spent waiting inside the section
 *   for the downloads gives this visit the storybook; 6 s near the section
 *   for the build and warm-up (the device's own work) gives it to the tab.
 * - Any fallback (a lost context, a renderer that cannot keep up, reduced
 *   motion switched on) flips `html[data-story-mode]` to "dom" and scrolls
 *   to the storybook's matching place.
 */

/** Visible time near the section the build and warm-up may take on this device. */
const START_FAILSAFE_MS = 6000;
/** Visible time spent waiting inside the section for the downloads. */
const NETWORK_FAILSAFE_MS = 10_000;

/**
 * The boot script probes only on a hard load of `/`. A visit that started on
 * another page decides here, with the same gates, the first time the
 * homepage mounts (in a layout effect, so the section never paints twice).
 */
function decideStoryMode() {
  const boot = readBoot();
  if (boot.storyDecided) return boot.story;
  let off = false;
  try {
    off = window.sessionStorage.getItem(STORY_KEY) === "dom";
  } catch {
    // No storage: decide on the device alone.
  }
  const nostory = new URLSearchParams(window.location.search).has("nostory");
  const story = !off && !nostory && motionAllowed() && hardwareWebGL2() ? "gl" : "dom";
  updateBoot({ story, storyDecided: true });
  return story;
}

/**
 * The storybook panel (`STORY_PANELS` id) that tells each beat after the
 * cards are drawn. Beats before `c-gather` are the cards themselves, and
 * the finale has its own block.
 */
const PANEL_OF_BEAT: ReadonlyMap<BeatId, string> = new Map<BeatId, string>([
  ["c-gather", "table"],
  ["c-drop", "table"],
  ["r-land", "table"],
  ["r-figure", "toy"],
  ["r-break", "spark"],
  ["r-spark", "spark"],
  ["r-dragged", "spark"],
  ["r-learn", "spark"],
  ["r-tv", "screen"],
  ["r-dive", "screen"],
  ["w-loss", "fall"],
  ["w-fall", "fall"],
]);

/** The storybook's place for story position `t`: the still that tells the same moment. */
function storybookAnchor(section: HTMLElement, t: number): HTMLElement | null {
  if (t < 0) return null;
  if (t >= TIMELINE.finaleStart) return section.querySelector("[data-storybook-finale]");
  const beat = beatAt(t);
  if (!beat) return section.querySelector("[data-storybook-cards]");
  // Every world and rift between w-hole and w-5 is "Five worlds".
  const panel = PANEL_OF_BEAT.get(beat.id) ?? (beat.act === "worlds" ? "worlds" : null);
  if (!panel) return section.querySelector("[data-storybook-cards]");
  return section.querySelector(`[data-storybook-panel="${panel}"]`);
}

/** The story position from the section's rect: what is on screen, engine or not. */
function sectionT(section: HTMLElement) {
  const vh =
    Number.parseFloat(getComputedStyle(section).getPropertyValue("--story-vh")) ||
    window.innerHeight;
  return -section.getBoundingClientRect().top / vh;
}

/**
 * Switches the section to the storybook. Only a visitor already inside the
 * tall WebGL section (`t > 0`) is moved, to the storybook's matching place:
 * anywhere else the switch changes nothing above the viewport's top.
 */
function toStorybook(section: HTMLElement, t: number) {
  updateBoot({ story: "dom" });
  if (!(t > 0)) return;
  const anchor = storybookAnchor(section, t);
  if (anchor) settleOn(anchor);
}

/** Space left above the anchor for the fixed header. */
const ANCHOR_OFFSET_PX = 96;

/**
 * Brings `anchor` to the top of the screen once the section has collapsed
 * to the storybook. ScrollSmoother takes a few frames to catch up with a
 * page that just lost most of its height (its own scroll position is
 * clamped against the old one), so the position is measured from the
 * anchor itself and applied again on each frame until it has held for
 * three frames in a row (at most half a second).
 */
function settleOn(anchor: HTMLElement) {
  let frames = 0;
  let steady = 0;
  const step = () => {
    frames += 1;
    const smoother = ScrollSmoother.get();
    if (smoother) {
      const current = smoother.scrollTop();
      const target = Math.max(0, anchor.getBoundingClientRect().top + current - ANCHOR_OFFSET_PX);
      if (Math.abs(current - target) > 1) {
        steady = 0;
        smoother.scrollTo(target, false);
      } else {
        steady += 1;
      }
    } else {
      const top = anchor.getBoundingClientRect().top;
      if (Math.abs(top - ANCHOR_OFFSET_PX) > 1) {
        steady = 0;
        window.scrollTo({ top: window.scrollY + top - ANCHOR_OFFSET_PX, behavior: "instant" });
      } else {
        steady += 1;
      }
    }
    if (steady < 3 && frames < 30) requestAnimationFrame(step);
  };
  // After the layout switch has been laid out.
  requestAnimationFrame(step);
}

/** The title's width, for the box placeholder (80% of it). */
function watchTitle(section: HTMLElement) {
  const intro = section.querySelector<HTMLElement>("[data-story-intro]");
  const title = section.querySelector<HTMLElement>("[data-story-title]");
  if (!intro || !title) return () => {};
  const apply = () => {
    intro.style.setProperty("--story-title-w", `${title.getBoundingClientRect().width}px`);
  };
  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(title);
  void document.fonts.ready.then(apply);
  return () => {
    observer.disconnect();
  };
}

type Waiting = Readonly<{ section: HTMLElement; fraction: number | null }>;

export function StoryHost() {
  const markerRef = useRef<HTMLSpanElement>(null);
  const [overlay, setOverlay] = useState<StoryOverlayStore | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);

  useLayoutEffect(() => {
    reapplyBoot();
    const section = markerRef.current?.closest<HTMLElement>("[data-story-section]");
    const host = section?.querySelector<HTMLElement>("[data-story-layer-host]");
    if (!section || !host || decideStoryMode() !== "gl") return;

    let disposed = false;
    /** The visit switched to the storybook: a build that finishes later never attaches. */
    let fellBack = false;
    let engine: StoryEngine | null = null;
    let running = false;
    /** Where the build is: "load" while the engine's own code is still downloading. */
    let phase: StoryBuildPhase | "idle" | "load" = "load";
    let offStatus = () => {};
    const stopTitle = watchTitle(section);

    const discard = (reason: StoryFallbackReason) => {
      import("@/components/story/engine/story-engine")
        .then(({ discardStoryEngine }) => {
          discardStoryEngine(reason);
        })
        .catch(() => undefined);
    };

    const fallback = () => {
      if (disposed || fellBack) return;
      fellBack = true;
      const t = engine ? engine.director.t : sectionT(section);
      engine?.detach();
      engine = null;
      running = false;
      window.clearInterval(failsafe);
      offStatus();
      setOverlay(null);
      setWaiting(null);
      toStorybook(section, t);
    };

    // Visible time only (gotcha #18). Two clocks:
    // - downloading (the engine's code or the story's bytes): only the time a
    //   visitor spends inside the section, waiting on it, counts; past 10 s
    //   the visit gets the storybook, and the next visit tries again;
    // - building and warming up (the device's own work): any time near the
    //   section counts; past 6 s the tab gets the storybook.
    let waited = 0;
    let waitedInside = 0;
    let last = performance.now();
    const failsafe = window.setInterval(() => {
      const now = performance.now();
      const step = Math.min(now - last, 500);
      last = now;
      if (running || document.hidden) return;
      const rect = section.getBoundingClientRect();
      const height = window.innerHeight;
      if (phase === "load" || phase === "idle" || phase === "fetch") {
        if (rect.top < 0 && rect.bottom > height) waitedInside += step;
        if (waitedInside < NETWORK_FAILSAFE_MS) return;
        discard("network");
      } else {
        if (rect.top > height * 1.5 || rect.bottom < 0) return;
        waited += step;
        if (waited < START_FAILSAFE_MS) return;
        discard("slow");
      }
      fallback();
    }, 250);

    const offReduced = onReducedMotion(() => {
      discard("failed");
      fallback();
    });

    setWaiting({ section, fraction: null });
    import("@/components/story/engine/story-engine")
      .then(({ ensureStoryEngine, onStoryBuildStatus }) => {
        if (disposed || fellBack) return null;
        offStatus = onStoryBuildStatus((status) => {
          phase = status.phase;
          if (status.phase === "idle") return;
          setWaiting((current) =>
            current && current.fraction !== status.fraction
              ? { section, fraction: status.fraction }
              : current,
          );
        });
        return ensureStoryEngine();
      })
      .then((built) => {
        if (disposed || fellBack) return;
        if (!built) {
          fallback();
          return;
        }
        engine = built;
        running = true;
        window.clearInterval(failsafe);
        offStatus();
        built.attach(section, host, fallback);
        setOverlay(built.overlay);
        setWaiting(null);
      })
      .catch(() => {
        fallback();
      });

    return () => {
      disposed = true;
      window.clearInterval(failsafe);
      offStatus();
      offReduced();
      stopTitle();
      engine?.detach();
      engine = null;
    };
  }, []);

  return (
    <>
      <span ref={markerRef} hidden />
      {overlay ? <StoryOverlay store={overlay} /> : null}
      {waiting && !overlay ? (
        <StoryWaiting section={waiting.section} fraction={waiting.fraction} />
      ) : null}
    </>
  );
}
