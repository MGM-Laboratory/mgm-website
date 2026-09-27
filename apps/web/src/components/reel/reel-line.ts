import { seededRandom } from "@/components/reel/reel-math";

/**
 * The reel's ribbon: one smooth, hand-shaped curve that enters from the
 * left under the title, runs down past the description, loops clockwise
 * around the thumbnail, crosses its own earlier strand, runs right under
 * the call to action and leaves the right edge in an S.
 *
 * Built once from a few control points nudged by a fixed seed (so it is
 * the same curve on every load and in every screenshot), through a
 * centripetal Catmull-Rom spline, resampled evenly by arc length.
 *
 * Space: "line units", scaled by the viewport diagonal on both axes, y up.
 * On screen (px, y down, relative to the viewport's left edge and the
 * section's top):
 *   x = (u - 0.05) * diag
 *   y = sectionTop + (0.8 - v) * diag
 */

export const LINE_MARGIN_X = -0.05;
export const LINE_MARGIN_Y = -0.8;

/** Where the ribbon passes, in line units (y up). */
const CONTROL: ReadonlyArray<readonly [number, number]> = [
  [-0.1, 0.742],
  [0.04, 0.712],
  [0.16, 0.66],
  [0.25, 0.585],
  [0.307, 0.49],
  [0.328, 0.378],
  [0.3, 0.262],
  [0.215, 0.192],
  [0.118, 0.205],
  [0.082, 0.3],
  [0.15, 0.382],
  [0.265, 0.414],
  [0.39, 0.414],
  [0.5, 0.39],
  [0.592, 0.334],
  [0.662, 0.262],
  [0.748, 0.228],
  [0.84, 0.246],
  [0.895, 0.2],
  [0.925, 0.1],
  [0.97, 0.01],
  [1.08, -0.05],
];

/** How far the seed may move each inner control point, line units. */
const JITTER = 0.011;
/** The same curve every time: a fixed seed, never the clock. */
const SEED = 0x6d676d;

export type ReelLine = {
  count: number;
  /** Centreline, line units. */
  x: Float32Array;
  y: Float32Array;
  /** Unit normals (left of the direction of travel). */
  nx: Float32Array;
  ny: Float32Array;
  /** Normalised arc length, 0 (tail) to 1 (head). */
  t: Float32Array;
  /** Contact shadow where the later strand passes over: 0 shaded, 1 open. */
  ao: Float32Array;
  /** The draw ratio at which the head crosses the earlier strand. */
  crossT: number;
  /** Bounds in line units, for visibility tests. */
  minY: number;
  maxY: number;
};

function catmullRom(points: ReadonlyArray<readonly [number, number]>, perSegment: number) {
  // Centripetal parameterisation (alpha 0.5): no cusps, no self-loops
  // inside a segment, even where control points bunch up.
  const out: Array<[number, number]> = [];
  const pts = [points[0], ...points, points[points.length - 1]];
  const knot = (a: readonly [number, number], b: readonly [number, number], t: number) => {
    const d = Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5);
    return t + (d > 1e-6 ? d : 1e-4);
  };
  for (let i = 1; i < pts.length - 2; i += 1) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];
    const t0 = 0;
    const t1 = knot(p0, p1, t0);
    const t2 = knot(p1, p2, t1);
    const t3 = knot(p2, p3, t2);
    for (let s = 0; s < perSegment; s += 1) {
      const t = t1 + ((t2 - t1) * s) / perSegment;
      const point: [number, number] = [0, 0];
      for (let k = 0; k < 2; k += 1) {
        const a1 = ((t1 - t) / (t1 - t0 || 1e-6)) * p0[k] + ((t - t0) / (t1 - t0 || 1e-6)) * p1[k];
        const a2 = ((t2 - t) / (t2 - t1)) * p1[k] + ((t - t1) / (t2 - t1)) * p2[k];
        const a3 = ((t3 - t) / (t3 - t2 || 1e-6)) * p2[k] + ((t - t2) / (t3 - t2 || 1e-6)) * p3[k];
        const b1 = ((t2 - t) / (t2 - t0)) * a1 + ((t - t0) / (t2 - t0)) * a2;
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
        point[k] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
      }
      out.push(point);
    }
  }
  const last = points[points.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

function segmentHit(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
) {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const u = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const v = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v };
}

let cached: ReelLine | null = null;

