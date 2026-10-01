import { Box3, MathUtils, Quaternion, Vector3, type Mesh, type PerspectiveCamera } from "three";

import { saturate, type StoryRect, type StorySize } from "@/components/story/engine/act";
import type { StoryRoom } from "@/components/story/props/room";

/**
 * The table's small physical answers to the pointer, all on the clock and
 * never part of the story state: a damped spring for anything that rocks
 * (her stand, the cup, the pots, the magazine, the TV), the rocking props
 * themselves, and the projection that puts a hotspot over a GL object.
 */

/** A damped angular spring: `kick()` it, `step()` it every frame, read `angle` (radians). */
export class Wobble {
  angle = 0;
  velocity = 0;

  constructor(
    /** Natural frequency, Hz. */
    private readonly frequency: number,
    /** Damping ratio (0.1 rings for a while, 1 settles at once). */
    private readonly damping: number,
  ) {}

  kick(velocity: number) {
    this.velocity += velocity;
  }

  step(dt: number) {
    const w = this.frequency * Math.PI * 2;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      const accel = -w * w * this.angle - 2 * this.damping * w * this.velocity;
      this.velocity += accel * h;
      this.angle += this.velocity * h;
    }
    if (Math.abs(this.angle) < 1e-5 && Math.abs(this.velocity) < 1e-4) {
      this.angle = 0;
      this.velocity = 0;
    }
    return this.angle;
  }

  reset() {
    this.angle = 0;
    this.velocity = 0;
  }

  get resting() {
    return this.angle === 0 && this.velocity === 0;
  }
}

const UP = new Vector3(0, 1, 0);
const corner = new Vector3();

/**
 * The CSS px rect (canvas space) that `box` covers on screen, grown to at
 * least `min` px each way, or null when it is behind the camera or off the
 * frame. `camera` must have this frame's matrices.
 */
export function projectBox(
  box: Box3,
  camera: PerspectiveCamera,
  size: StorySize,
  min = 44,
): StoryRect | null {
  if (box.isEmpty()) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < 8; i += 1) {
    corner.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    );
    corner.applyMatrix4(camera.matrixWorldInverse);
    // Any corner behind the lens: too close to place a sensible rect.
    if (corner.z > -camera.near) return null;
    corner.applyMatrix4(camera.projectionMatrix);
    const x = (corner.x * 0.5 + 0.5) * size.width;
    const y = (0.5 - corner.y * 0.5) * size.height;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return clipRect(x0, y0, x1, y1, size, min);
}

/** A rect `min` px square round a point in the room, or null off the frame. */
export function projectPoint(
  point: Vector3,
  camera: PerspectiveCamera,
  size: StorySize,
  min = 44,
): StoryRect | null {
  corner.copy(point).applyMatrix4(camera.matrixWorldInverse);
  if (corner.z > -camera.near) return null;
  corner.applyMatrix4(camera.projectionMatrix);
  const x = (corner.x * 0.5 + 0.5) * size.width;
  const y = (0.5 - corner.y * 0.5) * size.height;
  return clipRect(x, y, x, y, size, min);
}

function clipRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: StorySize,
  min: number,
): StoryRect | null {
  // Grow to the minimum target, then keep what is on screen.
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = Math.max(min, x1 - x0);
  const h = Math.max(min, y1 - y0);
  const left = Math.max(0, cx - w / 2);
  const top = Math.max(0, cy - h / 2);
  const right = Math.min(size.width, cx + w / 2);
  const bottom = Math.min(size.height, cy + h / 2);
  if (right - left < 8 || bottom - top < 8) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

type PropSpec = Readonly<{ name: string; frequency: number; damping: number; hover: number }>;

/** The props on the table that answer a hover with a rock, and how each one moves. */
const TABLE_PROPS: readonly PropSpec[] = [
  { name: "coffee_table_cup_saucer", frequency: 4.2, damping: 0.16, hover: 0.5 },
  { name: "coffee_table_pot_A", frequency: 2.6, damping: 0.12, hover: 0.35 },
  { name: "coffee_table_pot_B", frequency: 2.4, damping: 0.12, hover: 0.35 },
  { name: "coffee_table_pot_C", frequency: 2.8, damping: 0.12, hover: 0.35 },
  { name: "coffee_table_magazine", frequency: 3.4, damping: 0.3, hover: 0.25 },
];

type Prop = {
  readonly mesh: Mesh;
  readonly spec: PropSpec;
  readonly wobble: Wobble;
  /** Its resting place (the base's middle). */
  readonly home: Vector3;
  readonly axis: Vector3;
  hovered: boolean;
};

/**
 * The rocking things of the room: the props on the table (each about the
 * middle of its base, rolling onto the rim it tips toward) and the TV (the
 * body and the screen together, about the body's base). Only the nodes the
 * room lets an act move (`room.handles`) take part, so on the low tier,
 * where the table's props and the TV's body are merged, nothing rocks.
 */
export class RoomProps {
  private readonly props: Prop[] = [];
  private readonly list: Mesh[] = [];
  private readonly tvBody: Mesh | null;
  private readonly tvScreen: Mesh | null;
  private readonly tvBodyHome = new Vector3();
  private readonly tvScreenHome = new Vector3();
  readonly tv = new Wobble(3.1, 0.16);
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly tvAxis: Vector3;
  private readonly box = new Box3();

  constructor(private readonly room: StoryRoom) {
    for (const spec of TABLE_PROPS) {
      const mesh = room.handles.has(spec.name) ? room.nodes.get(spec.name) : undefined;
      if (!mesh) continue;
      this.props.push({
        mesh,
        spec,
        wobble: new Wobble(spec.frequency, spec.damping),
        home: mesh.position.clone(),
        axis: new Vector3(1, 0, 0),
        hovered: false,
      });
      this.list.push(mesh);
    }
    this.tvBody = room.handles.has("tv_body") ? (room.nodes.get("tv_body") ?? null) : null;
    this.tvScreen = room.handles.has("tv_screen") ? room.screen : null;
    if (this.tvBody) this.tvBodyHome.copy(this.tvBody.position);
    if (this.tvScreen) this.tvScreenHome.copy(this.tvScreen.position);
    this.tvAxis = new Vector3(...room.anchors.tv.normal).normalize();
  }

  /** The meshes a ray may hit. */
  get meshes(): Mesh[] {
    return this.list;
  }

  /** Marks the prop `mesh` as hovered (null: none), kicking it once on entry. */
  hover(mesh: Mesh | null, eye: Vector3) {
    for (const prop of this.props) {
      const now = prop.mesh === mesh;
      if (now && !prop.hovered) this.knock(prop, eye, prop.spec.hover);
      prop.hovered = now;
    }
  }

  /** A click: a firmer knock. True when `mesh` is one of the props. */
  tap(mesh: Mesh | null, eye: Vector3) {
    const prop = this.props.find((one) => one.mesh === mesh);
    if (!prop) return false;
    this.knock(prop, eye, 1);
    return true;
  }

  /**
   * A knock on the TV (`strength` 1 is a good smack). Only with its body: where the room merged the
   * set into one mesh (the low tier keeps only the screen as a handle) the screen would rock alone
   * inside a bezel that stays put, so the set takes the knock without moving.
   */
  knockTv(strength: number) {
    if (!this.tvBody) return;
    this.tv.kick(MathUtils.degToRad(14) * strength * (this.tv.velocity >= 0 ? 1 : -1));
  }

  private knock(prop: Prop, eye: Vector3, strength: number) {
    // It rocks side to side as the camera sees it: about the horizontal line of sight.
    prop.axis.copy(prop.home).sub(eye).setY(0);
    if (prop.axis.lengthSq() < 1e-6) prop.axis.set(1, 0, 0);
    prop.axis.normalize();
    const side = prop.wobble.velocity >= 0 ? 1 : -1;
    prop.wobble.kick(MathUtils.degToRad(70) * strength * side);
  }

  /**
   * Steps every spring and writes the transforms. `calm` (0..1) eases the
   * TV back to rest when its position must be exact (the dive).
   */
  update(dt: number, calm: number) {
    for (const prop of this.props) {
      const angle = prop.wobble.step(dt);
      const mesh = prop.mesh;
      if (angle === 0 && prop.wobble.resting) {
        mesh.position.copy(prop.home);
        mesh.quaternion.identity();
        continue;
      }
      // Roll on the rim it tips toward (the base's half width along the tip).
      this.box.copy(mesh.geometry.boundingBox ?? this.box.makeEmpty());
      const half = this.box.isEmpty() ? 0.02 : (this.box.max.x - this.box.min.x) * 0.5;
      const tipSide = this.v.crossVectors(prop.axis, UP).normalize();
      const pivotShift = tipSide.multiplyScalar(Math.sign(angle) * half * 0.8);
      this.q.setFromAxisAngle(prop.axis, angle);
      mesh.quaternion.copy(this.q);
      // position = pivot + R (home - pivot), pivot = home + shift.
      mesh.position
        .copy(pivotShift)
        .negate()
        .applyQuaternion(this.q)
        .add(prop.home)
        .add(pivotShift);
    }
    const tvAngle = this.tv.step(dt) * (1 - saturate(calm));
    this.placeTv(tvAngle);
  }

  private placeTv(angle: number) {
    const body = this.tvBody;
    const screen = this.tvScreen;
    if (!body) return;
    const pivot = this.tvBodyHome;
    this.q.setFromAxisAngle(this.tvAxis, angle);
    if (body) body.quaternion.copy(this.q);
    if (screen) {
      screen.quaternion.copy(this.q);
      screen.position.copy(this.tvScreenHome).sub(pivot).applyQuaternion(this.q).add(pivot);
    }
  }

  /** Everything home, every spring at rest. */
  reset() {
    for (const prop of this.props) {
      prop.wobble.reset();
      prop.hovered = false;
      prop.mesh.position.copy(prop.home);
      prop.mesh.quaternion.identity();
    }
    this.tv.reset();
    this.placeTv(0);
  }

  /** A room-frame box round the TV screen, for its hotspot. */
  screenBox(out: Box3) {
    const c = this.room.anchors.tv.corners;
    out.makeEmpty();
    for (const p of [c.tl, c.tr, c.br, c.bl]) out.expandByPoint(this.v.set(p[0], p[1], p[2]));
    return out;
  }
}
