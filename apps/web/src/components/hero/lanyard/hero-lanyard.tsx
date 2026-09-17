"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";

import { cn } from "@/lib/utils";
import type { LanyardProps } from "./lanyard";

const LanyardScene = dynamic(() => import("./lanyard"), { ssr: false });

// A perpetual physics simulation is exactly the "decorative loop" case
// animation-system.md says to skip entirely under reduced motion — so
// reduced motion never even mounts the Canvas, it just shows the card's
// front face as a plain, static image in the same slot.
function useReducedMotion() {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = (matches: boolean) => setReduced(matches);
    sync(mq.matches);
    const onChange = (e: MediaQueryListEvent) => sync(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function HeroLanyard(props: LanyardProps & { className?: string }) {
  const { className, ...lanyardProps } = props;
  const reduced = useReducedMotion();
  const [dragging, setDragging] = useState(false);

  if (reduced === null) return null;

  // Sits under the fixed site header at rest (z-50) — the card's rope anchor
  // is out of view above the canvas, so nothing is lost by staying behind it
  // — but lifts above it while the user is actively swinging the card, so a
  // big swing visibly passes over the nav instead of getting clipped by it.
  const wrapperClassName = cn(className, dragging ? "z-[60]" : "z-30");

  if (reduced) {
    return (
      <div className={wrapperClassName}>
        <div className="relative mx-auto aspect-[636/999] w-40 overflow-hidden rounded-2xl shadow-2xl sm:w-52">
          <Image
            src={lanyardProps.frontImage ?? "/lanyard/front.png"}
            alt=""
            fill
            sizes="208px"
            className="object-cover"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      <LanyardScene {...lanyardProps} onDragChange={setDragging} />
    </div>
  );
}
