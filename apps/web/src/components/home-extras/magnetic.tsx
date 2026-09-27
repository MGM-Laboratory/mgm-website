"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";

import { attachMagnetic } from "@/lib/motion/magnetic";
import { motionAllowed, useMotionPreference } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

type MagneticProps = {
  children: ReactNode;
  className?: string;
  /** How far outside its box the pull starts, px. */
  radius?: number;
  /** Share of the pointer's offset the element follows. */
  strength?: number;
  /** Largest offset, px. */
  max?: number;
  /** A quick squash on press. */
  press?: boolean;
};

/**
 * Pulls its children toward a nearby cursor (`attachMagnetic`), with a
 * little parallax inside: a descendant marked `data-magnetic-inner` drifts
 * a bit further than the rest, so a label seems to lean out of its pill.
 * Pressing gives a quick squash.
 *
 * The wrapper is a plain span that nothing else transforms, so the pull
 * never meets another tween or a Tailwind transform class (gotcha #1).
 * Without a hovering pointer, or under reduced motion, it is just a span.
 */
export function Magnetic({
  children,
  className,
  radius = 70,
  strength = 0.35,
  max = 12,
  press = true,
}: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motion = useMotionPreference();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !motionAllowed()) return;
    const inner = el.querySelector<HTMLElement>("[data-magnetic-inner]");
    const innerX = inner ? gsap.quickTo(inner, "x", { duration: 0.45, ease: "power3.out" }) : null;
    const innerY = inner ? gsap.quickTo(inner, "y", { duration: 0.45, ease: "power3.out" }) : null;
    const offMagnet = attachMagnetic(el, {
      radius,
      strength,
      max,
      onPull: (pull) => {
        if (!innerX || !innerY) return;
        if (pull === 0) {
          innerX(0);
          innerY(0);
          return;
        }
        // The wrapper's own offset, a touch further: parallax inside.
        innerX(Number(gsap.getProperty(el, "x")) * 0.45);
        innerY(Number(gsap.getProperty(el, "y")) * 0.45);
      },
    });

    let squash: gsap.core.Timeline | null = null;
    const onDown = (event: PointerEvent) => {
      if (!press || event.button !== 0) return;
      squash?.kill();
      squash = gsap
        .timeline()
        .fromTo(
          el,
          { scaleX: 1, scaleY: 1 },
          { scaleX: 1.07, scaleY: 0.88, duration: 0.09, ease: "power2.out" },
        )
        .to(el, { scaleX: 1, scaleY: 1, duration: 0.5, ease: "elastic.out(1.1, 0.4)" });
    };
    el.addEventListener("pointerdown", onDown);
    return () => {
      offMagnet();
      el.removeEventListener("pointerdown", onDown);
      squash?.kill();
      innerX?.tween.kill();
      innerY?.tween.kill();
      gsap.set(el, { clearProps: "transform" });
      if (inner) gsap.set(inner, { clearProps: "transform" });
    };
  }, [motion, radius, strength, max, press]);

  return (
    <span ref={ref} className={cn("inline-flex", className)}>
      {children}
    </span>
  );
}
