import type { StoryCardId } from "@/data/story";

/**
 * The four division logos (`public/logo/{web,mobile,game,ux}.svg`), piece by
 * piece, so each one can move with its own personality on the card fronts
 * (ACTS Act 1, "Logo personalities"). The path data is the logos' own, in
 * their 2000 x 2000 frame. `ink` is each logo's ink box (x, y, width,
 * height), the same framing as the storybook's cards, so the four read at
 * the same weight.
 *
 * A personality maps the logo's state (how far it has woken, the clock,
 * the hover, the pointer's direction, an idle trigger) to one transform per
 * piece; `card-front.ts` draws it.
 */

export type LogoPiece = Readonly<{
  id: string;
  /** SVG path data, or a circle as [cx, cy, r]. */
  d?: string;
  circle?: readonly [number, number, number];
  fill: string;
}>;

export type LogoArt = Readonly<{
  pieces: readonly LogoPiece[];
  ink: readonly [number, number, number, number];
}>;

const BLUE = "#3a6dc5";
const YELLOW = "#f7bf33";
const RED = "#f94141";

export const LOGOS: ReadonlyMap<StoryCardId, LogoArt> = new Map<StoryCardId, LogoArt>([
  [
    "website",
    {
      ink: [276, 620, 1447, 760],
      pieces: [
        { id: "screenA", d: "M483 681L1510 674L1507.97 1315L483 681Z", fill: YELLOW },
        { id: "screenB", d: "M1510 674L483 676.427L485.42 1316L1510 674Z", fill: RED },
        { id: "dot0", circle: [575, 753, 25], fill: YELLOW },
        { id: "dot1", circle: [648, 753, 25], fill: YELLOW },
        { id: "dot2", circle: [721, 753, 25], fill: YELLOW },
        { id: "baseL", d: "M487.311 1133H1003L846.731 1326H330L487.311 1133Z", fill: BLUE },
        { id: "baseR", d: "M1511.69 1133H996L1152.27 1326H1669L1511.69 1133Z", fill: BLUE },
      ],
    },
  ],
  [
    "mobile",
    {
      ink: [638, 432, 723, 1136],
      pieces: [
        { id: "lowR", d: "M1319.49 716L1319.48 1526.27L680.416 1526.27L1319.49 716Z", fill: RED },
        { id: "lowL", d: "M680.421 716L680.425 1526.27L1319.49 1526.27L680.421 716Z", fill: BLUE },
        {
          id: "upR",
          d: "M1319.49 1284.18L1319.48 473.91L680.416 473.91L1319.49 1284.18Z",
          fill: YELLOW,
        },
        {
          id: "upL",
          d: "M680.421 1284.18L680.425 473.91L1319.49 473.91L680.421 1284.18Z",
          fill: RED,
        },
        { id: "sun", circle: [832.5, 610.5, 67.5], fill: YELLOW },
      ],
    },
  ],
  [
    "game",
    {
      ink: [240, 515, 1520, 970],
      pieces: [
        {
          id: "wingL",
          d: "M296 1266L682.999 569L1000.5 917.5V1192.5L571 1431L296 1266Z",
          fill: RED,
        },
        {
          id: "wingR",
          d: "M1704.5 1266L1317.5 569L1000 917.5V1192.5L1429.5 1431L1704.5 1266Z",
          fill: BLUE,
        },
        { id: "top", d: "M1000 919.5L1317.5 569.5L683 569L1000 919.5Z", fill: YELLOW },
      ],
    },
  ],
  [
    "ux",
    {
      ink: [466, 452, 1067, 1151],
      pieces: [
        {
          id: "body",
          d: "M999.39 838.079L1415.91 1559.52H582.866L999.39 838.079Z",
          fill: BLUE,
        },
        {
          id: "armL",
          d: "M866.284 1069.98L792.87 919.037L508.823 1397.94L583.877 1559.86L866.285 1559.86L866.284 1069.98Z",
          fill: YELLOW,
        },
        {
          id: "armR",
          d: "M1133.02 1069.48L1206.43 918.537L1490.48 1397.44L1415.42 1559.36L1133.02 1559.36L1133.02 1069.48Z",
          fill: RED,
        },
        {
          id: "headY",
          d: "M1298.48 668.784C1328.14 721.019 1343.56 780.126 1343.21 840.193C1342.85 900.26 1326.73 959.18 1296.46 1011.06C1266.18 1062.94 1222.82 1105.96 1170.7 1135.82C1118.58 1165.68 1059.53 1181.34 999.464 1181.21L1000.16 838.162L1298.48 668.784Z",
          fill: YELLOW,
        },
        {
          id: "headR",
          d: "M999.479 1181.22C938.181 1181.1 878.035 1164.55 825.298 1133.31C772.56 1102.06 729.157 1057.26 699.604 1003.56C670.051 949.852 655.428 889.21 657.255 827.939C659.082 766.668 677.293 707.006 709.993 655.158L1000.16 838.164L999.479 1181.22Z",
          fill: RED,
        },
        {
          id: "headB",
          d: "M705.051 663.249C735.678 611.576 779.336 568.85 831.658 539.345C883.98 509.841 943.132 494.592 1003.2 495.123C1063.26 495.655 1122.14 511.948 1173.93 542.374C1225.72 572.8 1268.61 616.292 1298.32 668.499L1000.16 838.163L705.051 663.249Z",
          fill: BLUE,
        },
      ],
    },
  ],
]);

