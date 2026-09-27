/**
 * The reel player cursor's shapes, all drawn as one closed outline of the
 * same number of points so any shape can melt into any other: the close
 * disc, the play triangle, the two pause bars, the seek plus, the sound
 * half disc and the end star. Each outline is resampled by arc length, so
 * the points spread evenly along the edges, and a morph target is rotated
 * to the point order that travels least from where the cursor's points are
 * now, so shapes melt instead of twisting.
 *
 * The two pause bars are one outline too: the path runs along the bars'
 * shared baseline out and back, a bridge of zero area that fills nothing.
 * Mid-morph the bridge has width, which reads as the shape splitting in two.
 */

export type Glyph = "disc" | "play" | "pause" | "plus" | "half" | "star";

export const POINTS = 128;

type Point = [number, number];

function arc(
  out: Point[],
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  steps = 48,
) {
  // The end point is left out: the next piece of the outline starts there.
  for (let i = 0; i < steps; i++) {
    const a = from + ((to - from) * i) / steps;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
}

function outline(glyph: Glyph, u: number): Point[] {
  const out: Point[] = [];
  switch (glyph) {
    case "disc":
      arc(out, 0, 0, 44 * u, 0, Math.PI * 2, 256);
      break;
    case "play":
      out.push([-13 * u, -20 * u], [22 * u, 0], [-13 * u, 20 * u]);
      break;
    case "pause":
      out.push(
        [-14 * u, -18 * u],
        [-4 * u, -18 * u],
        [-4 * u, 18 * u],
        [4 * u, 18 * u],
        [4 * u, -18 * u],
        [14 * u, -18 * u],
        [14 * u, 18 * u],
        [-14 * u, 18 * u],
      );
      break;
    case "plus": {
      const l = 17 * u;
      const t = 5 * u;
      out.push(
        [-t, -l],
        [t, -l],
        [t, -t],
        [l, -t],
        [l, t],
        [t, t],
        [t, l],
        [-t, l],
        [-t, t],
        [-l, t],
        [-l, -t],
        [-t, -t],
      );
      break;
    }
    case "half": {
      const r = 20 * u;
      const x = -9 * u;
      arc(out, x, 0, r, -Math.PI / 2, Math.PI / 2, 96);
      out.push([x, r]);
      break;
    }
    case "star": {
      // The lab notes' star: four tips joined by quarter circles centred
      // on the corners of its box.
      const r = 38 * u;
      arc(out, r, -r, r, Math.PI, Math.PI / 2);
      arc(out, r, r, r, (Math.PI * 3) / 2, Math.PI);
      arc(out, -r, r, r, Math.PI * 2, (Math.PI * 3) / 2);
      arc(out, -r, -r, r, Math.PI / 2, 0);
      break;
    }
  }
  return out;
}

/** Twice the signed area; positive when the outline runs clockwise on screen. */
function signedArea(points: Point[]) {
  let area = 0;
  for (const [i, [x0, y0]] of points.entries()) {
    const [x1, y1] = points[(i + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  }
  return area;
}

function resample(points: Point[], count: number) {
  const lengths = [0];
  let total = 0;
  for (const [i, [x0, y0]] of points.entries()) {
    const [x1, y1] = points[(i + 1) % points.length];
    total += Math.hypot(x1 - x0, y1 - y0);
    lengths.push(total);
  }
  const out = new Float32Array(count * 2);
  let edge = 0;
  for (let i = 0; i < count; i++) {
    const at = (total * i) / count;
    while (edge < points.length - 1 && lengths[edge + 1] < at) edge++;
    const start = lengths.at(edge) ?? 0;
    const span = lengths[edge + 1] - start || 1;
    const t = (at - start) / span;
    const [x0, y0] = points.at(edge) ?? [0, 0];
    const [x1, y1] = points[(edge + 1) % points.length];
    out[i * 2] = x0 + (x1 - x0) * t;
    out[i * 2 + 1] = y0 + (y1 - y0) * t;
  }
  return out;
}

/** A shape's `POINTS` points, clockwise, at the cursor's unit size `u`. */
export function glyphPoints(glyph: Glyph, u: number) {
  const points = outline(glyph, u);
  if (signedArea(points) < 0) points.reverse();
  return resample(points, POINTS);
}

/**
 * `target` re-ordered to start at the point that makes the whole morph
 * from `current` travel least, so every point takes a short, direct path.
 */
export function alignTo(current: Float32Array, target: Float32Array) {
  const n = target.length / 2;
  let best = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < n; shift++) {
    let cost = 0;
    for (let i = 0; i < n && cost < bestCost; i++) {
      const k = (i + shift) % n;
      const dx = current[i * 2] - target[k * 2];
      const dy = current[i * 2 + 1] - target[k * 2 + 1];
      cost += dx * dx + dy * dy;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = shift;
    }
  }
  if (!best) return target;
  // The same points, starting from `best` and wrapping round to the start.
  const out = new Float32Array(target.length);
  out.set(target.subarray(best * 2));
  out.set(target.subarray(0, best * 2), (n - best) * 2);
  return out;
}

/** The SVG path of an outline. */
export function outlinePath(points: Float32Array) {
  let d = "";
  for (let i = 0; i < points.length; i += 2) {
    const x = points.at(i) ?? 0;
    const y = points.at(i + 1) ?? 0;
    d += `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

/** How far the outline reaches to the right and up, for placing labels. */
export function reach(points: Float32Array) {
  let right = 0;
  let top = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = points.at(i) ?? 0;
    const y = points.at(i + 1) ?? 0;
    if (x > right) right = x;
    if (-y > top) top = -y;
  }
  return { right, top };
}
