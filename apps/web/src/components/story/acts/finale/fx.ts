import { Vector3, type PerspectiveCamera } from "three";

import {
  seededRandom,
  stepSpring,
  type StoryPalette,
  type StoryTier,
} from "@/components/story/engine/act";

import { PHASE, fallSpeed, impulse } from "./acting";
import type { SpriteBatch, StrokeBatch } from "./batches";

/**
 * Everything small the finale draws around Godette, written into the two
 * batches every frame. Story fx are pure functions of the acting time `A`
 * (the dust, the impact, the speed lines, the dizzy constellation's
 * presence); life fx run on the clock (the constellation's orbit, the
 * ambient stars, the bursts a click throws).
 *
 * Sizes are life size metres (she is 1.848 m tall here).
 */

/** The four brand colours, in the card's order. */
export type FinaleColors = Readonly<{
  ink: number;
  page: number;
  dust: number;
  faint: number;
  brand: readonly number[];
  /** Her blush (a warm pink from the brand red). */
  blush: number;
  light: boolean;
}>;

function mixHex(a: number, b: number, k: number) {
  const ch = (shift: number) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * k) & 255;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function finaleColors(palette: StoryPalette): FinaleColors {
  const light = palette.scheme === "light";
  return {
    ink: palette.ink,
    page: palette.page,
    dust: light ? mixHex(palette.page, palette.ink, 0.085) : mixHex(palette.page, 0xffffff, 0.12),
    faint: light ? mixHex(palette.page, palette.ink, 0.5) : mixHex(palette.page, 0xffffff, 0.62),
    brand: [palette.yellow, palette.blue, palette.red, palette.green],
    blush: mixHex(palette.red, 0xffc4cc, 0.45),
    light,
  };
}

const RING = Array.from({ length: 5 }, () => new Vector3());
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const right = new Vector3();
const up = new Vector3();
const forward = new Vector3();

