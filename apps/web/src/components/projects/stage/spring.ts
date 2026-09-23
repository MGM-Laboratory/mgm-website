/**
 * A second-order spring (the "procedural animation" system t3ssel8r
 * popularised, also what lusion.co drives its card focus with), described
 * by three intuitive numbers instead of stiffness/damping:
 *
 * - `f`: natural frequency in Hz (how fast it responds),
 * - `z`: damping ratio (below 1 it overshoots and wobbles),
 * - `r`: initial response (above 1 it overshoots the target's own motion,
 *   which is what gives a snapped target its quick "kick").
 *
 * The coefficients are recomputed per step from the frame's dt with the
 * pole-matching form, so a long frame (tab resume, a hitch) can never make
 * it explode. `settle()` snaps it exactly onto a resting target once the
 * motion is imperceptible, so callers can rely on exact end values (a
 * cover blur must end at exactly 0, never 0.0003).
 */
export class Spring {
  /** Current value. */
  value: number;
  /** Current velocity (units per second). */
  velocity = 0;
  /** Value it springs toward. */
  target: number;

  private previousTarget: number;
  private w = 0;
  private z = 0;
  private d = 0;
  private k1 = 0;
  private k2 = 0;
  private k3 = 0;

  constructor(f: number, z: number, r: number, initial = 0) {
    this.value = initial;
    this.target = initial;
    this.previousTarget = initial;
    this.configure(f, z, r);
  }

  configure(f: number, z: number, r: number) {
    this.w = 2 * Math.PI * f;
    this.z = z;
    this.d = this.w * Math.sqrt(Math.abs(z * z - 1));
    this.k1 = z / (Math.PI * f);
    this.k2 = 1 / (this.w * this.w);
    this.k3 = (r * z) / this.w;
  }

  /**
   * Jumps to `value` at rest. `from` is the target it is treated as having
   * followed until now: pass the old target to get the "kick" toward a new
   * one on the next step (the focus pulse starts that way).
   */
  reset(value: number, from = value) {
    this.value = value;
    this.velocity = 0;
    this.previousTarget = from;
    this.target = from;
  }

  step(dt: number, target = this.target) {
    if (dt <= 0) return this.value;
    this.target = target;
    const targetVelocity = (target - this.previousTarget) / dt;
    this.previousTarget = target;

    let k1 = this.k1;
    let k2: number;
    if (this.w * dt < this.z) {
      // Small steps: clamp k2 so the explicit integration stays stable.
      k2 = Math.max(this.k2, (dt * dt) / 2 + (dt * k1) / 2, dt * k1);
    } else {
      // Large steps: match the continuous system's poles exactly.
      const t = Math.exp(-this.z * this.w * dt);
      const a = 2 * t * (this.z <= 1 ? Math.cos(dt * this.d) : Math.cosh(dt * this.d));
      const b = t * t;
      const q = dt / (1 + b - a);
      k1 = (1 - b) * q;
      k2 = dt * q;
    }

    this.value += dt * this.velocity;
    this.velocity +=
      (dt * (target + this.k3 * targetVelocity - this.value - k1 * this.velocity)) / k2;
    return this.value;
  }

  /**
   * Snaps onto the target once both the offset and the speed are below
   * `epsilon` (in the spring's own units). Returns true when at rest.
   */
  settle(epsilon: number) {
    if (Math.abs(this.value - this.target) < epsilon && Math.abs(this.velocity) < epsilon * 10) {
      this.value = this.target;
      this.velocity = 0;
      this.previousTarget = this.target;
      return true;
    }
    return false;
  }

  get atRest() {
    return this.value === this.target && this.velocity === 0;
  }
}
