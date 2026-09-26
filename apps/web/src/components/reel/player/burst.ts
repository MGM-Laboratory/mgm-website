import { randomBetween } from "@/lib/random";

import { ease, saturate } from "./springs";

type Particle = {
  el: HTMLElement;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  age: number;
  life: number;
  alive: boolean;
};

export type BurstOptions = {
  /** Launch directions, degrees (0 is right, -90 is up). */
  from: number;
  to: number;
  speed: [number, number];
  /** Seconds each shape lives. */
  life?: [number, number];
  /** Seconds between the first and the last launch. */
  spread?: number;
};

const GRAVITY = 1700;

/**
 * Brand shapes thrown from a point: each flies on its own arc under
 * gravity with a little air drag, spinning, pops in and shrinks away.
 * Stepped from the player's frame loop, so it pauses with it.
 */
export class Burst {
  private readonly particles: Particle[];

  constructor(elements: HTMLElement[]) {
    this.particles = elements.map((el) => ({
      el,
      size: el.offsetWidth || 16,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      spin: 0,
      age: 0,
      life: 1,
      alive: false,
    }));
  }

  fire(x: number, y: number, options: BurstOptions) {
    const { from, to, speed, life = [1.05, 1.5], spread = 0.12 } = options;
    const count = this.particles.length;
    this.particles.forEach((p, index) => {
      const direction =
        ((from + ((to - from) * (index + randomBetween(0, 1))) / count) * Math.PI) / 180;
      const v = randomBetween(speed[0], speed[1]);
      p.size = p.el.offsetWidth || p.size;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(direction) * v;
      p.vy = Math.sin(direction) * v;
      p.angle = randomBetween(-40, 40);
      p.spin = randomBetween(-620, 620);
      // A staggered launch reads as a burst, not a single explosion frame.
      p.age = -randomBetween(0, spread);
      p.life = randomBetween(life[0], life[1]);
      p.alive = true;
      p.el.style.opacity = "0";
    });
  }

  /** Steps every shape; returns whether any is still flying. */
  update(dt: number) {
    let any = false;
    const drag = Math.pow(0.42, dt);
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age < 0) {
        any = true;
        continue;
      }
      if (p.age >= p.life) {
        p.alive = false;
        p.el.style.opacity = "0";
        continue;
      }
      any = true;
      p.vx *= drag;
      p.vy = p.vy * drag + GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      const pop = ease.backOut(saturate(p.age / 0.16));
      const shrink = 1 - ease.cubicInOut(saturate((p.age - p.life * 0.6) / (p.life * 0.4)));
      const scale = pop * shrink;
      const half = p.size / 2;
      p.el.style.opacity = "1";
      p.el.style.transform = `translate3d(${(p.x - half).toFixed(1)}px, ${(p.y - half).toFixed(1)}px, 0) rotate(${p.angle.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
    }
    return any;
  }

  clear() {
    for (const p of this.particles) {
      p.alive = false;
      p.el.style.opacity = "0";
    }
  }
}
