"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

import { ProjectCard } from "@/components/projects/project-card";
import { SITE_HEADER_HEIGHT } from "@/components/site-header";
import {
  gridRevealState,
  resetGridRevealState,
} from "@/components/projects/stage/grid-reveal-state";
import { ProjectsStage } from "@/components/projects/stage/projects-stage";
import { getStageMode, waitForStageMode } from "@/components/projects/stage/stage-registry";
import type { CmsProjectRecord } from "@/lib/project-cms";
import {
  clearProjectReturn,
  peekProjectReturn,
  type ProjectReturn,
} from "@/lib/project-transition";
import { markGridRevealStarted, waitForProjectsIntro } from "@/lib/projects-intro";
import { onReducedMotion } from "@/lib/reduced-motion";
import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";

// SSR runs useEffect; the browser prefers useLayoutEffect so the list's
// hidden state is settled before first paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// How long the reveal waits for the WebGL stage once the intro is over,
// so it can draw the first screen's openings. A later stage no longer
// holds the list back: the list reveals with DOM covers and the stage
// takes the cards over as it can (projects-stage.tsx).
const STAGE_SETTLE_MS = 700;
// Reveal the list even if the hero's intro never reports back (a hidden
// list still reserves its full height as blank scrollable space). Visible
// tab time only.
const INTRO_FAILSAFE_MS = 13_000;
const RISE_PX = 28;
const REVEAL_LOCK_OWNER = "projects-grid-reveal";
// Back from a project with no remembered position (or one that no longer
// shows the card), the card's top lands at this share of the viewport
// height, as on lusion.co.
const RETURN_CARD_TOP = 0.25;
// A remembered position is kept only while it still shows this share of
// the card's cover below the header.
const RETURN_MIN_SHOWN = 0.5;

/**
 * Scrolls the list back to where a return note wants it: the remembered
 * position, or the returned-to card's top at a quarter of the viewport.
 * A jump (never through the page's smooth scroller, which is either
 * missing or locked at this point).
 */
function restoreReturnScroll(section: HTMLElement, note: ProjectReturn) {
  const viewport = window.innerHeight;
  const card = section.querySelector<HTMLElement>(
    `a[data-project-slug="${CSS.escape(note.slug)}"]`,
  );
  const frame = card?.querySelector<HTMLElement>("[data-project-transition-frame]") ?? card;
  let top = note.scrollY ?? 0;
  if (frame) {
    const rect = frame.getBoundingClientRect();
    const documentTop = rect.top + window.scrollY;
    const fallback = documentTop - viewport * RETURN_CARD_TOP;
    if (note.scrollY === undefined) {
      top = fallback;
    } else {
      // The list may have changed since it was left (a new project, a
      // resize): the remembered position must still show the card.
      const at = documentTop - note.scrollY;
      const shown = Math.min(at + rect.height, viewport) - Math.max(at, SITE_HEADER_HEIGHT);
      if (shown < rect.height * RETURN_MIN_SHOWN) top = fallback;
    }
  }
  const max = document.documentElement.scrollHeight - viewport;
  window.scrollTo({ top: Math.round(Math.max(0, Math.min(top, max))), behavior: "instant" });
}

/**
 * The full project index: every published project, two cards per row on
 * desktop. While the hero's entrance plays, the list stays hidden; once it
 * ends, the list gives the WebGL stage a short moment to get ready, then
 * the whole list fades and rises in while the covers on screen play their
 * opening (drawn by the stage, or by the DOM covers it hasn't taken). Further down, each card opens as it scrolls
 * into view (the stage or the DOM cover handles that per card).
 *
 * The list starts at `opacity-0` from the server (opacity only, so no
 * transform ever stacks with an animated one), with a <noscript> override
 * so visitors without JavaScript still see every project. The hide only
 * applies when motion is allowed: reduced motion has no reveal to wait
 * for, so those visitors see the list in the server HTML right away.
 *
 * Coming back from a project (a return note, lib/project-transition.ts),
 * the list shows at once, unlocked, scrolled back to the project's card
 * (in this layout effect, before the root layout's scroll reset, which the
 * note's sender has told to stand down), so the zoom overlay can land on it.
 */
