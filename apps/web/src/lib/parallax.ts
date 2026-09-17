"use client";

import gsap from "gsap";

/**
 * Mouse-driven parallax for every `.parallax-el` descendant of `root`,
 * offset by its own `data-depth` (1 = full strength). Shared between the
 * homepage hero and the About page's Bauhaus field.
 */
export function setupParallax(
  root: HTMLElement,
  {
    duration = 0.7,
    xStrength = 20,
    yStrength = 14,
  }: { duration?: number; xStrength?: number; yStrength?: number } = {},
) {
  if (!window.matchMedia("(pointer: fine)").matches) return () => {};

  const els = Array.from(root.querySelectorAll<HTMLElement>(".parallax-el"));
  if (!els.length) return () => {};

  const setters = els.map((el) => ({
    depth: Number(el.dataset.depth ?? 1),
    x: gsap.quickTo(el, "x", { duration, ease: "power3.out" }),
    y: gsap.quickTo(el, "y", { duration, ease: "power3.out" }),
  }));

  function onMove(e: MouseEvent) {
    const relX = e.clientX / window.innerWidth - 0.5;
    const relY = e.clientY / window.innerHeight - 0.5;
    for (const { x, y, depth } of setters) {
      x(relX * xStrength * depth);
      y(relY * yStrength * depth);
    }
  }

  window.addEventListener("mousemove", onMove);
  return () => window.removeEventListener("mousemove", onMove);
}
