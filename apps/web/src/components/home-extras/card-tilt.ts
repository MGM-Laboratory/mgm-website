import gsap from "gsap";

import { onIdle } from "@/lib/motion/idle";
import { finePointer, onPointer, pointer } from "@/lib/motion/pointer";
import { random, randomBetween, randomInt } from "@/lib/random";
import { motionAllowed } from "@/lib/reduced-motion";
import { isScrollLocked } from "@/lib/scroll-lock";
import { createSpringLoop, spring, springAtRest, stepSpring, type SpringConfig } from "./spring";

/**
 * Cards that notice the cursor (the homepage's competency cards). Each card
 * sits in a plain wrapper that only this module transforms; the card inside
 * keeps its own lift and flip timeline untouched.
 *
 * - Approach: within `reach` px of a card, its near edge leans up toward
 *   the cursor, more the closer the cursor gets, and it keeps following the
 *   cursor over the card (and over its flipped back).
 * - Release: the lean springs back with a small wobble.
 * - Press: the card dips a little, like a key.
 * - Idle: when the visitor has gone quiet and the cards are on screen, one
 *   card now and then sways, as if it were asking to be turned over.
 *
 * Fine pointers with motion allowed only; everyone else gets still cards.
 */

const K_TILT: SpringConfig = [120, 11];
const K_PRESS: SpringConfig = [300, 16];
/** Largest lean, degrees. */
const MAX_TILT = 9;

type Card = {
  el: HTMLElement;
  rx: ReturnType<typeof spring>;
  ry: ReturnType<typeof spring>;
  press: ReturnType<typeof spring>;
  held: boolean;
  tx: number;
  ty: number;
  put: Record<"rx" | "ry" | "s", (value: number) => void>;
};

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export function startCardTilt(elements: HTMLElement[], { reach = 150 } = {}) {
  if (!elements.length || !motionAllowed() || !finePointer()) return () => {};

  gsap.set(elements, { transformPerspective: 1100, transformOrigin: "50% 50%" });
  const cards: Card[] = elements.map((el) => ({
    el,
    rx: spring(),
    ry: spring(),
    press: spring(),
    held: false,
    tx: 0,
    ty: 0,
    put: {
      rx: gsap.quickSetter(el, "rotationX", "deg") as (v: number) => void,
      ry: gsap.quickSetter(el, "rotationY", "deg") as (v: number) => void,
      s: gsap.quickSetter(el, "scale") as (v: number) => void,
    },
  }));
  let inView = false;
  let near = false;

  function frame() {
    const p = pointer();
    const active = p.inside && p.type !== "touch" && !isScrollLocked();
    near = false;
    for (const card of cards) {
      card.tx = 0;
      card.ty = 0;
      if (!active) continue;
      const r = card.el.getBoundingClientRect();
      const dx = p.x - (r.left + r.width / 2);
      const dy = p.y - (r.top + r.height / 2);
      const ex = Math.max(0, Math.abs(dx) - r.width / 2);
      const ey = Math.max(0, Math.abs(dy) - r.height / 2);
      const proximity = smoothstep(clamp(0, 1, 1 - Math.hypot(ex, ey) / reach));
      if (proximity <= 0) continue;
      near = true;
      const nx = clamp(-1, 1, dx / (r.width / 2 + reach * 0.5));
      const ny = clamp(-1, 1, dy / (r.height / 2 + reach * 0.5));
      // The edge nearest the cursor comes up toward it.
      card.tx = ny * MAX_TILT * proximity;
      card.ty = -nx * MAX_TILT * proximity;
    }
  }

  function step(dt: number) {
    let moving = false;
    for (const card of cards) {
      stepSpring(card.rx, K_TILT, card.tx, dt);
      stepSpring(card.ry, K_TILT, card.ty, dt);
      stepSpring(card.press, K_PRESS, card.held ? 1 : 0, dt);
      if (
        !springAtRest(card.rx, card.tx, 0.02, 0.05) ||
        !springAtRest(card.ry, card.ty, 0.02, 0.05) ||
        !springAtRest(card.press, card.held ? 1 : 0, 0.001, 0.01)
      ) {
        moving = true;
      }
    }
    return moving;
  }

  function write() {
    for (const card of cards) {
      card.put.rx(card.rx.x);
      card.put.ry(card.ry.x);
      card.put.s(1 - card.press.x * 0.025);
    }
  }

  const loop = createSpringLoop({
    frame,
    step,
    write,
    onSleep: () => {
      // A cursor resting over a card keeps its pose; otherwise exact rest,
      // with no sub-degree residue.
      if (near) return;
      for (const card of cards) {
        card.rx = spring();
        card.ry = spring();
        card.press = spring();
      }
      write();
    },
  });

  const offPointer = onPointer((state) => {
    if (!inView || state.type === "touch" || loop.awake()) return;
    // Wake only when the cursor is somewhere near the cards.
    const first = cards[0].el.getBoundingClientRect();
    const last = cards[cards.length - 1].el.getBoundingClientRect();
    const top = Math.min(first.top, last.top) - reach;
    const bottom = Math.max(first.bottom, last.bottom) + reach;
    const left = Math.min(first.left, last.left) - reach;
    const right = Math.max(first.right, last.right) + reach;
    if (state.x > left && state.x < right && state.y > top && state.y < bottom) loop.wake();
  });

  const downs = cards.map((card) => {
    const down = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      card.held = true;
      loop.wake();
    };
    const up = () => {
      if (!card.held) return;
      card.held = false;
      // Let go: a little pop past rest.
      card.press.v -= 6;
      loop.wake();
    };
    card.el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      card.el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  // Idle sway, only while the visitor has gone quiet and the cards show.
  let swayCall: gsap.core.Tween | null = null;
  const sway = () => {
    swayCall = gsap.delayedCall(randomBetween(5, 9), sway);
    if (!inView || near || document.hidden || isScrollLocked()) return;
    const card = cards[randomInt(0, cards.length - 1)];
    const dir = random() < 0.5 ? -1 : 1;
    card.ry.v += dir * 95;
    card.rx.v -= 28;
    loop.wake();
  };
  const offIdle = onIdle(4000, (idle) => {
    swayCall?.kill();
    swayCall = idle ? gsap.delayedCall(1.2, sway) : null;
  });

  const io = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
    },
    { rootMargin: "60px 0px" },
  );
  const grid = elements[0].parentElement;
  if (grid) io.observe(grid);

  return () => {
    offPointer();
    offIdle();
    swayCall?.kill();
    io.disconnect();
    downs.forEach((off) => off());
    loop.sleep();
    gsap.set(elements, { clearProps: "transform" });
  };
}
