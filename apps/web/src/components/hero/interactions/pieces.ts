import gsap from "gsap";

import { labNote } from "@/lib/lab-notes";
import { randomBetween } from "@/lib/random";

import {
  DT,
  clamp,
  launchSpeed,
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

/**
 * The hero's shapes, each with a personality of its own. The solver writes
 * only the `.hero-piece` wrapper around a shape (the parallax wrapper above
 * it and the shape div below it, with the entrance and the idle loop, keep
 * their own transforms). Parts inside a shape (the toggle's knob, the
 * clover's petals, the domes, the logo's shards) are driven by short GSAP
 * tweens that nothing else touches after the entrance.
 *
 * - Every shape within about 220 px of the cursor leans or slides a few
 *   degrees toward it, as if it noticed.
 * - Square: a squash-and-stretch hop on hover; a press squashes it, and the
 *   release throws it up for a quarter turn that lands with a bounce.
 * - Toggle: the knob leans toward the other end on hover; a click switches
 *   it, and switching it off drains the colour from the shapes for a
 *   moment. It stays decorative: no role, no focus.
 * - Triangle: tips over on hover, rocking on its corners like a block,
 *   and a press flips it over (and back a moment later).
 * - Yellow circle: jelly that wobbles along the cursor's direction.
 * - X: a fidget spinner, turned by the cursor's movement around it.
 * - Red circle: a heartbeat on hover; a press pops it into four.
 * - Clover: the petals open on hover like a flower; a press claps them
 *   shut and whirls it round once (it isn't symmetric under a quarter
 *   turn, so it always lands back on its rest pose).
 * - Star: a pinwheel, blown round by the cursor passing by.
 * - Domes: a mouth that opens on hover and bites on press.
 * - Logo: an exploded view on hover; a press snaps it back together with
 *   the entrance's little pop.
 */

export type PieceName =
  | "square"
  | "toggle"
  | "triangle"
  | "circle-yellow"
  | "x"
  | "circle-red"
  | "leaves"
  | "fans"
  | "domes"
  | "logo";

// Slide toward targets (gaze, doze).
const KP: SpringConfig = [110, 13];
// Rotation: gaze leans, a little bouncy.
const KR: SpringConfig = [150, 11];
// The square's thrown quarter turn: firm, so it lands instead of wobbling.
const KR_THROWN: SpringConfig = [260, 21];
// Squash and stretch.
const KS: SpringConfig = [360, 11];
// Uniform scale pulses (heartbeat, pops).
const KK: SpringConfig = [320, 10];
// The triangle's flip.
const KY: SpringConfig = [120, 12];
// The yellow circle's jelly: very lightly damped.
const KJ: SpringConfig = [230, 5];

/** Hop gravity, px/s^2. */
const GRAVITY = 2600;
/** Proximity reach, px from a shape's edge. */
const GAZE_REACH = 220;
/** The triangle rocking back onto its base: angular acceleration, deg/s^2. */
const TIP_ACCEL = 1500;
/** Spinner friction time constants, s (a pinwheel coasts longer). */
const SPIN_TAU = { x: 1.4, fans: 1.7 } as const;
/** The fastest a press or the cursor can spin them, deg/s. */
const SPIN_MAX = 1600;

type Piece = {
  name: PieceName;
  el: HTMLElement;
  parallax: HTMLElement | null;
  /** Rest box in hero-local px, without the parallax. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** The parallax offset this frame. */
  ox: number;
  oy: number;
  x: Spring;
  y: Spring;
  r: Spring;
  s: Spring;
  k: Spring;
  ry: Spring;
  jelly: Spring;
  /** Personality targets (quarter turns, flips, a held squash). */
  baseR: number;
  baseRy: number;
  baseS: number;
  baseJelly: number;
  jellyAngle: number;
  /** Hop height (px, negative is up) and speed. */
  hy: number;
  hvy: number;
  /** Rocking on a corner: angle (deg) and angular speed. */
  tip: number;
  tipV: number;
  /** Free spin: angle and angular speed (deg, deg/s). */
  spin: number;
  omega: number;
  lastAngle: number | null;
  /** Scheduled hops and pulses, ticker seconds. */
  hopAt: number;
  hopHeight: number;
  pulseAt: number;
  pulse: number;
  nextBeat: number;
  hovered: boolean;
  pressed: boolean;
  cooldown: number;
  dozeTilt: number;
  live: boolean;
  wasLive: boolean;
  put: Record<"x" | "y" | "r" | "sx" | "sy" | "ry", Setter>;
};

export type PiecesSystem = StageSystem & {
  /** Handles a press on a shape; returns whether it was one. */
  press(target: Element, x: number, touch: boolean): boolean;
  release(): void;
  setDoze(amount: number): void;
  startle(): void;
};

const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

export function createPieces(stage: Stage): PiecesSystem {
  const { root, pointer } = stage;
  const els = Array.from(root.querySelectorAll<HTMLElement>(".hero-piece[data-piece]"));
  const pieces: Piece[] = els.map((el, i) => ({
    name: el.dataset.piece as PieceName,
    el,
    parallax: el.closest<HTMLElement>(".parallax-el"),
    x0: 0,
    y0: 0,
    w: 0,
    h: 0,
    cx: 0,
    cy: 0,
    ox: 0,
    oy: 0,
    x: spring(),
    y: spring(),
    r: spring(),
    s: spring(),
    k: spring(),
    ry: spring(),
    jelly: spring(),
    baseR: 0,
    baseRy: 0,
    baseS: 0,
    baseJelly: 0,
    jellyAngle: 0,
    hy: 0,
    hvy: 0,
    tip: 0,
    tipV: 0,
    spin: 0,
    omega: 0,
    lastAngle: null,
    hopAt: 0,
    hopHeight: 0,
    pulseAt: 0,
    pulse: 0,
    nextBeat: 0,
    hovered: false,
    pressed: false,
    cooldown: 0,
    dozeTilt: i % 2 ? 2.4 : -2.2,
    live: false,
    wasLive: false,
    put: {
      x: setter(el, "x", "px"),
      y: setter(el, "y", "px"),
      r: setter(el, "rotation", "deg"),
      sx: setter(el, "scaleX"),
      sy: setter(el, "scaleY"),
      ry: setter(el, "rotationY", "deg"),
    },
  }));
  const byName = new Map(pieces.map((p) => [p.name, p]));
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  const qa = <T extends Element>(selector: string) =>
    Array.from(root.querySelectorAll<T>(selector));

  gsap.set(els, { transformOrigin: "50% 50%" });
  const triangle = byName.get("triangle");
  if (triangle) gsap.set(triangle.el, { transformPerspective: 600 });
  if (stage.fine) for (const el of els) el.style.cursor = "pointer";

  // ---- the parts that personalities move ----
  const knob = q<SVGCircleElement>(".shape-toggle [data-part='knob']");
  const track = q<SVGRectElement>(".shape-toggle [data-part='track']");
  const petals = qa<SVGPathElement>(".leaves-motif [data-part^='leaf-']");
  const domeTop = q<SVGPathElement>(".domes-motif [data-part='dome-top']");
  const domeBottom = q<SVGPathElement>(".domes-motif [data-part='dome-bottom']");
  const shards = [1, 2, 3].map((n) =>
    q<SVGPathElement>(`.hero-logo [data-part='shard-${n}'] path`),
  );
  const redCircle = q<SVGSVGElement>(".shape-circle-red svg");
  const redBits = qa<HTMLElement>(".hero-red-bits > span");
  const partEls = [
    knob,
    track,
    ...petals,
    domeTop,
    domeBottom,
    ...shards,
    redCircle,
    ...redBits,
  ].filter((el): el is NonNullable<typeof el> => !!el);

  // Each part turns about a fixed point of its shape, set once while it is
  // at rest. Passing an svgOrigin on every tween re-derives it from the
  // part's current transform, and GSAP's compensation for that drifts.
  gsap.set(petals, { svgOrigin: "50 50" });
  if (domeTop) gsap.set(domeTop, { svgOrigin: "0 0" });
  if (domeBottom) gsap.set(domeBottom, { svgOrigin: "0 100" });
  ["391 289", "253 490", "521 490"].forEach((origin, i) => {
    if (shards[i]) gsap.set(shards[i], { svgOrigin: origin });
  });

  let doze = 0;
  let toggleOn = true;
  let pressedPiece: Piece | null = null;
  let flipBack: gsap.core.Tween | null = null;
  let popping: gsap.core.Timeline | null = null;
  let biting: gsap.core.Timeline | null = null;
  let whirl: gsap.core.Tween | null = null;
  let desaturate: gsap.core.Timeline | null = null;
  const now = () => stage.now();

  function measure() {
    for (const p of pieces) {
      const { x, y } = offsetIn(p.el, root);
      p.x0 = x;
      p.y0 = y;
      p.w = p.el.offsetWidth;
      p.h = p.el.offsetHeight;
      p.cx = x + p.w / 2;
      p.cy = y + p.h / 2;
    }
  }

  const hop = (p: Piece, height: number) => {
    p.hvy = Math.min(p.hvy, -launchSpeed(height, GRAVITY));
  };

  // ---- personalities: hover ----
  function toggleNudge() {
    if (!knob) return;
    const hovered = byName.get("toggle")?.hovered ?? false;
    // Toward the other end: left when on (the knob sits right), and back.
    gsap.to(knob, {
      x: hovered ? (toggleOn ? -26 : 26) : 0,
      duration: hovered ? 0.5 : 0.7,
      ease: "elastic.out(1, 0.5)",
      overwrite: "auto",
    });
  }

  function bloom(open: boolean) {
    const dirs = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    petals.forEach((petal, i) => {
      gsap.to(petal, {
        x: open ? dirs[i][0] * 7 : 0,
        y: open ? dirs[i][1] * 7 : 0,
        rotation: open ? 18 : 0,
        scale: open ? 0.94 : 1,
        duration: open ? 0.55 : 0.8,
        ease: open ? "back.out(2.4)" : "elastic.out(1, 0.45)",
        delay: open ? i * 0.03 : 0,
        // Kill every earlier tween on the petal at once, including a
        // delayed open that hasn't started yet ("auto" would let it win).
        overwrite: true,
      });
    });
  }

  function mouth(open: boolean) {
    if (!domeTop || !domeBottom || biting?.isActive()) return;
    gsap.to(domeTop, {
      y: open ? -13 : 0,
      rotation: open ? -9 : 0,
      duration: open ? 0.4 : 0.32,
      ease: open ? "back.out(2)" : "back.out(3)",
      overwrite: true,
    });
    gsap.to(domeBottom, {
      y: open ? 9 : 0,
      rotation: open ? 5 : 0,
      duration: open ? 0.4 : 0.32,
      ease: open ? "back.out(2)" : "back.out(3)",
      overwrite: true,
    });
  }

  // Each shard slides out from the mark's centre, in user units (the mark
  // is 660 units across, so 40 is about 6 px at the hero's size).
  const SHARD_OUT = [
    { x: 0, y: -44, rotation: -5 },
    { x: -38, y: 30, rotation: -7 },
    { x: 38, y: 30, rotation: 7 },
  ];
  function explode(open: boolean, fast = false) {
    shards.forEach((shard, i) => {
      if (!shard) return;
      const out = SHARD_OUT[i];
      gsap.to(shard, {
        x: open ? out.x : 0,
        y: open ? out.y : 0,
        rotation: open ? out.rotation : 0,
        duration: fast ? 0.12 : open ? 0.5 : 0.7,
        ease: fast ? "power3.in" : open ? "back.out(2.2)" : "elastic.out(1, 0.5)",
        delay: open && !fast ? i * 0.04 : 0,
        overwrite: true,
      });
    });
  }

  function enter(p: Piece) {
    const t = now();
    switch (p.name) {
      case "square":
        if (p.hy === 0 && t > p.cooldown) {
          p.cooldown = t + 0.7;
          // Crouch, then spring up.
          p.s.v -= 2.4;
          p.hopAt = t + 0.07;
          p.hopHeight = 22;
        }
        break;
      case "toggle":
        toggleNudge();
        break;
      case "triangle":
        if (p.tip === 0 && t > p.cooldown) {
          p.cooldown = t + 0.5;
          // Tipped away from the side the cursor came in from.
          const dir = pointer.x - p.ox < p.cx ? 1 : -1;
          p.tipV = dir * 250;
        }
        break;
      case "circle-yellow":
        wobble(p, 1.6);
        break;
      case "circle-red":
        p.nextBeat = t;
        break;
      case "leaves":
        bloom(true);
        break;
      case "domes":
        mouth(true);
        break;
      case "logo":
        explode(true);
        break;
      default:
        break;
    }
  }

  function leave(p: Piece) {
    switch (p.name) {
      case "toggle":
        toggleNudge();
        break;
      case "leaves":
        bloom(false);
        break;
      case "domes":
        mouth(false);
        break;
      case "logo":
        explode(false);
        break;
      default:
        break;
    }
  }

  /** A jelly impulse along the cursor's direction of travel. */
  function wobble(p: Piece, strength: number) {
    const angle = (Math.atan2(pointer.vy, pointer.vx) * 180) / Math.PI;
    if (pointer.speed > 30) {
      // An ellipse looks the same turned half a turn, so aim the shortest
      // way; retarget freely while the jelly is nearly round.
      const delta = wrap180(angle - p.jellyAngle);
      const aim = Math.abs(delta) > 90 ? delta - Math.sign(delta) * 180 : delta;
      p.jellyAngle += Math.abs(p.jelly.x) < 0.03 ? aim : aim * 0.2;
    }
    p.jelly.v += strength * clamp(0.4, 1.4, pointer.speed / 900);
  }

  // ---- personalities: press ----
  function toggleSwitch(p: Piece) {
    if (!knob || !track) return;
    toggleOn = !toggleOn;
    const cx = toggleOn ? 175 : 45;
    p.s.v -= 2.2;
    const tl = gsap.timeline();
    tl.to(knob, { x: 0, duration: 0.18, ease: "power2.out", overwrite: "auto" }, 0)
      .to(knob, { attr: { cx }, duration: 0.3, ease: "power3.inOut" }, 0)
      .to(track, { attr: { fill: toggleOn ? "#f94141" : "#9aa3ad" }, duration: 0.3 }, 0)
      // The click: the knob lands against the end cap and squashes.
      .fromTo(
        knob,
        // The knob's centre moves between the ends, so its origin moves too;
        // without smoothOrigin GSAP never adds offsets that outlive the squash.
        { scaleX: 0.78, scaleY: 1.16, svgOrigin: `${cx} 45`, smoothOrigin: false },
        {
          scaleX: 1,
          scaleY: 1,
          duration: 0.55,
          ease: "elastic.out(1, 0.4)",
          immediateRender: false,
        },
        0.28,
      )
      .call(() => toggleNudge(), [], 0.5);
    if (toggleOn) {
      // Lights back on: every shape pops once.
      pieces.forEach((other, i) => {
        if (other !== p) {
          other.pulseAt = now() + 0.25 + i * 0.03;
          other.pulse = 1.8;
        }
      });
    } else {
      drain();
      labNote({
        id: "hero-toggle",
        text: "You found the switch. Everything here is a little bit playable.",
        shape: "circle",
        tone: "red",
      });
    }
    stage.wake();
  }

  /** The colour drains from every shape for a moment, then comes back. */
  function drain() {
    desaturate?.kill();
    const targets = qa<HTMLElement>(".hero-piece, .hero-motif, .corner-pattern");
    desaturate = gsap
      .timeline({ onComplete: () => gsap.set(targets, { clearProps: "filter" }) })
      .to(targets, { filter: "saturate(0.06)", duration: 0.45, ease: "power2.out" })
      .to(targets, { filter: "saturate(1)", duration: 1.6, ease: "power2.inOut" }, "+=1.2");
  }

  function popRed(p: Piece) {
    if (!redCircle || redBits.length !== 4 || popping?.isActive()) return;
    const reach = p.w * 0.62;
    const dirs = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    const release = stage.hold();
    popping = gsap
      .timeline({ onComplete: release, onInterrupt: release })
      .to(redCircle, {
        scale: 0.3,
        opacity: 0,
        transformOrigin: "50% 50%",
        duration: 0.1,
        ease: "power2.in",
      })
      .fromTo(
        redBits,
        { x: 0, y: 0, scale: 0.5, opacity: 1, rotation: 0 },
        {
          x: (i: number) => dirs[i][0] * reach * randomBetween(0.85, 1.1),
          y: (i: number) => dirs[i][1] * reach * randomBetween(0.85, 1.1),
          scale: 1,
          rotation: (i: number) => dirs[i][0] * 90,
          duration: 0.42,
          ease: "power3.out",
        },
        0.04,
      )
      // A breath apart, then they fall back in and merge.
      .to(redBits, { x: 0, y: 0, scale: 0.7, duration: 0.3, ease: "back.in(1.8)" }, 0.78)
      .set(redBits, { opacity: 0, x: 0, y: 0, rotation: 0, scale: 1 }, 1.08)
      .fromTo(
        redCircle,
        { scale: 0.6, opacity: 1 },
        { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.4)" },
        1.06,
      );
  }

  function bite(p: Piece) {
    if (!domeTop || !domeBottom) return;
    biting?.kill();
    p.s.v -= 2.6;
    const top = { overwrite: "auto" as const };
    const bottom = { overwrite: "auto" as const };
    // Open wide, snap shut past closed (the chomp), once more, then settle
    // back open if the cursor is still there.
    biting = gsap
      .timeline({ onComplete: () => mouth(p.hovered) })
      .to(domeTop, { ...top, y: -18, rotation: -12, duration: 0.1, ease: "power2.out" }, 0)
      .to(domeBottom, { ...bottom, y: 13, rotation: 7, duration: 0.1, ease: "power2.out" }, 0)
      .to(domeTop, { ...top, y: 4, rotation: 0, duration: 0.07, ease: "power4.in" }, 0.1)
      .to(domeBottom, { ...bottom, y: -4, rotation: 0, duration: 0.07, ease: "power4.in" }, 0.1)
      .to(domeTop, { ...top, y: -9, rotation: -6, duration: 0.1, ease: "power2.out" }, 0.22)
      .to(domeBottom, { ...bottom, y: 6, rotation: 3, duration: 0.1, ease: "power2.out" }, 0.22)
      .to(domeTop, { ...top, y: 3, rotation: 0, duration: 0.07, ease: "power4.in" }, 0.32)
      .to(domeBottom, { ...bottom, y: -3, rotation: 0, duration: 0.07, ease: "power4.in" }, 0.32)
      .to([domeTop, domeBottom], { y: 0, duration: 0.25, ease: "back.out(3)" }, 0.39);
    gsap.delayedCall(0.1, () => {
      p.s.v -= 1.6;
      stage.wake();
    });
  }

  function pressPiece(p: Piece, x: number, touch: boolean) {
    const t = now();
    p.pressed = true;
    pressedPiece = p;
    // Where on the shape: -1 (left or top) to 1 (right or bottom).
    const side = clamp(-1, 1, (x - p.ox - p.cx) / (p.w / 2 || 1));
    switch (p.name) {
      case "square":
        p.baseS = -0.14;
        break;
      case "toggle":
        p.s.v -= 1.6;
        break;
      case "triangle":
        p.s.v -= 1.4;
        break;
      case "circle-yellow":
        p.jellyAngle = 90;
        p.baseJelly = -0.16;
        break;
      case "x":
        p.omega = clamp(-SPIN_MAX, SPIN_MAX, p.omega + (side >= 0 ? 1 : -1) * 1000);
        p.s.v -= 1.2;
        break;
      case "circle-red":
        popRed(p);
        break;
      case "leaves":
        bloom(false);
        p.s.v -= 1.4;
        if (!whirl?.isActive()) {
          const release = stage.hold();
          whirl = gsap.to(p, {
            spin: p.spin + 360,
            duration: 1,
            ease: "back.out(1.3)",
            onComplete: () => {
              // A whole turn is the rest pose.
              p.spin = 0;
              release();
              stage.wake();
            },
            onInterrupt: release,
          });
        }
        break;
      case "fans":
        p.omega = clamp(-SPIN_MAX, SPIN_MAX, p.omega + (side >= 0 ? 1 : -1) * 1300);
        break;
      case "domes":
        bite(p);
        break;
      case "logo":
        if (touch) {
          // No hover on touch: open up first, then snap together.
          explode(true);
          gsap.delayedCall(0.32, () => {
            explode(false, true);
            p.k.v += 2.2;
            stage.wake();
          });
        } else {
          explode(false, true);
          gsap.delayedCall(0.1, () => {
            p.k.v += 2.2;
            stage.wake();
          });
        }
        break;
      default:
        break;
    }
    p.cooldown = Math.max(p.cooldown, t + 0.3);
    stage.wake();
  }

  function releasePiece(p: Piece) {
    p.pressed = false;
    switch (p.name) {
      case "square":
        // Thrown up for a quarter turn, landing with a bounce.
        p.baseS = 0;
        p.s.v += 2.6;
        hop(p, 34);
        p.baseR += 90;
        break;
      case "toggle":
        toggleSwitch(p);
        break;
      case "triangle":
        flipBack?.kill();
        p.baseRy += 180;
        if (p.baseRy % 360 !== 0) {
          // Back over on its own after a moment, finishing the full turn.
          flipBack = gsap.delayedCall(2.6, () => {
            p.baseRy += 180;
            stage.wake();
          });
        }
        break;
      case "circle-yellow":
        p.baseJelly = 0;
        p.jelly.v += 2.4;
        break;
      case "leaves":
        if (p.hovered) gsap.delayedCall(0.28, () => p.hovered && bloom(true));
        else gsap.delayedCall(0.28, () => bloom(true));
        if (!p.hovered) gsap.delayedCall(1, () => !p.hovered && bloom(false));
        break;
      case "logo":
        if (p.hovered) gsap.delayedCall(0.55, () => p.hovered && explode(true));
        break;
      default:
        break;
    }
    stage.wake();
  }

  // ---- per frame: hover and the input-driven reactions ----
  function frame() {
    const t = now();
    for (const p of pieces) {
      p.ox = p.parallax ? Number(gsap.getProperty(p.parallax, "x")) || 0 : 0;
      p.oy = p.parallax ? Number(gsap.getProperty(p.parallax, "y")) || 0 : 0;
      const px = pointer.x - p.ox;
      const py = pointer.y - p.oy;
      const round = p.name === "circle-yellow" || p.name === "circle-red";
      const inside =
        pointer.over &&
        (round
          ? Math.hypot(px - p.cx, py - p.cy) < p.w / 2 + 2
          : px > p.x0 - 2 && px < p.x0 + p.w + 2 && py > p.y0 - 2 && py < p.y0 + p.h + 2);
      if (inside && !p.hovered && stage.hoverAllowed()) {
        p.hovered = true;
        enter(p);
      } else if (!inside && p.hovered) {
        p.hovered = false;
        leave(p);
      }

      if (p.hopAt && t >= p.hopAt) {
        hop(p, p.hopHeight);
        p.s.v += 2.2;
        p.hopAt = 0;
      }
      if (p.pulseAt && t >= p.pulseAt) {
        p.k.v += p.pulse;
        p.pulseAt = 0;
      }

      if (!pointer.over || !pointer.moved) {
        if (p.name === "x") p.lastAngle = null;
        continue;
      }
      const dx = px - p.cx;
      const dy = py - p.cy;
      const distance = Math.hypot(dx, dy);
      if (p.name === "x") {
        // Turned by the cursor's movement around it, like a fidget spinner.
        const reach = p.w / 2 + 40;
        if (distance < reach) {
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          if (p.lastAngle !== null && distance > 4) {
            const rate = wrap180(angle - p.lastAngle) / pointer.dt;
            const grip = 0.28 * (1 - distance / reach);
            p.omega = clamp(-SPIN_MAX, SPIN_MAX, p.omega + (rate - p.omega) * grip);
          }
          p.lastAngle = angle;
        } else {
          p.lastAngle = null;
        }
      } else if (p.name === "fans") {
        // Blown round by the cursor passing by: the tangential part of its
        // velocity, stronger closer in.
        const reach = 170;
        if (distance < reach && distance > 1) {
          const tangential = (dx * pointer.vy - dy * pointer.vx) / Math.max(distance, 24);
          const f = 1 - distance / reach;
          p.omega = clamp(-SPIN_MAX, SPIN_MAX, p.omega + tangential * 7 * f * pointer.dt);
        }
      } else if (p.name === "circle-yellow") {
        if (distance < p.w / 2 + 24 && pointer.speed > 140) wobble(p, 0.08);
      }
    }
    // The red circle's heartbeat while it's hovered: lub, dub, rest.
    const red = byName.get("circle-red");
    if (red?.hovered && !popping?.isActive() && t >= red.nextBeat) {
      red.k.v += 2.6;
      red.pulseAt = t + 0.17;
      red.pulse = 1.7;
      red.nextBeat = t + 1.05;
      stage.wake();
    }
  }

  // ---- the solver ----
  function stepPiece(p: Piece) {
    let tx = 0;
    let ty = 0;
    let tr = p.baseR;
    const leans = p.name !== "x" && p.name !== "fans" && !p.name.startsWith("circle");
    if (pointer.over) {
      const px = pointer.x - p.ox;
      const py = pointer.y - p.oy;
      const dx = px - p.cx;
      const dy = py - p.cy;
      const ex = Math.max(0, Math.abs(dx) - p.w / 2);
      const ey = Math.max(0, Math.abs(dy) - p.h / 2);
      const f = smoothstep(1 - Math.hypot(ex, ey) / GAZE_REACH);
      if (f > 0) {
        tx = clamp(-1, 1, dx / GAZE_REACH) * 6 * f;
        ty = clamp(-1, 1, dy / GAZE_REACH) * 4 * f;
        // Lean the top toward the cursor.
        if (leans) tr += clamp(-1, 1, dx / 180) * 6 * f;
      }
    }
    if (doze > 0) {
      ty += 3 * doze;
      if (leans) tr += p.dozeTilt * doze;
    }

    step(p.x, KP, tx);
    step(p.y, KP, ty);
    step(p.r, p.name === "square" ? KR_THROWN : KR, tr);
    step(p.s, KS, p.baseS);
    step(p.k, KK, 0);
    step(p.ry, KY, p.baseRy);
    step(p.jelly, KJ, p.baseJelly);

    // Hops, landing with a squash.
    if (p.hy < 0 || p.hvy !== 0) {
      p.hvy += GRAVITY * DT;
      p.hy += p.hvy * DT;
      if (p.hy > 0) {
        const impact = p.hvy;
        p.hy = 0;
        if (impact > 90) {
          p.hvy = -impact * 0.26;
          p.s.v -= impact * 0.0055;
        } else {
          p.hvy = 0;
        }
      }
    }

    // Rocking on a corner: pulled back onto its base, losing most of its
    // speed each time the base lands flat, so it rocks a little and stops.
    if (p.tip !== 0 || p.tipV !== 0) {
      const side = Math.sign(p.tip) || Math.sign(p.tipV);
      p.tipV += -side * TIP_ACCEL * DT;
      const next = p.tip + p.tipV * DT;
      if (Math.sign(next) !== side && Math.sign(p.tip) === side) {
        const impact = Math.abs(p.tipV);
        p.s.v -= impact * 0.004;
        if (impact < 60) {
          p.tip = 0;
          p.tipV = 0;
        } else {
          p.tip = next;
          p.tipV *= 0.34;
        }
      } else {
        p.tip = next;
      }
    }

    // Spinners coast on friction and click into the nearest quarter turn.
    if (p.name === "x" || p.name === "fans") {
      p.omega *= Math.exp(-DT / SPIN_TAU[p.name]);
      const detent = Math.round(p.spin / 90) * 90;
      if (Math.abs(p.omega) < 140) p.omega += ((detent - p.spin) * 55 - p.omega * 7) * DT;
      p.spin += p.omega * DT;
      if (Math.abs(p.omega) < 0.5 && Math.abs(p.spin - detent) < 0.05) {
        p.spin = ((detent % 360) + 360) % 360;
        p.omega = 0;
      }
    }

    const spinCalm = p.omega === 0 && Math.abs(p.spin % 90) < 1e-6;
    const calm =
      p.hvy === 0 &&
      p.hy === 0 &&
      p.tip === 0 &&
      p.tipV === 0 &&
      spinCalm &&
      !p.hopAt &&
      !p.pulseAt &&
      settled(p.x, tx, 0.02, 0.1) &&
      settled(p.y, ty, 0.02, 0.1) &&
      settled(p.r, tr, 0.02, 0.1) &&
      settled(p.s, p.baseS, 0.0005, 0.003) &&
      settled(p.k, 0, 0.0005, 0.003) &&
      settled(p.ry, p.baseRy, 0.05, 0.2) &&
      settled(p.jelly, p.baseJelly, 0.0005, 0.003);
    if (calm) {
      p.x.x = tx;
      p.y.x = ty;
      p.r.x = tr;
      p.s.x = p.baseS;
      p.k.x = 0;
      p.ry.x = p.baseRy;
      p.jelly.x = p.baseJelly;
      p.x.v = p.y.v = p.r.v = p.s.v = p.k.v = p.ry.v = p.jelly.v = 0;
      // The square looks the same after any quarter turn: fold its turns
      // back to zero at rest, so the numbers stay small.
      if (p.baseR !== 0 && p.baseR % 90 === 0) {
        p.r.x -= p.baseR;
        p.baseR = 0;
      }
      // Round again: the jelly's axis no longer matters.
      if (p.name === "circle-yellow" && p.baseJelly === 0) p.jellyAngle = 0;
      if (p.baseRy !== 0 && p.baseRy % 360 === 0) {
        p.baseRy = 0;
        p.ry.x = 0;
      }
    }
    p.live = !calm;
    return calm && !p.pressed;
  }

  function write() {
    for (const p of pieces) {
      if (!p.live && !p.wasLive) continue;
      p.wasLive = p.live;
      const stretch = Math.min(Math.abs(p.hvy) * 0.00032, 0.12);
      const sy = clamp(0.7, 1.35, 1 + p.s.x + (p.hy < 0 ? stretch : 0));
      let sx = 1 + (1 / sy - 1) * 0.85;
      let syOut = sy;
      let rotation = p.r.x + p.spin;
      if (p.name === "circle-yellow") {
        // Stretched along the jelly's axis: a circle turned any amount is
        // still a circle, so the rotation only aims the stretch.
        sx *= 1 + p.jelly.x;
        syOut *= 1 - p.jelly.x * 0.9;
        rotation += p.jellyAngle;
      }
      const scale = 1 + p.k.x;
      // Rotation about a bottom corner (the rocking triangle): turn about
      // the centre, then move the centre so the corner stays put.
      let dx = 0;
      let dy = 0;
      if (p.tip !== 0) {
        const cornerX = (p.tip > 0 ? 0.48 : -0.48) * p.w;
        const cornerY = 0.48 * p.h;
        const a = (p.tip * Math.PI) / 180;
        dx = cornerX - (cornerX * Math.cos(a) - cornerY * Math.sin(a));
        dy = cornerY - (cornerX * Math.sin(a) + cornerY * Math.cos(a));
        rotation += p.tip;
      }
      // A squash on the ground keeps the bottom edge planted.
      const plant = p.hy === 0 && (p.name === "square" || p.name === "triangle");
      const planted = plant ? -(syOut * scale - 1) * (p.h / 2) : 0;
      p.put.x(p.x.x + dx);
      p.put.y(p.y.x + p.hy + dy + planted);
      p.put.r(rotation);
      p.put.sx(sx * scale);
      p.put.sy(syOut * scale);
      p.put.ry(p.ry.x);
    }
  }

  function rest(p: Piece) {
    p.x = spring();
    p.y = spring();
    p.r = spring();
    p.s = spring();
    p.k = spring();
    p.ry = spring();
    p.jelly = spring();
    p.baseR = 0;
    p.baseRy = 0;
    p.baseS = 0;
    p.baseJelly = 0;
    p.hy = 0;
    p.hvy = 0;
    p.tip = 0;
    p.tipV = 0;
    p.spin = 0;
    p.omega = 0;
    p.lastAngle = null;
    p.hopAt = 0;
    p.pulseAt = 0;
    p.hovered = false;
    p.pressed = false;
    p.live = false;
    p.wasLive = false;
  }

  function park() {
    flipBack?.kill();
    whirl?.kill();
    popping?.progress(1);
    biting?.progress(1);
    pressedPiece = null;
    for (const p of pieces) rest(p);
    gsap.set(els, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, rotationY: 0 });
    bloom(false);
    mouth(false);
    explode(false);
    if (knob) gsap.to(knob, { x: 0, duration: 0.2, overwrite: "auto" });
  }

  return {
    measure,
    frame,
    step() {
      let calm = true;
      for (const p of pieces) if (!stepPiece(p)) calm = false;
      return calm;
    },
    write,
    park,
    press(target, x, touch) {
      const el = target.closest<HTMLElement>(".hero-piece");
      const p = pieces.find((piece) => piece.el === el);
      if (!p) return false;
      pressPiece(p, x, touch);
      return true;
    },
    release() {
      const p = pressedPiece;
      pressedPiece = null;
      if (p) releasePiece(p);
    },
    setDoze(amount) {
      doze = amount;
      stage.wake();
    },
    startle() {
      const t = now();
      pieces.forEach((p) => {
        p.hopAt = t + randomBetween(0, 0.14);
        p.hopHeight = randomBetween(7, 15);
      });
      stage.wake();
    },
    destroy() {
      park();
      desaturate?.kill();
      popping?.kill();
      biting?.kill();
      whirl?.kill();
      gsap.killTweensOf(partEls);
      gsap.set(partEls, { clearProps: "transform,opacity" });
      if (knob) knob.setAttribute("cx", "175");
      if (track) track.setAttribute("fill", "#f94141");
      gsap.set(qa(".hero-piece, .hero-motif, .corner-pattern"), { clearProps: "filter" });
      gsap.set(els, { clearProps: "transform,transformPerspective" });
      for (const el of els) el.style.cursor = "";
    },
  };
}
