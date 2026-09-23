"use client";

import { useEffect, useRef } from "react";

import {
  TopographyEngine,
  type TopographyMotion,
} from "@/components/projects/detail/topography-engine";
import type { ProjectPalette } from "@/lib/project-themes";
import { motionAllowed, useMotionPreference } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

// Ported from React Bits' Topography (MIT, https://reactbits.dev).

export type { TopographyMotion };

export type ProjectTopographyProps = {
  /** The page's theme variant; line colours derive from bg, text and highlight. */
  palette: ProjectPalette;
  /** Classes for the host box (position and size it; the canvas fills it). */
  className?: string;
  /** Multiplies the line alpha. 1 is the tuned, barely visible default. */
  intensity?: number;
  /** Stops the loop (page transitions); the last frame stays on screen. */
  paused?: boolean;
  /**
   * Read once per animation frame: the page's horizontal scroll position
   * (px) and velocity (px per frame). The field drifts a little with the
   * scroll and morphs a little faster while it moves fast.
   */
  getMotion?: () => TopographyMotion;
};

/**
 * The faint contour-line background behind a project detail page: an
 * engraved texture in the project's own colours, never a pattern that
 * competes with the content.
 *
 * - Colours: valleys take the palette's highlight, ridges its text colour.
 *   Every line core sits the same small lightness step from `palette.bg`
 *   (5.5 L*, roughly 4-6% luma), whatever the theme. A palette change
 *   (light/dark switch, the next project) crossfades over 0.6 s.
 * - The canvas is transparent (premultiplied alpha), so the page's own
 *   background shows through; it is decorative (aria-hidden, no pointer
 *   events; the cursor bump listens on the window).
 * - Performance: raw WebGL2, one full-screen triangle. At most 1.5 device
 *   pixels per CSS pixel, 30 fps while the page is still and 60 fps while
 *   `getMotion` reports scrolling. The loop stops entirely while the canvas
 *   is off screen, the tab is hidden, `paused` is set or the WebGL context
 *   is lost, and the context is released on unmount.
 * - Reduced motion: one static frame, no loop, no cursor bump (follows the
 *   preference live). Touch and coarse pointers get no cursor bump.
 * - Without hardware WebGL2 it renders nothing and the page background
 *   shows on its own.
 */
export function ProjectTopography({
  palette,
  className,
  intensity = 1,
  paused = false,
  getMotion,
}: ProjectTopographyProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<TopographyEngine | null>(null);
  const getMotionRef = useRef(getMotion);
  // A re-render trigger only; the effect below gates on motionAllowed()
  // (lib/reduced-motion.ts explains why).
  const motion = useMotionPreference();
  const { bg, text, highlight } = palette;

  useEffect(() => {
    getMotionRef.current = getMotion;
  }, [getMotion]);

  // The canvas is created here rather than rendered: a remount (Strict
  // Mode runs effects twice in development) needs a fresh canvas, because
  // a canvas whose context was released can never give out another one.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = TopographyEngine.create(host, () => getMotionRef.current?.());
    engineRef.current = engine;
    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setColors({ bg, text, highlight });
  }, [bg, text, highlight]);

  useEffect(() => {
    engineRef.current?.setIntensity(intensity);
  }, [intensity]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    engineRef.current?.setReducedMotion(!motionAllowed());
  }, [motion]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={cn("pointer-events-none relative overflow-hidden", className)}
    />
  );
}
