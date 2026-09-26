"use client";

import { useEffect, useRef } from "react";

type Wake = { x: number; y: number; born: number };
const LIFETIME = 1600;
const SPACING = 24;

/** A quiet wake over the existing surface; no textures or network assets. */
export function InteractiveBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const preference = matchMedia("(prefers-reduced-motion: no-preference) and (pointer: fine)");
    let wakes: Wake[] = [];
    let frame = 0;
    let width = 0;
    let height = 0;
    let last = 0;
    let ink = "";

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
      ink = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim();
    }

    function clear() {
      cancelAnimationFrame(frame);
      frame = 0;
      wakes = [];
      ctx!.clearRect(0, 0, width, height);
    }

    function draw(now: number) {
      frame = 0;
      ctx!.clearRect(0, 0, width, height);
      wakes = wakes.filter((wake) => now - wake.born < LIFETIME);
      if (!wakes.length) return;
      ctx!.fillStyle = ink;
      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          let dx = 0;
          let dy = 0;
          let strength = 0;
          for (const wake of wakes) {
            const age = (now - wake.born) / LIFETIME;
            const distance = Math.hypot(x - wake.x, y - wake.y);
            if (distance > 220) continue;
            const envelope = Math.exp(-Math.pow((distance - age * 150) / 55, 2)) * (1 - age);
            const ripple = Math.sin(distance / 22 - age * 9) * envelope * 7;
            dx += ((x - wake.x) / Math.max(distance, 1)) * ripple;
            dy += ((y - wake.y) / Math.max(distance, 1)) * ripple;
            strength = Math.max(strength, envelope);
          }
          if (strength < 0.015) continue;
          ctx!.globalAlpha = strength * 0.09;
          ctx!.beginPath();
          ctx!.arc(
            x + Math.max(-12, Math.min(12, dx)),
            y + Math.max(-12, Math.min(12, dy)),
            0.85,
            0,
            Math.PI * 2,
          );
          ctx!.fill();
        }
      }
      frame = requestAnimationFrame(draw);
    }

    function move(event: PointerEvent) {
      if (!preference.matches || document.hidden || event.pointerType === "touch") return;
      const now = performance.now();
      if (now - last < 45) return;
      last = now;
      wakes.push({ x: event.clientX, y: event.clientY, born: now });
      if (wakes.length > 18) wakes.shift();
      if (!frame) frame = requestAnimationFrame(draw);
    }

    resize();
    const theme = new MutationObserver(() => {
      ink = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", clear);
    preference.addEventListener("change", clear);
    return () => {
      clear();
      theme.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", clear);
      preference.removeEventListener("change", clear);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="interactive-background pointer-events-none fixed inset-0 z-40 h-full w-full motion-reduce:hidden"
    />
  );
}
