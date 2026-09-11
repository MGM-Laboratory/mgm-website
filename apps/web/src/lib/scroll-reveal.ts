"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Fades a section's `selector` matches up into place the first time the
 * section scrolls into view — never replays on the way back up.
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

  return gsap.fromTo(
    targets,
    { opacity: 0, y },
    {
      opacity: 1,
      y: 0,
      duration: 0.6,
      ease: "power3.out",
      stagger,
      scrollTrigger: { trigger: root, start, once: true },
    },
  );
}
