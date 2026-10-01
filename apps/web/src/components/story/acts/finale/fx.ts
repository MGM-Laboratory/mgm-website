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
  /** The dust clouds' two tones: the shaded base and the lit top. */
  dustBase: number;
  dustTop: number;
  faint: number;
  brand: readonly number[];
  /** Her blush (a warm pink from the brand red). */
  blush: number;
  light: boolean;
}>;

/** Mixes two 0xRRGGBB colours (sRGB, per channel). */
export function mixHex(a: number, b: number, k: number) {
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
    dustBase: light ? mixHex(palette.page, 0x6d6359, 0.2) : mixHex(palette.page, 0xd8d0c8, 0.3),
    dustTop: light ? mixHex(palette.page, 0xffffff, 0.75) : mixHex(palette.page, 0xffffff, 0.52),
    faint: light ? mixHex(palette.page, palette.ink, 0.5) : mixHex(palette.page, 0xffffff, 0.62),
    brand: [palette.yellow, palette.blue, palette.red, palette.green],
    // on the dark page her lit skin is darker: a deeper rose there, not a light patch
    blush: light ? mixHex(palette.red, 0xffc4cc, 0.45) : mixHex(palette.red, 0xc9707e, 0.6),
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
    strokes.push(tmpA, tmpB, 0.022, colors.faint, 0.55 * fade, 0.15, 0.25);
  });
}

/** The landing's dust clouds: [angle (0 is her right, along the floor), reach (m), size, delay (s)]. */
const LANDING_CLOUDS: readonly (readonly [number, number, number, number])[] = [
  [0.12, 0.95, 1.15, 0],
  [Math.PI - 0.1, 1.0, 1.2, 0.01],
  [0.55, 0.62, 0.85, 0.03],
  [Math.PI - 0.6, 0.66, 0.9, 0.02],
  [1.35, 0.38, 0.7, 0.05],
  [Math.PI + 0.35, 0.72, 0.75, 0.04],
  [-0.4, 0.7, 0.7, 0.05],
];

/** Impact dashes: [angle (radians from her right, counter clockwise), delay (s)], a shuffled pop. */
const DASHES: readonly (readonly [number, number])[] = [
  [0.2, 0.0],
  [0.62, 0.035],
  [1.08, 0.012],
  [1.57, 0.05],
  [2.06, 0.02],
  [2.52, 0.045],
  [2.94, 0.006],
];

/**
 * The landing: little cartoon dust clouds (two tones, soft edged, each a
 * cluster of puffs) roll out along the floor from where her bottom hits and
 * break up, a thin ring runs out over the floor, pebbles of light hop out,
 * and tapered impact dashes pop around the hit, a frame or two apart.
 */
