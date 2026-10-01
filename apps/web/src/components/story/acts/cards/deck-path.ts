import { CatmullRomCurve3, Vector3 } from "three";

/**
 * A path the deck flies along, sampled once into an arc-length table so a
 * card can be placed at any distance `s` along it in constant time:
 * position, unit tangent, the tangent's angle on screen (unwrapped, so a
 * card rolling with it never jumps a turn) and the screen curvature (for
 * banking). Built from a centripetal Catmull-Rom through control points in
 * the stage frame (x right, y up, z toward the camera); rebuilt on resize.
 */

const SAMPLES = 768;

export class DeckPath {
  /** Total length, metres. */
  length = 0;
  private readonly px = new Float32Array(SAMPLES + 1);
  private readonly py = new Float32Array(SAMPLES + 1);
  private readonly pz = new Float32Array(SAMPLES + 1);
  private readonly tx = new Float32Array(SAMPLES + 1);
  private readonly ty = new Float32Array(SAMPLES + 1);
  private readonly tz = new Float32Array(SAMPLES + 1);
  private readonly roll = new Float32Array(SAMPLES + 1);
  private readonly bend = new Float32Array(SAMPLES + 1);

  /** Samples `points` (stage frame). Returns this. */
  build(points: readonly Vector3[]) {
    const curve = new CatmullRomCurve3(
      points.map((p) => p.clone()),
      false,
      "centripetal",
      0.5,
    );
    this.length = curve.getLength();
    const p = new Vector3();
    const t = new Vector3();
    let previous = 0;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const u = i / SAMPLES;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, t);
      this.px.set([p.x], i);
      this.py.set([p.y], i);
      this.pz.set([p.z], i);
      this.tx.set([t.x], i);
      this.ty.set([t.y], i);
      this.tz.set([t.z], i);
      // The tangent's angle on screen, unwrapped along the path.
      let angle = Math.atan2(t.y, t.x);
      if (i > 0) {
        while (angle - previous > Math.PI) angle -= Math.PI * 2;
        while (angle - previous < -Math.PI) angle += Math.PI * 2;
      }
      previous = angle;
      this.roll.set([angle], i);
    }
    // Curvature on screen: the change of the angle per metre, smoothed over a few samples.
    const ds = this.length / SAMPLES;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const a = this.roll.at(Math.max(0, i - 4)) ?? 0;
      const b = this.roll.at(Math.min(SAMPLES, i + 4)) ?? 0;
      const span = (Math.min(SAMPLES, i + 4) - Math.max(0, i - 4)) * ds;
      this.bend.set([span > 0 ? (b - a) / span : 0], i);
    }
    return this;
  }

  private index(s: number) {
    const f = (Math.max(0, Math.min(this.length, s)) / Math.max(1e-6, this.length)) * SAMPLES;
    const i0 = Math.min(SAMPLES - 1, Math.floor(f));
    return { i0, k: f - i0 };
  }

  /** Position at distance `s` (clamped to the path). */
  point(s: number, out: Vector3) {
    const { i0, k } = this.index(s);
    return out.set(lerpAt(this.px, i0, k), lerpAt(this.py, i0, k), lerpAt(this.pz, i0, k));
  }

  /** Unit tangent at distance `s`. */
  tangent(s: number, out: Vector3) {
    const { i0, k } = this.index(s);
    return out
      .set(lerpAt(this.tx, i0, k), lerpAt(this.ty, i0, k), lerpAt(this.tz, i0, k))
      .normalize();
  }

  /** The tangent's angle on screen (radians, unwrapped along the path). */
  rollAt(s: number) {
    const { i0, k } = this.index(s);
    return lerpAt(this.roll, i0, k);
  }

  /** Signed screen curvature (radians per metre). */
  curvatureAt(s: number) {
    const { i0, k } = this.index(s);
    return lerpAt(this.bend, i0, k);
  }
}

function lerpAt(values: Float32Array, i0: number, k: number) {
  const a = values.at(i0) ?? 0;
  const b = values.at(i0 + 1) ?? a;
  return a + (b - a) * k;
}