/** The ribbon's geometry (built once, then shared). */
export function reelLine(samples = 320): ReelLine {
  if (cached && cached.count === samples) return cached;
  const rand = seededRandom(SEED);
  const control = CONTROL.map(([x, y], index) => {
    if (index === 0 || index === CONTROL.length - 1) return [x, y] as const;
    return [x + (rand() * 2 - 1) * JITTER, y + (rand() * 2 - 1) * JITTER] as const;
  });
  const dense = catmullRom(control, 48);

  // Even arc-length resampling.
  const lengths = new Float64Array(dense.length);
  for (let i = 1; i < dense.length; i += 1) {
    lengths[i] =
      lengths[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
  }
  const total = lengths[dense.length - 1];
  const x = new Float32Array(samples);
  const y = new Float32Array(samples);
  const t = new Float32Array(samples);
  let j = 1;
  for (let i = 0; i < samples; i += 1) {
    const target = (total * i) / (samples - 1);
    while (j < dense.length - 1 && lengths[j] < target) j += 1;
    const span = lengths[j] - lengths[j - 1] || 1;
    const f = Math.min(1, Math.max(0, (target - lengths[j - 1]) / span));
    x[i] = dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * f;
    y[i] = dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * f;
    t[i] = i / (samples - 1);
  }

  const nx = new Float32Array(samples);
  const ny = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const a = Math.max(0, i - 1);
    const b = Math.min(samples - 1, i + 1);
    const tx = x[b] - x[a];
    const ty = y[b] - y[a];
    const length = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / length;
    ny[i] = tx / length;
  }

  // The self-crossing: the first place a later stretch passes over an
  // earlier one. The earlier strand gets a soft contact shadow there.
  let crossT = 0.56;
  let crossX = Number.NaN;
  let crossY = Number.NaN;
  outer: for (let later = Math.floor(samples * 0.4); later < samples - 1; later += 1) {
    for (let early = 0; early < later - 12; early += 1) {
      const hit = segmentHit(
        x[early],
        y[early],
        x[early + 1],
        y[early + 1],
        x[later],
        y[later],
        x[later + 1],
        y[later + 1],
      );
      if (hit) {
        crossT = t[later] + (t[later + 1] - t[later]) * hit.v;
        crossX = x[early] + (x[early + 1] - x[early]) * hit.u;
        crossY = y[early] + (y[early + 1] - y[early]) * hit.u;
        break outer;
      }
    }
  }

  const ao = new Float32Array(samples).fill(1);
  if (Number.isFinite(crossX)) {
    const sigma = 0.075;
    for (let i = 0; i < samples; i += 1) {
      if (t[i] > crossT - 0.08) break;
      const d = Math.hypot(x[i] - crossX, y[i] - crossY);
      ao[i] = 1 - Math.exp(-(d * d) / (2 * sigma * sigma));
    }
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < samples; i += 1) {
    minY = Math.min(minY, y[i]);
    maxY = Math.max(maxY, y[i]);
  }

  cached = { count: samples, x, y, nx, ny, t, ao, crossT, minY, maxY };
  return cached;
}

/** Half the ribbon's width in px: thicker on small screens, 0.8% of the diagonal at 1920 wide. */
export function lineHalfWidth(vw: number, diag: number) {
  const k = vw <= 540 ? 2 : vw >= 1920 ? 1 : 2 - (vw - 540) / (1920 - 540);
  return 0.008 * k * diag;
}

/**
 * The idle wiggle: a slow travelling wave along the ribbon, stronger on
 * the stretch just drawn, like ink that hasn't settled. Line units, along
 * the normal. The shader computes the same (reel-shaders.ts).
 */
export function lineWiggle(t: number, time: number, reveal: number) {
  const fresh = Math.exp(-Math.max(0, reveal - t) / 0.06);
  const amp = 0.0024 + 0.0042 * fresh;
  const wave =
    Math.sin(t * 21 - time * 0.9) * 0.6 +
    Math.sin(t * 47 + time * 1.4 + 1.7) * 0.25 +
    Math.sin(t * 8 - time * 0.45 + 0.4) * 0.15;
  return amp * wave;
}

/** The centreline point at draw ratio `reveal`, interpolated between samples. */
export function lineHead(line: ReelLine, reveal: number) {
  const f = Math.min(1, Math.max(0, reveal)) * (line.count - 1);
  const i = Math.min(line.count - 2, Math.floor(f));
  const k = f - i;
  const lerp = (a: Float32Array) => a[i] + (a[i + 1] - a[i]) * k;
  return {
    x: lerp(line.x),
    y: lerp(line.y),
    nx: lerp(line.nx),
    ny: lerp(line.ny),
    ao: lerp(line.ao),
  };
}

/** The ribbon as an SVG path in section px (for the DOM version). */
export function linePath(line: ReelLine, diag: number) {
  const parts: string[] = [];
  for (let i = 0; i < line.count; i += 2) {
    const px = (line.x[i] + LINE_MARGIN_X) * diag;
    const py = (-LINE_MARGIN_Y - line.y[i]) * diag;
    parts.push(`${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  const last = line.count - 1;
  parts.push(
    `L${((line.x[last] + LINE_MARGIN_X) * diag).toFixed(1)} ${((-LINE_MARGIN_Y - line.y[last]) * diag).toFixed(1)}`,
  );
  return parts.join("");
}