export function drawImpact(
  sprites: SpriteBatch,
  strokes: StrokeBatch,
  A: number,
  contact: Readonly<Vector3>,
  camera: PerspectiveCamera,
  colors: FinaleColors,
) {
  // the feet tap first: a small soft puff each side
  const feet = (A - PHASE.fallEnd) / 0.45;
  if (feet > 0 && feet < 1) {
    for (const side of [-1, 1]) {
      const k = easeOut(feet);
      tmpA.set(contact.x + side * (0.14 + 0.16 * k), 0.04 + 0.03 * k, contact.z + 0.25);
      sprites.push(tmpA, 0.1 + 0.1 * k, "disc", colors.dustBase, 0.6 * (1 - feet) ** 1.5, 0.6);
    }
  }
  const u = (A - PHASE.bottomHit) / 1.1;
  if (u < 0 || u > 1) return;
  // the ring on the floor: thin, fast, gone first
  const ring = u / 0.55;
  if (ring < 1) {
    const radius = 0.3 + 0.85 * easeOut(ring);
    const segments = 26;
    const alpha = 0.26 * (1 - ring) ** 1.4;
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      tmpA.set(contact.x + Math.cos(a0) * radius, 0.006, contact.z + Math.sin(a0) * radius * 0.85);
      tmpB.set(contact.x + Math.cos(a1) * radius, 0.006, contact.z + Math.sin(a1) * radius * 0.85);
      strokes.push(tmpA, tmpB, 0.009, colors.faint, alpha);
    }
  }
  // the clouds: every base first, then every lit top (so a top never hides under a neighbour)
  for (let pass = 0; pass < 2; pass += 1) {
    LANDING_CLOUDS.forEach(([angle, reach, size, delay], c) => {
      const age = (A - PHASE.bottomHit - delay) / 1.0;
      if (age <= 0 || age >= 1) return;
      const k = easeOut(age);
      const swell = Math.sin(Math.min(1, age * 1.2) * Math.PI) ** 0.6;
      const cx = contact.x + Math.cos(angle) * reach * (0.25 + 0.75 * k);
      const cz = contact.z + Math.sin(angle) * reach * 0.45 * (0.25 + 0.75 * k);
      const r = 0.075 * size * (0.7 + 0.6 * k);
      PUFF_CLOUD.forEach(([ox, oy, s], i) => {
        // the cloud rolls (its puffs turn about its centre) and opens as it goes
        const roll = k * 1.6 * (Math.cos(angle) >= 0 ? -1 : 1) + c;
        const open = 1 + 0.45 * k;
        const px = ox * Math.cos(roll) - oy * Math.sin(roll) * 0.35;
        const py = oy * 0.7 + Math.abs(ox) * 0.08;
        const lift = 0.03 + r * (0.85 + py) + 0.06 * k;
        const puff = 2 * r * s * swell * (1 - 0.35 * age);
        if (pass === 0) {
          tmpA.set(cx + px * r * open, lift, cz + 0.01 * i);
          sprites.push(tmpA, puff, "disc", colors.dustBase, 0.92 * (1 - age ** 3), 0.45);
        } else {
          tmpA.set(cx + px * r * open - 0.12 * r, lift + 0.22 * puff, cz + 0.01 * i + 0.004);
          sprites.push(tmpA, puff * 0.62, "disc", colors.dustTop, 0.85 * (1 - age ** 2), 0.7);
        }
      });
    });
  }
  // pebbles of light: brand stars hopping out of the dust
  for (let i = 0; i < 5; i += 1) {
    const angle = -0.4 + i * 0.95;
    const age = u * 1.1;
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
  // comic impact dashes around the hit, in the view plane: tapered, light, popping in turn
  cameraAxes(camera);
  tmpC.set(contact.x, 0.3, contact.z);
  DASHES.forEach(([angle, delay], i) => {
    const dash = (A - PHASE.bottomHit - delay) / 0.3;
    if (dash <= 0 || dash >= 1) return;
    const r0 = 0.44 + 0.24 * easeOut(dash);
    const r1 = r0 + 0.2 * (1 - dash) + 0.05;
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
    // two of the seven in the spark's yellow
    const color = i === 1 || i === 4 ? (colors.brand[0] ?? colors.ink) : colors.ink;
    const alpha = (i === 1 || i === 4 ? 0.9 : 0.45) * (1 - dash) ** 0.8;
    strokes.push(tmpA, tmpB, 0.022, color, alpha, 0, 0.15);
  });
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
  // every base first, then every lit top (so a top never hides under a neighbour)
  for (let pass = 0; pass < 2; pass += 1) {
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
        tmpA.set(
          cx + side * ox * radius * open,
          cy + oy * radius * open,
          hips.z + 0.14 + i * 0.002,
        );
        if (pass === 0) {
          sprites.push(tmpA, 2 * radius * size * swell, "disc", colors.dustBase, 0.9, 0.45);
        } else {
          tmpA.y += 0.3 * radius * size;
          tmpA.z += 0.003;
          sprites.push(tmpA, 1.3 * radius * size * swell, "disc", colors.dustTop, 0.8, 0.7);
        }
      });
      if (pass === 1) return;
      // specks flicked out ahead of the cloud
      for (let i = 0; i < 2; i += 1) {
        const fly = easeOut(Math.min(1, age * 1.4));
        tmpA.set(
          cx + side * (0.12 + 0.2 * fly + i * 0.06),
          cy + 0.05 + 0.1 * fly - 0.12 * age * age + i * 0.04,
          hips.z + 0.15,
        );
        sprites.push(tmpA, 0.026 * (1 - age), "disc", colors.dustBase, 1, 0.3);
      }
    });
  }
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

