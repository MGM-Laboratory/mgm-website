import gsap from "gsap";

import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import { Spring } from "@/components/projects/stage/spring";
import { getStageCards, type StageCard } from "@/components/projects/stage/stage-registry";

/**
 * The DOM fallback's answer to the WebGL scroll bend (touch devices, no
 * WebGL2, a lost context): each cover frame stretches and leans a little
 * with the scroll speed and its text lags behind, all from one spring on
 * the native scroll velocity, so a flick visibly jolts the list and it
 * wobbles back to rest. Cheap on purpose: two transform components per
 * frame, written only while the spring moves, then cleared to identity.
 *
 * It owns the frame's skewY/scaleY and the footer wrapper's y. The cover's
 * own DOM effects live on other elements or other properties (clip-path on
 * the frame, scale/filter inside it).
 */

const MAX_SKEW = 1.4; // deg
const MAX_STRETCH = 0.035;
const FOOTER_LAG = 10; // px
const DEADZONE = 150; // px/s
const SOFTNESS = 2200; // px/s
const VELOCITY_SMOOTHING = 18; // 1/s

type Targets = {
  frame: HTMLElement;
  footer: HTMLElement | null;
  side: number;
  skew: (value: number) => void;
  stretch: (value: number) => void;
  lag: ((value: number) => void) | null;
};

/** Starts the reaction; returns the stop function (which resets every card). */
export function startDomReaction() {
  const spring = new Spring(2, 0.32, 0);
  const targets = new WeakMap<StageCard, Targets>();
  let lastScroll: number | null = null;
  let velocity = 0;
  let resting = true;

  const targetsFor = (card: StageCard) => {
    let entry = targets.get(card);
    if (!entry) {
      const footer = card.root.querySelector<HTMLElement>("[data-card-footer]");
      const rect = card.frame.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      // Two columns lean away from each other; a single column leans as one.
      const side =
        rect.width > viewport * 0.6 ? 1 : rect.left + rect.width / 2 < viewport / 2 ? -1 : 1;
      entry = {
        frame: card.frame,
        footer,
        side,
        skew: gsap.quickSetter(card.frame, "skewY", "deg") as (value: number) => void,
        stretch: gsap.quickSetter(card.frame, "scaleY") as (value: number) => void,
        lag: footer ? (gsap.quickSetter(footer, "y", "px") as (value: number) => void) : null,
      };
      targets.set(card, entry);
    }
    return entry;
  };

  const clear = () => {
    for (const card of getStageCards()) {
      const entry = targets.get(card);
      if (!entry) continue;
      gsap.set(entry.frame, { clearProps: "transform" });
      if (entry.footer) gsap.set(entry.footer, { clearProps: "transform" });
    }
  };

  const onResize = () => {
    // Columns may have changed; re-read each card's side lazily.
    for (const card of getStageCards()) targets.delete(card);
  };
  window.addEventListener("resize", onResize);

  const offFrame = addFrameCallback("render", (_time, dt) => {
    const scroll = window.scrollY;
    const moved = lastScroll === null ? 0 : scroll - lastScroll;
    lastScroll = scroll;
    // More than a screen in one frame is a jump (an anchor, the End key),
    // not a flick: no jolt for it.
    const delta = Math.abs(moved) > window.innerHeight ? 0 : moved;
    if (dt > 0) velocity += (delta / dt - velocity) * (1 - Math.exp(-VELOCITY_SMOOTHING * dt));
    if (delta === 0 && Math.abs(velocity) < 1) velocity = 0;

    const speed = Math.abs(velocity);
    const target = Math.sign(velocity) * (1 - Math.exp(-Math.max(0, speed - DEADZONE) / SOFTNESS));
    spring.step(dt, target);
    if (target === 0 && spring.settle(0.0005)) {
      if (!resting) {
        resting = true;
        clear();
      }
      return;
    }
    resting = false;

    const s = Math.max(-1.2, Math.min(1.2, spring.value));
    for (const card of getStageCards()) {
      const entry = targetsFor(card);
      entry.skew(s * MAX_SKEW * entry.side);
      entry.stretch(1 + Math.abs(s) * MAX_STRETCH);
      entry.lag?.(s * FOOTER_LAG);
    }
  });

  return () => {
    offFrame();
    window.removeEventListener("resize", onResize);
    clear();
  };
}
