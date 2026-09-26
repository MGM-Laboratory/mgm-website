"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";

import { motionAllowed } from "@/lib/reduced-motion";

/**
 * A question that logic shows or hides: its height and opacity ease open or
 * shut (never a transform, the reveal inside owns that), and a closed one is
 * `hidden`, so it's out of the tab order and the accessibility tree.
 */
export function Collapse({
  open,
  children,
  width,
}: {
  open: boolean;
  children: ReactNode;
  width?: "full" | "half";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [initialOpen] = useState(open);
  const shown = useRef(open);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (shown.current === open) return;
    shown.current = open;
    gsap.killTweensOf(element);
    const animate = motionAllowed();
    if (open) {
      element.hidden = false;
      if (!animate) {
        gsap.set(element, { clearProps: "height,opacity,overflow" });
        return;
      }
      gsap.fromTo(
        element,
        { height: 0, opacity: 0, overflow: "hidden" },
        {
          height: "auto",
          opacity: 1,
          duration: 0.55,
          ease: "expo.out",
          clearProps: "height,opacity,overflow",
          immediateRender: true,
        },
      );
    } else if (!animate) {
      element.hidden = true;
    } else {
      gsap.to(element, {
        height: 0,
        opacity: 0,
        overflow: "hidden",
        duration: 0.35,
        ease: "power2.inOut",
        onComplete: () => {
          element.hidden = true;
          gsap.set(element, { clearProps: "height,opacity,overflow" });
        },
      });
    }
  }, [open]);

  return (
    <div
      ref={ref}
      className="fx-collapse"
      hidden={initialOpen ? undefined : true}
      data-open={open ? "" : undefined}
      data-width={width}
    >
      {children}
    </div>
  );
}