export function ProjectsGrid({ records }: { records: CmsProjectRecord[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  // Read during render, like the hero: the overlay clears it on landing.
  const [returnNote] = useState(peekProjectReturn);

  useIsomorphicLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    resetGridRevealState();

    // The WebGL canvas lives outside this section, so the reveal runs on a
    // shared state object that both this list and the stage apply.
    const reveal = gridRevealState;
    const apply = () => {
      section.style.opacity = String(reveal.opacity);
      section.style.transform = reveal.y ? `translate3d(0, ${reveal.y}px, 0)` : "";
    };

    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      reveal.started = true;
      reveal.opacity = 1;
      apply();
      markGridRevealStarted();
      if (!returnNote) return;
      // Reduced motion back from a project: only the position comes back.
      // A link's own navigation scrolls to the top after this effect, so
      // the jump is repeated on the next frame.
      restoreReturnScroll(section, returnNote);
      clearProjectReturn();
      const frame = requestAnimationFrame(() => restoreReturnScroll(section, returnNote));
      return () => cancelAnimationFrame(frame);
    }

    if (returnNote && !returnNote.restoreOnly) {
      // Back from a project through the zoom: the list arrives as it was
      // left, shown and unlocked. The overlay clears the note once it has
      // landed on the card.
      reveal.started = true;
      reveal.opacity = 1;
      reveal.y = 0;
      apply();
      markGridRevealStarted();
      restoreReturnScroll(section, returnNote);
      return;
    }
    // A reduced-motion note that outlived its preference: drop it.
    if (returnNote) clearProjectReturn();

    // While the intro hides the list, it takes no clicks, no keyboard focus
    // and stays out of the accessibility tree (opacity alone hides none of
    // that). Whatever follows the page's <main> (the footer) is held too:
    // otherwise Tab from the hero skips the hidden list straight into
    // footer links thousands of pixels down, and the locked page flashes
    // there until the hero pins it back. Set from here only, never in the
    // server HTML: CSS can't undo inert, so the <noscript> visitors who
    // see the list must never get it.
    // The page also stays scroll-locked until the list starts appearing:
    // the hero lets go when its entrance ends, but the list can still wait
    // up to STAGE_SETTLE_MS for the cover stage after that, and scrolling
    // then only moved through blank space.
    const held: HTMLElement[] = [section];
    for (let el = section.closest("main")?.nextElementSibling; el; el = el.nextElementSibling) {
      if (el instanceof HTMLElement) held.push(el);
    }
    const hold = (on: boolean) => {
      for (const el of held) el.inert = on;
      if (on) acquireScrollLock(REVEAL_LOCK_OWNER);
      else releaseScrollLock(REVEAL_LOCK_OWNER);
    };
    hold(true);

    let cancelled = false;
    let tween: gsap.core.Tween | null = null;
    const stops: Array<() => void> = [];
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, ms);
        stops.push(() => window.clearTimeout(timer));
      });
    // Counts only the time the tab is visible. A background tab freezes the
    // hero's entrance (no animation frames) but not timers: a wall-clock
    // failsafe fired there, and the list then faded in over an entrance
    // that had not played yet.
    const visibleDelay = (ms: number) =>
      new Promise<void>((resolve) => {
        let left = ms;
        let since = 0;
        let timer = 0;
        const stop = () => {
          window.clearTimeout(timer);
          document.removeEventListener("visibilitychange", onVisibility);
        };
        const run = () => {
          since = performance.now();
          timer = window.setTimeout(
            () => {
              stop();
              resolve();
            },
            Math.max(0, left),
          );
        };
        const onVisibility = () => {
          if (document.hidden) {
            if (!timer) return;
            window.clearTimeout(timer);
            timer = 0;
            left -= performance.now() - since;
          } else if (!timer) {
            run();
          }
        };
        stops.push(stop);
        document.addEventListener("visibilitychange", onVisibility);
        if (!document.hidden) run();
      });

    void (async () => {
      await Promise.race([waitForProjectsIntro(), visibleDelay(INTRO_FAILSAFE_MS)]);
      if (cancelled) return;
      if (getStageMode() === "pending") {
        await Promise.race([waitForStageMode(), delay(STAGE_SETTLE_MS)]);
        if (cancelled) return;
      }
      reveal.started = true;
      hold(false);
      markGridRevealStarted();
      tween = gsap.fromTo(
        reveal,
        { opacity: 0, y: RISE_PX },
        { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", onUpdate: apply, onComplete: apply },
      );
    })();

    // Reduced motion turned on mid-visit: the list shows as it ends up,
    // right away (mid-intro, or mid-fade).
    const offReduced = onReducedMotion(() => {
      if (!reveal.started) {
        cancelled = true;
        reveal.started = true;
        hold(false);
        markGridRevealStarted();
      }
      tween?.kill();
      reveal.opacity = 1;
      reveal.y = 0;
      apply();
    });

    return () => {
      cancelled = true;
      offReduced();
      // A Strict Mode rehearsal unmount (or any teardown mid-intro) must
      // never leave the list or the footer unreachable, or the page locked.
      hold(false);
      tween?.kill();
      for (const stop of stops) stop();
      // Leaving before the reveal: settle the signal so the cards' pending
      // waits (each already cancelled) resolve and let this page go,
      // instead of holding it until some later visit reveals.
      if (!reveal.started) markGridRevealStarted();
    };
  }, [returnNote]);

  return (
    <>
      <noscript>
        <style>{".projects-grid-reveal{opacity:1 !important}"}</style>
      </noscript>
      <ProjectsStage />
      <section
        ref={sectionRef}
        id="projects"
        className="projects-grid-reveal grid scroll-mt-24 grid-cols-1 gap-x-7 gap-y-16 pb-28 motion-safe:opacity-0 md:grid-cols-2 md:gap-y-20 md:pb-36"
      >
        {records.map((record, index) => (
          <ProjectCard key={record.slug} record={record} index={index} />
        ))}
      </section>
    </>
  );
}