function saturate(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function easeOut(x: number) {
  const k = saturate(x);
  return 1 - (1 - k) ** 3;
}

function backOut(x: number) {
  const k = saturate(x) - 1;
  return 1 + 2.4 * k * k * k + 1.4 * k * k;
}

/** The camera's right, up and forward axes. */
function cameraAxes(camera: PerspectiveCamera) {
  const e = camera.matrixWorld.elements;
  right.set(e[0], e[1], e[2]).normalize();
  up.set(e[4], e[5], e[6]).normalize();
  forward.set(-e[8], -e[9], -e[10]).normalize();
}

/* ------------------------------------------------------------------ story fx */

/**
 * The fall: cartoon speed lines above her while she drops in, fading the
 * moment her feet hit.
 */
export function drawSpeedLines(
  strokes: StrokeBatch,
  A: number,
  rootY: number,
  colors: FinaleColors,
) {
  const speed = fallSpeed(A);
  const fade = A < PHASE.fallEnd ? 1 : 1 - saturate((A - PHASE.fallEnd) / 0.1);
  if (fade <= 0) return;
  const v = A < PHASE.fallEnd ? speed : fallSpeed(PHASE.fallEnd - 1e-3);
  const lanes = [-0.34, -0.17, 0.02, 0.19, 0.36];
  lanes.forEach((x, i) => {
    const length = (0.55 + 0.35 * Math.abs(Math.sin(i * 2.3))) * Math.min(1.4, v * 0.11);
    const gap = 0.12 + 0.18 * ((i * 7) % 3) * 0.5;
    const top = rootY + 1.9 + gap;
    tmpA.set(x, top, -0.15);
    tmpB.set(x, top + length, -0.15);
    strokes.push(tmpA, tmpB, 0.022, colors.faint, 0.55 * fade, 0.15);
  });
}

/**
 * The landing: soft dust puffs rolling out along the floor from where her
 * bottom hits, a few pebbles of light hopping out, and comic impact dashes
 * around the hit.
 */
export function drawImpact(
  sprites: SpriteBatch,
  strokes: StrokeBatch,
  A: number,
  contact: Readonly<Vector3>,
  camera: PerspectiveCamera,
  colors: FinaleColors,
) {
  // the feet tap first: a small puff each side
  const feet = (A - PHASE.fallEnd) / 0.45;
  if (feet > 0 && feet < 1) {
    for (const side of [-1, 1]) {
      const k = easeOut(feet);
      tmpA.set(contact.x + side * (0.14 + 0.16 * k), 0.04 + 0.03 * k, contact.z + 0.25);
      sprites.push(tmpA, 0.1 + 0.1 * k, "disc", colors.dust, 0.55 * (1 - feet) ** 1.5);
    }
  }
  const u = (A - PHASE.bottomHit) / 1.0;
  if (u < 0 || u > 1) return;
  const k = easeOut(u);
  // cartoon dust: flat puffs that roll out along the floor, swell, then shrink away
  const puffs = 10;
  for (let i = 0; i < puffs; i += 1) {
    const angle = (i / puffs) * Math.PI * 2 + 0.35;
    const wobble = 0.75 + 0.5 * Math.abs(Math.sin(i * 12.9898));
    const radius = (0.22 + 0.62 * k) * (0.9 + 0.2 * Math.sin(i * 5.7));
    const x = contact.x + Math.cos(angle) * radius * 1.25;
    const z = contact.z + Math.sin(angle) * radius * 0.7;
    const lift = 0.05 + 0.1 * k * (0.5 + 0.5 * Math.abs(Math.sin(i * 3.1)));
    const swell = Math.sin(Math.min(1, u * 1.15) * Math.PI) ** 0.7;
    const size = (0.1 + 0.16 * k) * wobble * swell;
    tmpA.set(x, lift, z);
    sprites.push(tmpA, size, "disc", colors.dust, 1);
  }
  // pebbles of light: brand stars hopping out of the dust
  for (let i = 0; i < 5; i += 1) {
    const angle = -0.4 + i * 0.95;
    const age = u * 1.0;
    const out = 0.25 + 0.7 * easeOut(age * 1.4);
    const hop = Math.max(0, 0.42 * Math.sin(Math.min(1, age * 1.6) * Math.PI)) * (0.7 + 0.1 * i);
    tmpA.set(
      contact.x + Math.cos(angle) * out,
      0.03 + hop,
      contact.z + Math.sin(angle) * out * 0.6,
    );
    const color = colors.brand[i % colors.brand.length] ?? colors.ink;
    sprites.push(tmpA, 0.065, "twinkle", color, (1 - u) ** 1.2 * saturate(u * 18), age * 5 + i);
  }
  // comic impact dashes around the hit, in the view plane
  const dash = (A - PHASE.bottomHit) / 0.28;
  if (dash > 0 && dash < 1) {
    cameraAxes(camera);
    tmpC.set(contact.x, 0.32, contact.z);
    for (let i = 0; i < 7; i += 1) {
      const angle = Math.PI * (0.06 + (i / 6) * 0.88);
      const r0 = 0.42 + 0.22 * easeOut(dash);
      const r1 = r0 + 0.16 * (1 - dash) + 0.04;
      const cx = Math.cos(angle);
      const cy = Math.sin(angle) * 0.85;
      tmpA
        .copy(tmpC)
        .addScaledVector(right, cx * r0 * 1.3)
        .addScaledVector(up, cy * r0);
      tmpB
        .copy(tmpC)
        .addScaledVector(right, cx * r1 * 1.3)
        .addScaledVector(up, cy * r1);
      strokes.push(tmpA, tmpB, 0.03, colors.ink, 0.85 * (1 - dash));
    }
  }
}

/** One little cartoon cloud: disc offsets (x, y in puff radii) and sizes. */
const PUFF_CLOUD: readonly (readonly [number, number, number])[] = [
  [0, 0, 1],
  [0.78, 0.18, 0.78],
  [-0.62, 0.22, 0.72],
  [0.22, 0.72, 0.66],
  [1.32, -0.12, 0.5],
  [-0.2, -0.42, 0.56],
];

/**
 * Dusting off: each brush of her hands on her shorts knocks out a little
 * cartoon cloud that billows out to that side, rises a little and shrinks
 * away, with a speck or two flicked further (story: the clip's brush times,
 * aged by the acting clock).
 */
export function drawBrushPuffs(
  sprites: SpriteBatch,
  A: number,
  hips: Readonly<Vector3>,
  colors: FinaleColors,
) {
  const clip = (A - PHASE.standEnd) * PHASE.dustRate;
  if (clip < 0 || clip > 2.4) return;
  const brushes = [0.38, 0.72, 1.08];
  brushes.forEach((at, b) => {
    const age = (clip - at) / 0.8;
    if (age <= 0 || age >= 1) return;
    const side = b % 2 === 0 ? -1 : 1;
    const k = easeOut(age);
    const radius = 0.045 + 0.03 * k;
    const swell = Math.sin(Math.min(1, age * 1.25) * Math.PI) ** 0.55;
    const cx = hips.x + side * (0.2 + 0.22 * k);
    const cy = hips.y - 0.08 + 0.1 * k;
    PUFF_CLOUD.forEach(([ox, oy, size], i) => {
      // the cloud opens as it goes: its discs drift apart a little
      const open = 1 + 0.35 * k;
      tmpA.set(cx + side * ox * radius * open, cy + oy * radius * open, hips.z + 0.14 + i * 0.002);
      sprites.push(tmpA, 2 * radius * size * swell, "disc", colors.dust, 1);
    });
    // specks flicked out ahead of the cloud
    for (let i = 0; i < 2; i += 1) {
      const fly = easeOut(Math.min(1, age * 1.4));
      tmpA.set(
        cx + side * (0.12 + 0.2 * fly + i * 0.06),
        cy + 0.05 + 0.1 * fly - 0.12 * age * age + i * 0.04,
        hips.z + 0.15,
      );
      sprites.push(tmpA, 0.026 * (1 - age), "disc", colors.dust, 1);
    }
  });
}

/**
 * The dizzy constellation: five of the card back's small stars, linked by
 * thin lines, orbiting her head. `amount` is its presence (story), `scatter`
 * throws the stars off as she shakes her head, `time` turns it (life).
 */
export function drawDizzy(
  sprites: SpriteBatch,
  strokes: StrokeBatch,
  head: Readonly<Vector3>,
  amount: number,
  scatter: number,
  time: number,
  colors: FinaleColors,
  tilt = 0,
) {
  if (amount <= 0.003) return;
  const n = 5;
  const grow = backOut(amount);
  const spread = 1 + 1.6 * easeOut(scatter);
  const fade = saturate(amount * 1.4) * (1 - easeOut(scatter));
  if (fade <= 0.003) return;
  const radiusX = 0.27 * grow * spread;
  const radiusZ = 0.19 * grow * spread;
  const spin = time * 2.6;
  const points = RING;
  points.forEach((p, i) => {
    const angle = spin + (i / n) * Math.PI * 2;
    const bob = Math.sin(time * 5.3 + i * 1.7) * 0.012;
    // seen from a little above: the front of the orbit dips, the back rises
    const lift =
      -Math.sin(angle) * 0.075 * grow +
      Math.cos(angle) * tilt * 0.05 +
      scatter * 0.25 * (1 + Math.sin(i * 4.1));
    p.set(
      head.x + Math.cos(angle) * radiusX,
      head.y + 0.1 + bob + lift,
      head.z + Math.sin(angle) * radiusZ,
    );
  });
  for (let i = 0; i < n; i += 1) {
    const a = points.at(i);
    const b = points.at((i + 1) % n);
    if (a && b) strokes.push(a, b, 0.008, colors.faint, 0.55 * fade);
  }
  points.forEach((p, i) => {
    const twinkle = 0.82 + 0.18 * Math.sin(time * 9 + i * 2.1);
    const color = colors.brand[i % colors.brand.length] ?? colors.ink;
    sprites.push(p, 0.105 * twinkle * grow, "twinkle", color, fade, time * 1.4 + i * 0.6);
  });
}

/* ------------------------------------------------------------------ life fx */

const faceZ = new Vector3();
const faceX = new Vector3();
const faceY = new Vector3();
const cheek = new Vector3();
const cheekNormal = new Vector3();
const toEye = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);
/** The eyes socket sits this far below the head socket's line of sight (radians). */
const SOCKET_TILT = Math.atan2(0.055, 0.1);