/** What a personality reads each time the front is drawn. */
export type LogoState = {
  /** Seconds since the front started waking (negative: not yet). Plays back when the card turns away. */
  wake: number;
  /** The clock, seconds. */
  time: number;
  /** 0..1, the card is hovered (spring). */
  hover: number;
  /** Seconds since the hover began (for one-shot hover moves), or -1. */
  hoverAge: number;
  /** The pointer on the card in logo space (2000 frame), or null. */
  pointer: { x: number; y: number } | null;
  /** Seconds since the last idle flourish started, or -1. */
  idleAge: number;
};

/** A piece's transform for this frame: about `pivot`, in the logo's 2000 frame. */
export type PieceTransform = {
  tx: number;
  ty: number;
  rotate: number;
  sx: number;
  sy: number;
  alpha: number;
  /** 0 filled, 1 drawn as an outline only (the UX wireframe). */
  outline: number;
  pivotX: number;
  pivotY: number;
};

export function identityTransform(out: PieceTransform, pivotX = 1000, pivotY = 1000) {
  out.tx = 0;
  out.ty = 0;
  out.rotate = 0;
  out.sx = 1;
  out.sy = 1;
  out.alpha = 1;
  out.outline = 0;
  out.pivotX = pivotX;
  out.pivotY = pivotY;
  return out;
}

// ------------------------------------------------------------------ easing for the drawings

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const phase = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const outCubic = (t: number) => 1 - (1 - t) ** 3;
const outBack = (t: number, s = 1.9) => {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};
const bump = (t: number) => Math.sin(clamp01(t) * Math.PI);

/** A seconds-long envelope for an idle flourish of `length` seconds. */
const flourish = (age: number, length: number) => (age < 0 || age > length ? -1 : age / length);

// ------------------------------------------------------------------ personalities

/**
 * Website, a laptop: the base halves slide in, the lid (the two screen
 * triangles) folds up from the base, the three dots pop in and blink like a
 * loading indicator. Idle: the screen triangles swap like a page loading.
 * Hover: the base halves slide apart and snap back; the dots look at you.
 */
