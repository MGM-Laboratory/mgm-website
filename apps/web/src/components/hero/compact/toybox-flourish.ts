import gsap from "gsap";

import { randomBetween } from "@/lib/random";
import type { ToyFlourish } from "./toybox-shapes";

/**
 * The toy box's small motions, all GSAP, all on elements the physics never
 * writes: the squash layer (landings, jelly, presses), the lift layer (hover
 * and drag), the art inside a body (per-shape personalities) and the letters.
 * The physics owns only each body's outer translate and its rotate layer.
 */

/** A landing or a knock: squash along the hit, spring back. `amount` 0..1. */
export function squash(el: HTMLElement, amount: number, axis: "x" | "y", origin: string) {
  const k = 0.07 + amount * 0.2;
  gsap.fromTo(
    el,
    axis === "y"
      ? { scaleY: 1 - k, scaleX: 1 + k * 0.7, transformOrigin: origin }
      : { scaleX: 1 - k, scaleY: 1 + k * 0.7, transformOrigin: origin },
    {
      scaleX: 1,
      scaleY: 1,
      duration: 0.55 + amount * 0.25,
      ease: "elastic.out(1, 0.38)",
      overwrite: true,
    },
  );
}

/** Pressed: a quick squash that holds until release lets it spring out. */
export function press(el: HTMLElement, down: boolean) {
  gsap.to(el, {
    scaleX: down ? 1.06 : 1,
    scaleY: down ? 0.9 : 1,
    transformOrigin: "50% 100%",
    duration: down ? 0.12 : 0.5,
    ease: down ? "power2.out" : "elastic.out(1, 0.4)",
    overwrite: true,
  });
}

function shadow(dark: boolean, lifted: number) {
  if (!lifted) return "drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))";
  const alpha = dark ? 0.5 : 0.2;
  return `drop-shadow(0px ${Math.round(10 * lifted)}px ${Math.round(14 * lifted)}px rgba(0, 0, 0, ${alpha}))`;
}

/** Hovered (a little) or held (fully): up off the shelf, with a shadow when held. */
export function lift(el: HTMLElement, level: 0 | 1 | 2) {
  const dark = document.documentElement.classList.contains("dark");
  gsap.to(el, {
    scale: level === 2 ? 1.1 : level === 1 ? 1.05 : 1,
    filter: shadow(dark, level === 2 ? 1 : 0),
    duration: level ? 0.3 : 0.45,
    ease: level ? "back.out(2.4)" : "elastic.out(1, 0.45)",
    overwrite: true,
  });
}

/**
 * Each shape's own answer to a tap, played on its art so the body keeps its
 * true outline: a shape that spins or flips ends facing the way it started.
 */
export function flourish(kind: ToyFlourish, art: HTMLElement, squashEl: HTMLElement) {
  const svg = art.querySelector("svg");
  if (!svg) return;
  const part = (name: string) => svg.querySelector<SVGElement>(`[data-part='${name}']`);

  switch (kind) {
    case "toggle": {
      const knob = part("knob");
      const track = part("track");
      if (!knob || !track) return;
      const on = Number(knob.getAttribute("cx")) < 110;
      gsap.to(knob, {
        attr: { cx: on ? 175 : 45 },
        duration: 0.32,
        ease: "back.out(2.2)",
        overwrite: true,
      });
      gsap.to(track, {
        attr: { fill: on ? "#f94141" : "#9aa3ad" },
        duration: 0.25,
        overwrite: true,
      });
      squash(squashEl, 0.35, "x", on ? "100% 50%" : "0% 50%");
      return;
    }
    case "flip":
      gsap.fromTo(
        svg,
        { rotateY: 0 },
        { rotateY: 360, transformPerspective: 400, duration: 0.8, ease: "power3.out" },
      );
      return;
    case "spin":
      gsap.fromTo(
        svg,
        { rotation: 0 },
        { rotation: 360, duration: 0.9, ease: "back.out(1.6)", transformOrigin: "50% 50%" },
      );
      return;
    case "leaves": {
      const petals: [string, number, number][] = [
        ["leaf-1", -1, -1],
        ["leaf-2", -1, 1],
        ["leaf-3", 1, -1],
        ["leaf-4", 1, 1],
      ];
      for (const [name, dx, dy] of petals) {
        const petal = part(name);
        if (!petal) continue;
        gsap
          .timeline()
          .to(petal, { x: dx * 9, y: dy * 9, duration: 0.22, ease: "power2.out" })
          .to(petal, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.45)" });
      }
      return;
    }
    case "domes": {
      const top = part("dome-top");
      const bottom = part("dome-bottom");
      if (!top || !bottom) return;
      gsap
        .timeline()
        .to(top, { y: -12, duration: 0.18, ease: "power2.out" })
        .to(bottom, { y: 12, duration: 0.18, ease: "power2.out" }, "<")
        .to([top, bottom], { y: 0, duration: 0.14, ease: "power3.in" })
        .add(() => squash(squashEl, 0.4, "y", "50% 50%"));
      return;
    }
    case "logo": {
      const shards: [string, number, number, number][] = [
        ["shard-1", 0, -60, -14],
        ["shard-2", -54, 38, 12],
        ["shard-3", 54, 38, -12],
      ];
      for (const [name, x, y, rotate] of shards) {
        const shard = part(name);
        if (!shard) continue;
        gsap
          .timeline()
          .to(shard, {
            x,
            y,
            rotate,
            transformOrigin: "50% 50%",
            duration: 0.2,
            ease: "power2.out",
          })
          .to(shard, { x: 0, y: 0, rotate: 0, duration: 0.55, ease: "back.out(2.6)" });
      }
      return;
    }
    case "stretch":
      gsap
        .timeline()
        .to(squashEl, {
          scaleX: 0.84,
          scaleY: 1.18,
          transformOrigin: "50% 100%",
          duration: 0.12,
          ease: "power2.out",
        })
        .to(squashEl, { scaleX: 1, scaleY: 1, duration: 0.6, ease: "elastic.out(1, 0.35)" });
      return;
    default:
      squash(squashEl, 0.5, "y", "50% 50%");
  }
}