const eyeAt = new Vector3();
const across = new Vector3();

/**
 * Her blush when she is shy: two soft pink glows on her cheekbones, placed
 * from where her face points (the head and eyes sockets, so they follow
 * every turn and duck of the head). Each fades as its cheek turns away from
 * the camera, as her head ducks (the cheeks slide up toward the eyes in the
 * view) and wherever it would reach over an eye as seen from the camera.
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
  // a duck of the head (pitch down) hides the cheeks under the eyes: fade and shrink with it
  const duck = saturate(1 + Math.asin(Math.max(-1, Math.min(1, faceZ.y))) / 0.75);
  if (duck <= 0.01) return;
  for (const side of [-1, 1]) {
    cheek
      .copy(eyes)
      .addScaledVector(faceX, side * 0.062)
      .addScaledVector(faceY, -0.06)
      .addScaledVector(faceZ, -0.016);
    cheekNormal
      .copy(faceZ)
      .addScaledVector(faceX, side * 0.75)
      .normalize();
    toEye.copy(camera.position).sub(cheek).normalize();
    const facing = saturate((cheekNormal.dot(toEye) - 0.1) / 0.5);
    if (facing <= 0) continue;
    // the eye on this side, and how far the cheek sits from it across the view
    eyeAt
      .copy(eyes)
      .addScaledVector(faceX, side * 0.036)
      .addScaledVector(faceY, -0.008);
    across.copy(cheek).sub(eyeAt);
    across.addScaledVector(toEye, -across.dot(toEye));
    const clear = saturate((across.length() - 0.034) / 0.022);
    if (clear <= 0) continue;
    cheek.addScaledVector(toEye, 0.02);
    const size = 0.054 * (0.75 + 0.25 * duck);
    sprites.push(cheek, size, "soft", colors.blush, 0.5 * amount * facing * duck * clear);
  }
}

const SPARKLES = (() => {
  const random = seededRandom(9137);
  return Array.from({ length: 16 }, () => ({
    angle: random() * Math.PI * 2,
    radius: 0.32 + random() * 0.3,
    height: -0.55 + random() * 1.1,
    period: 0.9 + random() * 0.6,
    phase: random(),
    size: 0.045 + random() * 0.045,
    yellow: random() < 0.68,
    tone: Math.floor(random() * 3) + 1,
    spin: (random() - 0.5) * 6,
  }));
})();

/**
 * Her magic as sparkles: little four-point stars winking around her body
 * and drifting up, mostly the spark's yellow (the hero pose, the action's
 * hover). `centre` is her chest, `amount` 0..1, `time` the life clock.
 * Some sit behind her (her body hides them), some in front.
 */
export function drawSparkles(
  sprites: SpriteBatch,
  centre: Readonly<Vector3>,
  amount: number,
  time: number,
  colors: FinaleColors,
) {
  if (amount <= 0.01) return;
  for (const spark of SPARKLES) {
    const cycle = (time / spark.period + spark.phase) % 1;
    // each one winks in, drifts up a little and winks out, then comes back elsewhere on its ring
    const wink = Math.sin(cycle * Math.PI) ** 1.6;
    const round = Math.floor(time / spark.period + spark.phase);
    const angle = spark.angle + round * 2.39996;
    tmpA.set(
      centre.x + Math.cos(angle) * spark.radius,
      centre.y + spark.height + cycle * 0.22,
      centre.z + Math.sin(angle) * spark.radius * 0.7,
    );
    const color = spark.yellow
      ? (colors.brand[0] ?? colors.ink)
      : (colors.brand[spark.tone] ?? colors.ink);
    sprites.push(
      tmpA,
      spark.size * (0.6 + 0.4 * wink),
      "twinkle",
      color,
      amount * wink,
      time * spark.spin,
    );
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