/**
 * Her blush when she is shy: two soft pink glows on her cheeks, placed from
 * where her face points (the head and eyes sockets, so they follow every
 * turn and duck of the head), fading as a cheek turns away from the camera.
 */
export function drawBlush(
  sprites: SpriteBatch,
  head: Readonly<Vector3>,
  eyes: Readonly<Vector3>,
  camera: PerspectiveCamera,
  amount: number,
  colors: FinaleColors,
) {
  if (amount <= 0.01) return;
  // the line from the head socket to the eyes points forward and a little down: lift it level
  faceZ.copy(eyes).sub(head).normalize();
  faceX.crossVectors(WORLD_UP, faceZ);
  if (faceX.lengthSq() < 1e-6) return;
  faceX.normalize();
  faceZ.applyAxisAngle(faceX, -SOCKET_TILT);
  faceY.crossVectors(faceZ, faceX).normalize();
  for (const side of [-1, 1]) {
    cheek
      .copy(eyes)
      .addScaledVector(faceX, side * 0.056)
      .addScaledVector(faceY, -0.04)
      .addScaledVector(faceZ, -0.012);
    cheekNormal
      .copy(faceZ)
      .addScaledVector(faceX, side * 0.75)
      .normalize();
    toEye.copy(camera.position).sub(cheek).normalize();
    const facing = saturate((cheekNormal.dot(toEye) - 0.1) / 0.5);
    if (facing <= 0) continue;
    cheek.addScaledVector(toEye, 0.02);
    sprites.push(cheek, 0.062, "soft", colors.blush, 0.55 * amount * facing);
  }
}

