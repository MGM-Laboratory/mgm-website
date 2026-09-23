import gsap from "gsap";

import { isScrollLocked, onScrollLockChange } from "@/lib/scroll-lock";

/**
 * The /projects hero's idle and hover play ("Residents"): the word PROJECT
 * is a row of heavy type blocks standing on the baseline.
 *
 * - Letters have mass: they lean away from a nearby cursor and gain ink
 *   weight (Hanken Grotesk's wght axis), squash when pressed, and hop when
 *   released, landing with a squash of their own.
 *
 * One fixed-step spring solver on the GSAP ticker writes every physics
 * transform. It only runs while something moves: once everything is calm
 * it removes itself from the ticker, and with nothing holding a pose it
 * snaps every glyph back to an exact identity transform and weight 500,
 * so the hero costs nothing at rest. It parks (everything back to rest,
 * solver asleep) while the hero is offscreen, the tab is hidden, or a page
 * scroll lock (the nav menu) covers it.
 *
 * Ownership, so idle and hover never strand a value: the entrance owns the
 * outer `.projects-hero-char` slots and never touches the inner
 * `.projects-hero-glyph`; the solver's quickSetters are the only writers
 * of a glyph's transform and font weight. The markup owns slot widths and
 * pivots (transform-origin), so nothing here may clear them.
 *
 * Started only after the entrance completes, and never under reduced
 * motion (gsap.matchMedia also tears it down live if that preference
 * turns on mid-visit).
 */

/** Title geometry, in em of the title's font size (see projects-hero.tsx). */
const CAP_MID = 0.575;
const HALF_TRACKING = 0.025;

type Spring = { x: number; v: number };
/** Stiffness and damping; the damping ratio is c / (2 * sqrt(k)). */
type SpringConfig = readonly [k: number, c: number];

// x: a fast pass leaves a small wobble behind (zeta 0.54).
const KX: SpringConfig = [170, 14];
// Lean: deliberately jelly (zeta 0.37).
const KR: SpringConfig = [150, 9];
// Squash and stretch: quick and bouncy.
const KS: SpringConfig = [420, 15];
// Weight: critically damped, so ink never over- or undershoots.
const KW: SpringConfig = [120, 22];

const DT = 1 / 120;
/** Gravity for hops, in em/s^2. */
const GRAVITY = 16;
/** Share of the landing speed a letter bounces back with. */
const RESTITUTION = 0.3;
/** Landings slower than this (em/s) just stop instead of bouncing. */
const MIN_BOUNCE = 0.5;
/** Consecutive calm substeps before the solver sleeps (0.1 s). */
const CALM_STEPS = 12;
const REST_WEIGHT = 500;

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const spring = (x = 0): Spring => ({ x, v: 0 });
function step(s: Spring, [k, c]: SpringConfig, target: number) {
  s.v += (k * (target - s.x) - c * s.v) * DT;
  s.x += s.v * DT;
}

type Setter = (value: number) => void;

type Glyph = {
  el: HTMLElement;
  /** Ink centre, em from the title's left edge. */
  cx: number;
  /** Sideways push (em), lean (deg), squash (scaleY - 1), weight. */
  x: Spring;
  r: Spring;
  s: Spring;
  w: Spring;
  /** Height above the baseline shelf (em, negative is up) and its speed. */
  y: number;
  vy: number;
  held: boolean;
  lastWeight: number;
  put: Record<"x" | "y" | "r" | "sx" | "sy", Setter>;
};

export type HeroPlayOptions = {
  /** Each letter's frozen slot width, in em of the title's font size. */
  slots: number[];
};

export function startHeroPlay(root: HTMLElement, options: HeroPlayOptions): () => void {
  const mm = gsap.matchMedia();
  mm.add(
    {
      motion: "(prefers-reduced-motion: no-preference)",
      fine: "(hover: hover) and (pointer: fine)",
    },
    (context) => {
      const { motion, fine } = context.conditions as { motion: boolean; fine: boolean };
      if (!motion) return;
      // attach() runs synchronously, so the matchMedia context records its
      // setup sets and reverts them on teardown.
      return attach(root, options, fine);
    },
  );
  return () => mm.revert();
}

