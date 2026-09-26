import gsap from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { isScrollIdle, trackScrollIdle } from "@/components/projects/stage/scroll-idle";
import { Spring } from "@/components/projects/stage/spring";
import { PROCESS_MAGNETS } from "@/data/process-magnets";
import { labNote } from "@/lib/lab-notes";
import { attachMagnetic } from "@/lib/motion/magnetic";
import { randomBetween } from "@/lib/random";
import { motionAllowed } from "@/lib/reduced-motion";

import {
  clampOffset,
  offsetRange,
  resolveOverlaps,
  rubberBand,
  type Bounds,
  type Box,
} from "./magnet-geometry";
import { startMagnetEntrance } from "./magnet-entrance";
import { startMagnetIdle } from "./magnet-idle";
import { loadArrangement, saveArrangement, type Arrangement } from "./magnet-storage";
import { playTileMove, setLeavesOpen } from "./magnet-tile-moves";
import type { PatternKind } from "./pattern-tile";

gsap.registerPlugin(InertiaPlugin, MotionPathPlugin, ScrollTrigger);

/** Gap kept between the magnets and the board's edges, px. */
const EDGE = 12;
/** A touch has to rest this long on a magnet to pick it up, ms. */
const HOLD_MS = 180;
/** A touch that travels this far before the hold is a scroll, px. */
const HOLD_SLOP = 8;
/** A mouse press that travels this far is a drag rather than a click, px. */
const DRAG_SLOP = 5;
/** The flipped side turns back on its own after this long, s. */
const FLIP_HOLD = 5;
/** Where magnets rest at home: slightly crooked, as fridge magnets are. */
const HOME_ANGLES = [-2, 1.5, -1.2, 2.2, -1.6, 1, -2.4, 1.8, -1.1, 1.6];

export type MagnetState = {
  index: number;
  word: string;
  kind: PatternKind;
  el: HTMLElement;
  pose: HTMLElement;
  lift: HTMLElement;
  shadow: HTMLElement;
  squash: HTMLElement;
  flip: HTMLElement;
  back: HTMLElement;
  ring: HTMLElement;
  motif: SVGGElement;
  /** Layout box at home, in section pixels. */
  home: Box;
  /** Resting offset from home (where it is once every tween settles). */
  x: number;
  y: number;
  /** Resting angle, degrees. */
  angle: number;
  homeAngle: number;
  /** Landed on the board (the entrance is over for this magnet). */
  ready: boolean;
  hovered: boolean;
  focused: boolean;
  dragging: boolean;
  gliding: boolean;
  flying: boolean;
  flipped: boolean;
  /** The idle gravity slide owns the pose's y right now. */
  sliding: boolean;
  liftSpring: Spring;
  tiltSpring: Spring;
  written: { lift: number; tilt: number };
  /** Where it is held, from its centre: lift and tilt pivot on this point. */
  pivot: { x: number; y: number };
  moveTween: gsap.core.Animation | null;
  poseTween: gsap.core.Animation | null;
  squashTween: gsap.core.Animation | null;
  flipTween: gsap.core.Animation | null;
  flipBack: gsap.core.Tween | null;
  keyTarget: { x: number; y: number } | null;
  lastKeyMove: number;
  lowerTimer: gsap.core.Tween | null;
};

type Press = {
  m: MagnetState;
  id: number;
  type: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  held: boolean;
  dragging: boolean;
  holdTimer: number;
  grabX: number;
  grabY: number;
};

export type MagnetBoard = {
  section: HTMLElement;
  magnets: MagnetState[];
  bounds: () => Bounds;
  /** Busy with a person: a press, a drag, a glide or a flight home. */
  busy: () => boolean;
  lastInput: () => number;
  ensureTicking: () => void;
  land: (m: MagnetState, options?: LandOptions) => void;
  squash: (m: MagnetState, amount: number) => void;
  ring: (m: MagnetState, strength: number) => void;
  jiggle: (source: MagnetState, strength: number, only?: (m: MagnetState) => boolean) => void;
  tileMove: (m: MagnetState) => void;
};

type LandOptions = {
  /** 0..1, how hard it hits the board. */
  strength?: number;
  /** A fresh crooked angle (a drop), or keep the current one (a nudge, a key step). */
  newAngle?: boolean;
  /** Counted as one of the visitor's moves (lab notes). */
  countAs?: "drag" | "key" | null;
  /** Skip the collision pass and the save (the reset does them once at the end). */
  quiet?: boolean;
};

function part<T extends Element = HTMLElement>(root: Element, name: string) {
  const found = root.querySelector<T>(`[data-part="${name}"]`);
  if (!found) throw new Error(`magnet part ${name} missing`);
  return found;
}

function clampAngle(angle: number) {
  return Math.max(-4, Math.min(4, angle));
}

/** A fresh resting angle between -4 and 4 degrees, clearly unlike the last. */
function crookedAngle(previous: number) {
  for (let i = 0; i < 6; i++) {
    const next = randomBetween(-4, 4);
    if (Math.abs(next - previous) > 1.5) return next;
  }
  return clampAngle(-previous || 2);
}

