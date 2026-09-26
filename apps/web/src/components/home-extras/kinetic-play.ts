import gsap from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";

import { finePointer, onPointer, pointer } from "@/lib/motion/pointer";
import { random, randomBetween, randomInt } from "@/lib/random";
import { motionAllowed } from "@/lib/reduced-motion";
import { isScrollLocked } from "@/lib/scroll-lock";
import { playOnScroll } from "./play-on-scroll";
import {
  createSpringLoop,
  spring,
  springAtRest,
  stepSpring,
  type Spring,
  type SpringConfig,
} from "./spring";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrambleTextPlugin);
}

/**
 * The life of a kinetic heading (kinetic-heading.tsx): letters that drop in
 * with a spin, then answer the cursor.
 *
 * - Entrance: when the heading scrolls in, each word's letters fall from
 *   above, spinning, bounce on the baseline and settle, word after word.
 * - Pointer: letters near a fine cursor rise, lean away from it and gain ink
 *   on Hanken Grotesk's `wght` axis, so a soft wave follows the cursor
 *   along the line. A fast flick through a word kicks the letters it
 *   crosses into a ripple.
 * - Press (mouse or touch): the letters hop in a wave from the pressed one,
 *   which also spins, and they land with a squash.
 * - Idle: every few seconds on screen, a crest of weight rolls through the
 *   line, or one letter does a little hop.
 *
 * Ownership, so nothing fights: the entrance only writes the outer
 * `.kh-char` slots; the spring solver below is the only writer of the inner
 * `.kh-glyph` transforms and font weight. Before any weight change every
 * slot's width is locked (in em, from the glyph's layout width at rest), so
 * a heavier glyph never widens its word, re-wraps the heading or moves the
 * section. The solver sleeps whenever nothing moves.
 */

// Lift: a little jelly, so a passing cursor leaves a wobble behind.
const K_LIFT: SpringConfig = [210, 13];
// Lean: jellier still.
const K_LEAN: SpringConfig = [160, 10];
// Weight: critically damped, so the ink never over- or undershoots.
const K_WEIGHT: SpringConfig = [140, 24];
// Squash and stretch: quick and bouncy.
const K_SQUASH: SpringConfig = [420, 15];

/** Gravity for hops, em/s^2. */
const GRAVITY = 18;
/** Share of the landing speed a letter bounces back with. */
const RESTITUTION = 0.32;
/** The cursor's reach, em. */
const REACH = 0.8;
/** Weight the letter under the cursor gains. */
const WEIGHT_GAIN = 200;

type Setter = (value: number) => void;

type Glyph = {
  el: HTMLElement;
  slot: HTMLElement;
  /** Centre, em from the heading's top-left corner. */
  cx: number;
  cy: number;
  lift: Spring;
  lean: Spring;
  weight: Spring;
  squash: Spring;
  /** Hop height (em, negative is up) and speed. */
  hop: number;
  hopV: number;
  /** When a queued hop starts (performance.now() ms), 0 for none. */
  hopAt: number;
  hopSpeed: number;
  /** Extra spin while hopping (deg), tweened by GSAP. */
  spin: { deg: number };
  /** Which side of the cursor the letter was on last frame, for flick kicks. */
  side: number;
  lastWeight: number;
  put: Record<"y" | "r" | "sx" | "sy", Setter>;
};

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));

