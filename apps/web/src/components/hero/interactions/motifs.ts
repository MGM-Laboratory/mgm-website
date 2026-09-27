import gsap from "gsap";
import { Physics2DPlugin } from "gsap/Physics2DPlugin";

import { randomBetween, randomInt } from "@/lib/random";

import {
  offsetIn,
  settled,
  setter,
  smoothstep,
  spring,
  step,
  type Setter,
  type Spring,
  type SpringConfig,
  type Stage,
  type StageSystem,
} from "./stage";

if (typeof window !== "undefined") {
  gsap.registerPlugin(Physics2DPlugin);
}

/**
 * The hero's whitespace. The small background motifs drift away from the
 * cursor (and tumble a little) and float back once it passes, on a soft,
 * floaty spring. A click on empty hero space throws a handful of small
 * brand shapes from the click point, which arc under gravity and fade.
 */

// Floaty: slow to return, a little overshoot.
const KM: SpringConfig = [38, 6.5];
const REPEL_REACH = 180;
const REPEL_PUSH = 48;

type Motif = {
  el: HTMLElement;
  cx: number;
  cy: number;
  x: Spring;
  y: Spring;
  r: Spring;
  live: boolean;
  wasLive: boolean;
  put: Record<"x" | "y" | "r", Setter>;
};

export type MotifsSystem = StageSystem & {
  /** Throws a burst of shapes from a hero-local point. */
  burst(x: number, y: number): void;
};

export function createMotifs(stage: Stage): MotifsSystem {
  const { root, pointer } = stage;
  const motifs: Motif[] = Array.from(root.querySelectorAll<HTMLElement>(".hero-motif")).map(
    (el) => ({
      el,
      cx: 0,
      cy: 0,
      x: spring(),
      y: spring(),
      r: spring(),
      live: false,
      wasLive: false,
      put: {
        x: setter(el, "x", "px"),
        y: setter(el, "y", "px"),
        r: setter(el, "rotation", "deg"),
      },
    }),
  );
  const pool = Array.from(root.querySelectorAll<HTMLElement>(".hero-burst > div"));
  let next = 0;

  function measure() {
    for (const m of motifs) {
      const { x, y } = offsetIn(m.el, root);
      m.cx = x + m.el.offsetWidth / 2;
      m.cy = y + m.el.offsetHeight / 2;
    }
  }

  function stepMotif(m: Motif) {
    let tx = 0;
    let ty = 0;
    let tr = 0;
    if (pointer.over) {
      const dx = m.cx - pointer.x;
      const dy = m.cy - pointer.y;
      const distance = Math.hypot(dx, dy) || 1;
      const f = smoothstep(1 - distance / REPEL_REACH);
      if (f > 0) {
        tx = (dx / distance) * REPEL_PUSH * f;
        ty = (dy / distance) * REPEL_PUSH * f;
        tr = (dx >= 0 ? 1 : -1) * 40 * f;
      }
    }
    step(m.x, KM, tx);
    step(m.y, KM, ty);
    step(m.r, KM, tr);
    const calm =
      settled(m.x, tx, 0.05, 0.2) && settled(m.y, ty, 0.05, 0.2) && settled(m.r, tr, 0.1, 0.4);
    if (calm) {
      m.x.x = tx;
      m.y.x = ty;
      m.r.x = tr;
      m.x.v = m.y.v = m.r.v = 0;
    }
    m.live = !calm;
    return calm;
  }

  function burst(x: number, y: number) {
    if (!pool.length) return;
    const count = randomInt(5, 8);
    for (let i = 0; i < count; i++) {
      const el = pool[next];
      next = (next + 1) % pool.length;
      gsap.killTweensOf(el);
      const spin = randomBetween(-420, 420);
      gsap.set(el, { x, y, scale: 0, rotation: randomBetween(-90, 90), opacity: 1 });
      const life = randomBetween(0.85, 1.15);
      gsap
        .timeline()
        .to(el, { scale: randomBetween(0.75, 1.25), duration: 0.14, ease: "back.out(2.5)" }, 0)
        .to(
          el,
          {
            physics2D: {
              velocity: randomBetween(260, 480),
              // Mostly upward, fanned out on both sides.
              angle: randomBetween(-160, -20),
              gravity: 1100,
            },
            rotation: `+=${spin}`,
            duration: life,
            ease: "none",
          },
          0,
        )
        .to(el, { opacity: 0, scale: 0.4, duration: life * 0.4, ease: "power1.in" }, life * 0.6);
    }
  }

  return {
    measure,
    step() {
      let calm = true;
      for (const m of motifs) if (!stepMotif(m)) calm = false;
      return calm;
    },
    write() {
      for (const m of motifs) {
        if (!m.live && !m.wasLive) continue;
        m.wasLive = m.live;
        m.put.x(m.x.x);
        m.put.y(m.y.x);
        m.put.r(m.r.x);
      }
    },
    park() {
      for (const m of motifs) {
        m.x = spring();
        m.y = spring();
        m.r = spring();
        m.live = m.wasLive = false;
      }
      gsap.set(
        motifs.map((m) => m.el),
        { x: 0, y: 0, rotation: 0 },
      );
    },
    burst,
    destroy() {
      gsap.killTweensOf(pool);
      gsap.set(pool, { clearProps: "transform,opacity" });
      gsap.set(
        motifs.map((m) => m.el),
        { clearProps: "transform" },
      );
    },
  };
}