function website(id: string, s: LogoState, out: PieceTransform) {
  const w = s.wake;
  if (id === "baseL" || id === "baseR") {
    const side = id === "baseL" ? -1 : 1;
    const k = outBack(phase(w, 0, 0.5), 1.4);
    identityTransform(out, side < 0 ? 666 : 1332, 1230);
    out.tx =
      side * (1 - k) * 420 +
      side * s.hover * 46 * (1 + 0.4 * Math.sin(s.hoverAge * 18) * Math.exp(-s.hoverAge * 4));
    out.alpha = clamp01(w / 0.2);
    return out;
  }
  if (id === "screenA" || id === "screenB") {
    // The lid folds up about its bottom edge (a squash on y from the hinge).
    identityTransform(out, 996, 1316);
    const k = outBack(phase(w, 0.22, 0.85), 1.6);
    out.sy = Math.max(0.001, k);
    out.alpha = clamp01((w - 0.2) / 0.15);
    // Idle: the two triangles turn half a turn and trade places, like a page loading.
    const f = flourish(s.idleAge, 0.8);
    if (f >= 0) {
      out.pivotX = 996;
      out.pivotY = 995;
      out.rotate = Math.PI * outCubic(f);
      out.sy *= 1 - 0.12 * bump(f);
      out.sx = 1 - 0.12 * bump(f);
    }
    return out;
  }
  // The dots: pop in one by one, blink a loading sequence, follow the pointer.
  const n = id === "dot0" ? 0 : id === "dot1" ? 1 : 2;
  const cx = 575 + n * 73;
  identityTransform(out, cx, 753);
  const pop = outBack(phase(w, 0.8 + n * 0.09, 1.05 + n * 0.09), 2.6);
  out.sx = pop;
  out.sy = pop;
  const loading = phase(w, 1.15, 2.4);
  if (loading > 0 && loading < 1) {
    const beat = (loading * 3 - n * 0.33 + 1) % 1;
    out.alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(beat * Math.PI * 2));
  }
  const p = s.pointer;
  if (p && s.hover > 0.01) {
    const dx = p.x - cx;
    const dy = p.y - 753;
    const d = Math.max(1, Math.hypot(dx, dy));
    out.tx = (dx / d) * 11 * s.hover;
    out.ty = (dy / d) * 11 * s.hover;
  }
  return out;
}

/**
 * Mobile, a phone: it slides up, the sun rises and bounces like a
 * notification badge. Idle: a buzz. Hover: the phone tilts toward landscape
 * and the sun pulses.
 */
function mobile(id: string, s: LogoState, out: PieceTransform) {
  const w = s.wake;
  identityTransform(out, 1000, 1000);
  const order = id === "lowL" ? 0 : id === "lowR" ? 1 : id === "upL" ? 2 : id === "upR" ? 3 : 4;
  // The tilt and the buzz move the whole phone (every piece about its centre).
  const buzzF = flourish(s.idleAge, 0.42);
  const buzz = buzzF >= 0 ? Math.sin(buzzF * Math.PI * 14) * 12 * (1 - buzzF) : 0;
  const tilt = -0.42 * s.hover;
  if (order < 4) {
    const k = outBack(phase(w, order * 0.07, 0.5 + order * 0.07), 1.3);
    out.ty = (1 - k) * 520;
    out.alpha = clamp01((w - order * 0.07) / 0.18);
    out.tx = buzz;
    out.rotate = tilt;
    return out;
  }
  // The sun: rises late, overshoots like a badge, pulses on hover.
  const rise = phase(w, 0.62, 1.1);
  const pop = outBack(rise, 3.2);
  const pulse = 1 + s.hover * 0.14 * (0.5 + 0.5 * Math.sin(s.time * 7));
  out.pivotX = 832.5;
  out.pivotY = 610.5;
  out.sx = pop * pulse;
  out.sy = pop * pulse;
  out.ty = (1 - outCubic(rise)) * 140;
  out.alpha = clamp01(rise * 3);
  // Follows the phone's tilt and buzz: rotate its centre about the phone's centre.
  const angle = tilt;
  const rx = 832.5 - 1000;
  const ry = 610.5 - 1000;
  out.tx += rx * Math.cos(angle) - ry * Math.sin(angle) - rx + buzz;
  out.ty += rx * Math.sin(angle) + ry * Math.cos(angle) - ry;
  return out;
}

/**
 * Game, a controller (or a bird): the wings flap in, the top jumps like a
 * sprite and lands with a squash, a coin spark pops. Idle: another hop.
 * Hover: the wings press like buttons, left then right.
 */