/**
 * Wires the process section's magnets. Returns the cleanup. Everything is
 * imperative: React renders the magnets once and never touches them again.
 */
export function createMagnetBoard(section: HTMLElement) {
  const rows = section.querySelector<HTMLElement>("[data-magnet-rows]");
  const controls = section.querySelector<HTMLElement>("[data-magnet-controls]");
  const resetButton = section.querySelector<HTMLButtonElement>("[data-magnet-reset]");
  const resetWrap = section.querySelector<HTMLElement>("[data-magnet-reset-wrap]");
  if (!rows || !controls || !resetButton || !resetWrap) throw new Error("magnet board markup");

  const cleanups: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window | Document,
    type: K | string,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, handler as EventListener, options);
    cleanups.push(() => target.removeEventListener(type, handler as EventListener, options));
  };

  const saved = loadArrangement();
  const magnets: MagnetState[] = Array.from(
    section.querySelectorAll<HTMLElement>("[data-magnet]"),
  ).map((el, index) => {
    const word = el.dataset.magnet ?? String(index);
    const homeAngle = HOME_ANGLES[index % HOME_ANGLES.length];
    const stored = saved[word];
    return {
      index,
      word,
      kind: (el.dataset.magnetKind ?? "square") as PatternKind,
      el,
      pose: part(el, "pose"),
      lift: part(el, "lift"),
      shadow: part(el, "shadow"),
      squash: part(el, "squash"),
      flip: part(el, "flip"),
      back: part(el, "back"),
      ring: part(el, "ring"),
      motif: part<SVGGElement>(el, "motif"),
      home: { x: 0, y: 0, w: 0, h: 0 },
      x: stored?.x ?? 0,
      y: stored?.y ?? 0,
      angle: stored ? clampAngle(stored.a) : homeAngle,
      homeAngle,
      ready: false,
      hovered: false,
      focused: false,
      dragging: false,
      gliding: false,
      flying: false,
      flipped: false,
      sliding: false,
      liftSpring: new Spring(3.4, 0.5, 0),
      tiltSpring: new Spring(2.4, 0.3, 0),
      written: { lift: Number.NaN, tilt: Number.NaN },
      pivot: { x: 0, y: 0 },
      moveTween: null,
      poseTween: null,
      squashTween: null,
      flipTween: null,
      flipBack: null,
      keyTarget: null,
      lastKeyMove: 0,
      lowerTimer: null,
    };
  });
  const byWord = new Map(PROCESS_MAGNETS.map((step, i) => [step.word, i]));
  magnets.sort((a, b) => (byWord.get(a.word) ?? a.index) - (byWord.get(b.word) ?? b.index));

  // ---- Layout ------------------------------------------------------------

  let bounds: Bounds = { left: 0, top: 0, right: 0, bottom: 0 };

  function measure() {
    for (const m of magnets) {
      m.home = { x: m.el.offsetLeft, y: m.el.offsetTop, w: m.el.offsetWidth, h: m.el.offsetHeight };
    }
    bounds = {
      left: EDGE,
      top: EDGE,
      right: section.clientWidth - EDGE,
      bottom: Math.max(rows!.offsetTop + rows!.offsetHeight, controls!.offsetTop - EDGE),
    };
  }

  function setOffset(m: MagnetState, x: number, y: number) {
    gsap.set(m.el, { x, y });
  }

  /** Clamps every magnet back into the board (a resize, a reflow). */
  function relayout() {
    measure();
    for (const m of magnets) {
      if (m.dragging || m.flying) continue;
      const clamped = clampOffset(m.home, bounds, m);
      if (!m.ready) {
        // Not thrown in yet: the entrance reads the offset when it plays.
        m.x = clamped.x;
        m.y = clamped.y;
        continue;
      }
      if (m.gliding) {
        m.moveTween?.kill();
        m.gliding = false;
        m.x = Number(gsap.getProperty(m.el, "x"));
        m.y = Number(gsap.getProperty(m.el, "y"));
        const inside = clampOffset(m.home, bounds, m);
        setOffset(m, inside.x, inside.y);
        land(m);
        continue;
      }
      if (Math.abs(clamped.x - m.x) > 0.5 || Math.abs(clamped.y - m.y) > 0.5) {
        m.x = clamped.x;
        m.y = clamped.y;
        m.moveTween?.kill();
        m.moveTween = gsap.to(m.el, { x: m.x, y: m.y, duration: motionAllowed() ? 0.35 : 0 });
      }
      if (m.flipped) placeBack(m);
    }
  }

  // ---- Frame loop: lift and tilt springs ----------------------------------

  let ticking = false;
  let press: Press | null = null;
  let lastInput = 0;

  function liftTarget(m: MagnetState) {
    if (m.dragging || m.flying) return 1;
    if (m.gliding) return 0.8;
    if (press?.m === m && press.held && press.type === "touch") return 0.7;
    if ((m.hovered || m.focused) && !m.flipped && m.ready) return 0.32;
    return 0;
  }

  function tiltTarget(m: MagnetState) {
    if (!(m.dragging || m.gliding) || !motionAllowed()) return 0;
    const vx = InertiaPlugin.isTracking(m.el, "x") ? InertiaPlugin.getVelocity(m.el, "x") : 0;
    // Held off-centre, the far end droops a little under its own weight.
    const droop = m.dragging
      ? Math.max(-1, Math.min(1, -m.pivot.x / Math.max(1, m.home.w / 2))) * 5
      : 0;
    return Math.max(-14, Math.min(14, vx / 75 + droop));
  }

  function write(m: MagnetState) {
    const l = m.liftSpring.value;
    const t = m.tiltSpring.value;
    if (Math.abs(l - m.written.lift) < 0.0005 && Math.abs(t - m.written.tilt) < 0.005) return;
    m.written.lift = l;
    m.written.tilt = t;
    // Rotate and scale about the held point rather than the centre, so the
    // spot under the finger stays under it and the magnet swings from there.
    const scale = 1 + 0.075 * l;
    const rad = (t * Math.PI) / 180;
    const cos = Math.cos(rad) * scale;
    const sin = Math.sin(rad) * scale;
    const { x: px, y: py } = m.pivot;
    const tx = px - (cos * px - sin * py);
    const ty = py - (sin * px + cos * py) - 6 * l;
    m.lift.style.transform =
      l === 0 && t === 0
        ? ""
        : `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) rotate(${t.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    const shadow = Math.max(0, l) * (m.flipped ? 0 : 1);
    m.shadow.style.opacity = shadow ? `calc(var(--magnet-shadow) * ${shadow.toFixed(3)})` : "";
    m.shadow.style.transform = shadow
      ? `translate3d(${(3 * l).toFixed(2)}px,${(20 * l).toFixed(2)}px,0) scale(${(1 + 0.05 * l).toFixed(4)})`
      : "";
  }

  function tick(_time: number, deltaMs: number) {
    const dt = Math.min(0.05, Math.max(0.001, deltaMs / 1000));
    if (press?.dragging) followPointer(dt);
    let active = !!press;
    const motion = motionAllowed();
    for (const m of magnets) {
      const lt = motion ? liftTarget(m) : 0;
      const tt = tiltTarget(m);
      m.liftSpring.step(dt, lt);
      m.tiltSpring.step(dt, tt);
      const restL = m.liftSpring.settle(0.001);
      const restT = m.tiltSpring.settle(0.01);
      write(m);
      // Fully at rest the pivot no longer matters, so it can reset unseen.
      if (restL && restT && m.liftSpring.value === 0 && m.tiltSpring.value === 0 && !m.dragging) {
        m.pivot.x = 0;
        m.pivot.y = 0;
      }
      if (!restL || !restT || m.gliding || m.flying) active = true;
    }
    if (!active) {
      gsap.ticker.remove(tick);
      ticking = false;
    }
  }

  function ensureTicking() {
    if (ticking) return;
    ticking = true;
    gsap.ticker.add(tick);
  }

  // ---- Feedback: squash, ring, jiggle, tile moves ------------------------

  function squash(m: MagnetState, amount: number) {
    m.squashTween?.kill();
    if (!motionAllowed() || amount <= 0) {
      gsap.set(m.squash, { scaleX: 1, scaleY: 1 });
      return;
    }
    m.squashTween = gsap
      .timeline()
      .to(m.squash, {
        scaleX: 1 + 0.09 * amount,
        scaleY: 1 - 0.12 * amount,
        duration: 0.07,
        ease: "power2.in",
      })
      .to(m.squash, { scaleX: 1, scaleY: 1, duration: 0.55, ease: "elastic.out(1.1, 0.35)" });
  }

  function ring(m: MagnetState, strength: number) {
    if (!motionAllowed()) return;
    gsap.fromTo(
      m.ring,
      { scale: 1, opacity: Math.min(0.9, 0.45 + 0.45 * strength) },
      { scale: 1.45 + 0.45 * strength, opacity: 0, duration: 0.5, ease: "power3.out" },
    );
  }

  function centre(m: MagnetState) {
    return { x: m.home.x + m.x + m.home.w / 2, y: m.home.y + m.y + m.home.h / 2 };
  }

  /** The board shakes: nearby magnets rattle, less the farther they are. */
  function jiggle(source: MagnetState, strength: number, only?: (m: MagnetState) => boolean) {
    if (!motionAllowed()) return;
    const c = centre(source);
    for (const m of magnets) {
      if (m === source || !m.ready || m.dragging || m.gliding || m.flying || m.sliding) continue;
      if (only && !only(m)) continue;
      const other = centre(m);
      const d = Math.hypot(other.x - c.x, other.y - c.y);
      const reach = 420;
      if (d > reach) continue;
      const falloff = Math.pow(1 - d / reach, 1.4);
      const a = 3.4 * strength * falloff * (m.index % 2 ? 1 : -1);
      if (Math.abs(a) < 0.25) continue;
      m.poseTween?.kill();
      m.poseTween = gsap
        .timeline({ delay: d / 2600 })
        .to(m.pose, {
          rotation: m.angle + a,
          y: -1.6 * Math.abs(a),
          duration: 0.08,
          ease: "power2.out",
        })
        .to(m.pose, { rotation: m.angle - a * 0.55, y: 0, duration: 0.13, ease: "sine.inOut" })
        .to(m.pose, { rotation: m.angle + a * 0.22, duration: 0.14, ease: "sine.inOut" })
        .to(m.pose, { rotation: m.angle, duration: 0.24, ease: "sine.out" });
    }
  }

  function tileMove(m: MagnetState) {
    if (!motionAllowed()) return;
    playTileMove(m.motif, m.kind, !m.hovered);
  }

  // ---- Moves, collisions, saving ------------------------------------------

  let moves = 0;
  let firstDragNoted = false;
  let resetShown = false;

  function isMoved(m: MagnetState) {
    return Math.abs(m.x) > 0.5 || Math.abs(m.y) > 0.5;
  }

  function persist() {
    const arrangement: Arrangement = {};
    for (const m of magnets) {
      if (isMoved(m)) {
        arrangement[m.word] = {
          x: Math.round(m.x * 10) / 10,
          y: Math.round(m.y * 10) / 10,
          a: Math.round(m.angle * 100) / 100,
        };
      }
    }
    saveArrangement(arrangement);
    showReset(Object.keys(arrangement).length > 0);
  }

  function showReset(show: boolean) {
    if (show === resetShown) return;
    resetShown = show;
    const d = motionAllowed() ? 1 : 0;
    gsap.killTweensOf(resetButton);
    if (show) {
      gsap.fromTo(
        resetButton,
        { autoAlpha: 0, scale: 0.85, y: 6 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 0.45 * d, ease: "back.out(2.2)" },
      );
    } else {
      if (resetWrap!.contains(document.activeElement))
        magnets[0]?.el.focus({ preventScroll: true });
      gsap.to(resetButton, {
        autoAlpha: 0,
        scale: 0.9,
        y: 4,
        duration: 0.3 * d,
        ease: "power2.in",
      });
    }
  }

  function lower(m: MagnetState, after: number) {
    m.lowerTimer?.kill();
    m.lowerTimer = gsap.delayedCall(after, () => {
      if (!m.dragging && !m.flipped && !m.gliding && !m.flying) m.el.style.zIndex = "";
    });
  }

  function nudge(m: MagnetState, x: number, y: number) {
    m.x = x;
    m.y = y;
    m.moveTween?.kill();
    if (!m.flipped) {
      m.el.style.zIndex = "5";
      lower(m, 0.7);
    }
    if (!motionAllowed()) {
      setOffset(m, x, y);
      return;
    }
    m.moveTween = gsap.to(m.el, { x, y, duration: 0.55, ease: "back.out(1.5)" });
  }

  function collide(m: MagnetState) {
    const pushed = resolveOverlaps(
      magnets.map((other) => ({
        home: other.home,
        offset: { x: other.x, y: other.y },
        locked: other.dragging || other.flying || other.gliding || !other.ready,
      })),
      magnets.indexOf(m),
      bounds,
    );
    for (const [i, offset] of pushed) {
      const other = magnets[i];
      nudge(other, offset.x, offset.y);
      squash(other, 0.35);
    }
    return pushed.size;
  }

  function countMove(kind: "drag" | "key") {
    moves++;
    if (kind === "drag" && !firstDragNoted) {
      firstDragNoted = true;
      labNote({
        id: "magnets-first",
        text: "Good move. We rearrange our process all the time too.",
        shape: "leaf",
        tone: "green",
      });
    }
    if (moves >= 5) {
      labNote({
        id: "magnets-five",
        text: "You just iterated. That is most of the job.",
        shape: "plus",
        tone: "red",
      });
    }
  }

  /** The clack: the magnet meets the board. */
  function land(m: MagnetState, options: LandOptions = {}) {
    const { strength = 1, newAngle = true, countAs = null, quiet = false } = options;
    InertiaPlugin.untrack(m.el);
    m.dragging = false;
    m.gliding = false;
    m.x = Number(gsap.getProperty(m.el, "x")) || 0;
    m.y = Number(gsap.getProperty(m.el, "y")) || 0;
    if (newAngle) m.angle = crookedAngle(m.angle);
    m.poseTween?.kill();
    if (motionAllowed()) {
      m.poseTween = gsap.to(m.pose, {
        rotation: m.angle,
        y: 0,
        duration: 0.7,
        ease: "elastic.out(1, 0.45)",
      });
    } else {
      gsap.set(m.pose, { rotation: m.angle, y: 0 });
    }
    squash(m, strength);
    ring(m, strength);
    jiggle(m, strength);
    ensureTicking();
    lower(m, 0.9);
    if (quiet) return;
    collide(m);
    persist();
    if (countAs) countMove(countAs);
  }

  // ---- Flip ---------------------------------------------------------------

  /** Keeps the (wider) back inside the board near its edges. */
  function placeBack(m: MagnetState) {
    m.back.style.marginLeft = "0px";
    const rect = m.back.getBoundingClientRect();
    const board = section.getBoundingClientRect();
    let shift = 0;
    if (rect.left < board.left + EDGE) shift = board.left + EDGE - rect.left;
    else if (rect.right > board.right - EDGE) shift = board.right - EDGE - rect.right;
    m.back.style.marginLeft = `${shift}px`;
  }

  function setFlipped(m: MagnetState, on: boolean, quick = false) {
    if (!m.ready || m.flipped === on) return;
    m.flipped = on;
    m.flipTween?.kill();
    m.flipBack?.kill();
    m.flipBack = null;
    m.lowerTimer?.kill();
    // The note takes clicks only while it shows (it is wider than the front,
    // and a click on it should turn this magnet back, not grab a neighbour).
    m.back.style.pointerEvents = on ? "auto" : "";
    if (on) {
      placeBack(m);
      m.el.style.zIndex = "40";
      m.flipBack = gsap.delayedCall(FLIP_HOLD, () => setFlipped(m, false));
    }
    m.el.dataset.flipped = on ? "true" : "false";
    ensureTicking();
    if (!motionAllowed()) {
      gsap.set(m.flip, { rotationX: on ? 180 : 0, transformPerspective: 900 });
      if (!on) m.el.style.zIndex = "";
      return;
    }
    m.flipTween = gsap.to(m.flip, {
      rotationX: on ? 180 : 0,
      transformPerspective: 900,
      duration: quick ? 0.35 : 0.85,
      ease: quick ? "power2.out" : "back.out(1.45)",
      onComplete: () => {
        if (!m.flipped) lower(m, 0);
      },
    });
    m.squashTween?.kill();
    m.squashTween = gsap
      .timeline()
      .to(m.squash, {
        scaleX: 1.06,
        scaleY: 1.06,
        duration: quick ? 0.1 : 0.22,
        ease: "power2.out",
      })
      .to(m.squash, { scaleX: 1, scaleY: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" });
  }

  // ---- Pointer: press, hold, drag, throw ---------------------------------

  const rootStyle = document.documentElement.style;

  function setGrabbing(m: MagnetState, on: boolean) {
    m.el.style.cursor = on ? "grabbing" : "";
    rootStyle.cursor = on ? "grabbing" : "";
  }

  function pressSquash(m: MagnetState) {
    if (!motionAllowed()) return;
    m.squashTween?.kill();
    m.squashTween = gsap.to(m.squash, {
      scaleX: 1.05,
      scaleY: 0.92,
      duration: 0.14,
      ease: "power2.out",
    });
  }

  function releaseSquash(m: MagnetState) {
    if (!motionAllowed()) return;
    m.squashTween?.kill();
    m.squashTween = gsap.to(m.squash, {
      scaleX: 1,
      scaleY: 1,
      duration: 0.5,
      ease: "elastic.out(1.1, 0.4)",
    });
  }

  function endPress() {
    if (!press) return;
    window.clearTimeout(press.holdTimer);
    const { m, id } = press;
    if (m.el.hasPointerCapture(id)) m.el.releasePointerCapture(id);
    setGrabbing(m, false);
    press = null;
  }

  function beginDrag() {
    if (!press) return;
    const m = press.m;
    press.dragging = true;
    m.dragging = true;
    m.sliding = false;
    if (m.flipped) setFlipped(m, false, true);
    m.moveTween?.kill();
    m.poseTween?.kill();
    m.lowerTimer?.kill();
    gsap.to(m.pose, { y: 0, duration: 0.2, ease: "power2.out" });
    const rect = section.getBoundingClientRect();
    const x = Number(gsap.getProperty(m.el, "x")) || 0;
    const y = Number(gsap.getProperty(m.el, "y")) || 0;
    press.grabX = press.startX - rect.left - (m.home.x + x);
    press.grabY = press.startY - rect.top - (m.home.y + y);
    m.el.style.zIndex = "30";
    setGrabbing(m, true);
    releaseSquash(m);
    InertiaPlugin.track(m.el, "x,y");
    ensureTicking();
  }

  /** Moves the dragged magnet under the pointer, in the same frame as the scroll. */
  function followPointer(dt: number) {
    if (!press) return;
    const { m } = press;
    const rect = section.getBoundingClientRect();
    const range = offsetRange(m.home, bounds);
    const tx = press.lastX - rect.left - press.grabX - m.home.x;
    const ty = press.lastY - rect.top - press.grabY - m.home.y;
    const x = rubberBand(tx, range.minX, range.maxX);
    const y = rubberBand(ty, range.minY, range.maxY);
    setOffset(m, x, y);
    // Near the top or bottom of the window, a board taller than the window
    // scrolls along, so a magnet can travel the whole board on a phone.
    const top = 64 + 56;
    const bottom = window.innerHeight - 56;
    let speed = 0;
    if (press.lastY < top && rect.top < 64) speed = -Math.min(18, (top - press.lastY) * 0.3);
    else if (press.lastY > bottom && rect.bottom > window.innerHeight) {
      speed = Math.min(18, (press.lastY - bottom) * 0.3);
    }
    if (speed) window.scrollBy(0, speed * dt * 60);
  }

  function endDrag(throwIt: boolean) {
    if (!press) return;
    const m = press.m;
    const startX = m.x;
    const startY = m.y;
    endPress();
    m.dragging = false;
    const range = offsetRange(m.home, bounds);
    const x = Number(gsap.getProperty(m.el, "x")) || 0;
    const y = Number(gsap.getProperty(m.el, "y")) || 0;
    const travelled = Math.hypot(x - startX, y - startY);
    const countAs = travelled > 8 ? ("drag" as const) : null;
    const vx = throwIt ? InertiaPlugin.getVelocity(m.el, "x") : 0;
    const vy = throwIt ? InertiaPlugin.getVelocity(m.el, "y") : 0;
    const speed = Math.hypot(vx, vy);
    const outside = x < range.minX || x > range.maxX || y < range.minY || y > range.maxY;
    if (!motionAllowed()) {
      const inside = clampOffset(m.home, bounds, { x, y });
      setOffset(m, inside.x, inside.y);
      land(m, { countAs });
      return;
    }
    if (speed < 90 && !outside) {
      land(m, { countAs });
      return;
    }
    // Slide on with the throw's momentum, then clack down where it stops.
    const cap = Math.min(1, 3200 / Math.max(1, speed));
    m.gliding = true;
    ensureTicking();
    m.moveTween = gsap.to(m.el, {
      inertia: {
        x: { velocity: vx * cap, min: range.minX, max: range.maxX },
        y: { velocity: vy * cap, min: range.minY, max: range.maxY },
        // The typings' index signature rejects `overshoot`, which the
        // plugin does read.
        duration: { min: 0.2, max: 1.1, overshoot: 0.25 } as gsap.InertiaDuration as number,
        resistance: 1400,
      },
      onComplete: () => land(m, { countAs: countAs ?? "drag" }),
    });
  }

  function onPointerDown(m: MagnetState, event: PointerEvent) {
    lastInput = performance.now();
    if (press || !m.ready || m.flying) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const touch = event.pointerType === "touch";
    press = {
      m,
      id: event.pointerId,
      type: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      held: !touch,
      dragging: false,
      holdTimer: 0,
      grabX: 0,
      grabY: 0,
    };
    const board = section.getBoundingClientRect();
    m.pivot = {
      x:
        event.clientX -
        board.left -
        (m.home.x + (Number(gsap.getProperty(m.el, "x")) || 0)) -
        m.home.w / 2,
      y:
        event.clientY -
        board.top -
        (m.home.y + (Number(gsap.getProperty(m.el, "y")) || 0)) -
        m.home.h / 2,
    };
    try {
      m.el.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that is already gone can't be captured; the press just ends.
    }
    // A magnet caught mid-glide or mid-nudge stops where it is.
    if (m.gliding || m.moveTween?.isActive()) {
      m.moveTween?.kill();
      m.gliding = false;
      InertiaPlugin.untrack(m.el);
      m.x = Number(gsap.getProperty(m.el, "x")) || 0;
      m.y = Number(gsap.getProperty(m.el, "y")) || 0;
    }
    if (touch) {
      // Hold still to pick it up; a swipe before then scrolls the page.
      const current = press;
      current.holdTimer = window.setTimeout(() => {
        if (press !== current) return;
        current.held = true;
        // Before any tap the browser refuses (and reports) a vibration.
        if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(8);
        pressSquash(m);
        ensureTicking();
      }, HOLD_MS);
    } else {
      setGrabbing(m, true);
      pressSquash(m);
    }
  }

  function onPointerMove(m: MagnetState, event: PointerEvent) {
    if (!press || press.m !== m || event.pointerId !== press.id) {
      maybeHover(m, event);
      return;
    }
    lastInput = performance.now();
    press.lastX = event.clientX;
    press.lastY = event.clientY;
    const travelled = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (!press.held) {
      if (travelled > HOLD_SLOP) endPress();
      return;
    }
    if (!press.dragging && travelled > (press.type === "touch" ? 2 : DRAG_SLOP)) beginDrag();
  }

  function onPointerUp(m: MagnetState, event: PointerEvent) {
    if (!press || press.m !== m || event.pointerId !== press.id) return;
    lastInput = performance.now();
    if (press.dragging) {
      endDrag(true);
      return;
    }
    const held = press.held && press.type === "touch";
    endPress();
    if (held) {
      // Picked up and put straight back down.
      land(m, { strength: 0.6, newAngle: false });
      return;
    }
    releaseSquash(m);
    setFlipped(m, !m.flipped);
  }

  function onPointerCancel(m: MagnetState, event: PointerEvent) {
    if (!press || press.m !== m || event.pointerId !== press.id) return;
    if (press.dragging) {
      endDrag(false);
      return;
    }
    endPress();
    releaseSquash(m);
  }

  // ---- Hover and focus -------------------------------------------------------

  const releaseScrollIdle = trackScrollIdle();
  cleanups.push(releaseScrollIdle);

  function maybeHover(m: MagnetState, event: PointerEvent) {
    if (m.hovered || event.pointerType === "touch" || press) return;
    if (!isScrollIdle() || !m.ready) return;
    m.hovered = true;
    ensureTicking();
    if (motionAllowed()) playTileMove(m.motif, m.kind);
  }

  function onPointerEnter(m: MagnetState, event: PointerEvent) {
    maybeHover(m, event);
  }

  function onPointerLeave(m: MagnetState, event: PointerEvent) {
    if (event.pointerType === "touch") return;
    if (!m.hovered) return;
    m.hovered = false;
    ensureTicking();
    if (m.kind === "leaves") setLeavesOpen(m.motif, false);
  }

  // ---- Keyboard ------------------------------------------------------------

  const KEY_STEPS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  function keyMove(m: MagnetState, dx: number, dy: number, repeat: boolean) {
    if (!m.ready || m.dragging || m.flying) return;
    if (m.flipped) setFlipped(m, false, true);
    const base = m.keyTarget ?? { x: m.x, y: m.y };
    const next = clampOffset(m.home, bounds, { x: base.x + dx, y: base.y + dy });
    if (Math.abs(next.x - base.x) < 0.5 && Math.abs(next.y - base.y) < 0.5) {
      // Against the edge: a little bump instead of a move.
      squash(m, 0.4);
      return;
    }
    const now = performance.now();
    const burst = now - m.lastKeyMove < 900;
    m.lastKeyMove = now;
    m.keyTarget = next;
    m.moveTween?.kill();
    m.el.style.zIndex = "30";
    const done = () => {
      m.keyTarget = null;
      land(m, {
        strength: repeat ? 0.35 : 0.7,
        newAngle: false,
        countAs: burst ? null : "key",
      });
    };
    if (!motionAllowed()) {
      setOffset(m, next.x, next.y);
      done();
      return;
    }
    m.moveTween = gsap.to(m.el, {
      x: next.x,
      y: next.y,
      duration: 0.22,
      ease: "power3.out",
      onComplete: done,
    });
  }

  function onKeyDown(m: MagnetState, event: KeyboardEvent) {
    lastInput = performance.now();
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = KEY_STEPS[event.key];
    if (step) {
      event.preventDefault();
      const distance = event.shiftKey ? 64 : 16;
      keyMove(m, step[0] * distance, step[1] * distance, event.repeat);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) setFlipped(m, !m.flipped);
      return;
    }
    if (event.key === "Escape" && m.flipped) {
      event.preventDefault();
      setFlipped(m, false);
    }
  }

  // ---- Put them back -------------------------------------------------------

  function putBack() {
    lastInput = performance.now();
    // A second finger can reach the button while the first holds a magnet.
    if (press) return;
    const moved = magnets.filter((m) => isMoved(m) && m.ready);
    if (!moved.length) return;
    const motion = motionAllowed();
    gsap.fromTo(
      resetButton!.querySelector('[data-part="reset-icon"]'),
      { rotation: 0 },
      { rotation: -360, duration: motion ? 0.8 : 0, ease: "power3.inOut" },
    );
    let pending = moved.length;
    const finish = () => {
      pending--;
      if (pending > 0) return;
      saveArrangement({});
      showReset(false);
      labNote({
        id: "magnets-reset",
        text: "Back to the plan. Until the next idea.",
        shape: "circle",
        tone: "blue",
      });
    };
    moved.forEach((m, order) => {
      if (m.flipped) setFlipped(m, false, true);
      m.moveTween?.kill();
      m.poseTween?.kill();
      m.sliding = false;
      if (!motion) {
        m.x = 0;
        m.y = 0;
        m.angle = m.homeAngle;
        setOffset(m, 0, 0);
        gsap.set(m.pose, { rotation: m.angle, y: 0 });
        finish();
        return;
      }
      const x = Number(gsap.getProperty(m.el, "x")) || 0;
      const y = Number(gsap.getProperty(m.el, "y")) || 0;
      const distance = Math.hypot(x, y) || 1;
      // Curve each flight to one side of the straight line home, alternating.
      const bend = Math.min(180, distance * 0.35) * (order % 2 ? 1 : -1);
      const control = { x: x / 2 + (-y / distance) * bend, y: y / 2 + (x / distance) * bend };
      const delay = order * 0.07;
      const duration = gsap.utils.clamp(0.6, 1, 0.45 + distance / 1600);
      m.flying = true;
      m.el.style.zIndex = "30";
      ensureTicking();
      m.moveTween = gsap.to(m.el, {
        motionPath: { path: [control, { x: 0, y: 0 }], curviness: 1.3 },
        duration,
        delay,
        ease: "power2.inOut",
        onComplete: () => {
          m.flying = false;
          m.angle = m.homeAngle;
          land(m, { strength: 0.75, newAngle: false, quiet: true });
          finish();
        },
      });
      const spin = m.angle > m.homeAngle ? -360 : 360;
      m.poseTween = gsap.to(m.pose, {
        rotation: m.homeAngle + spin,
        y: 0,
        duration,
        delay,
        ease: "power2.inOut",
        onComplete: () => {
          gsap.set(m.pose, { rotation: m.homeAngle });
        },
      });
    });
  }

  // ---- Wiring --------------------------------------------------------------

  let finishEntrance = () => {};

  measure();
  for (const m of magnets) {
    const inside = clampOffset(m.home, bounds, m);
    m.x = inside.x;
    m.y = inside.y;
    setOffset(m, m.x, m.y);
    gsap.set(m.pose, { rotation: m.angle });
    gsap.set(m.flip, { rotationX: 0, transformPerspective: 900 });

    listen(m.el, "pointerdown", (e: PointerEvent) => onPointerDown(m, e));
    listen(m.el, "pointermove", (e: PointerEvent) => onPointerMove(m, e));
    listen(m.el, "pointerup", (e: PointerEvent) => onPointerUp(m, e));
    listen(m.el, "pointercancel", (e: PointerEvent) => onPointerCancel(m, e));
    listen(m.el, "lostpointercapture", (e: PointerEvent) => onPointerCancel(m, e));
    listen(m.el, "pointerenter", (e: PointerEvent) => onPointerEnter(m, e));
    listen(m.el, "pointerleave", (e: PointerEvent) => onPointerLeave(m, e));
    listen(m.el, "keydown", (e: KeyboardEvent) => onKeyDown(m, e));
    listen(m.el, "focus", () => {
      // Tabbing in before the throw: every magnet lands at once, so focus
      // never sits on an invisible magnet that ignores the keys.
      if (!m.ready) finishEntrance();
      m.focused = m.el.matches(":focus-visible");
      ensureTicking();
    });
    listen(m.el, "blur", () => {
      m.focused = false;
      if (m.flipped) setFlipped(m, false);
      ensureTicking();
    });
    // After the hold, the page must not scroll under the finger. This has
    // to be a non-passive listener registered up front: one added
    // mid-gesture is not reliably consulted.
    listen(
      m.el,
      "touchmove",
      (e: TouchEvent) => {
        if (press?.m === m && press.held && e.cancelable) e.preventDefault();
      },
      { passive: false },
    );
    listen(m.el, "contextmenu", (e: MouseEvent) => {
      if (press?.type === "touch") e.preventDefault();
    });
  }
  // Settle anything a saved arrangement left overlapping.
  for (const m of magnets) {
    const pushed = resolveOverlaps(
      magnets.map((other) => ({
        home: other.home,
        offset: { x: other.x, y: other.y },
        locked: false,
      })),
      magnets.indexOf(m),
      bounds,
    );
    for (const [i, offset] of pushed) {
      magnets[i].x = offset.x;
      magnets[i].y = offset.y;
      setOffset(magnets[i], offset.x, offset.y);
    }
  }
  showReset(magnets.some(isMoved));

  // A release the magnet itself never hears (a capture that failed) must
  // still end the press, or no magnet could be picked up again.
  listen(window, "pointerup", (e: PointerEvent) => {
    if (press && e.pointerId === press.id) onPointerUp(press.m, e);
  });
  listen(window, "pointercancel", (e: PointerEvent) => {
    if (press && e.pointerId === press.id) onPointerCancel(press.m, e);
  });

  listen(resetButton, "click", putBack);
  cleanups.push(attachMagnetic(resetWrap, { radius: 60, strength: 0.3, max: 10 }));

  let layoutFrame = 0;
  const resize = new ResizeObserver(() => {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(relayout);
  });
  resize.observe(section);
  resize.observe(rows);
  cleanups.push(() => {
    resize.disconnect();
    cancelAnimationFrame(layoutFrame);
  });

  const board: MagnetBoard = {
    section,
    magnets,
    bounds: () => bounds,
    busy: () => !!press || magnets.some((m) => m.dragging || m.gliding || m.flying),
    lastInput: () => lastInput,
    ensureTicking,
    land,
    squash,
    ring,
    jiggle,
    tileMove,
  };

  const entrance = startMagnetEntrance(board, rows);
  finishEntrance = entrance.finish;
  cleanups.push(entrance.dispose);
  cleanups.push(startMagnetIdle(board));
  // For tests and anything else that needs to know the board is live.
  section.dataset.magnetBoard = "ready";
  cleanups.push(() => {
    section.dataset.magnetBoard = "";
  });

  return () => {
    endPress();
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    if (ticking) gsap.ticker.remove(tick);
    ticking = false;
    rootStyle.cursor = "";
    for (const m of magnets) {
      InertiaPlugin.untrack(m.el);
      m.flipBack?.kill();
      m.lowerTimer?.kill();
      gsap.killTweensOf([m.el, m.pose, m.squash, m.flip, m.ring, m.motif, ...m.motif.children]);
    }
    gsap.killTweensOf(resetButton);
  };
}
