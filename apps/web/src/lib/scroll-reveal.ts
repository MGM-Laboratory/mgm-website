"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
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

  const tl = gsap.timeline({ scrollTrigger: { trigger: root, start, once: true } });
  tl.fromTo(
    targets,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", stagger },
  );
  // A `once: true` ScrollTrigger's onEnter only fires on an actual forward
  // crossing of `start` - it does not fire retroactively. If this section
  // mounts already scrolled past that point (e.g. a client-side navigation
  // whose data-fetched content, and this reveal along with it, renders a
  // few commits after the route change, by which time the visitor has
  // already scrolled down - or simply landing on a page and immediately
  // flicking straight to the bottom), no crossing ever happens and the
  // timeline silently never plays, leaving the section stuck at its
  // opacity:0 "from" state forever. ScrollTrigger's own progress/isActive
  // still reflect the true current scroll position regardless of whether
  // that crossing event fired, so checking progress right after creation
  // and jumping straight to the resolved end state catches this up without
  // an entrance animation that would look disconnected in time anyway.
  if (tl.scrollTrigger && tl.scrollTrigger.progress > 0) {
    tl.progress(1);
    // Defensive redundancy, not a substitute for the line above: setting
    // the DOM values directly guarantees the resolved end state even if
    // something about this timeline's own internals didn't fully apply it.
    gsap.set(targets, { opacity: 1, y: 0 });
  }
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