type AmbientStar = {
  u: number;
  v: number;
  depth: number;
  size: number;
  speed: number;
  spin: number;
  phase: number;
  color: number;
  brand: boolean;
  pushX: number;
  pushY: number;
  velX: number;
  velY: number;
};

/**
 * The page coming alive once she has said hello: small four-point stars
 * drifting up behind her, twinkling, parting around the cursor. They are
 * laid out in screen space at their own depth, so they fill any frame.
 */
export class AmbientStars {
  private readonly stars: AmbientStar[] = [];

  constructor(count: number) {
    const random = seededRandom(4207);
    for (let i = 0; i < count; i += 1) {
      const brand = random() < 0.28;
      this.stars.push({
        u: random() * 2.3 - 1.15,
        v: random() * 2.3 - 1.15,
        depth: 1.5 + random() * 4.5,
        size: 0.6 + random() * 0.9,
        speed: 0.012 + random() * 0.03,
        spin: (random() - 0.5) * 0.8,
        phase: random() * Math.PI * 2,
        color: Math.floor(random() * 4),
        brand,
        pushX: 0,
        pushY: 0,
        velX: 0,
        velY: 0,
      });
    }
  }

  static countFor(tier: StoryTier) {
    return tier === "high" ? 46 : tier === "medium" ? 34 : 24;
  }

