import { starPoints, polyPath } from "@/components/loader/loader-net";
import { random } from "@/lib/random";

/**
 * Things to play with while the deal runs (pointer and touch only: the
 * loader is decoration, nothing in it takes focus).
 *
 * - The sheet leans toward the pointer, and a tap gives it a little push.
 * - The shapes around it step out of the pointer's way, wiggle on hover,
 *   and on a tap hop, spin, change colour and throw a few small stars.
 * - The star over the counter turns on hover and spins on a tap.
 * - A tapped card in the fan turns over (the show plays it: `pickCard`).
 *
 * One small spring loop runs only while something is moving.
 */

type Hooks = Readonly<{ pickCard: (card: HTMLElement) => void }>;

type Body = {
  el: HTMLElement;
  push: HTMLElement;
  play: HTMLElement;
  shape: SVGElement | null;
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  colour: number;
};

const COLOURS = [
  "var(--brand-blue)",
  "var(--brand-yellow)",
  "var(--brand-red)",
  "var(--brand-green)",
];
const PUSH_RADIUS = 120;
const PUSH = 30;
const TILT_X = 6;
const TILT_Y = 8;

export class LoaderToys {
  private readonly bodies: Body[] = [];
  private readonly sheet: HTMLElement | null;
  private readonly anims = new Set<Animation>();
  private readonly cleanups: (() => void)[] = [];
  private frame = 0;
  private last = 0;
  private pointer: { x: number; y: number } | null = null;
  private tilt = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  private left = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly hooks: Hooks,
  ) {
    this.sheet = root.querySelector<HTMLElement>('[data-ld="sheet"]');
    for (const el of root.querySelectorAll<HTMLElement>(".ld-toy")) {
      const push = el.querySelector<HTMLElement>(".ld-toy-push");
      const play = el.querySelector<HTMLElement>(".ld-toy-play");
      if (!push || !play) continue;
      this.bodies.push({
        el,
        push,
        play,
        shape: play.querySelector<SVGElement>("svg > *"),
        x: 0,
        y: 0,
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
        colour: Math.floor(random() * COLOURS.length),
      });
      const enter = () => {
        this.wiggle(play);
      };
      el.addEventListener("pointerenter", enter);
      this.cleanups.push(() => {
        el.removeEventListener("pointerenter", enter);
      });
    }
    const star = root.querySelector<HTMLElement>('[data-ld="hub-star"]');
    if (star) {
      const enter = () => {
        this.play(
          star,
          [
            { transform: "rotate(0deg)" },
            { transform: "rotate(45deg) scale(1.15)" },
            { transform: "rotate(90deg)" },
          ],
          520,
          "cubic-bezier(0.35, 0, 0, 1)",
        );
      };
      star.addEventListener("pointerenter", enter);
      this.cleanups.push(() => {
        star.removeEventListener("pointerenter", enter);
      });
    }
    const move = (event: PointerEvent) => {
      this.pointer = { x: event.clientX, y: event.clientY };
      const box = root.getBoundingClientRect();
      this.tilt.ty = ((event.clientX - box.left) / box.width - 0.5) * 2 * TILT_Y;
      this.tilt.tx = -((event.clientY - box.top) / box.height - 0.5) * 2 * TILT_X;
      this.wake();
    };
    const out = () => {
      this.pointer = null;
      this.tilt.tx = 0;
      this.tilt.ty = 0;
      this.wake();
    };
    const down = (event: PointerEvent) => {
      this.tap(event);
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", out);
    root.addEventListener("pointercancel", out);
    root.addEventListener("pointerdown", down);
    this.cleanups.push(() => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", out);
      root.removeEventListener("pointercancel", out);
      root.removeEventListener("pointerdown", down);
    });
    this.locate();
    const resize = () => {
      this.locate();
    };
    window.addEventListener("resize", resize);
    this.cleanups.push(() => {
      window.removeEventListener("resize", resize);
    });
  }

  /** Stops the lean and takes it off the sheet; returns the lean it had, for the caller to ease out. */
  release() {
    this.left = true;
    this.stop();
    if (!this.sheet) return "";
    const lean = this.sheet.style.transform;
    this.sheet.style.transform = "";
    return lean;
  }

  /** The outro starts: the shapes pop away. */
  leave() {
    this.release();
    this.bodies.forEach((body, i) => {
      this.play(
        body.el,
        [
          { transform: "scale(1)", opacity: 1 },
          { transform: "scale(1.15)", opacity: 1, offset: 0.3 },
          { transform: "scale(0)", opacity: 0 },
        ],
        360,
        "cubic-bezier(0.55, 0, 0.9, 0.4)",
        i * 30,
        "forwards",
      );
    });
  }

  dispose() {
    this.stop();
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
    for (const anim of this.anims) anim.cancel();
    this.anims.clear();
  }

  private play(
    el: Element,
    keyframes: Keyframe[],
    duration: number,
    easing: string,
    delay = 0,
    fill: FillMode = "none",
  ) {
    const anim = el.animate(keyframes, { duration, easing, delay, fill });
    this.anims.add(anim);
    void anim.finished
      .then(() => {
        if (fill === "none") this.anims.delete(anim);
      })
      .catch(() => undefined);
    return anim;
  }

  private locate() {
    for (const body of this.bodies) {
      const r = body.el.getBoundingClientRect();
      body.x = r.left + r.width / 2;
      body.y = r.top + r.height / 2;
    }
  }

  private wake() {
    if (this.frame || this.left) return;
    this.last = performance.now();
    this.frame = window.requestAnimationFrame(this.step);
  }

  private stop() {
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private readonly step = (time: number) => {
    this.frame = 0;
    const dt = Math.min(0.05, (time - this.last) / 1000);
    this.last = time;
    let moving = false;
    // Springs: stiffness 140, damping 16 (a quick, slightly bouncy settle).
    const k = 140;
    const c = 16;
    for (const body of this.bodies) {
      let tx = 0;
      let ty = 0;
      if (this.pointer) {
        const dx = body.x - this.pointer.x;
        const dy = body.y - this.pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < PUSH_RADIUS && d > 0.01) {
          const f = ((PUSH_RADIUS - d) / PUSH_RADIUS) * PUSH;
          tx = (dx / d) * f;
          ty = (dy / d) * f;
        }
      }
      body.vx += ((tx - body.ox) * k - body.vx * c) * dt;
      body.vy += ((ty - body.oy) * k - body.vy * c) * dt;
      body.ox += body.vx * dt;
      body.oy += body.vy * dt;
      if (
        Math.abs(body.vx) + Math.abs(body.vy) > 0.5 ||
        Math.abs(tx - body.ox) + Math.abs(ty - body.oy) > 0.3
      ) {
        moving = true;
      }
      body.push.style.transform = `translate(${body.ox.toFixed(2)}px, ${body.oy.toFixed(2)}px)`;
    }
    const t = this.tilt;
    const kt = 60;
    const ct = 13;
    t.vx += ((t.tx - t.x) * kt - t.vx * ct) * dt;
    t.vy += ((t.ty - t.y) * kt - t.vy * ct) * dt;
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    if (
      Math.abs(t.vx) + Math.abs(t.vy) > 0.02 ||
      Math.abs(t.tx - t.x) + Math.abs(t.ty - t.y) > 0.02
    ) {
      moving = true;
    }
    if (this.sheet) {
      this.sheet.style.transform = `rotateX(${t.x.toFixed(3)}deg) rotateY(${t.y.toFixed(3)}deg)`;
    }
    if (moving) this.frame = window.requestAnimationFrame(this.step);
  };

  private tap(event: PointerEvent) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || this.left) return;
    const toy = target.closest<HTMLElement>(".ld-toy");
    if (toy) {
      const body = this.bodies.find((b) => b.el === toy);
      if (body) this.hop(body);
      return;
    }
    const card = target.closest<HTMLElement>(".ld-card");
    if (card) {
      this.hooks.pickCard(card);
      return;
    }
    const star = target.closest<HTMLElement>('[data-ld="hub-star"]');
    if (star) {
      this.play(
        star,
        [
          { transform: "rotate(0deg) scale(1)" },
          { transform: "rotate(200deg) scale(1.5)", offset: 0.45 },
          { transform: "rotate(360deg) scale(1)" },
        ],
        700,
        "cubic-bezier(0.35, 0, 0, 1)",
      );
      const r = star.getBoundingClientRect();
      this.burst(r.left + r.width / 2, r.top + r.height / 2, 8, "var(--brand-yellow)");
      return;
    }
    if (target.closest('[data-ld="sheet"]')) {
      // A push: the sheet tips away from the finger and swings back.
      const box = this.root.getBoundingClientRect();
      this.tilt.vy -= ((event.clientX - box.left) / box.width - 0.5) * 160;
      this.tilt.vx += ((event.clientY - box.top) / box.height - 0.5) * 120;
      this.wake();
    }
  }

  private wiggle(play: HTMLElement) {
    if (play.getAnimations().length > 0) return;
    this.play(
      play,
      [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-14deg)", offset: 0.25 },
        { transform: "rotate(10deg)", offset: 0.5 },
        { transform: "rotate(-5deg)", offset: 0.75 },
        { transform: "rotate(0deg)" },
      ],
      520,
      "ease-in-out",
    );
  }

  private hop(body: Body) {
    for (const anim of body.play.getAnimations()) anim.cancel();
    const turns = random() < 0.5 ? 360 : -360;
    this.play(
      body.play,
      [
        { transform: "translateY(0) rotate(0deg) scale(1, 1)" },
        { transform: "translateY(4px) rotate(0deg) scale(1.18, 0.8)", offset: 0.12 },
        { transform: `translateY(-46px) rotate(${turns * 0.6}deg) scale(0.92, 1.1)`, offset: 0.45 },
        { transform: `translateY(0) rotate(${turns}deg) scale(1.14, 0.86)`, offset: 0.8 },
        { transform: `translateY(0) rotate(${turns}deg) scale(1, 1)` },
      ],
      720,
      "ease-out",
    );
    body.colour = (body.colour + 1) % COLOURS.length;
    const colour = COLOURS.at(body.colour);
    if (body.shape && colour) {
      if (body.shape.style.stroke) body.shape.style.stroke = colour;
      else body.shape.style.fill = colour;
    }
    this.burst(body.x + body.ox, body.y + body.oy, 6, colour ?? "var(--brand-yellow)");
  }

  /** A few small four-point stars thrown out of a point. */
  private burst(x: number, y: number, count: number, colour: string) {
    const box = this.root.getBoundingClientRect();
    const d = polyPath(starPoints(50, 50, 50));
    for (let i = 0; i < count; i += 1) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      el.setAttribute("viewBox", "0 0 100 100");
      el.setAttribute("class", "ld-spark");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.style.fill = colour;
      el.append(path);
      el.style.left = `${x - box.left}px`;
      el.style.top = `${y - box.top}px`;
      this.root.append(el);
      const a = (i / count) * Math.PI * 2 + random() * 0.6;
      const dist = 34 + random() * 30;
      const anim = this.play(
        el,
        [
          { transform: "translate(-50%, -50%) scale(0.2) rotate(0deg)", opacity: 1 },
          {
            transform: `translate(calc(-50% + ${(Math.cos(a) * dist).toFixed(1)}px), calc(-50% + ${(Math.sin(a) * dist).toFixed(1)}px)) scale(1) rotate(90deg)`,
            opacity: 1,
            offset: 0.6,
          },
          {
            transform: `translate(calc(-50% + ${(Math.cos(a) * dist * 1.25).toFixed(1)}px), calc(-50% + ${(Math.sin(a) * dist * 1.25 + 8).toFixed(1)}px)) scale(0) rotate(140deg)`,
            opacity: 0,
          },
        ],
        620 + i * 20,
        "cubic-bezier(0.16, 1, 0.3, 1)",
      );
      const drop = () => {
        el.remove();
      };
      void anim.finished.then(drop).catch(drop);
    }
  }
}
