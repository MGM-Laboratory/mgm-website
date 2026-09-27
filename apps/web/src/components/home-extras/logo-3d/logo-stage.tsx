"use client";

import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import gsap from "gsap";

import { LogoMark } from "@/components/hero/shapes";
import { motionAllowed, onReducedMotion } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";
import type { LogoEngine } from "./logo-engine";
import { hardwareWebGL2 } from "./webgl-probe";

export type LogoStageHandle = {
  /** The end-of-page moment: a big spin (3D) or a shard burst (flat mark). */
  celebrate: () => void;
  /** The stage's box on screen, where the confetti bursts from. */
  rect: () => DOMRect | null;
};

/** LogoMark's viewBox (hero/shapes.tsx). */
const VIEW_BOX: [number, number, number, number] = [57.5, 86.0265, 660, 660];

/**
 * The slot the footer's highlight lives in: a flat `LogoMark` in the server
 * HTML, swapped for the extruded 3D mark (logo-engine.ts) once its first
 * frame is up. three.js is only fetched when the footer comes within about
 * a screen, and never under reduced motion, without hardware WebGL2 (CI's
 * software renderers included) or with `?nologo3d`. The slot keeps its
 * size in every case, so the text beside it never moves and the mark never
 * covers it.
 */
export function LogoStage({ ref, className }: { ref?: Ref<LogoStageHandle>; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LogoEngine | null>(null);
  const [mode, setMode] = useState<"flat" | "gl">("flat");

  useImperativeHandle(ref, () => ({
    celebrate() {
      if (engineRef.current) {
        engineRef.current.celebrate();
        return;
      }
      const svg = flatRef.current?.querySelector("svg");
      if (!svg || !motionAllowed()) return;
      // The flat mark's version: the shards burst apart and snap back.
      const shards = [...svg.querySelectorAll<SVGGElement>("g[data-part]")];
      const offsets = [
        { x: 0, y: -60 },
        { x: -60, y: 40 },
        { x: 60, y: 40 },
      ];
      gsap
        .timeline()
        .to(svg, { rotation: 360, duration: 1, ease: "power3.inOut" }, 0)
        .fromTo(
          shards,
          { x: 0, y: 0 },
          {
            x: (i: number) => offsets[i]?.x ?? 0,
            y: (i: number) => offsets[i]?.y ?? 0,
            duration: 0.35,
            ease: "power3.out",
          },
          0,
        )
        .to(shards, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.45)" }, 0.4)
        .set(svg, { rotation: 0 });
    },
    rect: () => boxRef.current?.getBoundingClientRect() ?? null,
  }));

  useLayoutEffect(() => {
    const box = boxRef.current;
    const flat = flatRef.current;
    if (!box || !flat) return;
    if (!motionAllowed() || new URLSearchParams(window.location.search).has("nologo3d")) return;
    if (!hardwareWebGL2()) return;

    let cancelled = false;
    const stop = () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      setMode("flat");
    };
    const load = async () => {
      const { createLogoEngine } = await import("./logo-engine");
      if (cancelled) return;
      const paths = [...flat.querySelectorAll("path")];
      engineRef.current = createLogoEngine(box, {
        paths: paths.map((p) => p.getAttribute("d") ?? ""),
        colors: paths.map((p) => p.getAttribute("fill") ?? "#3A6DC5"),
        viewBox: VIEW_BOX,
        onReady: () => {
          if (!cancelled) setMode("gl");
        },
        onFail: () => {
          if (!cancelled) stop();
        },
      });
    };
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        near.disconnect();
        void load();
      },
      { rootMargin: "900px 0px" },
    );
    near.observe(box);
    const offReduced = onReducedMotion(stop);
    return () => {
      cancelled = true;
      near.disconnect();
      offReduced();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div
      ref={boxRef}
      data-logo-stage={mode}
      className={cn("relative aspect-square select-none", className)}
    >
      <div
        ref={flatRef}
        aria-hidden
        className={cn(
          "absolute inset-[18%] transition-opacity duration-500",
          mode === "gl" && "opacity-0",
        )}
      >
        <LogoMark solid className="h-full w-full" />
      </div>
    </div>
  );
}