  /**
   * Draws the field. `amount` fades it (0..1), `pointer` is the cursor in
   * NDC (null: none), `focus` is the distance from the camera to her.
   */
  draw(
    sprites: SpriteBatch,
    camera: PerspectiveCamera,
    focus: number,
    amount: number,
    time: number,
    dt: number,
    pointer: Readonly<{ x: number; y: number }> | null,
    colors: FinaleColors,
  ) {
    if (amount <= 0.003) return;
    cameraAxes(camera);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const aspect = camera.aspect;
    for (const star of this.stars) {
      // rise forever, wrapping, a little sideways sway
      let v = star.v + time * star.speed;
      v = ((((v + 1.15) % 2.3) + 2.3) % 2.3) - 1.15;
      const u = star.u + Math.sin(time * 0.21 + star.phase) * 0.03;
      // part around the cursor (aspect-corrected, springy)
      let tx = 0;
      let ty = 0;
      if (pointer) {
        const dx = (u - pointer.x) * aspect;
        const dy = v - pointer.y;
        const d = Math.hypot(dx, dy);
        const reach = 0.32;
        if (d < reach && d > 1e-4) {
          const push = (1 - d / reach) ** 2 * 0.22;
          tx = ((dx / d) * push) / aspect;
          ty = (dy / d) * push;
        }
      }
      const x: [number, number] = [star.pushX, star.velX];
      const y: [number, number] = [star.pushY, star.velY];
      stepSpring(x, tx, dt, 60, 9);
      stepSpring(y, ty, dt, 60, 9);
      [star.pushX, star.velX] = x;
      [star.pushY, star.velY] = y;
      const depth = focus + star.depth;
      const halfH = depth * tan;
      tmpA
        .copy(camera.position)
        .addScaledVector(forward, depth)
        .addScaledVector(right, (u + star.pushX) * halfH * aspect)
        .addScaledVector(up, (v + star.pushY) * halfH);
      const edge = 1 - saturate((Math.abs(v) - 0.85) / 0.3);
      const twinkle = 0.65 + 0.35 * Math.sin(time * (1.4 + star.speed * 30) + star.phase);
      // a share of the frame's height, whatever the camera's distance (close or wide shots alike)
      const size = star.size * 0.0128 * 2 * halfH * (0.85 + 0.15 * twinkle);
      const color = star.brand ? (colors.brand.at(star.color) ?? colors.ink) : colors.faint;
      const alpha = (star.brand ? 0.62 : 0.3) * twinkle * edge * amount;
      sprites.push(
        tmpA,
        size,
        star.size > 1.1 ? "compass" : "twinkle",
        color,
        alpha,
        time * star.spin,
      );
    }
  }
}

type Burst = { origin: Vector3; start: number; power: number; seed: number };

/** Little star bursts thrown by a click (life). Pure functions of their age. */
export class StarBursts {
  private readonly bursts: Burst[] = [];

  fire(origin: Readonly<Vector3>, time: number, power = 1) {
    if (this.bursts.length >= 6) this.bursts.shift();
    this.bursts.push({
      origin: origin.clone(),
      start: time,
      power,
      seed: Math.floor(time * 997) % 1000,
    });
  }

  clear() {
    this.bursts.length = 0;
  }

  draw(sprites: SpriteBatch, time: number, colors: FinaleColors) {
    for (let b = this.bursts.length - 1; b >= 0; b -= 1) {
      const burst = this.bursts.at(b);
      if (!burst) continue;
      const age = time - burst.start;
      if (age > 1.4 || age < 0) {
        this.bursts.splice(b, 1);
        continue;
      }
      const random = seededRandom(burst.seed + 11);
      const count = 12;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + random() * 0.5;
        const speed = (0.55 + random() * 0.6) * burst.power;
        const life = 0.8 + random() * 0.6;
        const k = age / life;
        if (k >= 1) continue;
        const travel = (speed * (1 - Math.exp(-3.4 * age))) / 3.4;
        tmpA.set(
          burst.origin.x + Math.cos(angle) * travel,
          burst.origin.y + Math.sin(angle) * travel * 0.9 - 0.25 * age * age,
          burst.origin.z,
        );
        const color = colors.brand[(i + burst.seed) % colors.brand.length] ?? colors.ink;
        const grow = saturate(k * 10) * (1 - k * k);
        sprites.push(
          tmpA,
          (0.07 + random() * 0.06) * grow * burst.power,
          "twinkle",
          color,
          grow,
          age * 6 + i,
        );
      }
    }
  }
}

/** A soft wobble used by the impact (re-exported for the act). */
export { impulse };
