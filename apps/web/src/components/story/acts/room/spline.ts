import { Vector3 } from "three";

/**
 * A path through points at given times: a cubic Hermite with Catmull-Rom
 * tangents that respect uneven key spacing, so speed is continuous across
 * keys. A key may give its own velocity (to start a path exactly where and
 * how another one left off). Before the first key and after the last it
 * holds the end point.
 */

export type TimedKey = Readonly<{ t: number; p: Vector3; v?: Vector3 }>;

export class TimedSpline {
  private readonly keys: TimedKey[];
  private readonly tangents: Vector3[];

  constructor(keys: readonly TimedKey[]) {
    this.keys = [...keys].sort((a, b) => a.t - b.t);
    this.tangents = this.keys.map((key, i) => {
      if (key.v) return key.v.clone();
      const before = i > 0 ? this.keys.at(i - 1) : undefined;
      const after = this.keys.at(i + 1);
      if (!before || !after) return new Vector3();
      return after.p
        .clone()
        .sub(before.p)
        .divideScalar(Math.max(1e-6, after.t - before.t));
    });
  }

  get start() {
    return this.keys.at(0)?.t ?? 0;
  }

  get end() {
    return this.keys.at(-1)?.t ?? 0;
  }

  /** Position at time `t`. */
  at(t: number, out: Vector3) {
    const keys = this.keys;
    const first = keys.at(0);
    const last = keys.at(-1);
    if (!first || !last) return out.set(0, 0, 0);
    if (t <= first.t) return out.copy(first.p);
    if (t >= last.t) return out.copy(last.p);
    let i = 0;
    while (i < keys.length - 2 && (keys.at(i + 1)?.t ?? Infinity) <= t) i += 1;
    const k0 = keys.at(i);
    const k1 = keys.at(i + 1);
    const m0 = this.tangents.at(i);
    const m1 = this.tangents.at(i + 1);
    if (!k0 || !k1 || !m0 || !m1) return out.copy(first.p);
    const dt = Math.max(1e-6, k1.t - k0.t);
    const u = Math.min(1, Math.max(0, (t - k0.t) / dt));
    const u2 = u * u;
    const u3 = u2 * u;
    return out
      .copy(k0.p)
      .multiplyScalar(2 * u3 - 3 * u2 + 1)
      .addScaledVector(m0, (u3 - 2 * u2 + u) * dt)
      .addScaledVector(k1.p, -2 * u3 + 3 * u2)
      .addScaledVector(m1, (u3 - u2) * dt);
  }

  /** Velocity at time `t` (central difference). */
  velocity(t: number, out: Vector3, h = 1 / 120) {
    this.at(t + h, out);
    this.at(t - h, scratch);
    return out.sub(scratch).divideScalar(2 * h);
  }
}

const scratch = new Vector3();
