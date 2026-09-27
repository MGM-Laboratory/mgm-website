import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

import { arrowPathD, type ArrowGeometry } from "./arrow-path";
import { clamp, offsetIn, type Stage, type StageSystem } from "./stage";

if (typeof window !== "undefined") {
  gsap.registerPlugin(MotionPathPlugin);
}

/**
 * The connector arrow as an instrument. Hovering the line sends the red
 * spark running along it again, the way it drew itself in, and the head
 * nods when the spark arrives. Pressing it plucks it like a guitar string:
 * the nearest straight run bows out toward the press and rings down in a
 * few decaying swings, then the path settles back on hero.tsx's exact
 * geometry (read fresh every frame, so a resize mid-pluck is safe).
 */

/** Hover reach from the line, px (the stroke itself is 4 px wide). */
const HOVER_REACH = 14;
const PRESS_REACH = { fine: 18, touch: 26 };
/** The pluck's ring: frequency (Hz) and decay time constant (s). */
const RING_HZ = 6.5;
const RING_TAU = 0.3;
const RING_LENGTH = 1.3;

type Segment = "top" | "side" | "bottom";

export type ArrowSystem = StageSystem & {
  press(x: number, y: number, touch: boolean): boolean;
};

export function createArrow(
  stage: Stage,
  geometry: () => ArrowGeometry | null,
): ArrowSystem | null {
  const { root, pointer } = stage;
  const wrap = root.querySelector<HTMLElement>(".hero-arrow-wrap");
  const path = wrap?.querySelector<SVGPathElement>("[data-part='arrow-path']");
  const head = wrap?.querySelector<SVGPathElement>("[data-part='arrow-head']");
  const spark = wrap?.querySelector<SVGCircleElement>("[data-part='arrow-spark']");
  if (!wrap || !path || !head || !spark) return null;

  let x0 = 0;
  let y0 = 0;
  let hovered = false;
  let cooldown = 0;
  let run: gsap.core.Timeline | null = null;
  let ring: gsap.core.Tween | null = null;

  function measure() {
    const offset = offsetIn(wrap!, root);
    x0 = offset.x;
    y0 = offset.y;
  }

  /** The pointer in the arrow's own pixels (its box moves with parallax). */
  function local(x: number, y: number) {
    const ox = Number(gsap.getProperty(wrap!, "x")) || 0;
    const oy = Number(gsap.getProperty(wrap!, "y")) || 0;
    return { x: x - x0 - ox, y: y - y0 - oy };
  }

  function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp(0, 1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1));
    return { distance: Math.hypot(px - ax - dx * t, py - ay - dy * t), t };
  }

  /** The nearest straight run and how far along it the point is. */
  function nearest(px: number, py: number) {
    const g = geometry();
    if (!g) return null;
    const r = g.radius;
    const runs: { segment: Segment; distance: number; t: number; side: number }[] = [
      { segment: "top", ...segmentDistance(px, py, g.topEndX, 0, r, 0), side: Math.sign(py) || 1 },
      {
        segment: "side",
        ...segmentDistance(px, py, 0, r, 0, g.height - r),
        side: Math.sign(px) || 1,
      },
      {
        segment: "bottom",
        ...segmentDistance(px, py, r, g.height, g.bottomEndX, g.height),
        side: Math.sign(py - g.height) || 1,
      },
    ];
    // The rounded corners count as the line too.
    const corners = [
      [r, r],
      [r, g.height - r],
    ].map(([cx, cy]) => {
      const inQuadrant = px <= cx && (cy === r ? py <= cy : py >= cy);
      return inQuadrant ? Math.abs(Math.hypot(px - cx, py - cy) - r) : Infinity;
    });
    const best = runs.reduce((a, b) => (b.distance < a.distance ? b : a));
    return { ...best, lineDistance: Math.min(best.distance, ...corners) };
  }

  function runSpark() {
    run?.kill();
    const release = stage.hold();
    const motion = (end: number) => ({
      path: path!,
      align: path!,
      alignOrigin: [0.5, 0.5] as [number, number],
      start: 0,
      end,
    });
    run = gsap
      .timeline({ onComplete: release, onInterrupt: release })
      .fromTo(
        spark!,
        { opacity: 1, motionPath: motion(0) },
        { motionPath: motion(1), duration: 0.85, ease: "power2.inOut", immediateRender: true },
      )
      .to(spark!, { opacity: 0, duration: 0.14, ease: "power1.in" }, 0.76)
      // The head nods as the spark arrives.
      .to(head!, { x: 7, duration: 0.1, ease: "power2.out" }, 0.8)
      .to(head!, { x: 0, duration: 0.6, ease: "elastic.out(1, 0.35)" }, 0.9);
  }

  function pluck(segment: Segment, t: number, side: number, pull: number) {
    const g = geometry();
    if (!g) return;
    ring?.kill();
    const at = clamp(0.18, 0.82, t);
    const amplitude = side * clamp(7, 13, 7 + pull * 0.5);
    const state = { t: 0 };
    ring = gsap.to(state, {
      t: RING_LENGTH,
      duration: RING_LENGTH,
      ease: "none",
      onUpdate() {
        const current = geometry();
        if (!current) return;
        const decay = Math.exp(-state.t / RING_TAU);
        // The fundamental plus a quick overtone for a plucked, not waved, feel.
        const bend =
          amplitude * decay * Math.cos(2 * Math.PI * RING_HZ * state.t) +
          amplitude * 0.22 * decay * decay * Math.sin(2 * Math.PI * RING_HZ * 2.1 * state.t);
        path!.setAttribute("d", arrowPathD(current, { segment, at, bend }));
      },
      onComplete: settle,
      onInterrupt: settle,
    });
  }

  function settle() {
    const g = geometry();
    if (g) path!.setAttribute("d", arrowPathD(g));
  }

  return {
    measure,
    frame() {
      if (!pointer.over) {
        hovered = false;
        return;
      }
      const p = local(pointer.x, pointer.y);
      const near = nearest(p.x, p.y);
      const inside = !!near && near.lineDistance < HOVER_REACH;
      if (
        inside &&
        !hovered &&
        stage.hoverAllowed() &&
        stage.now() > cooldown &&
        !run?.isActive()
      ) {
        cooldown = stage.now() + 1.1;
        runSpark();
      }
      hovered = inside;
    },
    step: () => true,
    write() {},
    park() {
      run?.progress(1);
      ring?.kill();
      settle();
      hovered = false;
    },
    press(x, y, touch) {
      const p = local(x, y);
      const near = nearest(p.x, p.y);
      if (!near || near.lineDistance > (touch ? PRESS_REACH.touch : PRESS_REACH.fine)) return false;
      pluck(near.segment, near.t, near.side, near.distance);
      return true;
    },
    destroy() {
      run?.kill();
      ring?.kill();
      settle();
      gsap.set(head, { clearProps: "transform" });
      gsap.set(spark, { opacity: 0 });
    },
  };
}
