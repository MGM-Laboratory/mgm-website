"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";

import { motionAllowed } from "@/lib/reduced-motion";

/**
 * A primary button that leans toward a nearby pointer and springs back:
 * the outer element is the hit area, GSAP moves only the inner face (no
 * CSS transform ever sits on it).
 */
export function MagneticButton({
  children,
  onClick,
  type = "button",
  disabled,
  className,
  buttonRef,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children">) {
  const faceRef = useRef<HTMLSpanElement>(null);
  const hitRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const face = faceRef.current;
    const hit = hitRef.current;
    const button = hit?.querySelector("button");
    if (!face || !hit || !button || !motionAllowed()) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    gsap.set([button, face], { x: 0, y: 0 });
    const buttonX = gsap.quickTo(button, "x", { duration: 0.55, ease: "power3.out" });
    const buttonY = gsap.quickTo(button, "y", { duration: 0.55, ease: "power3.out" });
    const faceX = gsap.quickTo(face, "x", { duration: 0.45, ease: "power3.out" });
    const faceY = gsap.quickTo(face, "y", { duration: 0.45, ease: "power3.out" });
    const onMove = (event: PointerEvent) => {
      const rect = hit.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      buttonX(dx * 0.22);
      buttonY(dy * 0.3);
      faceX(dx * 0.12);
      faceY(dy * 0.14);
    };
    const onLeave = () => {
      gsap.to([button, face], {
        x: 0,
        y: 0,
        duration: 0.9,
        ease: "elastic.out(1, 0.35)",
        overwrite: true,
      });
    };
    hit.addEventListener("pointermove", onMove);
    hit.addEventListener("pointerleave", onLeave);
    return () => {
      hit.removeEventListener("pointermove", onMove);
      hit.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf([button, face]);
    };
  }, []);

  return (
    <span ref={hitRef} className="fx-magnet">
      <button
        ref={buttonRef}
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`fx-button fx-button-hero ${className ?? ""}`}
        data-variant="primary"
        {...rest}
      >
        <span ref={faceRef} className="fx-button-face">
          {children}
        </span>
      </button>
    </span>
  );
}
