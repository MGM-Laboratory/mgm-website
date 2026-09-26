import Matter from "matter-js";
import gsap from "gsap";

import { labNote } from "@/lib/lab-notes";
import { onIdle } from "@/lib/motion/idle";
import { onPointer } from "@/lib/motion/pointer";
import { randomBetween, randomPick } from "@/lib/random";

import * as fx from "./toybox-flourish";
import { requestMotionAccess, watchMotion } from "./toybox-sensors";
import { DROPS, TOYS, type Toy, type ToyId, type ToyLayout, type ToyPart } from "./toybox-shapes";

/**
 * The toy box's physics, loaded on demand (compact-hero.tsx imports this
 * module, and matter-js with it, only after the first paint).
 *
 * Every shape is a matter-js body; the words' letters are static colliders
 * cut to their inked outline, so shapes sit on the type like objects on
 * shelves. The world is in the box's own CSS pixels. Each frame writes two
 * transforms per moving shape (its translate and its rotation); every other
 * motion (squash, lift, the shapes' personalities, the letters) is GSAP on
 * elements the physics never touches.
 */

const { Bodies, Body, Composite, Constraint, Engine, Events, Query, Sleeping, Vertices } = Matter;

const STEP = 1000 / 60;
const MAX_STEPS_PER_FRAME = 4;
// How much of the free space above the floor the shapes may fill.
const FILL = 0.4;
const MAX_SPEED = 38; // px per step, so a hard throw can't tunnel through a letter
const FLING_SPEED = 850; // px/s at release that counts as a throw
const HOLD_MS = 170;
const TAP_MS = 320;

export type ToyNodes = {
  outer: HTMLElement;
  lift: HTMLElement;
  squash: HTMLElement;
  rot: HTMLElement;
  art: HTMLElement;
  hit: HTMLElement;
};

export type ToyboxOptions = {
  box: HTMLElement;
  words: HTMLElement;
  layer: HTMLElement;
  /** The four words, in reading order. */
  wordEls: HTMLElement[];
  /** Each word's letters (SplitText chars). */
  chars: HTMLElement[][];
  nodes: Record<ToyId, ToyNodes>;
  /**
   * "full": the fresh visit's entrance (the words play, the shapes drop in).
   * "drop": the shapes alone drop in, quicker (a return where the physics
   * arrived after the page was already on screen). "settled": start from the
   * pile at rest (a return, or a visit that starts scrolled down).
   */
  entrance: "full" | "drop" | "settled";
  /** The entrance's cue for the call to action (the logo has landed). */
  onReveal: () => void;
};

export type Toybox = {
  shake: () => void;
  destroy: () => void;
};

type Live = {
  toy: Toy;
  nodes: ToyNodes;
  body: Matter.Body;
  /** The element's centre relative to the body's centre of mass, at angle 0. */
  offset: { x: number; y: number };
  w: number;
  h: number;
  inWorld: boolean;
};

type Glyph = { word: number; index: number; x0: number; x1: number; y0: number; y1: number };

type Grab = {
  live: Live;
  constraint: Matter.Constraint;
  /** Latest pointer position in viewport pixels. */
  clientX: number;
  clientY: number;
  /** The hand's smoothed velocity, px per step, and when it last moved. */
  vx: number;
  vy: number;
  moved: number;
};