function attach(root: HTMLElement, { slots }: HeroPlayOptions, fine: boolean) {
  const wrap = root.querySelector<HTMLElement>(".projects-hero-wrap");
  const h1 = root.querySelector<HTMLElement>("h1");
  const glyphEls = [...root.querySelectorAll<HTMLElement>(".projects-hero-glyph")];
  if (!wrap || !h1 || glyphEls.length !== slots.length) return;

  // E: the title's font size in px; every physics length below is in em.
  let E = parseFloat(getComputedStyle(h1).fontSize) || 16;
  let alive = true;
  let awake = false;
  let running = true;
  let inView = true;
  // A page scroll lock means something (the nav menu) covers the page.
  let covered = isScrollLocked();
  let acc = 0;
  let calm = 0;
  let held: Glyph | null = null;
  // The pointer in em, relative to the title's top-left corner.
  const pointer = { x: 0, y: 0, inside: false };

  const qs = (el: Element, property: string, unit?: string) =>
    gsap.quickSetter(el, property, unit) as Setter;

  let left = 0;
  const glyphs: Glyph[] = glyphEls.map((el, i) => {
    const cx = left + slots[i] / 2 - HALF_TRACKING;
    left += slots[i];
    return {
      el,
      cx,
      x: spring(),
      r: spring(),
      s: spring(),
      w: spring(REST_WEIGHT),
      y: 0,
      vy: 0,
      held: false,
      lastWeight: REST_WEIGHT,
      put: {
        x: qs(el, "x", "px"),
        y: qs(el, "y", "px"),
        r: qs(el, "rotation", "deg"),
        sx: qs(el, "scaleX"),
        sy: qs(el, "scaleY"),
      },
    };
  });

  // The entrance's rise mask has done its job; hops may leave the line box.
  gsap.set(h1, { overflow: "visible" });

  // ---- solver ----
  function targets(g: Glyph, i: number): [x: number, r: number, s: number, w: number] {
    let tx = 0;
    let tr = 0;
    let tw = REST_WEIGHT;
    const ts = g.held ? -0.18 : 0;
    // A pressed letter's neighbours lean aside to make room for it.
    const hi = held ? glyphs.indexOf(held) : -9;
    if (Math.abs(hi - i) === 1) {
      tx += (i - hi) * 0.05;
      tr += (i - hi) * 5;
    }
    if (pointer.inside && fine) {
      // Gaussian falloff around the cursor (vertical distance measured
      // from the cap middle, slightly flattened), so two or three letters
      // react at once: they shift and lean away and gain ink.
      // The push and lean scale with the sideways offset (not its
      // direction alone), so they pass smoothly through zero as the
      // cursor crosses a letter instead of flipping sides.
      const dx = g.cx - pointer.x;
      const dy = (CAP_MID - pointer.y) * 0.8;
      const R = 0.55;
      const f = Math.exp(-(dx * dx + dy * dy) / (2 * R * R));
      const side = clamp(-1, 1, dx / R);
      tx += side * 0.08 * f;
      tr += side * 6 * f;
      tw += 180 * f;
    }
    return [tx, tr, ts, tw];
  }

  let restTargets = true;
  function stepGlyph(g: Glyph, i: number) {
    const [tx, tr, ts, tw] = targets(g, i);
    if (tx !== 0 || tr !== 0 || ts !== 0 || tw !== REST_WEIGHT) restTargets = false;
    step(g.x, KX, tx);
    step(g.r, KR, tr);
    step(g.s, KS, ts);
    step(g.w, KW, tw);
    g.x.x = clamp(-0.3, 0.3, g.x.x);
    g.vy += GRAVITY * DT;
    g.y += g.vy * DT;
    if (g.y > 0) {
      // Landed on the baseline shelf.
      const impact = g.vy;
      g.y = 0;
      if (impact > MIN_BOUNCE) {
        g.vy = -impact * RESTITUTION;
        g.s.v -= impact * 0.6;
      } else {
        g.vy = 0;
      }
    }
    // Calm: settled on its targets and on the shelf.
    return (
      g.vy === 0 &&
      Math.abs(g.x.v) < 0.005 &&
      Math.abs(g.x.x - tx) < 0.001 &&
      Math.abs(g.r.v) < 0.05 &&
      Math.abs(g.r.x - tr) < 0.02 &&
      Math.abs(g.s.v) < 0.002 &&
      Math.abs(g.s.x - ts) < 0.0005 &&
      Math.abs(g.w.v) < 0.5 &&
      Math.abs(g.w.x - tw) < 0.5
    );
  }

  function write() {
    for (const g of glyphs) {
      // Airborne letters stretch a little with their speed.
      const stretch = Math.min(Math.abs(g.vy) * 0.025, 0.08);
      const sy = clamp(0.72, 1.25, (1 + g.s.x) * (1 + stretch));
      g.put.x(g.x.x * E);
      g.put.y(g.y * E);
      g.put.r(g.r.x);
      g.put.sy(sy);
      // Near area-preserving: a squashed letter spreads sideways.
      g.put.sx(1 + (1 / sy - 1) * 0.8);
      const weight = Math.round(g.w.x);
      if (weight !== g.lastWeight) {
        g.el.style.fontWeight = String(weight);
        g.lastWeight = weight;
      }
    }
  }

  function tick(_time: number, deltaMs: number) {
    // Clamped, so a hitch or a resumed tab never fires a huge step.
    acc += Math.min(deltaMs, 50) / 1000;
    while (acc >= DT) {
      acc -= DT;
      restTargets = true;
      let allCalm = true;
      glyphs.forEach((g, i) => {
        if (!stepGlyph(g, i)) allCalm = false;
      });
      calm = allCalm && !held ? calm + 1 : 0;
    }
    write();
    // A parked cursor keeps its pose asleep; only a true rest snaps.
    if (calm > CALM_STEPS) sleep(restTargets);
  }

  function wake() {
    if (!alive || !running || awake) return;
    awake = true;
    gsap.ticker.add(tick);
  }

  function sleep(snap: boolean) {
    gsap.ticker.remove(tick);
    awake = false;
    acc = 0;
    calm = 0;
    if (!snap) return;
    for (const g of glyphs) {
      g.x = spring();
      g.r = spring();
      g.s = spring();
      g.w = spring(REST_WEIGHT);
      g.y = 0;
      g.vy = 0;
    }
    write();
    // Exact identity: no sub-pixel residue, and weight back to the class.
    for (const g of glyphs) {
      g.el.style.fontWeight = "";
      g.lastWeight = REST_WEIGHT;
    }
  }

  // ---- input ----
  function toLocal(e: PointerEvent) {
    const r = h1!.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) / E;
    pointer.y = (e.clientY - r.top) / E;
  }

  function onMove(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    toLocal(e);
    pointer.inside = true;
    wake();
  }

  function onLeave(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    pointer.inside = false;
    wake();
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (e.pointerType === "mouse") onMove(e);
    const target = e.target as Element;
    const glyphEl = target.closest<HTMLElement>(".projects-hero-glyph");
    if (glyphEl) {
      held = glyphs[glyphEls.indexOf(glyphEl)] ?? null;
      if (held) held.held = true;
      wake();
    }
  }

  function launch(g: Glyph, height: number) {
    g.vy = -Math.sqrt(2 * GRAVITY * height);
  }

  function onUp() {
    if (held) {
      const g = held;
      held = null;
      g.held = false;
      // The release: a hop, a random spin and a stretch kick.
      launch(g, 0.28);
      g.r.v += gsap.utils.random(-160, 160);
      g.s.v += 1.6;
    }
    wake();
  }

  // A touch that turned into a scroll: let go without a launch.
  function onCancel() {
    if (held) {
      held.held = false;
      held = null;
    }
    wake();
  }

  // ---- lifecycle ----
  function park() {
    if (held) {
      held.held = false;
      held = null;
    }
    pointer.inside = false;
    sleep(true);
  }

  function sync() {
    const on = alive && inView && !covered && !document.hidden;
    if (on === running) return;
    running = on;
    if (!on) park();
  }

  function measure() {
    if (!alive) return;
    E = parseFloat(getComputedStyle(h1!).fontSize) || E;
    // Positions are em, so only the px writes need refreshing.
    if (!awake) write();
  }

  const offs: Array<() => void> = [];
  function listen(
    target: EventTarget,
    type: string,
    handler: (event: never) => void,
    opts?: AddEventListenerOptions,
  ) {
    const listener = handler as unknown as EventListener;
    target.addEventListener(type, listener, opts);
    offs.push(() => target.removeEventListener(type, listener, opts));
  }

  if (fine) {
    listen(root, "pointermove", onMove, { passive: true });
    listen(root, "pointerleave", onLeave);
  }
  listen(root, "pointerdown", onDown);
  listen(window, "pointerup", onUp);
  listen(window, "pointercancel", onCancel);
  listen(document, "visibilitychange", sync);
  offs.push(
    onScrollLockChange((locked) => {
      covered = locked;
      sync();
    }),
  );
  const io = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    sync();
  });
  io.observe(root);
  const ro = new ResizeObserver(() => measure());
  ro.observe(h1);
  void document.fonts?.ready.then(measure);

  if (process.env.NODE_ENV !== "production") {
    // Dev-only probe for the browser verification scripts.
    (window as unknown as { __heroPlay?: object }).__heroPlay = {
      get awake() {
        return awake;
      },
      get running() {
        return running;
      },
    };
  }

  return () => {
    alive = false;
    park();
    running = false;
    io.disconnect();
    ro.disconnect();
    offs.forEach((off) => off());
    // quickSetter writes are not recorded by the matchMedia context, so
    // clear them by hand. Transform only: the markup owns the pivots.
    gsap.set(glyphEls, { clearProps: "transform" });
    for (const el of glyphEls) el.style.fontWeight = "";
  };
}