/** The logo's shards fly together while it falls, as on the desktop hero. */
export function assembleLogo(art: HTMLElement, duration: number) {
  const svg = art.querySelector("svg");
  if (!svg) return;
  const from: [string, number, number, number][] = [
    ["shard-1", -40, -55, -140],
    ["shard-2", -55, 45, 120],
    ["shard-3", 55, 45, -120],
  ];
  from.forEach(([name, x, y, rotate], index) => {
    const shard = svg.querySelector(`[data-part='${name}']`);
    if (!shard) return;
    gsap.fromTo(
      shard,
      { opacity: 0, scale: 0.3, x, y, rotate, transformOrigin: "50% 50%" },
      {
        opacity: 1,
        scale: 1,
        x: 0,
        y: 0,
        rotate: 0,
        duration,
        delay: index * 0.08,
        ease: "back.out(1.9)",
      },
    );
  });
}

/** Shows the toggle as switched on without a tween (resting state). */
export function setToggle(art: HTMLElement, on: boolean) {
  const svg = art.querySelector("svg");
  if (!svg) return;
  gsap.set(svg.querySelector("[data-part='knob']"), { attr: { cx: on ? 175 : 45 } });
  gsap.set(svg.querySelector("[data-part='track']"), {
    attr: { fill: on ? "#f94141" : "#9aa3ad" },
  });
}

/** Letters hop in a ripple spreading out from `from` (a char index). */
export function ripple(chars: HTMLElement[], from: number, size: number) {
  chars.forEach((char, index) => {
    const distance = Math.abs(index - from);
    gsap
      .timeline({ delay: distance * 0.045 })
      .to(char, {
        y: -size * (0.2 - Math.min(distance, 4) * 0.025),
        rotate: randomBetween(-8, 8),
        duration: 0.16,
        ease: "power2.out",
      })
      .to(char, { y: 0, rotate: 0, duration: 0.7, ease: "elastic.out(1, 0.35)" });
  });
}

/** A letter the cursor runs over bobs up like a key, then settles. */
export function bob(char: HTMLElement, size: number) {
  if (gsap.isTweening(char)) return;
  gsap
    .timeline()
    .to(char, { y: -size * 0.09, duration: 0.14, ease: "power2.out" })
    .to(char, { y: 0, duration: 0.6, ease: "elastic.out(1, 0.35)" });
}

/** A letter something landed on gives under it, then springs back. */
export function dip(char: HTMLElement, amount: number, size: number) {
  gsap.fromTo(
    char,
    { y: size * (0.02 + amount * 0.07) },
    { y: 0, duration: 0.6, ease: "elastic.out(1, 0.3)", overwrite: "auto" },
  );
}

/** Every letter jumps a little on its own (the box was shaken). */
export function shiver(chars: HTMLElement[], size: number) {
  for (const char of chars) {
    gsap
      .timeline({ delay: randomBetween(0, 0.12) })
      .to(char, {
        y: -size * randomBetween(0.06, 0.16),
        rotate: randomBetween(-10, 10),
        duration: 0.14,
        ease: "power2.out",
      })
      .to(char, { y: 0, rotate: 0, duration: 0.8, ease: "elastic.out(1, 0.3)" });
  }
}

/** The "i" in Media spins like a tossed coin and lands facing forward. */
export function coin(char: HTMLElement) {
  gsap.fromTo(
    char,
    { rotateX: 0 },
    {
      rotateX: 720,
      transformPerspective: 500,
      transformOrigin: "50% 50%",
      duration: 1.2,
      ease: "power2.out",
      onComplete: () => {
        gsap.set(char, { rotateX: 0 });
      },
    },
  );
}

/** "Game," turns a full circle, like a card flipped over and back. */
export function turn(word: HTMLElement) {
  gsap.fromTo(
    word,
    { rotateY: 0 },
    {
      rotateY: 360,
      transformPerspective: 700,
      duration: 0.75,
      ease: "power2.inOut",
      onComplete: () => {
        gsap.set(word, { rotateY: 0 });
      },
    },
  );
}

/** Letters roll forward over their baselines, one after another. */
export function roll(chars: HTMLElement[]) {
  gsap.fromTo(
    chars,
    { rotateX: 0 },
    {
      rotateX: -360,
      transformPerspective: 600,
      transformOrigin: "50% 80%",
      duration: 0.7,
      ease: "back.out(1.4)",
      stagger: 0.03,
      onComplete: () => {
        gsap.set(chars, { rotateX: 0 });
      },
    },
  );
}
