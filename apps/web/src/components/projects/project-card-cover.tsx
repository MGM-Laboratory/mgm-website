"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { PatternTile, type PatternKind } from "@/components/process/pattern-tile";
import { registerStageCard } from "@/components/projects/stage/stage-registry";

// SSR runs useEffect; the browser prefers useLayoutEffect so hover wiring
// happens before first paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Deterministic fallback motif for the few records without a cover image. */
const FALLBACK_PATTERNS: PatternKind[] = ["fans", "arcs", "circle", "plus"];

/**
 * The card's forced 3:2 cover frame. The frame registers with the page's
 * cover stage (see stage/stage-registry.ts): when the WebGL stage takes a
 * card over it marks the frame `data-stage="gl"`, which hides the DOM
 * image and the frame's own background so only the WebGL cover shows.
 * Otherwise this DOM cover is what visitors see, with a "camera focus"
 * blur and a slight 3D tilt toward the cursor on hover.
 */
export function ProjectCardCover({
  coverUrl,
  alt,
  slug,
  index,
}: {
  coverUrl?: string;
  alt: string;
  slug: string;
  index: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fallbackPattern = FALLBACK_PATTERNS[slug.length % FALLBACK_PATTERNS.length];

  useIsomorphicLayoutEffect(() => {
    const frame = frameRef.current;
    const root = frame?.closest("a");
    if (!frame || !root) return;
    return registerStageCard({ root, frame, image: imageRef.current, index });
  }, [index]);

  useIsomorphicLayoutEffect(() => {
    // The card's <a> root, found from our own element: a parent's ref is
    // not attached yet when a child's layout effect runs on mount.
    const root = frameRef.current?.closest("a");
    const img = imageRef.current;
    if (!root || !img) return;

    // Every hover effect is decorative; reduced motion keeps the card
    // completely static.
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    // Camera focus: blur in fast, then pull focus back to sharp. Built per
    // enter from the current filter so re-hovering mid-blur stays smooth.
    const focusIn = () => {
      gsap.killTweensOf(img, "filter");
      gsap
        .timeline()
        .fromTo(
          img,
          { filter: () => getComputedStyle(img).filter },
          { filter: "blur(12px)", duration: 0.15, ease: "power1.in" },
        )
        .to(img, { filter: "blur(0px)", duration: 0.55, ease: "power3.out" });
    };
    // Leaving pulls the cover back to sharp instead of leaving it blurred:
    // the image must end clear when the hover ends (and a mid-blur kill
    // lands on blur(0) too), so every new hover replays the same cycle.
    const blurOut = () => {
      gsap.killTweensOf(img, "filter");
      gsap.to(img, { filter: "blur(0px)", duration: 0.35, ease: "power2.out" });
    };

    // Slight 3D tilt of the image toward the cursor. Only the image
    // rotates (inside the flat, rounded frame); quickTo keeps each axis
    // independently smoothed.
    gsap.set(img, { transformPerspective: 900 });
    const tiltX = gsap.quickTo(img, "rotationX", { duration: 0.5, ease: "power2.out" });
    const tiltY = gsap.quickTo(img, "rotationY", { duration: 0.5, ease: "power2.out" });

    const onEnter = () => focusIn();
    const onLeave = () => {
      blurOut();
      tiltX(0);
      tiltY(0);
    };
    const onMove = (event: MouseEvent) => {
      const rect = root.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      tiltX(-py * 7);
      tiltY(px * 7);
    };

    root.addEventListener("mouseenter", onEnter);
    root.addEventListener("mouseleave", onLeave);
    root.addEventListener("mousemove", onMove);
    return () => {
      root.removeEventListener("mouseenter", onEnter);
      root.removeEventListener("mouseleave", onLeave);
      root.removeEventListener("mousemove", onMove);
      gsap.killTweensOf(img);
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className="group/cover aspect-[3/2] overflow-hidden rounded-[15px] bg-[var(--surface-muted)] data-[stage=gl]:bg-transparent dark:bg-white/[0.04]"
    >
      {coverUrl ? (
        // CMS media is served through the storage proxy; next/image
        // cannot optimize it, so a plain img matches the rest of the site.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={coverUrl}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover will-change-transform group-data-[stage=gl]/cover:invisible"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <PatternTile
            bg="canvas"
            fg="blue"
            kind={fallbackPattern}
            className="h-[45%] w-auto opacity-60"
          />
        </div>
      )}
    </div>
  );
}
