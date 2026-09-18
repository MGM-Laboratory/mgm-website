"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number; t: number };

const MAX_AGE_MS = 1400;
const MAX_POINTS = 260;
// Newer points render hot (brand-red), cooling to brand-yellow as they age —
// a literal "heat fading" read, not just an opacity fade.
const HOT: [number, number, number] = [249, 65, 65];
const COOL: [number, number, number] = [247, 191, 51];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// A live attention heatmap over an abstract UI mockup — this canvas tracks
// the visitor's actual cursor (event-sourced from real pointer input, not an
// autoplaying decorative loop), so unlike the other Focus pages' idle 3D
// drift it does not need to be suppressed under prefers-reduced-motion: it
// only ever runs in direct response to the visitor's own input, and the
// render loop stops itself the moment every point has fully faded.
export function AttentionCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Point[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    function resize() {
      const rect = container!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
      canvas!.style.width = `${rect.width}px`;
      canvas!.style.height = `${rect.height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    function draw() {
      const rect = container!.getBoundingClientRect();
      ctx!.clearRect(0, 0, rect.width, rect.height);
      const now = performance.now();
      const alive: Point[] = [];
      ctx!.globalCompositeOperation = "lighter";
      for (const p of pointsRef.current) {
        const age = now - p.t;
        if (age > MAX_AGE_MS) continue;
        alive.push(p);
        const lifeFrac = age / MAX_AGE_MS;
        const alpha = (1 - lifeFrac) * 0.4;
        const radius = lerp(16, 46, lifeFrac);
        const r = lerp(HOT[0], COOL[0], lifeFrac);
        const g = lerp(HOT[1], COOL[1], lifeFrac);
        const b = lerp(HOT[2], COOL[2], lifeFrac);
        const gradient = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx!.fillStyle = gradient;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = "source-over";
      pointsRef.current = alive;

      rafRef.current = alive.length > 0 ? requestAnimationFrame(draw) : null;
    }

    function ensureLoop() {
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(draw);
      }
    }

    const isFinePointer = window.matchMedia("(pointer: fine)").matches;

    if (!isFinePointer) {
      // No meaningful hover on touch — a few soft, motionless blobs so the
      // panel still reads as intentional rather than empty.
      const rect = container.getBoundingClientRect();
      pointsRef.current = [
        { x: rect.width * 0.3, y: rect.height * 0.35, t: performance.now() - MAX_AGE_MS * 0.2 },
        { x: rect.width * 0.62, y: rect.height * 0.55, t: performance.now() - MAX_AGE_MS * 0.4 },
        { x: rect.width * 0.45, y: rect.height * 0.72, t: performance.now() - MAX_AGE_MS * 0.1 },
      ];
      draw();
      return () => {
        ro.disconnect();
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    function onPointerMove(e: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      const pts = pointsRef.current;
      pts.push({ x, y, t: performance.now() });
      if (pts.length > MAX_POINTS) pts.splice(0, pts.length - MAX_POINTS);
      ensureLoop();
    }

    container.addEventListener("pointermove", onPointerMove);

    return () => {
      ro.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-lg border border-[var(--line)] bg-background"
    >
      <WireframeMockup />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" aria-hidden />
    </div>
  );
}

// A plain DOM/SVG-free abstract "interface" — the thing being observed. No
// real screenshot needed; blocks read as a UI at a glance the same way the
// /website hero's canvas-drawn browser cards do. `bg-foreground/8` (not
// --surface-muted) is deliberate: --surface-muted equals --background in
// dark mode, which would make every block invisible against this panel's
// own bg-background — a foreground-tinted fill contrasts in both themes.
function WireframeMockup() {
  return (
    <div className="absolute inset-0 p-7">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-brand-red" />
        <span className="size-2.5 rounded-full bg-brand-yellow" />
        <span className="size-2.5 rounded-full bg-brand-green" />
      </div>
      <div className="mt-6 h-9 w-2/3 rounded-md bg-foreground/8" />
      <div className="mt-4 flex gap-3">
        <div className="h-24 flex-1 rounded-md bg-foreground/8" />
        <div className="h-24 w-24 shrink-0 rounded-md bg-brand-yellow/25" />
      </div>
      <div className="mt-4 space-y-2.5">
        <div className="h-3 w-full rounded-full bg-foreground/8" />
        <div className="h-3 w-5/6 rounded-full bg-foreground/8" />
        <div className="h-3 w-2/3 rounded-full bg-foreground/8" />
      </div>
      <div className="mt-6 h-9 w-32 rounded-full bg-brand-red/15" />
    </div>
  );
}
