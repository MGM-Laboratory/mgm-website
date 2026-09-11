"use client";

import { useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";

import { isScrollLocked, onLockChange } from "@/lib/scroll-gate";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    // Smoothing itself is a motion effect — reduced-motion visitors keep
    // native, unsmoothed scrolling instead.
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    const smoother = ScrollSmoother.create({
      smooth: 1.1,
      effects: true,
      smoothTouch: 0.1,
    });
    smoother.paused(isScrollLocked());

    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, { __smoother: smoother });
    }

    const unsubscribe = onLockChange((locked) => smoother.paused(locked));

    return () => {
      unsubscribe();
      smoother.kill();
    };
  }, []);

  return (
    <div id="smooth-wrapper">
      <div id="smooth-content">{children}</div>
    </div>
  );
}