/** Starts a heading's play; returns the teardown. */
export function startKinetic(root: HTMLElement): () => void {
  const heading = root.querySelector<HTMLElement>(".kinetic-heading");
  if (!heading) return () => {};
  const slots = [...heading.querySelectorAll<HTMLElement>(".kh-char")];
  const words = [...heading.querySelectorAll<HTMLElement>(".kh-word")];
  const chapter = root.querySelector<HTMLElement>(".kh-chapter");
  const chapterShape = chapter?.querySelector<SVGElement>(".kh-chapter-shape") ?? null;
  const chapterNumber = chapter?.querySelector<HTMLElement>(".kh-chapter-number") ?? null;
  const chapterLabel = chapter?.querySelector<HTMLElement>(".kh-chapter-label") ?? null;
  const chapterRule = chapter?.querySelector<HTMLElement>(".kh-chapter-rule") ?? null;

  // Reduced motion: the heading and its chapter mark simply show.
  if (!motionAllowed()) {
    gsap.set([heading, chapter].filter(Boolean), { opacity: 1 });
    return () => {};
  }

  const fine = finePointer();
  let alive = true;
  let entered = false;
  let locked = false;
  let inView = false;
  let relockPending = false;
  let E = parseFloat(getComputedStyle(heading).fontSize) || 32;
  const restWeight = parseFloat(getComputedStyle(heading).fontWeight) || 600;

  const qs = (el: Element, property: string, unit?: string) =>
    gsap.quickSetter(el, property, unit) as Setter;

  const glyphs: Glyph[] = slots.map((slot) => {
    const el = slot.firstElementChild as HTMLElement;
    return {
      el,
      slot,
      cx: 0,
      cy: 0,
      lift: spring(),
      lean: spring(),
      weight: spring(restWeight),
      squash: spring(),
      hop: 0,
      hopV: 0,
      hopAt: 0,
      hopSpeed: 0,
      spin: { deg: 0 },
      side: 0,
      lastWeight: restWeight,
      put: {
        y: qs(el, "y", "px"),
        r: qs(el, "rotation", "deg"),
        sx: qs(el, "scaleX"),
        sy: qs(el, "scaleY"),
      },
    };
  });
  gsap.set(
    glyphs.map((g) => g.el),
    { transformOrigin: "50% 78%" },
  );

  // ---- entrance ----
  gsap.set(heading, { opacity: 1 });
  const entrance = playOnScroll(
    heading,
    (tl) => {
      if (chapter) {
        tl.fromTo(chapter, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "none" }, 0);
        if (chapterShape) {
          tl.fromTo(
            chapterShape,
            { scale: 0, rotation: -200, transformOrigin: "50% 50%" },
            { scale: 1, rotation: 0, duration: 0.7, ease: "back.out(2.6)" },
            0.05,
          );
        }
        if (chapterRule) {
          tl.fromTo(
            chapterRule,
            { scaleX: 0, transformOrigin: "0% 50%" },
            { scaleX: 1, duration: 0.5, ease: "power3.out" },
            0.2,
          );
        }
        if (chapterNumber?.textContent) {
          tl.to(
            chapterNumber,
            {
              duration: 0.6,
              scrambleText: { text: chapterNumber.textContent, chars: "0123456789", speed: 0.6 },
            },
            0.05,
          );
        }
        if (chapterLabel?.textContent) {
          tl.to(
            chapterLabel,
            {
              duration: 0.8,
              scrambleText: {
                text: chapterLabel.textContent,
                chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                speed: 0.5,
                revealDelay: 0.15,
              },
            },
            0.15,
          );
        }
      }
      const offset = chapter ? 0.12 : 0;
      words.forEach((word, wi) => {
        const letters = [...word.querySelectorAll<HTMLElement>(".kh-char")];
        const at = offset + wi * 0.13;
        const stagger = 0.035;
        tl.fromTo(
          letters,
          { opacity: 0 },
          { opacity: 1, duration: 0.18, ease: "none", stagger },
          at,
        )
          .fromTo(
            letters,
            { y: () => -E * randomBetween(0.95, 1.45) },
            { y: 0, duration: 0.82, ease: "bounce.out", stagger },
            at,
          )
          .fromTo(
            letters,
            {
              rotation: () => (random() < 0.5 ? -1 : 1) * randomBetween(80, 220),
              transformOrigin: "50% 70%",
            },
            { rotation: 0, duration: 0.72, ease: "back.out(1.7)", stagger },
            at,
          )
          .fromTo(
            letters,
            { scale: 0.5 },
            { scale: 1, duration: 0.55, ease: "back.out(2.4)", stagger },
            at,
          );
      });
    },
    {
      start: "top 88%",
      viewportShare: 0.88,
      onDone: () => {
        if (!alive) return;
        // The slots are back at identity; leave them clean for layout.
        gsap.set(slots, { clearProps: "transform,opacity" });
        entered = true;
        // The slots have been at their entrance offsets until now.
        if (locked) measureCentres();
        scheduleIdle();
      },
    },
  );

  // ---- width lock ----
  function measureCentres() {
    const box = heading!.getBoundingClientRect();
    for (const g of glyphs) {
      const r = g.slot.getBoundingClientRect();
      g.cx = (r.left + r.width / 2 - box.left) / E;
      g.cy = (r.top + r.height / 2 - box.top) / E;
    }
  }

  function lock() {
    E = parseFloat(getComputedStyle(heading!).fontSize) || E;
    for (const g of glyphs) g.slot.style.width = "";
    // Layout widths (unaffected by the entrance's transforms), at rest weight.
    const widths = glyphs.map((g) => parseFloat(getComputedStyle(g.el).width));
    glyphs.forEach((g, i) => {
      if (widths[i] > 0) g.slot.style.width = `${(widths[i] / E).toFixed(4)}em`;
    });
    measureCentres();
    locked = true;
  }

  const fonts = "fonts" in document ? document.fonts.ready : Promise.resolve();
  fonts.then(() => {
    if (alive) requestAnimationFrame(() => alive && lock());
  });

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!alive || !locked) return;
      if (loop.awake()) relockPending = true;
      else lock();
    }, 180);
  };
  window.addEventListener("resize", onResize);

  // ---- solver ----
  const local = { x: 0, y: 0, near: false };
  const tide = { pos: -99 };
  let tideTween: gsap.core.Tween | null = null;
  let busyUntil = 0;

  function readPointer() {
    const p = pointer();
    if (!fine || !p.inside || p.type === "touch" || isScrollLocked() || !entered || !locked) {
      local.near = false;
      return;
    }
    const r = heading!.getBoundingClientRect();
    const pad = E * 1.1;
    local.near =
      p.x > r.left - pad && p.x < r.right + pad && p.y > r.top - pad && p.y < r.bottom + pad;
    local.x = (p.x - r.left) / E;
    local.y = (p.y - r.top) / E;
    if (!local.near) return;
    // Flick kicks: a fast cursor crossing a letter jolts it.
    const speed = p.speed;
    for (const g of glyphs) {
      const dx = g.cx - local.x;
      const side = Math.sign(dx);
      const dy = Math.abs(g.cy - local.y);
      if (speed > 650 && g.side !== 0 && side !== g.side && dy < 0.9) {
        const kick = Math.min(speed / 900, 2.6);
        g.lift.v -= kick;
        g.lean.v += -side * Math.min(speed / 12, 160);
      }
      g.side = side;
    }
  }

  function tideAt(i: number) {
    if (tide.pos < -50) return 0;
    const d = i - tide.pos;
    return Math.exp(-(d * d) / (2 * 1.3 * 1.3));
  }

  function step(dt: number) {
    const now = performance.now();
    let moving = now < busyUntil || !!tideTween?.isActive();
    glyphs.forEach((g, i) => {
      let tLift = 0;
      let tLean = 0;
      let tWeight = restWeight;
      if (local.near) {
        const dx = g.cx - local.x;
        const dy = (g.cy - local.y) * 0.9;
        const f = Math.exp(-(dx * dx + dy * dy) / (2 * REACH * REACH));
        tLift -= 0.17 * f;
        tLean += clamp(-1, 1, dx / REACH) * 7 * f;
        tWeight += WEIGHT_GAIN * f;
      }
      const t = tideAt(i);
      if (t > 0.001) {
        tLift -= 0.1 * t;
        tWeight = Math.max(tWeight, restWeight + 170 * t);
      }
      stepSpring(g.lift, K_LIFT, tLift, dt);
      stepSpring(g.lean, K_LEAN, tLean, dt);
      stepSpring(g.weight, K_WEIGHT, tWeight, dt);
      stepSpring(g.squash, K_SQUASH, 0, dt);
      g.lift.x = clamp(-0.45, 0.25, g.lift.x);
      g.lean.x = clamp(-28, 28, g.lean.x);

      if (g.hopAt && now >= g.hopAt) {
        g.hopV = -g.hopSpeed;
        g.hopAt = 0;
      }
      if (g.hop < 0 || g.hopV !== 0) {
        g.hopV += GRAVITY * dt;
        g.hop += g.hopV * dt;
        if (g.hop >= 0) {
          const impact = g.hopV;
          g.hop = 0;
          if (impact > 0.7) {
            g.hopV = -impact * RESTITUTION;
            g.squash.v -= impact * 0.9;
          } else {
            g.hopV = 0;
          }
        }
      }
      const calm =
        g.hopAt === 0 &&
        g.hop === 0 &&
        g.hopV === 0 &&
        springAtRest(g.lift, tLift, 0.001, 0.01) &&
        springAtRest(g.lean, tLean, 0.05, 0.1) &&
        springAtRest(g.weight, tWeight, 0.5, 1) &&
        springAtRest(g.squash, 0, 0.0008, 0.005);
      if (!calm) moving = true;
    });
    return moving;
  }

  function write() {
    for (const g of glyphs) {
      const stretch = Math.min(Math.abs(g.hopV) * 0.018, 0.08);
      const sy = clamp(0.72, 1.28, (1 + g.squash.x) * (1 + stretch));
      g.put.y((g.lift.x + g.hop) * E);
      g.put.r(g.lean.x + g.spin.deg);
      g.put.sy(sy);
      g.put.sx(1 + (1 / sy - 1) * 0.75);
      const weight = Math.round(g.weight.x);
      if (weight !== g.lastWeight) {
        g.el.style.fontWeight = String(weight);
        g.lastWeight = weight;
      }
    }
  }

  function snapToRest() {
    for (const g of glyphs) {
      g.lift = spring();
      g.lean = spring();
      g.weight = spring(restWeight);
      g.squash = spring();
      g.hop = 0;
      g.hopV = 0;
      g.hopAt = 0;
      g.spin.deg = 0;
      g.side = 0;
    }
    write();
    for (const g of glyphs) {
      g.el.style.fontWeight = "";
      g.lastWeight = restWeight;
    }
  }

  const loop = createSpringLoop({
    frame: readPointer,
    step,
    write,
    onSleep: () => {
      if (!local.near) snapToRest();
      if (relockPending) {
        relockPending = false;
        lock();
      }
    },
  });

  // ---- input ----
  const offPointer = onPointer((state) => {
    if (!alive || !inView || !entered || !locked || !fine || state.type === "touch") return;
    if (loop.awake()) return;
    const r = heading.getBoundingClientRect();
    const pad = E * 1.1;
    if (
      state.x > r.left - pad &&
      state.x < r.right + pad &&
      state.y > r.top - pad &&
      state.y < r.bottom + pad
    ) {
      // Slots never move while the solver sleeps, but the heading may have
      // re-wrapped since the last look.
      measureCentres();
      loop.wake();
    }
  });

  function hopWave(from: number, strength = 1) {
    if (!entered || !locked || !glyphs.length) return;
    const origin = glyphs[clamp(0, glyphs.length - 1, from)];
    const now = performance.now();
    for (const g of glyphs) {
      const d = Math.hypot(g.cx - origin.cx, (g.cy - origin.cy) * 1.5);
      g.hopAt = now + d * 55;
      g.hopSpeed = Math.max(1.4, 4.4 - d * 0.45) * strength;
    }
    gsap.fromTo(
      origin.spin,
      { deg: 0 },
      {
        deg: random() < 0.5 ? 360 : -360,
        duration: 0.62,
        ease: "power2.out",
        onComplete: () => {
          origin.spin.deg = 0;
        },
      },
    );
    busyUntil = now + 650;
    loop.wake();
  }

  function nearestGlyph(clientX: number, clientY: number) {
    const r = heading!.getBoundingClientRect();
    const x = (clientX - r.left) / E;
    const y = (clientY - r.top) / E;
    let best = 0;
    let bestD = Infinity;
    glyphs.forEach((g, i) => {
      const d = Math.hypot(g.cx - x, (g.cy - y) * 1.5);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || isScrollLocked()) return;
    hopWave(nearestGlyph(event.clientX, event.clientY));
  };
  heading.addEventListener("pointerdown", onDown);
  const onHop = () => hopWave(Math.floor(glyphs.length / 2), 1.15);
  heading.addEventListener("kinetic:hop", onHop);

  // ---- idle beats ----
  let idleCall: gsap.core.Tween | null = null;
  function scheduleIdle() {
    idleCall?.kill();
    idleCall = gsap.delayedCall(randomBetween(7, 12), idleBeat);
  }
  function idleBeat() {
    if (!alive) return;
    if (!inView || document.hidden || isScrollLocked() || local.near || loop.awake()) {
      scheduleIdle();
      return;
    }
    if (random() < 0.3 && glyphs.length > 2) {
      // One letter hops on its own, like it couldn't sit still.
      const g = glyphs[randomInt(0, glyphs.length - 1)];
      g.hopAt = performance.now();
      g.hopSpeed = 3.2;
      busyUntil = performance.now() + 500;
      loop.wake();
      scheduleIdle();
      return;
    }
    const n = glyphs.length;
    tideTween?.kill();
    tideTween = gsap.fromTo(
      tide,
      { pos: -2.5 },
      {
        pos: n + 1.5,
        duration: 0.5 + n * 0.05,
        ease: "sine.inOut",
        onComplete: () => {
          tide.pos = -99;
          scheduleIdle();
        },
      },
    );
    loop.wake();
  }

  // ---- visibility ----
  const io = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      if (!inView && loop.awake()) {
        loop.sleep();
        tideTween?.kill();
        tide.pos = -99;
        snapToRest();
      }
    },
    { rootMargin: "80px 0px" },
  );
  io.observe(heading);

  return () => {
    alive = false;
    offPointer();
    io.disconnect();
    window.removeEventListener("resize", onResize);
    window.clearTimeout(resizeTimer);
    heading.removeEventListener("pointerdown", onDown);
    heading.removeEventListener("kinetic:hop", onHop);
    idleCall?.kill();
    tideTween?.kill();
    loop.sleep();
    entrance.kill();
    for (const g of glyphs) gsap.killTweensOf(g.spin);
    gsap.set(
      glyphs.map((g) => g.el),
      { clearProps: "all" },
    );
    gsap.set(slots, { clearProps: "all" });
    if (chapter)
      gsap.set([chapter, chapterShape, chapterRule].filter(Boolean), { clearProps: "transform" });
  };
}