function game(id: string, s: LogoState, out: PieceTransform) {
  const w = s.wake;
  if (id === "wingL" || id === "wingR") {
    const side = id === "wingL" ? -1 : 1;
    identityTransform(out, 1000, 1050);
    const k = phase(w, 0.05, 0.75);
    // Two flaps that settle: an angle that swings and damps out.
    const flap = (1 - outCubic(k)) * Math.cos(k * Math.PI * 3) * 0.9;
    out.rotate = side * flap;
    out.sx = 0.35 + 0.65 * outCubic(phase(w, 0, 0.35));
    out.sy = out.sx;
    out.alpha = clamp01(w / 0.15);
    // Hover: buttons pressed in turn.
    const press = s.hover * (0.5 + 0.5 * Math.sin(s.time * 9 + (side > 0 ? Math.PI : 0)));
    out.sx *= 1 - 0.07 * press;
    out.sy *= 1 - 0.07 * press;
    out.ty = 26 * press;
    return out;
  }
  // The top: a sprite's jump with a squash on landing, then small hops when idle.
  identityTransform(out, 1000, 919);
  const j = phase(w, 0.45, 1.0);
  const hopF = flourish(s.idleAge, 0.62);
  let height = j < 1 ? bump(j) * 330 : 0;
  let squash = Math.sin(phase(w, 0.97, 1.27) * Math.PI) * 0.24;
  if (j >= 1 && hopF >= 0) {
    height = bump(hopF / 0.78) * 150;
    squash = Math.max(squash, Math.sin(phase(hopF, 0.76, 1) * Math.PI) * 0.18);
  }
  out.ty = -height;
  out.sy = 1 - squash;
  out.sx = 1 + squash * 0.8;
  out.alpha = clamp01((w - 0.4) / 0.1);
  return out;
}

/**
 * UX, a person: assembles from its pieces, outlines first (a wireframe)
 * then filled; the head's wedges track the pointer like an eye. Idle: an arm
 * waves. Hover: the wedges spin once and settle toward the pointer.
 */
function ux(id: string, s: LogoState, out: PieceTransform) {
  const w = s.wake;
  const order =
    id === "body"
      ? 0
      : id === "armL"
        ? 1
        : id === "armR"
          ? 2
          : id === "headB"
            ? 3
            : id === "headR"
              ? 4
              : 5;
  identityTransform(out, 1000, 838);
  const k = outCubic(phase(w, order * 0.08, 0.55 + order * 0.08));
  // Seeded scatter directions so the assembly is the same every time.
  const angle = order * 2.39996 + 0.7;
  out.tx = Math.cos(angle) * 520 * (1 - k);
  out.ty = Math.sin(angle) * 520 * (1 - k);
  out.rotate = (1 - k) * (order % 2 === 0 ? 1.2 : -1.2);
  out.alpha = clamp01((w - order * 0.08) / 0.12);
  // Wireframe to filled.
  out.outline = 1 - outCubic(phase(w, 0.75 + order * 0.05, 1.3 + order * 0.05));
  if (id === "armR") {
    out.pivotX = 1133;
    out.pivotY = 1070;
    const f = flourish(s.idleAge, 1.1);
    if (f >= 0) out.rotate += -Math.sin(f * Math.PI * 4) * 0.32 * bump(f);
    return out;
  }
  if (id === "headY" || id === "headR" || id === "headB") {
    // The eye: the head turns toward the pointer (limited), and spins once when a hover begins.
    let look = 0;
    const p = s.pointer;
    if (p) {
      const a = Math.atan2(p.y - 838, p.x - 1000) + Math.PI / 2;
      look = Math.max(-0.7, Math.min(0.7, Math.atan2(Math.sin(a), Math.cos(a))));
    }
    const spin = s.hoverAge >= 0 && s.hoverAge < 0.9 ? Math.PI * 2 * outCubic(s.hoverAge / 0.9) : 0;
    out.rotate += look * (0.35 + 0.65 * s.hover) + spin;
  }
  return out;
}

const PERSONALITIES: ReadonlyMap<
  StoryCardId,
  (id: string, s: LogoState, out: PieceTransform) => PieceTransform
> = new Map([
  ["website", website],
  ["mobile", mobile],
  ["game", game],
  ["ux", ux],
]);

export function pieceTransform(card: StoryCardId, id: string, s: LogoState, out: PieceTransform) {
  const run = PERSONALITIES.get(card);
  return run ? run(id, s, out) : identityTransform(out);
}

/** How long a wake takes, seconds (after it, only idle and hover move the logo). */
export const WAKE_SECONDS = 2.4;
/** Seconds between idle flourishes, per logo. */
export const IDLE_GAP: ReadonlyMap<StoryCardId, number> = new Map([
  ["website", 5.2],
  ["mobile", 6.1],
  ["game", 4.3],
  ["ux", 5.6],
]);
