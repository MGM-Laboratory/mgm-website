"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Cursor-follow spotlight: writes `--mx`/`--my` (pointer position relative
 * to `ref`) as CSS custom properties, for a `radial-gradient(circle at
 * var(--mx) var(--my), ...)` layer to consume. Plain per-event property
 * writes rather than a GSAP tween — the standard technique for this effect
 * (confirmed against how Aceternity/Magic UI-style spotlight cards do it);
 * there's nothing here for GSAP to smooth that a instant CSS var read
 * doesn't already handle via the browser's own compositing.
 */
export function useSpotlight(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(pointer: fine)").matches) return undefined;

    function onMove(e: PointerEvent) {
      const box = el!.getBoundingClientRect();
      el!.style.setProperty("--mx", `${e.clientX - box.left}px`);
      el!.style.setProperty("--my", `${e.clientY - box.top}px`);
    }

    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, [ref]);
}
