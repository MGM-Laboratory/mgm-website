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