type TouchTrack = {
  id: number;
  live: Live;
  x0: number;
  y0: number;
  t0: number;
  state: "pending" | "held" | "scroll";
  timer: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rotate(x: number, y: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
}

function partArea(part: ToyPart, w: number, h: number) {
  if (part.kind === "circle") return Math.PI * (part.r * w) ** 2;
  if (part.kind === "box") return part.w * w * part.h * h;
  const points = part.points.map(([u, v]) => ({ x: u * w, y: v * h }));
  return Math.abs(Vertices.area(points, true));
}

/** Total shape area for a base size of 1. */
const UNIT_AREA = TOYS.reduce(
  (sum, toy) => sum + toy.parts.reduce((a, part) => a + partArea(part, toy.w, toy.h), 0),
  0,
);

export function createToybox(options: ToyboxOptions): Toybox {
  const { box, words, layer, wordEls, chars, nodes, onReveal } = options;
  const dev = process.env.NODE_ENV !== "production";

  const engine = Engine.create({
    enableSleeping: true,
    positionIterations: 10,
    velocityIterations: 8,
  });
  const world = engine.world;

  let W = 0;
  let H = 0;
  let size = 0; // font size of the words, px
  let base = 0; // shape base size, px
  let floorY = 0;
  let layout: ToyLayout = "stack";
  let glyphs: Glyph[] = [];
  let statics: Matter.Body[] = [];
  const glyphOf = new Map<number, Glyph>();
  const charEls = chars.flat();

  const lives: Live[] = TOYS.map((toy) => ({
    toy,
    nodes: nodes[toy.id],
    body: null as unknown as Matter.Body,
    offset: { x: 0, y: 0 },
    w: 0,
    h: 0,
    inWorld: false,
  }));
  const liveOf = new Map<ToyId, Live>(lives.map((live) => [live.toy.id, live]));
  const liveOfBody = new Map<number, Live>();

  let silent = false; // no flourishes while settling unseen
  let destroyed = false;
  let running = false;
  let paused = false;
  let visible = true;
  let accumulator = 0;
  let entrance: gsap.core.Timeline | null = null;
  let entranceDone = options.entrance === "settled";
  let grab: Grab | null = null;
  let touch: TouchTrack | null = null;
  let flung = false;
  let stopSensors: (() => void) | null = null;
  const canvas = document.createElement("canvas").getContext("2d");

  // -- Measuring the words ------------------------------------------------

  function measure() {
    W = box.clientWidth;
    H = box.clientHeight;
    const style = getComputedStyle(words);
    size = parseFloat(style.fontSize) || 48;
    layout =
      getComputedStyle(box).getPropertyValue("--toybox-layout").trim() === "wide"
        ? "wide"
        : "stack";

    let ascent = size;
    let descent = size * 0.3;
    if (canvas) {
      canvas.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
      const probe = canvas.measureText("M");
      if (probe.fontBoundingBoxAscent) ascent = probe.fontBoundingBoxAscent;
      if (probe.fontBoundingBoxDescent) descent = probe.fontBoundingBoxDescent;
    }

    // Offsets ignore transforms, so a letter mid-hop still measures at rest.
    const originX = words.offsetLeft;
    const originY = words.offsetTop;
    glyphs = [];
    chars.forEach((list, word) => {
      list.forEach((el, index) => {
        const text = el.textContent ?? "";
        if (!text.trim()) return;
        let left = el.offsetLeft;
        let top = el.offsetTop;
        let parent = el.offsetParent as HTMLElement | null;
        while (parent && parent !== words && parent !== box) {
          left += parent.offsetLeft;
          top += parent.offsetTop;
          parent = parent.offsetParent as HTMLElement | null;
        }
        left += originX;
        top += originY;
        const baseline = top + (el.offsetHeight - (ascent + descent)) / 2 + ascent;
        let x0 = left;
        let x1 = left + el.offsetWidth;
        let y0 = baseline - size * 0.7;
        if (canvas) {
          const ink = canvas.measureText(text);
          x0 = left - ink.actualBoundingBoxLeft;
          x1 = left + ink.actualBoundingBoxRight;
          y0 = baseline - ink.actualBoundingBoxAscent;
        }
        if (x1 - x0 < 1 || baseline - y0 < 1) return;
        glyphs.push({ word, index, x0, x1, y0, y1: baseline + size * 0.02 });
      });
    });
    // Punctuation sits low; give it the x-height of its neighbours so a shape
    // can't wedge into the notch above a comma.
    for (const glyph of glyphs) {
      const text = chars[glyph.word]?.[glyph.index]?.textContent ?? "";
      if (/^[,.]$/.test(text)) glyph.y0 = Math.min(glyph.y0, glyph.y1 - size * 0.52);
    }
    // Close the small gaps between letters and between the words on a line,
    // at the lower of the two neighbours' tops, so nothing pokes into them.
    const bridges: Glyph[] = [];
    const sorted = [...glyphs].sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
    for (let i = 1; i < sorted.length; i++) {
      const left = sorted[i - 1];
      const right = sorted[i];
      if (Math.abs(left.y1 - right.y1) > 1) continue;
      const gap = right.x0 - left.x1;
      if (gap <= 0 || gap > size * 0.5) continue;
      bridges.push({
        word: left.word,
        index: left.index,
        x0: left.x1 - 1,
        x1: right.x0 + 1,
        y0: Math.max(left.y0, right.y0),
        y1: left.y1,
      });
    }
    glyphs.push(...bridges);
    floorY = glyphs.reduce((max, glyph) => Math.max(max, glyph.y1), 0) + 1;

    // Fit the shapes to the room above the floor, as the words leave it.
    let inked = 0;
    for (const glyph of glyphs) inked += (glyph.x1 - glyph.x0) * (glyph.y1 - glyph.y0);
    const free = Math.max(W * floorY - inked * 1.25, W * size);
    base = clamp(Math.sqrt((FILL * free) / UNIT_AREA), 26, Math.min(size * 1.2, W * 0.26, 132));

    // Gravity reads the same on a small phone and a tall tablet.
    engine.gravity.scale = 0.001 * clamp(H / 360, 1.5, 2.8);
  }

  function buildStatics() {
    if (statics.length) Composite.remove(world, statics);
    glyphOf.clear();
    const wall = { isStatic: true, friction: 0.4, restitution: 0.2, label: "wall" };
    const tall = Math.max(H, 600) * 4;
    const ceiling = -base * 3;
    // The side walls stand just inside the screen's edges.
    const inset = 4;
    statics = [
      Bodies.rectangle(W / 2, floorY + 300, W * 3, 600, { ...wall, label: "floor" }),
      Bodies.rectangle(inset - 300, floorY - tall / 2, 600, tall, wall),
      Bodies.rectangle(W - inset + 300, floorY - tall / 2, 600, tall, wall),
      Bodies.rectangle(W / 2, ceiling - 300, W * 3, 600, wall),
    ];
    for (const glyph of glyphs) {
      const w = glyph.x1 - glyph.x0;
      const h = glyph.y1 - glyph.y0;
      const letter = Bodies.rectangle(glyph.x0 + w / 2, glyph.y0 + h / 2, w, h, {
        isStatic: true,
        friction: 0.7,
        restitution: 0.12,
        label: "glyph",
        chamfer: { radius: Math.min(3, w / 4, h / 4) },
      });
      glyphOf.set(letter.id, glyph);
      statics.push(letter);
    }
    Composite.add(world, statics);
  }

  // -- The shapes ---------------------------------------------------------

  function buildBody(toy: Toy) {
    const w = toy.w * base;
    const h = toy.h * base;
    const common = {
      restitution: toy.restitution,
      friction: toy.friction,
      frictionStatic: 0.5,
      frictionAir: 0.014,
      density: 0.0015,
      sleepThreshold: 45,
      label: toy.id,
    };
    const parts = toy.parts.map((part) => {
      if (part.kind === "circle") {
        return Bodies.circle((part.x - 0.5) * w, (part.y - 0.5) * h, part.r * w, common, 28);
      }
      if (part.kind === "box") {
        const bw = part.w * w;
        const bh = part.h * h;
        const radius = part.round ? part.round * Math.min(bw, bh) * 0.98 : 0;
        const body = Bodies.rectangle((part.x - 0.5) * w, (part.y - 0.5) * h, bw, bh, {
          ...common,
          chamfer: radius ? { radius } : undefined,
        });
        if (part.angle) Body.rotate(body, part.angle);
        return body;
      }
      let points = Vertices.clockwiseSort(
        part.points.map(([u, v]) => ({ x: (u - 0.5) * w, y: (v - 0.5) * h })),
      );
      if (part.round) points = Vertices.chamfer(points, part.round * Math.min(w, h), -1, 2, 8);
      return Body.create({ ...common, position: Vertices.centre(points), vertices: points });
    });
    const body = parts.length === 1 ? parts[0] : Body.create({ ...common, parts });
    return { body, offset: { x: -body.position.x, y: -body.position.y }, w, h };
  }

  function buildShapes() {
    liveOfBody.clear();
    for (const live of lives) {
      const { body, offset, w, h } = buildBody(live.toy);
      live.body = body;
      live.offset = offset;
      live.w = w;
      live.h = h;
      liveOfBody.set(body.id, live);
      for (const part of body.parts) liveOfBody.set(part.id, live);
      live.nodes.outer.style.width = `${w}px`;
      live.nodes.outer.style.height = `${h}px`;
    }
  }

  /** Moves a shape so its element's centre lands on (x, y). */
  function place(live: Live, x: number, y: number, angle: number) {
    Body.setAngle(live.body, angle);
    const o = rotate(live.offset.x, live.offset.y, angle);
    Body.setPosition(live.body, { x: x - o.x, y: y - o.y });
    Body.setVelocity(live.body, { x: 0, y: 0 });
    Body.setAngularVelocity(live.body, 0);
  }

  function centre(live: Live) {
    const o = rotate(live.offset.x, live.offset.y, live.body.angle);
    return { x: live.body.position.x + o.x, y: live.body.position.y + o.y };
  }

  function write(live: Live) {
    const c = centre(live);
    live.nodes.outer.style.transform = `translate3d(${(c.x - live.w / 2).toFixed(2)}px, ${(
      c.y -
      live.h / 2
    ).toFixed(2)}px, 0)`;
    live.nodes.rot.style.transform = `rotate(${live.body.angle.toFixed(4)}rad)`;
  }

  function show(live: Live) {
    live.nodes.outer.style.visibility = "visible";
  }

  function drop(id: ToyId, x: number) {
    const live = liveOf.get(id);
    if (!live || live.inWorld) return;
    const half = Math.max(live.w, live.h) / 2;
    place(live, clamp(x * W, half + 6, W - half - 6), -live.h * 0.7, live.toy.spin * 6);
    Body.setVelocity(live.body, { x: 0, y: 4 });
    Body.setAngularVelocity(live.body, live.toy.spin);
    Composite.add(world, live.body);
    live.inWorld = true;
    write(live);
    show(live);
    if (!silent && id === "logo") fx.assembleLogo(live.nodes.art, 0.6);
    if (id === "toggle") fx.setToggle(live.nodes.art, true);
    wake();
  }

  // -- The loop -----------------------------------------------------------

  function allAsleep() {
    for (const live of lives) if (live.inWorld && !live.body.isSleeping) return false;
    return true;
  }

  function step() {
    Engine.update(engine, STEP);
    for (const live of lives) {
      if (!live.inWorld) continue;
      const body = live.body;
      if (body.speed > MAX_SPEED) {
        const k = MAX_SPEED / body.speed;
        Body.setVelocity(body, { x: body.velocity.x * k, y: body.velocity.y * k });
      }
      // Lost through a wall by a freak collision: bring it back from above.
      const p = body.position;
      if (p.x < -W || p.x > 2 * W || p.y > floorY + 400 || p.y < -H * 2) {
        place(live, W / 2, -live.h, 0);
      }
    }
  }

  function tick(_time: number, deltaTime: number) {
    if (grab) followGrab();
    accumulator += Math.min(deltaTime, 100);
    let steps = 0;
    while (accumulator >= STEP && steps < MAX_STEPS_PER_FRAME) {
      step();
      accumulator -= STEP;
      steps++;
    }
    // A slow frame runs the world slower rather than jumping it.
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
    for (const live of lives) if (live.inWorld && !live.body.isSleeping) write(live);
    if (dev) drawDebug();
    if (entranceDone && !grab && !touch && allAsleep()) stop();
  }

  function start() {
    if (running || destroyed || paused) return;
    running = true;
    accumulator = 0;
    gsap.ticker.add(tick);
  }

  function stop() {
    if (!running) return;
    running = false;
    gsap.ticker.remove(tick);
  }

  function wake(live?: Live) {
    if (live) Sleeping.set(live.body, false);
    start();
  }

  function wakeAll() {
    for (const live of lives) if (live.inWorld) Sleeping.set(live.body, false);
    start();
  }

  // -- Collisions: landings squash the shape and dip the letter -----------

  Events.on(engine, "collisionStart", (event) => {
    if (silent) return;
    for (const pair of event.pairs) {
      const a = pair.bodyA.parent;
      const b = pair.bodyB.parent;
      const liveA = liveOfBody.get(a.id);
      const liveB = liveOfBody.get(b.id);
      if (!liveA && !liveB) continue;
      const normal = pair.collision.normal;
      const impact = Math.abs(
        (a.velocity.x - b.velocity.x) * normal.x + (a.velocity.y - b.velocity.y) * normal.y,
      );
      if (impact < 2.4) continue;
      const amount = clamp((impact - 2.4) / 14, 0, 1);
      const vertical = Math.abs(normal.y) >= Math.abs(normal.x);
      for (const [live, other] of [
        [liveA, b],
        [liveB, a],
      ] as const) {
        if (!live) continue;
        // The side of this shape that took the hit, for the squash's origin.
        const below = other.position.y > live.body.position.y;
        const right = other.position.x > live.body.position.x;
        const origin = vertical ? (below ? "50% 100%" : "50% 0%") : right ? "100% 50%" : "0% 50%";
        fx.squash(live.nodes.squash, amount, vertical ? "y" : "x", origin);
        const glyph = glyphOf.get(pair.bodyA.id) ?? glyphOf.get(pair.bodyB.id);
        if (glyph) {
          const char = chars[glyph.word]?.[glyph.index];
          if (char) fx.dip(char, amount, size);
        }
      }
    }
  });

  // -- Grabbing, dragging, throwing ---------------------------------------

  function local(clientX: number, clientY: number) {
    const rect = box.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startGrab(live: Live, clientX: number, clientY: number) {
    endGrab(false);
    const p = local(clientX, clientY);
    const body = live.body;
    const constraint = Constraint.create({
      pointA: p,
      bodyB: body,
      pointB: { x: p.x - body.position.x, y: p.y - body.position.y },
      // No damping: against a fixed point it would brake the throw itself.
      stiffness: 0.16,
      damping: 0,
      length: 0,
    });
    Composite.add(world, constraint);
    grab = { live, constraint, clientX, clientY, vx: 0, vy: 0, moved: performance.now() };
    live.nodes.outer.style.zIndex = "2";
    box.dataset.dragging = "";
    wake(live);
  }

  /** A new pointer position for the held shape. */
  function moveGrab(clientX: number, clientY: number) {
    if (!grab) return;
    const now = performance.now();
    const dt = Math.max(1, now - grab.moved);
    const k = dt > 80 ? 1 : 0.5;
    grab.vx += (((clientX - grab.clientX) / dt) * STEP - grab.vx) * k;
    grab.vy += (((clientY - grab.clientY) / dt) * STEP - grab.vy) * k;
    grab.clientX = clientX;
    grab.clientY = clientY;
    grab.moved = now;
  }

  function followGrab() {
    if (!grab) return;
    const p = local(grab.clientX, grab.clientY);
    // Keep the hold inside the box, so a drag can't pull a shape through the floor.
    grab.constraint.pointA = { x: clamp(p.x, 0, W), y: clamp(p.y, -base * 2, floorY) };
    Sleeping.set(grab.live.body, false);
  }

  function endGrab(throwIt: boolean) {
    if (!grab) return;
    const { live, constraint } = grab;
    Composite.remove(world, constraint);
    // A throw leaves with the hand's speed: the spring lags behind it.
    const recent = performance.now() - grab.moved < 70;
    if (throwIt && recent) {
      const body = live.body;
      Body.setVelocity(body, {
        x: body.velocity.x + (grab.vx - body.velocity.x) * 0.75,
        y: body.velocity.y + (grab.vy - body.velocity.y) * 0.75,
      });
      if (body.speed > MAX_SPEED) {
        const k = MAX_SPEED / body.speed;
        Body.setVelocity(body, { x: body.velocity.x * k, y: body.velocity.y * k });
      }
    }
    grab = null;
    live.nodes.outer.style.zIndex = "";
    delete box.dataset.dragging;
    fx.lift(live.nodes.lift, 0);
    if (!throwIt) {
      Body.setVelocity(live.body, {
        x: live.body.velocity.x * 0.3,
        y: live.body.velocity.y * 0.3,
      });
    } else if (live.body.speed * 60 > FLING_SPEED && !flung) {
      flung = true;
      labNote({
        id: "toybox-fling",
        text: "Nice throw. Everything in the lab is built to be played with.",
        shape: "circle",
        tone: "yellow",
      });
    }
    wake(live);
  }

  function hopSpeed(height: number) {
    const a = engine.gravity.scale * STEP * STEP;
    return Math.sqrt(2 * a * height);
  }

  function tap(live: Live) {
    const body = live.body;
    Sleeping.set(body, false);
    Body.setVelocity(body, {
      x: body.velocity.x + randomBetween(-1.2, 1.2),
      y: -hopSpeed(base * randomBetween(1.4, 2)),
    });
    Body.setAngularVelocity(body, randomPick([-1, 1]) * randomBetween(0.12, 0.22));
    fx.flourish(live.toy.flourish, live.nodes.art, live.nodes.squash);
    wake(live);
  }

  function liveFrom(target: EventTarget | null) {
    const el = (target as HTMLElement | null)?.closest?.("[data-toy]") as HTMLElement | null;
    const id = el?.dataset.toy as ToyId | undefined;
    const live = id ? liveOf.get(id) : undefined;
    return live?.inWorld ? live : undefined;
  }

  // Mouse and pen: press to grab at once, a click without a drag is a tap.
  let press: {
    live: Live;
    pointerId: number;
    x0: number;
    y0: number;
    t0: number;
    moved: boolean;
  } | null = null;

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "touch" || event.button !== 0) return;
    const live = liveFrom(event.target);
    if (!live) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    press = {
      live,
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      t0: performance.now(),
      moved: false,
    };
    startGrab(live, event.clientX, event.clientY);
    fx.press(live.nodes.squash, true);
  }

  function onPointerMove(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId || !grab) return;
    moveGrab(event.clientX, event.clientY);
    if (!press.moved && Math.hypot(event.clientX - press.x0, event.clientY - press.y0) > 4) {
      press.moved = true;
      fx.press(press.live.nodes.squash, false);
      fx.lift(press.live.nodes.lift, 2);
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    const { live, moved, t0 } = press;
    press = null;
    fx.press(live.nodes.squash, false);
    if (!moved && performance.now() - t0 < TAP_MS) {
      endGrab(false);
      tap(live);
    } else {
      endGrab(event.type === "pointerup");
    }
    requestMotionAccess();
  }

  // Touch: a swipe that starts on a shape still scrolls the page. A shape is
  // picked up by holding it a moment, or at once by a sideways drag; only
  // then is the page's scroll cancelled.
  function onTouchStart(event: TouchEvent) {
    if (touch || event.touches.length > 1) {
      cancelTouch();
      return;
    }
    const point = event.changedTouches[0];
    const live = liveFrom(event.target);
    if (!point || !live) return;
    const track: TouchTrack = {
      id: point.identifier,
      live,
      x0: point.clientX,
      y0: point.clientY,
      t0: performance.now(),
      state: "pending",
      timer: 0,
    };
    track.timer = window.setTimeout(() => {
      if (touch !== track || track.state !== "pending") return;
      track.state = "held";
      startGrab(live, track.x0, track.y0);
      fx.lift(live.nodes.lift, 2);
      navigator.vibrate?.(8);
    }, HOLD_MS);
    touch = track;
    fx.press(live.nodes.squash, true);
  }

  function findTouch(list: TouchList) {
    if (!touch) return null;
    for (let i = 0; i < list.length; i++) if (list[i].identifier === touch.id) return list[i];
    return null;
  }

  function onTouchMove(event: TouchEvent) {
    const point = findTouch(event.changedTouches);
    if (!touch || !point) return;
    if (touch.state === "scroll") return;
    if (touch.state === "pending") {
      const dx = point.clientX - touch.x0;
      const dy = point.clientY - touch.y0;
      if (Math.hypot(dx, dy) < 8) return;
      window.clearTimeout(touch.timer);
      if (Math.abs(dx) > Math.abs(dy) * 1.15 && event.cancelable) {
        touch.state = "held";
        startGrab(touch.live, touch.x0, touch.y0);
        fx.press(touch.live.nodes.squash, false);
        fx.lift(touch.live.nodes.lift, 2);
      } else {
        // Mostly vertical: the visitor is scrolling. Let the page have it.
        touch.state = "scroll";
        fx.press(touch.live.nodes.squash, false);
        return;
      }
    }
    if (event.cancelable) event.preventDefault();
    moveGrab(point.clientX, point.clientY);
  }

  function onTouchEnd(event: TouchEvent) {
    const point = findTouch(event.changedTouches);
    if (!touch || !point) return;
    const track = touch;
    touch = null;
    window.clearTimeout(track.timer);
    fx.press(track.live.nodes.squash, false);
    if (track.state === "held") {
      endGrab(event.type === "touchend");
    } else if (
      track.state === "pending" &&
      event.type === "touchend" &&
      performance.now() - track.t0 < TAP_MS &&
      Math.hypot(point.clientX - track.x0, point.clientY - track.y0) < 10
    ) {
      tap(track.live);
    }
    // Inside the touchend itself, so iOS counts it as the visitor's gesture.
    if (event.type === "touchend") requestMotionAccess();
  }

  function cancelTouch() {
    if (!touch) return;
    window.clearTimeout(touch.timer);
    fx.press(touch.live.nodes.squash, false);
    touch = null;
    endGrab(false);
  }

  // Hover: a shape under the cursor lifts a little, as if it noticed.
  const hoverOff: (() => void)[] = [];
  for (const live of lives) {
    const enter = (event: PointerEvent) => {
      if (event.pointerType === "touch" || grab) return;
      fx.lift(live.nodes.lift, 1);
    };
    const leave = (event: PointerEvent) => {
      if (event.pointerType === "touch" || grab?.live === live) return;
      fx.lift(live.nodes.lift, 0);
    };
    live.nodes.hit.addEventListener("pointerenter", enter);
    live.nodes.hit.addEventListener("pointerleave", leave);
    hoverOff.push(() => {
      live.nodes.hit.removeEventListener("pointerenter", enter);
      live.nodes.hit.removeEventListener("pointerleave", leave);
    });
  }

  // A quick cursor brushing through a shape shoves it along. The path since
  // the last move is sampled, so a fast flick can't skip over a shape.
  let lastPush: { x: number; y: number } | null = null;
  const offPush = onPointer((state, event) => {
    if (!event || event.type !== "pointermove" || state.type === "touch") {
      lastPush = null;
      return;
    }
    const p = local(state.x, state.y);
    const from = lastPush ?? p;
    lastPush = p;
    if (grab || !entranceDone || paused || state.speed < 260) return;
    if (p.x < 0 || p.x > W || p.y < -base || p.y > floorY) return;
    const bodies = lives.filter((live) => live.inWorld).map((live) => live.body);
    const pushed = new Set<number>();
    const samples = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / 10));
    const speed = Math.min(state.speed, 2600);
    const dirX = state.vx / (state.speed || 1);
    const dirY = state.vy / (state.speed || 1);
    for (let i = 1; i <= samples; i++) {
      const point = {
        x: from.x + ((p.x - from.x) * i) / samples,
        y: from.y + ((p.y - from.y) * i) / samples,
      };
      for (const body of Query.point(bodies, point)) {
        if (pushed.has(body.id)) continue;
        pushed.add(body.id);
        const live = liveOfBody.get(body.id);
        if (!live) continue;
        // About half the cursor's speed, pushed at the point it touched so
        // an off-centre brush also sets the shape spinning.
        const dv = Math.min((speed / 60) * 0.5, 14);
        const k = (body.mass * dv) / (STEP * STEP);
        Sleeping.set(body, false);
        Body.applyForce(body, point, { x: dirX * k, y: dirY * k });
        wake(live);
      }
    }
  });

  // A cursor running over the words bobs each letter it touches.
  const onLetterOver = (event: PointerEvent) => {
    if (event.pointerType === "touch" || grab) return;
    const char = (event.target as HTMLElement).closest?.(".toybox-char") as HTMLElement | null;
    if (char) fx.bob(char, size);
  };
  words.addEventListener("pointerover", onLetterOver);

  // Tapping a word bounces its letters and tosses whatever sits on it.
  const wordOff: (() => void)[] = [];
  wordEls.forEach((wordEl, word) => {
    const onClick = (event: MouseEvent) => {
      const list = chars[word] ?? [];
      const hitChar = (event.target as HTMLElement).closest?.("div");
      const from = Math.max(0, list.indexOf(hitChar as HTMLElement));
      fx.ripple(list, from, size);
      const mine = glyphs.filter((glyph) => glyph.word === word);
      if (!mine.length) return;
      const x0 = Math.min(...mine.map((g) => g.x0));
      const x1 = Math.max(...mine.map((g) => g.x1));
      const top = Math.min(...mine.map((g) => g.y0));
      for (const live of lives) {
        if (!live.inWorld) continue;
        const bounds = live.body.bounds;
        const resting = bounds.max.y > top - 6 && bounds.max.y < top + size * 0.5;
        if (!resting || bounds.max.x < x0 || bounds.min.x > x1) continue;
        Sleeping.set(live.body, false);
        Body.setVelocity(live.body, {
          x: randomBetween(-1.5, 1.5),
          y: -hopSpeed(base * randomBetween(0.9, 1.4)),
        });
        Body.setAngularVelocity(live.body, randomBetween(-0.15, 0.15));
      }
      wake();
    };
    wordEl.addEventListener("click", onClick);
    wordOff.push(() => wordEl.removeEventListener("click", onClick));
  });

  layer.addEventListener("pointerdown", onPointerDown);
  layer.addEventListener("pointermove", onPointerMove);
  layer.addEventListener("pointerup", onPointerUp);
  layer.addEventListener("pointercancel", onPointerUp);
  layer.addEventListener("touchstart", onTouchStart, { passive: true });
  layer.addEventListener("touchmove", onTouchMove, { passive: false });
  layer.addEventListener("touchend", onTouchEnd);
  layer.addEventListener("touchcancel", onTouchEnd);
  // No native image or text drag from a shape.
  const noDrag = (event: Event) => event.preventDefault();
  layer.addEventListener("dragstart", noDrag);

  // -- Shake, tilt and idle ------------------------------------------------

  function shake() {
    if (destroyed) return;
    for (const live of lives) {
      if (!live.inWorld) continue;
      if (grab?.live === live) continue;
      Sleeping.set(live.body, false);
      Body.setVelocity(live.body, {
        x: randomBetween(-4, 4),
        y: -hopSpeed(base * randomBetween(1.4, 2.4)),
      });
      Body.setAngularVelocity(live.body, randomBetween(-0.25, 0.25));
    }
    fx.shiver(charEls, size);
    wake();
  }

  function startSensors() {
    if (stopSensors) return;
    stopSensors = watchMotion({
      onGravity: (x, y) => {
        engine.gravity.x = x;
        engine.gravity.y = y;
        wakeAll();
      },
      onShake: shake,
    });
  }

  function stopSensorsNow() {
    stopSensors?.();
    stopSensors = null;
  }

  // After a while with nothing happening, one shape fidgets now and then.
  let fidget: gsap.core.Tween | null = null;
  function scheduleFidget() {
    fidget?.kill();
    fidget = gsap.delayedCall(randomBetween(4, 8), () => {
      if (!paused && !grab) {
        const idle = lives.filter((live) => live.inWorld);
        const live = idle.length ? randomPick(idle) : null;
        if (live) {
          Sleeping.set(live.body, false);
          Body.setVelocity(live.body, { x: 0, y: -hopSpeed(base * 0.35) });
          fx.flourish(live.toy.flourish, live.nodes.art, live.nodes.squash);
          wake(live);
        }
      }
      scheduleFidget();
    });
  }
  const offIdle = onIdle(8000, (idle) => {
    if (idle && entranceDone) scheduleFidget();
    else {
      fidget?.kill();
      fidget = null;
    }
  });

  // -- Visibility ----------------------------------------------------------

  function setPaused(value: boolean) {
    if (paused === value) return;
    paused = value;
    if (paused) {
      stop();
      stopSensorsNow();
      cancelTouch();
      endGrab(false);
      fidget?.pause();
    } else {
      if (entranceDone) startSensors();
      fidget?.resume();
      wakeAll();
    }
  }

  const syncPaused = () => setPaused(!visible || document.hidden);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    // The entrance plays out even if the visitor scrolls away mid-drop.
    if (entranceDone) syncPaused();
  });
  observer.observe(box);
  document.addEventListener("visibilitychange", syncPaused);

  // -- Resizing ------------------------------------------------------------

  let resizeFrame = 0;
  let measured = "";
  const sizeKey = () =>
    `${box.clientWidth}x${box.clientHeight}:${words.offsetWidth}x${words.offsetHeight}`;
  function relayout() {
    resizeFrame = 0;
    if (destroyed) return;
    // The observers report once on start, and the page's own reflows can
    // report an unchanged size: only a real change re-lays the box.
    const key = sizeKey();
    if (key === measured) return;
    measured = key;
    const before = base;
    cancelTouch();
    endGrab(false);
    measure();
    if (!W || !H) return;
    buildStatics();
    const scale = before ? base / before : 1;
    if (Math.abs(scale - 1) > 0.02) {
      for (const live of lives) {
        Body.scale(live.body, scale, scale);
        live.offset = { x: live.offset.x * scale, y: live.offset.y * scale };
        live.w *= scale;
        live.h *= scale;
        live.nodes.outer.style.width = `${live.w}px`;
        live.nodes.outer.style.height = `${live.h}px`;
      }
    }
    // Keep every shape inside the new box and out of the words.
    const top = glyphs.reduce((min, glyph) => Math.min(min, glyph.y0), floorY);
    for (const live of lives) {
      if (!live.inWorld) continue;
      const c = centre(live);
      const half = Math.max(live.w, live.h) / 2;
      let x = clamp(c.x, half, W - half);
      let y = Math.min(c.y, floorY - half);
      // Resting on a letter is touching it; only a shape the reflow left
      // inside the type is lifted out above the words.
      const inside = Query.collides(live.body, statics).some(
        (collision) => collision.depth > base * 0.12,
      );
      if (inside) {
        x = clamp(c.x, half, W - half);
        y = top - half - 2;
      }
      if (x !== c.x || y !== c.y) place(live, x, y, live.body.angle);
    }
    for (const live of lives) if (live.inWorld) write(live);
    wakeAll();
  }
  const resizer = new ResizeObserver(() => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(relayout);
  });

  // -- Debug outlines (development only, add ?toybox=debug) ----------------

  let debug: CanvasRenderingContext2D | null = null;
  if (dev && new URLSearchParams(window.location.search).get("toybox") === "debug") {
    const el = document.createElement("canvas");
    el.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:5";
    box.appendChild(el);
    debug = el.getContext("2d");
  }
  function drawDebug() {
    if (!debug) return;
    const el = debug.canvas;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (el.width !== Math.round(W * ratio) || el.height !== Math.round(H * ratio)) {
      el.width = Math.round(W * ratio);
      el.height = Math.round(H * ratio);
      el.style.width = `${W}px`;
      el.style.height = `${H}px`;
    }
    debug.setTransform(ratio, 0, 0, ratio, 0, 0);
    debug.clearRect(0, 0, W, H);
    debug.lineWidth = 1;
    for (const body of Composite.allBodies(world)) {
      debug.strokeStyle = body.isStatic ? "rgba(58,109,197,0.8)" : "rgba(249,65,65,0.9)";
      for (const part of body.parts.length > 1 ? body.parts.slice(1) : body.parts) {
        debug.beginPath();
        part.vertices.forEach((v, i) => (i ? debug!.lineTo(v.x, v.y) : debug!.moveTo(v.x, v.y)));
        debug.closePath();
        debug.stroke();
      }
    }
    debug.strokeStyle = "rgba(15,134,87,0.9)";
    debug.beginPath();
    debug.moveTo(0, floorY);
    debug.lineTo(W, floorY);
    debug.stroke();
  }

  // -- Start ---------------------------------------------------------------

  measure();
  measured = sizeKey();
  buildStatics();
  buildShapes();
  resizer.observe(box);
  resizer.observe(words);

  function finishEntrance() {
    if (entranceDone) return;
    entranceDone = true;
    entrance = null;
    // Anything the timeline didn't get to (a very slow device) drops now.
    for (const drop_ of DROPS[layout]) drop(drop_.id, drop_.x);
    syncPaused();
    if (!paused) startSensors();
    onReveal();
  }

  if (options.entrance === "drop") {
    const tl = gsap.timeline({ onComplete: finishEntrance });
    for (const item of DROPS[layout]) tl.add(() => drop(item.id, item.x), item.at * 0.55);
    tl.add(() => {}, 1.8);
    entrance = tl;
    start();
  } else if (options.entrance === "full") {
    const tl = gsap.timeline({ onComplete: finishEntrance });
    const media = chars[0] ?? [];
    tl.add(() => {
      fx.ripple(media, 0, size);
      if (media[3]) fx.coin(media[3]);
    }, 0);
    for (const item of DROPS[layout]) tl.add(() => drop(item.id, item.x), item.at);
    tl.add(() => {
      if (wordEls[1]) fx.turn(wordEls[1]);
    }, 1.05);
    tl.add(() => fx.roll([...(chars[2] ?? []), ...(chars[3] ?? [])]), 1.7);
    tl.add(onReveal, 2.5);
    tl.add(() => {}, 3.1);
    entrance = tl;
    start();
  } else {
    // Arriving from another page, or already scrolled past: settle the same
    // drop unseen, then show the pile at rest.
    silent = true;
    const schedule = DROPS[layout];
    let next = 0;
    for (let i = 0; i < 900; i++) {
      const now = (i * STEP) / 1000;
      while (next < schedule.length && schedule[next].at <= now) {
        drop(schedule[next].id, schedule[next].x);
        next++;
      }
      Engine.update(engine, STEP);
      if (next >= schedule.length && allAsleep()) break;
    }
    silent = false;
    for (const live of lives) if (live.inWorld) write(live);
    stop();
    syncPaused();
    if (!paused) startSensors();
  }

  if (dev) {
    Object.assign(window, {
      __toybox: {
        engine,
        shake,
        state: () => ({
          running,
          paused,
          layout,
          base,
          size,
          floorY,
          toys: lives.map((live) => ({
            id: live.toy.id,
            inWorld: live.inWorld,
            asleep: live.body.isSleeping,
            ...centre(live),
            angle: live.body.angle,
          })),
        }),
      },
    });
  }

  return {
    shake,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      entrance?.kill();
      fidget?.kill();
      offIdle();
      offPush();
      stopSensorsNow();
      observer.disconnect();
      resizer.disconnect();
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      document.removeEventListener("visibilitychange", syncPaused);
      cancelTouch();
      endGrab(false);
      hoverOff.forEach((off) => off());
      wordOff.forEach((off) => off());
      layer.removeEventListener("pointerdown", onPointerDown);
      layer.removeEventListener("pointermove", onPointerMove);
      layer.removeEventListener("pointerup", onPointerUp);
      layer.removeEventListener("pointercancel", onPointerUp);
      layer.removeEventListener("touchstart", onTouchStart);
      layer.removeEventListener("touchmove", onTouchMove);
      layer.removeEventListener("touchend", onTouchEnd);
      layer.removeEventListener("touchcancel", onTouchEnd);
      layer.removeEventListener("dragstart", noDrag);
      words.removeEventListener("pointerover", onLetterOver);
      debug?.canvas.remove();
      Events.off(engine, "collisionStart");
      Composite.clear(world, false, true);
      Engine.clear(engine);
      // The letters and words go back to rest; the split is reverted next.
      gsap.killTweensOf(charEls);
      gsap.set(wordEls, { clearProps: "transform" });
      for (const live of lives) {
        gsap.killTweensOf([live.nodes.lift, live.nodes.squash]);
        live.nodes.outer.style.cssText = "";
        live.nodes.rot.style.transform = "";
        gsap.set([live.nodes.lift, live.nodes.squash], { clearProps: "all" });
      }
      delete box.dataset.dragging;
      if (dev) delete (window as unknown as { __toybox?: unknown }).__toybox;
    },
  };
}
