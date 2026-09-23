import gsap from "gsap";

import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

import { scrollPageTo } from "@/lib/page-scroll";
import { waitForGridReveal } from "@/lib/projects-intro";
import { random, randomBetween, randomInt, randomPick } from "@/lib/random";
import { isScrollLocked, onScrollLockChange } from "@/lib/scroll-lock";

if (typeof window !== "undefined") {
  gsap.registerPlugin(DrawSVGPlugin);
}

/**
 * The /projects hero's idle and hover play ("Residents"): the word PROJECT
 * is a row of heavy type blocks standing on the baseline, with the lab's
 * Bauhaus shapes living behind it. At rest it reads as a plain word with
 * one brand-blue dot in the O, until the dot turns out to be an eye.
 *
 * - Letters have mass: they lean away from a nearby cursor and gain ink
 *   weight (Hanken Grotesk's wght axis), squash when pressed, and hop when
 *   released, landing with a squash of their own.
 * - Residents and the eye: shapes peek through the word's gaps and
 *   counters; the pupil tracks the cursor, glances at events and blinks
 *   (a hard landing makes it flinch).
 * - The instruments: the count re-rolls with a drop; the arrow is pulled
 *   toward a nearby cursor, winds up over a yellow disc on hover, and
 *   fires (its shaft zips into the tip and regrows, and the word flinches)
 *   while the page scrolls to the list.
 * - Touch: tapping a letter launches it, and a sideways drag across the
 *   word strums the letters it crosses.
 * - An idle director plays one beat at a time (peek, blink, breathe,
 *   count, a hop wave) while nobody is interacting.
 *
 * One fixed-step spring solver on the GSAP ticker writes every physics
 * transform. It only runs while something moves: once everything is calm
 * it removes itself from the ticker, and with nothing holding a pose it
 * snaps every glyph back to an exact identity transform and weight 500,
 * so the hero costs nothing at rest. It parks (every beat interrupted back
 * to rest, solver asleep) while the hero is offscreen, the tab is hidden,
 * or a page scroll lock (the nav menu) covers it.
 *
 * Ownership, so idle and hover never strand a value: the entrance owns the
 * outer `.projects-hero-char` slots and never touches the inner
 * `.projects-hero-glyph`; the solver's quickSetters are the only writers
 * of a glyph's transform and font weight. Pointer and idle only feed the
 * solver's targets (added together; the heavier weight wins), so a beat
 * that is mid-play when the cursor arrives just finishes underneath. Every
 * beat is a timeline whose onInterrupt returns it to rest, so pausing is
 * always kill(). The markup owns slot widths and pivots (transform-origin),
 * so nothing here may clear them.
 *
 * Started only after the entrance completes, and never under reduced
 * motion (a media query listener also tears it down live if that
 * preference turns on mid-visit, and rebuilds it for a new pointer type).
 */

/** Title geometry, in em of the title's font size (see projects-hero.tsx). */
const CAP_MID = 0.575;
const HALF_TRACKING = 0.025;
/** Resident shape size, in em of the title's font size. */
const RESIDENT_SIZE = 0.42;

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
// The arrow's drift, in units of its own size.
const KA: SpringConfig = [220, 14];

const DT = 1 / 120;
/** Gravity for hops, in em/s^2. */
const GRAVITY = 16;
/** Share of the landing speed a letter bounces back with. */
const RESTITUTION = 0.3;
/** Landings slower than this (em/s) just stop instead of bouncing. */
const MIN_BOUNCE = 0.5;
/** Landings faster than this (em/s) make the eye flinch. */
const FLINCH_IMPACT = 2;
/** Consecutive calm substeps before the solver sleeps (0.1 s). */
const CALM_STEPS = 12;
const REST_WEIGHT = 500;

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const spring = (x = 0): Spring => ({ x, v: 0 });
function step(s: Spring, [k, c]: SpringConfig, target: number) {
  s.v += (k * (target - s.x) - c * s.v) * DT;
  s.x += s.v * DT;
}

type Setter = (value: number) => void;
type Beat = gsap.core.Timeline | null;

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
  /** The idle "breathe" crest over this letter, 0 to 1. */
  tide: number;
  held: boolean;
  lastWeight: number;
  put: Record<"x" | "y" | "r" | "sx" | "sy", Setter>;
};

