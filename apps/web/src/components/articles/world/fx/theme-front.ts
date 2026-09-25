/**
 * The shape of a theme switch's front, shared by the GPU and the DOM.
 *
 * The world's shaders flip the scheme per pixel behind a ragged circular
 * front (world-glsl.ts `waveDistance`), and the page's DOM flips through a
 * clip that must follow the very same edge, so the text changes colour
 * exactly where the library behind it does. Both read the edge from here:
 * the GLSL is generated from these constants, and `frontEdge` is its exact
 * JavaScript twin (the same hash, the same value noise, the same octaves).
 *
 * Kept free of three.js: the DOM half of the switch imports it.
 */

/** How long a front takes to sweep the screen. */
export const FRONT_SECONDS = 1.8;
/** Half the width of the band where the scheme blends, CSS px. */
export const FRONT_BAND = 26;
/**
 * How far the DOM's clip runs ahead of the world's front, CSS px: the text
 * flips inside the blend band, and the front's glow (drawn just behind the
 * edge) always shows through the new page.
 */
export const FRONT_AHEAD = 10;

/** The edge's two octaves: frequency (per CSS px), drift (per second), amplitude (px). */
const OCTAVES = [
  { frequency: 0.009, drift: 0.15, amplitude: 140 },
  { frequency: 0.031, drift: -0.4, amplitude: 36 },
] as const;

/** The farthest the edge reaches ahead of or behind the circle. */
export const FRONT_EDGE_MAX = OCTAVES.reduce((sum, o) => sum + o.amplitude / 2, 0);

const glslFloat = (value: number) => (Number.isInteger(value) ? `${value}.0` : `${value}`);

/** GLSL for `frontEdge` (needs `worldNoise` before it). */
export const FRONT_EDGE_GLSL = /* glsl */ `
float frontEdge(vec2 css) {
  return ${OCTAVES.map(
    (o) =>
      `(worldNoise(css * ${glslFloat(o.frequency)} + uTime * ${glslFloat(o.drift)}) - 0.5) * ${glslFloat(o.amplitude)}`,
  ).join("\n       + ")};
}
`;

const fract = (value: number) => value - Math.floor(value);

/** worldHash() in world-glsl.ts, in JavaScript. */
function hash(px: number, py: number) {
  let x = fract(px * 0.1031);
  let y = fract(py * 0.1031);
  let z = x;
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  x += d;
  y += d;
  z += d;
  return fract((x + y) * z);
}

/** worldNoise() in world-glsl.ts, in JavaScript. */
function noise(px: number, py: number) {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const e = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a + (e - c - b + a) * ux) * uy;
}

/** How far the front's edge sits from its circle at a viewport point (CSS px), at world time `time`. */
export function frontEdge(x: number, y: number, time: number) {
  let sum = 0;
  for (const o of OCTAVES) {
    sum +=
      (noise(x * o.frequency + time * o.drift, y * o.frequency + time * o.drift) - 0.5) *
      o.amplitude;
  }
  return sum;
}

/**
 * Where the front crosses the ray from its origin along (ux, uy): the
 * distance r at which r + edge = radius. A damped fixed-point search (the
 * edge's slope can pass 1, where a plain one would ring).
 */
export function frontRadiusAlong(
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  radius: number,
  time: number,
) {
  let r = radius;
  for (let i = 0; i < 4; i++) {
    const target = radius - frontEdge(ox + ux * r, oy + uy * r, time);
    r += (target - r) * 0.6;
  }
  return Math.max(0, r);
}

/** The radius that covers the whole viewport from an origin, edge and blend included. */
export function frontReach(x: number, y: number, width: number, height: number) {
  return (
    Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + FRONT_EDGE_MAX + FRONT_BAND + 40
  );
}

/** power2.inOut: the front's pace (GSAP's, so the world and the DOM agree). */
export function frontEase(t: number) {
  const k = Math.min(1, Math.max(0, t));
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}

/** A running front, in viewport CSS px and world seconds. */
export type ThemeFront = {
  x: number;
  y: number;
  radius: number;
  /** The world time its edge is drawn at. */
  time: number;
  /** 1 while the front turns the page dark, 0 while it turns it light. */
  to: number;
};

/**
 * The clip that reveals the new scheme's DOM: a polygon following the
 * front's edge, `ahead` px in front of it (so the text flips with the band,
 * not after it). Viewport px, for `clip-path` on the view transition.
 */
export function frontPolygon(front: ThemeFront, ahead: number, vertices = 120) {
  if (front.radius <= 0.5) return `circle(0px at ${front.x}px ${front.y}px)`;
  const points: string[] = [];
  for (let i = 0; i < vertices; i++) {
    const angle = (i / vertices) * Math.PI * 2;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const r = frontRadiusAlong(front.x, front.y, ux, uy, front.radius, front.time) + ahead;
    points.push(`${(front.x + ux * r).toFixed(1)}px ${(front.y + uy * r).toFixed(1)}px`);
  }
  return `polygon(${points.join(",")})`;
}
