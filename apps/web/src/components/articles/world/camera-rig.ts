import { Euler, Quaternion, Vector3, type PerspectiveCamera } from "three";

/**
 * The world camera: it looks at the card plane from `distance` CSS px away
 * (the field of view makes one world unit one CSS px on that plane) and
 * orbits a pivot on it with the mouse, the way unseen.co's list camera
 * does. Because the pivot sits on the cards, they stay nearly anchored
 * under their DOM links while the library behind them swings away from the
 * cursor: the depth reads as real.
 *
 * - Pitch and yaw follow a fast-smoothed mouse (up to 2.0 and 2.9 degrees).
 * - A banking roll follows the lead of the fast mouse over a slow one, so it
 *   shows only while the cursor travels sideways and settles after.
 * - A slow brownian wander keeps a resting camera alive.
 * - Transitions add pure offsets (pan, lift, dolly) on top.
 *
 * Every smoothing is frame-rate independent: a per-60-fps-frame factor k
 * becomes 1 - (1 - k)^(60 dt).
 */

const PITCH = 0.035;
const YAW = 0.05;
const ROLL = 0.05;
const FAST = 0.075;
const SLOW = 0.02;
const WANDER = 0.012;

function ease(k: number, dt: number) {
  return 1 - (1 - k) ** (60 * dt);
}

/** Smooth 1D value noise in [-1, 1] (for the wander). */
function wander(t: number, seed: number) {
  const n = (x: number) => {
    const s = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return (n(i) * (1 - u) + n(i + 1) * u) * 2 - 1;
}

export class CameraRig {
  /** Pointer in [-1, 1], y up (0,0 when the pointer is away). */
  readonly pointer = { x: 0, y: 0 };
  /** Transition offsets, CSS px. */
  readonly offset = new Vector3();
  /** How much the mouse moves the camera: 1 on the list, less on an article. */
  influence = 1;
  enabled = true;

  private fast = { x: 0, y: 0 };
  private slow = { x: 0, y: 0 };
  private time = 0;
  private readonly euler = new Euler(0, 0, 0, "YXZ");
  private readonly q = new Quaternion();
  private readonly v = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    public distance: number,
  ) {}

  update(dt: number) {
    this.time += dt;
    const target = this.enabled ? this.pointer : { x: 0, y: 0 };
    const a = ease(FAST, dt);
    const b = ease(SLOW, dt);
    this.fast.x += (target.x - this.fast.x) * a;
    this.fast.y += (target.y - this.fast.y) * a;
    this.slow.x += (target.x - this.slow.x) * b;
    this.slow.y += (target.y - this.slow.y) * b;

    const k = this.influence;
    const w = this.enabled ? WANDER : 0;
    const pitch = this.fast.y * PITCH * k + wander(this.time * 0.18, 1) * w;
    const yaw = -this.fast.x * YAW * k + wander(this.time * 0.15, 2) * w;
    const roll = -ROLL * (this.fast.x - this.slow.x) * k;

    this.euler.set(pitch, yaw, roll);
    this.q.setFromEuler(this.euler);
    // Orbit the pivot on the card plane: the camera sits `distance` along
    // its own back axis from the pivot.
    this.v.set(0, 0, this.distance).applyQuaternion(this.q);
    this.camera.position.copy(this.v).add(this.offset);
    this.camera.quaternion.copy(this.q);
    this.camera.updateMatrixWorld();
  }

  /** Snaps the smoothing to rest (after a resize or a route jump). */
  settle() {
    this.fast = { x: this.pointer.x, y: this.pointer.y };
    this.slow = { ...this.fast };
  }
}