type Resident = { el: HTMLElement; body: HTMLElement; key: string; busy: boolean };

export type HeroPlayOptions = {
  /** Each letter's frozen slot width, in em of the title's font size. */
  slots: number[];
  /** The real project count, which every re-roll lands on. */
  count: number;
};

export function startHeroPlay(root: HTMLElement, options: HeroPlayOptions): () => void {
  // Plain media query lists whose listeners go away with the play, not
  // gsap.matchMedia: its add() never removes the change listeners it puts
  // on each list, so every visit would leave two behind for the session.
  const motionQuery = window.matchMedia("(prefers-reduced-motion: no-preference)");
  const fineQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  let ctx: gsap.Context | null = null;
  const run = () => {
    ctx?.revert();
    // attach() runs synchronously, so the context records its setup sets
    // and reverts them (and runs attach()'s returned teardown) on revert.
    ctx = gsap.context(() => {
      if (!motionQuery.matches) {
        // Reduced motion switched on mid-visit: the eye stays a still dot.
        gsap.set(root.querySelector(".projects-hero-pupil"), { autoAlpha: 1 });
        return;
      }
      return attach(root, options, fineQuery.matches);
    });
  };
  run();
  motionQuery.addEventListener("change", run);
  fineQuery.addEventListener("change", run);
  return () => {
    motionQuery.removeEventListener("change", run);
    fineQuery.removeEventListener("change", run);
    ctx?.revert();
    ctx = null;
  };
}

