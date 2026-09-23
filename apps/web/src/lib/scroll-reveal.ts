"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Replacement for the `once: true` ScrollTrigger option on this GSAP
 * version. A `once` trigger that is scrolled fully past its end while GSAP
 * force-initializes several not-yet-refreshed triggers (a page that mounted
 * already scrolled down) kills itself inside refresh()'s own loop over the
 * trigger registry, splicing the array mid-iteration — the intermittent
 * "Cannot read properties of undefined (reading 'end')" crash that blanks
 * the page below the header (issues #62/#63; docs/animation-system.md
 * gotcha #4). `once: false` keeps the identical visible behavior — the
 * default toggleActions ("play none none none") play the timeline on enter
 * and never replay or reverse it — while the trigger is removed from the
 * ticker once the timeline completes instead of from inside refresh().
 * Call this right after building the timeline (before it can complete);
 * call sites that already set their own onComplete must fold the kill into
 * that callback instead.
 */
export function killTriggerOnComplete(tl: gsap.core.Timeline) {
  tl.eventCallback("onComplete", () => {
    tl.scrollTrigger?.kill();
  });
}

/**
 * Fades a section's `selector` matches up into place the first time the
 * section scrolls into view — never replays on the way back up.
 *
 * Built as a timeline with a timeline-level `scrollTrigger`, not a bare
 * `gsap.fromTo(..., { scrollTrigger })` — GSAP 3.15.0 throws inside
 * ScrollTrigger's internal refresh when a tween-level scrollTrigger is
 * created after >=4 other ScrollTriggers already exist on a page that
 * loaded already scrolled down (e.g. a reload elsewhere on the page).
 * Timeline-level scrollTriggers don't hit that path. Confirmed via a
 * minimal repro outside this app before landing this fix.
 */
export function fadeUpOnScroll(
  root: Element,
  selector: string,
  {
    start = "top 85%",
    stagger = 0.1,
    y = 24,
  }: { start?: string; stagger?: number; y?: number } = {},
) {
  const targets = gsap.utils.toArray<HTMLElement>(selector, root);
  if (!targets.length) return null;

  if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    gsap.set(targets, { opacity: 1, y: 0 });
    return null;
  }

  let handled = false;
  let onRefresh: () => void = () => {};
  let timers: ReturnType<typeof setTimeout>[] = [];
  const resolve = () => {
    if (handled) return;
    handled = true;
    timers.forEach(clearTimeout);
    ScrollTrigger.removeEventListener("refresh", onRefresh);
  };
  const tl = gsap.timeline({
    scrollTrigger: { trigger: root, start, once: false, onKill: () => resolve() },
  });
  tl.fromTo(
    targets,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", stagger },
  );
  killTriggerOnComplete(tl);
  // A ScrollTrigger's onEnter only fires on an actual forward crossing of
  // `start` - it does not fire retroactively. If this section mounts
  // already scrolled past that point (a client-side navigation whose
  // content mounts a few commits after the route change while the visitor
  // is already flicking toward the bottom), no crossing ever happens and
  // the timeline silently never plays, leaving the section stuck at its
  // opacity:0 "from" state forever (issues #62/#63: pages blank below the
  // header until a manual reload).
  //
  // ScrollTrigger's own progress reflects the true current scroll position
  // regardless of whether that crossing event fired, so checking it and
  // jumping straight to the resolved end state catches this up. But
  // checking once, synchronously at creation, is not enough:
  //
  // - Timeline-attached triggers (which this is) are created with
  //   start = end = 0 and defer their real position calculation to the next
  //   tick (GSAP swaps in a refresh-on-first-update). `progress` reads
  //   `undefined` at creation time, so a synchronous check can never see a
  //   positive value and is effectively a no-op.
  // - The batched refresh that then computes real positions (`_refreshAll`)
  //   does not re-fire onEnter for triggers already past their start, and
  //   the homepage's ScrollSmoother teardown/recreation can settle even
  //   later still. GSAP's batched refresh can also abort mid-way on the
  //   documented 3.15.0 internal crash (gotcha #4 in
  //   docs/animation-system.md), leaving positions never computed at all.
  //
  // So the check is re-armed until it either catches up or the reveal has
  // actually started, through converging routes: ScrollTrigger's own
  // "refresh" event (fired at the end of every batched refreshAll - after
  // creation, on image-load layout shifts, and after the smoother settles),
  // two delayed fallbacks that re-read the trigger once its positions
  // exist, and a final DOM-measured fallback that needs no ScrollTrigger
  // internals at all (so it survives the refresh-abort case). Every route
  // converges on the same idempotent check; whichever fires first removes
  // the others, and a killed trigger (unmount) resolves them as handled
  // without touching the DOM.
  const catchUpIfPastStart = () => {
    if (handled) return true;
    const trigger = tl.scrollTrigger;
    if (!trigger) {
      resolve();
      return true; // killed by cleanup: nothing left to catch up
    }
    // Leave a reveal that already started (or finished) alone.
    if (tl.progress() > 0) {
      resolve();
      return true;
    }
    if (!(trigger.progress > 0)) return false;
    tl.progress(1);
    // Defensive redundancy, not a substitute for the line above: setting
    // the DOM values directly guarantees the resolved end state even if
    // something about this timeline's own internals didn't fully apply it.
    gsap.set(targets, { opacity: 1, y: 0 });
    resolve();
    return true;
  };
  onRefresh = () => {
    catchUpIfPastStart();
  };
  timers = [250, 750].map((ms) => setTimeout(() => catchUpIfPastStart(), ms));
  // Final fallback, independent of ScrollTrigger's position bookkeeping:
  // `start` defaults to "top 85%", so a section whose top is already above
  // 85% of the viewport height was past its reveal point when it mounted.
  // This still resolves the section even if GSAP's own refresh cycle died
  // before computing positions (the intermittent `reading 'end'` crash,
  // see docs/animation-system.md gotcha #4) - and it correctly leaves
  // below-the-fold sections alone, to be revealed by their crossing later.
  timers.push(
    setTimeout(() => {
      if (handled || tl.progress() > 0 || !root.isConnected || !root.getBoundingClientRect) {
        resolve();
        return;
      }
      if (root.getBoundingClientRect().top < window.innerHeight * 0.85) {
        tl.progress(1);
        gsap.set(targets, { opacity: 1, y: 0 });
      }
      resolve(); // below the fold: the normal crossing path handles it
    }, 1500),
  );
  ScrollTrigger.addEventListener("refresh", onRefresh);
  catchUpIfPastStart();
  return tl;
}

/**
 * The common wiring every `fadeUpOnScroll` call site otherwise repeats: a
 * root ref, a mount-time effect that starts the reveal, and cleanup that
 * kills its ScrollTrigger. Extracted after a second, near-identical call
 * site made the duplication visible.
 */
export function useFadeUpOnScroll<T extends HTMLElement = HTMLDivElement>(
  selector: string,
  { start, stagger, y }: { start?: string; stagger?: number; y?: number } = {},
) {
  const rootRef = useRef<T>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, selector, { start, stagger, y });
    return () => tween?.scrollTrigger?.kill();
  }, [selector, start, stagger, y]);

  return rootRef;
}
