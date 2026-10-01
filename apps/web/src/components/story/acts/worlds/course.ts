import { CatmullRomCurve3, Vector3 } from "three";

/**
 * A flight course: a smooth curve through control points, walked by arc
 * length so equal steps of progress are equal distances. Gives the position,
 * the tangent and the turn (signed curvature about the world up, positive
 * into a right turn, for banking) at any point. Pure: the same `u` is always
 * the same place.
 */
export class Course {
  readonly curve: CatmullRomCurve3;
  readonly length: number;

  constructor(points: readonly Vector3[], tension = 0.5) {
    this.curve = new CatmullRomCurve3(
      points.map((point) => point.clone()),
      false,
      "centripetal",
      tension,
    );
    this.curve.arcLengthDivisions = Math.max(200, points.length * 40);
    this.curve.updateArcLengths();
    this.length = this.curve.getLength();
  }

  /** Position at arc-length share `u` (clamped to 0..1). */
  at(u: number, out: Vector3) {
    return this.curve.getPointAt(clamp01(u), out);
  }

  /** Unit tangent at `u`. */
  tangent(u: number, out: Vector3) {
    return this.curve.getTangentAt(clamp01(u), out);
  }

  /**
   * Signed curvature about +Y at `u`, 1/metres: positive when the course
   * bends to the right of the travel direction.
   */
  turn(u: number) {
    const h = Math.min(0.02, 4 / Math.max(1, this.length));
    const a = clamp01(u - h);
    const b = clamp01(u + h);
    if (b - a < 1e-6) return 0;
    this.curve.getTangentAt(a, ta);
    this.curve.getTangentAt(b, tb);
    tc.crossVectors(ta, tb);
    const ds = (b - a) * this.length;
    return -tc.y / Math.max(1e-4, ds);
  }

  /**
   * Bank for a turn flown at `speed` m/s: atan(v^2 k / g), scaled for
   * style (research/inspiration.md 5.2) and clamped.
   */
  bank(u: number, speed: number, style = 0.6, max = 1.1) {
    const k = this.turn(u);
    const angle = Math.atan((speed * speed * k) / 9.81) * style;
    return angle > max ? max : angle < -max ? -max : angle;
  }
}

/**
 * Walking a course in course time `T` (vh) with a speed profile in metres
 * per vh. The profile is corrected by a bump that is zero at both ends, so
 * the walk covers the course exactly while the speeds at the ends (where it
 * meets the arrival and the rift) stay as given.
 */
export class Walk {
  private readonly table: Float32Array;
  private readonly steps: number;

  constructor(
    readonly course: Course,
    readonly length: number,
    profile: (T: number) => number,
  ) {
    const steps = 400;
    this.steps = steps;
    const dt = length / steps;
    let total = 0;
    let bumps = 0;
    for (let i = 0; i < steps; i += 1) {
      const T = (i + 0.5) * dt;
      total += profile(T) * dt;
      bumps += bump(T, length) * dt;
    }
    const k = bumps > 0 ? (course.length - total) / bumps : 0;
    this.table = new Float32Array(steps + 1);
    let d = 0;
    for (let i = 0; i < steps; i += 1) {
      const T = (i + 0.5) * dt;
      d += Math.max(0.2, profile(T) + k * bump(T, length)) * dt;
      this.table.set([d], i + 1);
    }
    this.scale = course.length / Math.max(1e-6, d);
    this.profile = (T: number) => (profile(T) + k * bump(T, length)) * this.scale;
  }

  private readonly scale: number;
  /** The corrected speed at `T`, metres per vh. */
  readonly profile: (T: number) => number;

  /** Distance walked at `T` (clamped to the course). */
  distance(T: number) {
    const x = (Math.min(this.length, Math.max(0, T)) / this.length) * this.steps;
    const i = Math.min(this.steps - 1, Math.floor(x));
    const f = x - i;
    const a = this.table.at(i) ?? 0;
    const b = this.table.at(i + 1) ?? a;
    return (a + (b - a) * f) * this.scale;
  }

  /** Arc-length share at `T`. */
  u(T: number) {
    return this.distance(T) / Math.max(1e-6, this.course.length);
  }
}

function bump(T: number, length: number) {
  const s = Math.sin((Math.PI * T) / length);
  return s * s;
}

const ta = new Vector3();
const tb = new Vector3();
const tc = new Vector3();

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