function attach(root: HTMLElement, { slots, count }: HeroPlayOptions, fine: boolean) {
  const h1 = root.querySelector<HTMLElement>("h1");
  const glyphEls = [...root.querySelectorAll<HTMLElement>(".projects-hero-glyph")];
  const look = root.querySelector<HTMLElement>(".projects-hero-pupil-look");
  const dilate = root.querySelector<HTMLElement>(".projects-hero-pupil-dilate");
  const pupil = root.querySelector<HTMLElement>(".projects-hero-pupil");
  const link = root.querySelector<HTMLElement>(".projects-hero-arrow-link");
  const disc = root.querySelector<HTMLElement>(".projects-hero-arrow-disc");
  const numberWrap = root.querySelector<HTMLElement>(".projects-hero-number");
  const numberText = root.querySelector<HTMLElement>(".projects-hero-number-text");
  const roll = root.querySelector<HTMLElement>(".projects-hero-number-roll");
  const arrowSvg = root.querySelector<SVGSVGElement>(".projects-hero-arrow");
  const arrowShaft = root.querySelector<SVGPathElement>(".projects-hero-arrow-shaft");
  if (!arrowSvg || !arrowShaft) return;
  if (!h1 || !look || !dilate || !pupil || !link || !disc) return;
  if (!numberWrap || !numberText || !roll) return;
  if (glyphEls.length !== slots.length) return;
  const residents: Resident[] = [
    ...root.querySelectorAll<HTMLElement>(".projects-hero-resident"),
  ].map((el) => ({
    el,
    body: el.firstElementChild as HTMLElement,
    key: el.dataset.resident ?? "",
    busy: false,
  }));

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
  // A touch drag across the word: where it was last seen (em) and when.
  const strum = { active: false, startX: 0, x: 0, t: 0 };
  let lastInput = performance.now();

  let activeBeat: Beat = null;
  let blinkTl: Beat = null;
  let dropTl: Beat = null;
  let dropCooldownUntil = 0;

  // The arrow: a solver body in units of its own size. The link around it
  // is never transformed; it is the hit area and the measuring box, so the
  // magnet can't feed back on itself.
  const arrow = {
    x: spring(),
    y: spring(),
    s: spring(),
    /** Centre and size, em in title coordinates (see measure()). */
    cx: 0,
    cy: 0,
    size: 1,
    hover: false,
    held: false,
  };

  let nextBeat: gsap.core.Tween | null = null;
  let glanceBack: gsap.core.Tween | null = null;
  let lastBeatId = "";
  // The first idle beat always introduces the residents.
  let firstBeat = true;

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
      tide: 0,
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
  const eyeCentre = { x: glyphs[2]?.cx ?? 0, y: CAP_MID };
  // Where residents surface: the gaps between letters, and the ink centres
  // of P, R, J, C and T (never the O: that is the eye).
  const spots = [
    ...slots
      .slice(0, -1)
      .map((_, i) => slots.slice(0, i + 1).reduce((a, b) => a + b, 0) - HALF_TRACKING),
    ...[0, 1, 3, 5, 6].filter((i) => glyphs[i]).map((i) => glyphs[i].cx),
  ];

  // ---- one-time setup (recorded by startHeroPlay's context) ----
  // The entrance's rise mask has done its job; hops may leave the line box.
  gsap.set(h1, { overflow: "visible" });
  gsap.set(
    residents.map((r) => r.body),
    { yPercent: 110, rotation: 0, autoAlpha: 0, transformOrigin: "50% 100%" },
  );
  // The eye starts closed (scale 0) and opens once the play begins.
  gsap.set(dilate, { scale: 0 });
  gsap.set(pupil, { autoAlpha: 1 });
  const lookX = gsap.quickTo(look, "x", { duration: 0.45, ease: "power3" });
  const lookY = gsap.quickTo(look, "y", { duration: 0.45, ease: "power3" });
  // quickTo drives one real property, not the scale shorthand.
  const dilateX = gsap.quickTo(dilate, "scaleX", { duration: 0.5, ease: "back.out(2)" });
  const dilateY = gsap.quickTo(dilate, "scaleY", { duration: 0.5, ease: "back.out(2)" });
  gsap.set(disc, { scale: 0, autoAlpha: 1 });
  const putArrow = {
    x: qs(arrowSvg, "x", "px"),
    y: qs(arrowSvg, "y", "px"),
    // quickSetter drives real properties, not the scale shorthand.
    sx: qs(arrowSvg, "scaleX"),
    sy: qs(arrowSvg, "scaleY"),
  };
  const dilateTo = (scale: number) => {
    dilateX(scale);
    dilateY(scale);
  };

  // ---- solver ----
  function targets(g: Glyph, i: number): [x: number, r: number, s: number, w: number] {
    let tx = 0;
    let tr = 0;
    let tw = REST_WEIGHT;
    const ts = g.held ? -0.18 : 0;
    // A pressed letter's neighbours make room for it, and pass a little of
    // the push on to the next letters, so nothing fuses into its neighbour
    // (the held letter also spreads sideways as it squashes).
    const hi = held ? glyphs.indexOf(held) : -9;
    const gap = Math.abs(hi - i);
    if (gap === 1) {
      tx += (i - hi) * 0.05;
      tr += (i - hi) * 3;
    } else if (gap === 2) {
      tx += Math.sign(i - hi) * 0.025;
    }
    if (pointer.inside && fine) {
      // Gaussian falloff around the cursor (vertical distance measured
      // from the cap middle, slightly flattened), so two or three letters
      // react at once: they shift and lean away and gain ink. The push and
      // lean scale with the sideways offset (not its direction alone), so
      // they pass smoothly through zero as the cursor crosses a letter.
      const dx = g.cx - pointer.x;
      const dy = (CAP_MID - pointer.y) * 0.8;
      const R = 0.55;
      const f = Math.exp(-(dx * dx + dy * dy) / (2 * R * R));
      if (!held) {
        const side = clamp(-1, 1, dx / R);
        tx += side * 0.08 * f;
        tr += side * 6 * f;
        tw += 180 * f;
      } else if (g.held) {
        // While a letter is held, the field only swells its weight:
        // pushing and leaning the letters around it on top of making room
        // ran them into their neighbours.
        tw += 180 * f;
      }
    }
    return [tx, tr, ts, Math.max(tw, REST_WEIGHT + 220 * g.tide)];
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
        if (impact > FLINCH_IMPACT) blink(false);
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

  function stepArrow() {
    let tx = 0;
    let ty = 0;
    const ts = arrow.held ? -0.16 : arrow.hover ? -0.08 : 0;
    // Wound up: cocked back up-left, against its own direction.
    if (arrow.hover) tx = ty = -0.08;
    if (pointer.inside && fine) {
      // The magnet: within 2.5 sizes it leans toward the cursor.
      const dx = (pointer.x - arrow.cx) / arrow.size;
      const dy = (pointer.y - arrow.cy) / arrow.size;
      const f = smoothstep(1 - Math.min(Math.hypot(dx, dy) / 2.5, 1));
      tx += clamp(-0.3, 0.3, dx * 0.3 * f);
      ty += clamp(-0.3, 0.3, dy * 0.3 * f);
    }
    if (tx !== 0 || ty !== 0 || ts !== 0) restTargets = false;
    step(arrow.x, KA, tx);
    step(arrow.y, KA, ty);
    step(arrow.s, KS, ts);
    return (
      Math.abs(arrow.x.v) < 0.005 &&
      Math.abs(arrow.x.x - tx) < 0.002 &&
      Math.abs(arrow.y.v) < 0.005 &&
      Math.abs(arrow.y.x - ty) < 0.002 &&
      Math.abs(arrow.s.v) < 0.002 &&
      Math.abs(arrow.s.x - ts) < 0.0005
    );
  }

  function writeArrow() {
    const px = arrow.size * E;
    putArrow.x(arrow.x.x * px);
    putArrow.y(arrow.y.x * px);
    putArrow.sx(1 + arrow.s.x);
    putArrow.sy(1 + arrow.s.x);
  }

  function tick(_time: number, deltaMs: number) {
    // Clamped, so a hitch or a resumed tab never fires a huge step.
    acc += Math.min(deltaMs, 50) / 1000;
    while (acc >= DT) {
      acc -= DT;
      restTargets = true;
      let allCalm = stepArrow();
      glyphs.forEach((g, i) => {
        if (!stepGlyph(g, i)) allCalm = false;
      });
      calm = allCalm && !held && !arrow.held ? calm + 1 : 0;
    }
    writeArrow();
    write();
    // A beat that drives the letters keeps the solver up until it ends;
    // a parked cursor keeps its pose asleep; only a true rest snaps.
    const glyphBeat = activeBeat?.isActive() && activeBeat.data === "glyphs";
    if (calm > CALM_STEPS && !glyphBeat) sleep(restTargets);
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
      g.tide = 0;
    }
    arrow.x = spring();
    arrow.y = spring();
    arrow.s = spring();
    write();
    writeArrow();
    // Exact identity: no sub-pixel residue, and weight back to the class.
    for (const g of glyphs) {
      g.el.style.fontWeight = "";
      g.lastWeight = REST_WEIGHT;
    }
  }

  function launch(g: Glyph, height: number) {
    g.vy = -Math.sqrt(2 * GRAVITY * height);
  }

  // ---- the arrow ----
  /** Two nods down-right: "the list is down there". */
  function nudgeArrow() {
    for (const delay of [0, 0.3]) {
      gsap.delayedCall(delay, () => {
        arrow.x.v += 1.6;
        arrow.y.v += 1.6;
        wake();
      });
    }
  }

  function setHot(on: boolean) {
    arrow.hover = on;
    link!.toggleAttribute("data-hot", on);
    gsap.to(disc, {
      scale: on ? 1 : 0,
      duration: on ? 0.35 : 0.22,
      ease: on ? "back.out(2)" : "power2.in",
      overwrite: true,
    });
    wake();
  }

  /** The recoil runs back through the word, right to left. */
  function flinch() {
    [...glyphs].reverse().forEach((g, k) => {
      gsap.delayedCall(k * 0.035, () => {
        if (!running) return;
        launch(g, 0.05 * 0.85 ** k);
        g.r.v -= 60 * 0.85 ** k;
        wake();
      });
    });
  }

  /** Fires the arrow and scrolls the page to the list. */
  function fire(e: MouseEvent) {
    // Always handled here: a native fragment jump also fires popstate,
    // which the page-transition curtain reads as a back/forward navigation
    // (and then waits on a pathname change that never comes).
    e.preventDefault();
    // The list, or the empty state's box in its place (same id).
    const target = document.getElementById("projects");
    // Keyboard or assistive-tech activation: a click no pointer produced
    // (detail 0), or on a link that was reached by keyboard.
    const fromKeyboard = e.detail === 0 || link!.matches(":focus-visible");
    lastInput = performance.now();
    arrow.held = false;
    arrow.x.v += 5;
    arrow.y.v += 5;
    arrow.s.v += 2;
    wake();
    // The shaft zips into the tip, then regrows as the arrow springs home.
    // A fromTo baseline, so a double-click can't strand it half drawn.
    gsap.killTweensOf(arrowShaft);
    gsap
      .timeline()
      .fromTo(
        arrowShaft,
        { drawSVG: "0% 100%" },
        { drawSVG: "100% 100%", duration: 0.16, ease: "power2.in" },
      )
      .to(arrowShaft, { drawSVG: "0% 100%", duration: 0.5, ease: "power3.out" }, "+=0.05");
    glance(arrow.cx + arrow.size, arrow.cy + arrow.size, 1.2);
    flinch();
    if (!target) return;
    // Through the page's scroller (a JS smooth scroller would fight a
    // direct window scroll); the offset honours the target's scroll margin.
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 96;
    gsap.delayedCall(0.12, () => {
      if (!alive) return;
      scrollPageTo(target, { duration: 1.1, offset: -margin });
      // Focus follows the jump, so a keyboard or screen-reader user is not
      // left on a link that just scrolled off the top: onto the first card
      // (or the empty state's box). preventScroll, so it never fights the
      // glide. Pointer users keep their focus where it was, with no ring.
      // Right after the intro the list can still be inert for a moment
      // (until its reveal starts), and focus() on an inert card does
      // nothing, so the hand-off waits for the reveal.
      if (fromKeyboard) {
        void waitForGridReveal().then(() => {
          if (!alive) return;
          (target.querySelector<HTMLElement>("a[href]") ?? target).focus({ preventScroll: true });
        });
      }
    });
  }

  // ---- the eye ----
  /** Points the pupil at a spot (em, title coordinates); null recentres. */
  function lookAt(x: number | null, y = 0) {
    if (x === null) {
      lookX(0);
      lookY(0);
      dilateTo(1);
      return;
    }
    const dx = x - eyeCentre.x;
    const dy = y - eyeCentre.y;
    const d = Math.hypot(dx, dy) || 1;
    // It never leaves the O's counter, even at the heaviest weight.
    const reach = Math.min(1, d / 2.5) * 0.08;
    lookX((dx / d) * reach * E);
    lookY((dy / d) * reach * E);
    // Something close to the eye makes the pupil widen.
    dilateTo(1 + 0.25 * (1 - clamp(0, 1, d / 0.8)));
  }

  /** A brief look at an event; the live cursor always wins over it. */
  function glance(x: number, y: number, hold: number) {
    if (pointer.inside) return;
    lookAt(x, y);
    glanceBack?.kill();
    glanceBack = gsap.delayedCall(hold, () => {
      if (!pointer.inside) lookAt(null);
    });
  }

  function blink(double = random() < 0.3): Beat {
    if (blinkTl?.isActive()) return blinkTl;
    blinkTl = gsap.timeline({ onInterrupt: () => void gsap.set(pupil, { scaleY: 1 }) });
    for (let k = 0; k < (double ? 2 : 1); k++) {
      blinkTl
        .to(pupil, { scaleY: 0.08, duration: 0.07, ease: "power2.in" }, k ? "+=0.08" : 0)
        .to(pupil, { scaleY: 1, duration: 0.14, ease: "power2.out" });
    }
    return blinkTl;
  }

  // ---- the count's re-roll ----
  /**
   * The count "drops", in the same vocabulary as the card titles' lusion
   * drop: each digit is a column of copies falling through the count's own
   * mask on expo.inOut. The column starts on the digit already showing, so
   * that digit sinks away slowly, `randoms` others flash past, and the
   * real digit settles in from above. Same digit count and tabular
   * figures, so the right edge never moves.
   */
  function dropCount(randoms: number): Beat {
    if (dropTl?.isActive() || performance.now() < dropCooldownUntil) return null;
    const digits = String(count).split("");
    const lines = randoms + 2;
    const columns = digits.map((digit, j) => {
      const column = document.createElement("span");
      column.style.cssText = "display:flex;flex-direction:column";
      const stack = [digit];
      for (let k = 0; k < randoms; k++) {
        // A leading digit never rolls to 0; no copy repeats the one above.
        let next = digit;
        while (next === stack[stack.length - 1]) {
          next = String(randomInt(j === 0 && digits.length > 1 ? 1 : 0, 9));
        }
        stack.push(next);
      }
      stack.push(digit);
      for (const d of stack) {
        const line = document.createElement("span");
        line.style.cssText = "display:block;height:1em";
        line.textContent = d;
        column.appendChild(line);
      }
      return column;
    });
    roll!.replaceChildren(...columns);
    const settle = () => {
      numberText!.textContent = String(count);
      gsap.set(numberText, { autoAlpha: 1 });
      gsap.set(roll, { autoAlpha: 0 });
      roll!.replaceChildren();
      dropCooldownUntil = performance.now() + 400;
    };
    const duration = 0.5 + 0.09 * (lines - 1);
    dropTl = gsap
      .timeline({ onComplete: settle, onInterrupt: settle })
      .set(roll, { autoAlpha: 1 })
      .set(numberText, { autoAlpha: 0 });
    columns.forEach((column, j) => {
      dropTl!.fromTo(
        column,
        { yPercent: (-100 * (lines - 1)) / lines },
        { yPercent: 0, duration, ease: "expo.inOut" },
        j * 0.07,
      );
    });
    return dropTl;
  }

  // ---- beats ----
  /** A resident rises behind a gap or letter, looks around, pops its head
   *  above the cap line, then ducks back down. */
  function peek(): Beat {
    // In dark mode the letters are white, and white strokes crossing the
    // brand-yellow disc read as notches cut into it (yellow only ever
    // carries ink, DESIGN_SYSTEM.md): the other residents peek instead.
    const dark = document.documentElement.classList.contains("dark");
    const free = residents.filter((r) => !r.busy && !(dark && r.key === "disc"));
    if (!free.length) return null;
    const r = randomPick(free);
    const x = randomPick(spots);
    r.busy = true;
    gsap.set(r.el, { x: (x - RESIDENT_SIZE / 2) * E });
    if (random() < 0.5) glance(x, 0.5, 1.2);
    const rest = () => {
      gsap.set(r.body, { yPercent: 110, rotation: 0, autoAlpha: 0 });
      r.busy = false;
    };
    return gsap
      .timeline({ onComplete: rest, onInterrupt: rest })
      .fromTo(
        r.body,
        { autoAlpha: 1, yPercent: 110, rotation: 0 },
        { yPercent: -45, duration: 0.55, ease: "power3.out" },
      )
      .to(r.body, {
        keyframes: { rotation: [0, -9, 9, -5, 0], easeEach: "sine.inOut" },
        duration: 0.6,
      })
      .to(r.body, { yPercent: -102, duration: 0.24, ease: "power2.out" })
      .to(r.body, { yPercent: 110, duration: 0.34, ease: "power3.in" }, "+=0.12");
  }

  /** A weight crest rolls through the word, left to right. */
  function breathe(): Beat {
    wake();
    const crest = { x: -2 };
    const settle = () => glyphs.forEach((g) => (g.tide = 0));
    return (
      gsap
        .timeline({ data: "glyphs", onComplete: settle, onInterrupt: settle })
        .fromTo(
          crest,
          { x: -2 },
          {
            x: glyphs.length + 1.5,
            duration: 1.6,
            ease: "sine.inOut",
            onUpdate: () => {
              glyphs.forEach((g, i) => (g.tide = Math.exp(-(((i - crest.x) / 1.1) ** 2))));
            },
          },
        )
        // The swell spills over into the count.
        .call(() => void dropCount(2), [], 1.15)
        // ...and the arrow points on at the list.
        .call(nudgeArrow, [], 1.35)
    );
  }

  /** Each letter crouches and hops in turn, then the arrow nods on. */
  function hopWave(): Beat {
    wake();
    const tl = gsap.timeline({ data: "glyphs" });
    glyphs.forEach((g, i) => {
      tl.call(() => void (g.s.v -= 1.2), [], i * 0.07).call(
        () => launch(g, 0.1),
        [],
        i * 0.07 + 0.08,
      );
    });
    return tl.call(nudgeArrow, [], glyphs.length * 0.07 + 0.1).set({}, {}, "+=0.5");
  }

  /** The eye opens once the entrance is over, and looks at the arrow. */
  function openEye(): Beat {
    return gsap
      .timeline({ onInterrupt: () => dilateTo(1) })
      .call(() => dilateTo(1), [], 0.3)
      .call(() => glance(arrow.cx, arrow.cy, 0.9), [], 0.9)
      .call(nudgeArrow, [], 1.05)
      .set({}, {}, 1.9);
  }

  const BEATS: Array<{ id: string; weight: number; whileHovered?: boolean; run: () => Beat }> = [
    { id: "peek", weight: 3, run: peek },
    { id: "blink", weight: 2, whileHovered: true, run: () => blink() },
    { id: "breathe", weight: 2, run: breathe },
    { id: "count", weight: 1, run: () => dropCount(4) },
    { id: "hop", weight: 1, run: hopWave },
  ];

  // Idle gaps stretch on touch devices and once nobody has touched
  // anything for a minute.
  const cadence = () => (fine ? 1 : 1.3) * (performance.now() - lastInput > 60_000 ? 2 : 1);

  function schedule(duration: number, gap: number) {
    nextBeat?.kill();
    nextBeat = gsap.delayedCall(duration + gap * cadence(), playBeat);
  }

  function playBeat() {
    // Parked: a late delayed call must never restart the director behind
    // the nav menu (sync() schedules afresh once the hero is back on).
    if (!running) return;
    // One beat at a time, never the same one twice in a row, and only a
    // blink while the cursor is over the hero.
    const pool = BEATS.filter(
      (b) => (!pointer.inside || b.whileHovered) && (b.id !== lastBeatId || pointer.inside),
    );
    if (!pool.length) return schedule(0, 2);
    let pick = random() * pool.reduce((sum, b) => sum + b.weight, 0);
    const beat =
      firstBeat && !pointer.inside
        ? BEATS[0]
        : (pool.find((b) => (pick -= b.weight) < 0) ?? pool[0]);
    firstBeat = false;
    lastBeatId = beat.id;
    activeBeat = beat.run();
    schedule(activeBeat?.duration() ?? 0, randomBetween(3.5, 6.5));
  }

  // ---- input ----
  function toLocal(e: PointerEvent): [number, number] {
    const r = h1!.getBoundingClientRect();
    return [(e.clientX - r.left) / E, (e.clientY - r.top) / E];
  }

  function onMove(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    [pointer.x, pointer.y] = toLocal(e);
    pointer.inside = true;
    lastInput = performance.now();
    glanceBack?.kill();
    lookAt(pointer.x, pointer.y);
    wake();
  }

  function onLeave(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    pointer.inside = false;
    lookAt(null);
    wake();
    // Opening the nav menu under a resting cursor parks the hero and then
    // fires this leave (the backdrop slides under the cursor): scheduling
    // here would start the director again behind the menu.
    if (running) schedule(0, randomBetween(2.5, 4));
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (e.pointerType === "mouse") onMove(e);
    lastInput = performance.now();
    if (e.pointerType !== "mouse") {
      const [x] = toLocal(e);
      Object.assign(strum, { active: true, startX: x, x, t: e.timeStamp });
    }
    const target = e.target as Element;
    const glyphEl = target.closest<HTMLElement>(".projects-hero-glyph");
    if (glyphEl) {
      held = glyphs[glyphEls.indexOf(glyphEl)] ?? null;
      if (held) held.held = true;
      wake();
    } else if (numberWrap!.contains(target)) {
      dropCount(4);
    } else if (link!.contains(target)) {
      arrow.held = true;
      wake();
    } else if (e.pointerType !== "mouse") {
      // A tap anywhere else in the hero: the eye looks at it.
      const [x, y] = toLocal(e);
      lookAt(x, y);
      glanceBack?.kill();
      glanceBack = gsap.delayedCall(0.8, () => lookAt(null));
    }
  }

  /**
   * The strum (touch only; the title allows vertical panning, so a
   * sideways drag stays with us): every letter the finger crosses near the
   * cap middle gets a kick scaled by the drag's speed. It also cancels a
   * pending tap launch.
   */
  function onTouchMove(e: PointerEvent) {
    if (e.pointerType === "mouse" || !strum.active) return;
    const [x, y] = toLocal(e);
    const dt = Math.max((e.timeStamp - strum.t) / 1000, 1 / 240);
    const vx = (x - strum.x) / dt;
    if (held && Math.abs(x - strum.startX) > 0.1) {
      held.held = false;
      held = null;
    }
    if (Math.abs(vx) >= 1.2 && Math.abs(y - CAP_MID) < 0.5) {
      const lo = Math.min(strum.x, x);
      const hi = Math.max(strum.x, x);
      const m = clamp(-1, 1, vx / 6);
      for (const g of glyphs) {
        if (g.cx < lo || g.cx > hi) continue;
        g.x.v += m;
        g.r.v += m * 180;
        g.vy -= Math.abs(m) * 2.4;
        g.s.v += Math.abs(m);
      }
      wake();
    }
    strum.x = x;
    strum.t = e.timeStamp;
  }

  function onUp() {
    strum.active = false;
    arrow.held = false;
    if (held) {
      const g = held;
      held = null;
      g.held = false;
      // The release: a hop, a random spin and a stretch kick.
      launch(g, 0.28);
      g.r.v += randomBetween(-160, 160);
      g.s.v += 1.6;
    }
    wake();
  }

  // A touch that turned into a scroll: let go without a launch.
  function onCancel() {
    strum.active = false;
    arrow.held = false;
    if (held) {
      held.held = false;
      held = null;
    }
    wake();
  }

  // ---- lifecycle ----
  function park() {
    nextBeat?.kill();
    nextBeat = null;
    glanceBack?.kill();
    // Each beat's onInterrupt returns it to rest.
    activeBeat?.kill();
    blinkTl?.kill();
    dropTl?.kill();
    activeBeat = null;
    if (held) {
      held.held = false;
      held = null;
    }
    arrow.held = false;
    arrow.hover = false;
    link!.removeAttribute("data-hot");
    gsap.killTweensOf(disc);
    gsap.set(disc, { scale: 0 });
    strum.active = false;
    pointer.inside = false;
    lookAt(null);
    sleep(true);
  }

  function sync() {
    const on = alive && inView && !covered && !document.hidden;
    if (on === running) return;
    running = on;
    if (on) {
      schedule(0, 1.2);
      // "Oh, you're back."
      gsap.delayedCall(0.3, () => {
        if (running) blink(true);
      });
    } else {
      park();
    }
  }

  function measure() {
    if (!alive) return;
    E = parseFloat(getComputedStyle(h1!).fontSize) || E;
    // Transform-free boxes: the link and the title are never transformed.
    const r = link!.getBoundingClientRect();
    const h = h1!.getBoundingClientRect();
    arrow.size = r.width / E || 1;
    arrow.cx = (r.left + r.width / 2 - h.left) / E;
    arrow.cy = (r.top + r.height / 2 - h.top) / E;
    // Positions are em, so only the px writes need refreshing.
    if (!awake) {
      write();
      writeArrow();
    }
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
    listen(numberWrap, "pointerenter", (e: PointerEvent) => {
      if (e.pointerType === "mouse") dropCount(4);
    });
    listen(link, "pointerenter", (e: PointerEvent) => {
      if (e.pointerType === "mouse") setHot(true);
    });
    listen(link, "pointerleave", () => setHot(false));
  }
  // Keyboard users get the wind-up on focus, and Enter fires it.
  listen(link, "focus", () => {
    if (link.matches(":focus-visible")) setHot(true);
  });
  listen(link, "blur", () => setHot(false));
  listen(link, "click", fire);
  listen(root, "pointerdown", onDown);
  listen(root, "pointermove", onTouchMove, { passive: true });
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

  measure();
  activeBeat = openEye();
  schedule(activeBeat?.duration() ?? 0, randomBetween(2.5, 4));
  running = !covered && !document.hidden;
  if (!running) park();

  if (process.env.NODE_ENV !== "production") {
    // Dev-only probe for the browser verification scripts.
    (window as unknown as { __heroPlay?: object }).__heroPlay = {
      get awake() {
        return awake;
      },
      get running() {
        return running;
      },
      get beat() {
        return activeBeat?.isActive() ? lastBeatId || "intro" : null;
      },
      play: (id: string) => {
        const beat = BEATS.find((b) => b.id === id);
        if (beat && running) {
          activeBeat?.kill();
          lastBeatId = beat.id;
          activeBeat = beat.run();
          schedule(activeBeat?.duration() ?? 0, randomBetween(3.5, 6.5));
        }
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
    // quickSetter writes are not recorded by the context, so clear them by
    // hand. Transform only: the markup owns the pivots.
    gsap.set([...glyphEls, ...residents.map((r) => r.el), arrowSvg], { clearProps: "transform" });
    gsap.killTweensOf(arrowShaft);
    gsap.set(arrowShaft, { drawSVG: "100%" });
    for (const el of glyphEls) el.style.fontWeight = "";
  };
}
