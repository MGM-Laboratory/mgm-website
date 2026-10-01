"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ScrollSmoother } from "gsap/ScrollSmoother";

import { STORY_KEY, readBoot, reapplyBoot, updateBoot } from "@/components/loader/boot";
import { hardwareWebGL2 } from "@/components/reel/gl/webgl-probe";
import { StoryOverlay } from "@/components/story/story-overlay";
// Types only: the engine and three.js stay in the dynamic import.
import type { StoryOverlayStore } from "@/components/story/engine/overlay-store";
import type { StoryEngine } from "@/components/story/engine/story-engine";
import { actOf, TIMELINE } from "@/components/story/engine/timeline";
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
 * - A start failsafe: if the engine is not drawing after 6 s of visible
 *   time with the section on screen, the visit gets the storybook.
 * - Any fallback (a lost context, a renderer that cannot keep up, reduced
 *   motion switched on) flips `html[data-story-mode]` to "dom" and scrolls
 *   to the storybook's matching place.
 */

const START_FAILSAFE_MS = 6000;

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

/** The storybook's place for story position `t`. */
function storybookAnchor(section: HTMLElement, t: number): HTMLElement | null {
  if (t < 0) return null;
  if (t < actOf("cards").end) return section.querySelector("[data-storybook-cards]");
  if (t >= TIMELINE.finaleStart) return section.querySelector("[data-storybook-finale]");
  const from = actOf("room").start;
  const to = actOf("worlds").end;
  const panels = section.querySelectorAll<HTMLElement>("[data-storybook-panel]");
  const index = Math.min(panels.length - 1, Math.floor(((t - from) / (to - from)) * panels.length));
  return panels.item(Math.max(0, index));
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
  if (!anchor) return;
  // After the layout switch has been laid out.
  requestAnimationFrame(() => {
    const smoother = ScrollSmoother.get();
    if (smoother) smoother.scrollTo(anchor, false, "top 96px");
    else anchor.scrollIntoView({ block: "start", behavior: "instant" });
  });
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

export function StoryHost() {
  const markerRef = useRef<HTMLSpanElement>(null);
  const [overlay, setOverlay] = useState<StoryOverlayStore | null>(null);

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
    const stopTitle = watchTitle(section);

    const fallback = () => {
      if (disposed || fellBack) return;
      fellBack = true;
      const t = engine ? engine.director.t : sectionT(section);
      engine?.detach();
      engine = null;
      running = false;
      window.clearInterval(failsafe);
      setOverlay(null);
      toStorybook(section, t);
    };

    // Visible time only (gotcha #18), and only while the section is near.
    let waited = 0;
    let last = performance.now();
    const failsafe = window.setInterval(() => {
      const now = performance.now();
      const step = now - last;
      last = now;
      if (running || document.hidden) return;
      const rect = section.getBoundingClientRect();
      if (rect.top > window.innerHeight * 1.5 || rect.bottom < 0) return;
      waited += Math.min(step, 500);
      if (waited < START_FAILSAFE_MS) return;
      window.clearInterval(failsafe);
      import("@/components/story/engine/story-engine")
        .then(({ discardStoryEngine }) => {
          discardStoryEngine("slow");
        })
        .catch(() => undefined);
      fallback();
    }, 250);

    const offReduced = onReducedMotion(() => {
      import("@/components/story/engine/story-engine")
        .then(({ discardStoryEngine }) => {
          discardStoryEngine("failed");
        })
        .catch(() => undefined);
      fallback();
    });

    import("@/components/story/engine/story-engine")
      .then(({ ensureStoryEngine }) => ensureStoryEngine())
      .then((built) => {
        if (disposed || fellBack) return;
        if (!built) {
          fallback();
          return;
        }
        engine = built;
        running = true;
        window.clearInterval(failsafe);
        built.attach(section, host, fallback);
        setOverlay(built.overlay);
      })
      .catch(() => {
        fallback();
      });

    return () => {
      disposed = true;
      window.clearInterval(failsafe);
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
    </>
  );
}
