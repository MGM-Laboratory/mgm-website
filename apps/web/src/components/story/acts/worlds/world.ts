import {
  Color,
  Matrix4,
  Quaternion,
  Scene,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from "three";

import type {
  StoryContext,
  StoryPointerEvent,
  StoryPostParams,
  StoryTier,
} from "@/components/story/engine/act";

import {
  createLightRig,
  createWorldUniforms,
  type CameraShot,
  type FlightPose,
  type LightRig,
  type WorldUniforms,
} from "./common";

export type WorldId = "paper" | "dunes" | "city" | "leaf" | "edge";

/** How a world is drawn this frame: on screen, or as the view through a rift. */
export type WorldView = "main" | "portal";

/** What a world needs from the act each frame. */
export type WorldFrame = Readonly<{
  /** Course time, vh from the start of the world's own beat (negative during the arrival). */
  T: number;
  /** Life clock seconds (freeze and speed ramps applied). */
  time: number;
  /** The treadmill, metres-ish units of the world's ambient flow. */
  flow: number;
  freeze: number;
  view: WorldView;
  camera: PerspectiveCamera;
}>;

/**
 * One world of Act 3: its own scene (palette, sky, fog, set pieces, light),
 * its course for Godette and its camera grammar. The act walks the course by
 * scroll (`course()` is a pure function of `T`) and lets the world keep its
 * life on the clock (`frame()`).
 *
 * Frames: each world works in its own metres, Y up. The rift beats are
 * authored once in a rift-local frame (rift plane z = 0, travel toward -z);
 * `exit` places the rift a world opens at its end, and `entry` places the
 * far side of the previous rift (or the wormhole's mouth) where it arrives.
 */
export abstract class World {
  abstract readonly id: WorldId;
  readonly scene = new Scene();
  readonly uniforms: WorldUniforms = createWorldUniforms();
  readonly rig: LightRig = createLightRig();
  /** The world's key colour: the light a rift showing it spills on her. */
  abstract readonly key: number;
  /** Rift-local (or wormhole-local) to world: where she arrives. */
  readonly entry = new Matrix4();
  /** Rift-local to world: the rift this world opens at its end (null for the last world). */
  exit: Matrix4 | null = new Matrix4();
  /** Length of the world's own beat in vh, and how far its course runs past it (into its rift, or the fall). */
  abstract readonly length: number;
  protected tier: StoryTier = "high";
  protected readonly geometries: BufferGeometry[] = [];
  protected readonly materials: Material[] = [];
  protected readonly textures: Texture[] = [];
  protected readonly targets: WebGLRenderTarget[] = [];
  private readonly entryRotation = new Quaternion();
  private readonly exitRotation = new Quaternion();

  constructor() {
    this.scene.add(this.rig.group);
    this.scene.matrixWorldAutoUpdate = true;
  }

  /** Builds everything from `ctx.assets`; the act compiles the scene afterwards. */
  abstract build(ctx: StoryContext): Promise<void>;

  /** Her pose and the camera for course time `T` in [0, length], in this world's frame. */
  abstract course(T: number, pose: FlightPose, shot: CameraShot, time: number): void;

  /** Life and per-frame uniforms (sky, fields, set pieces) for course time `T`. */
  abstract frame(ctx: StoryContext, frame: WorldFrame): void;

  /** The world's own post effects (the act adds the crossings' surges on top). */
  post(): Partial<StoryPostParams> {
    return { bloom: 0.5, bloomThreshold: 0.66, bloomRadius: 0.5, vignette: 0.38, grain: 0.18 };
  }

  /**
   * The life clock's rate at course time `T` (a speed ramp: the top of a
   * barrel roll, the hang time before the fall), 1 (real time) when absent.
   * It scales life only (loops, particles, the treadmill), never the scroll
   * mapping.
   */
  timeRate?(T: number): number;

  /** The header's ink over this world at `T` ("dark" over a dark scene, light ink); "dark" when absent. */
  headerTone?(T: number): "light" | "dark";

  /**
   * After she is posed, the scene the stage should render this frame (null:
   * the world's own). A world with its own composite (Leafhold's depth of
   * field) renders `scene` into its target here and hands back a scene that
   * shows the result.
   */
  present?(ctx: StoryContext, camera: PerspectiveCamera): Scene | null;

  /** One draw into each render target the world owns (pipelines are built on a first draw). */
  warmTargets?(renderer: WebGLRenderer, camera: PerspectiveCamera): void;

  /** Targets she is drawn into besides the canvas and the stage's post target (her warm draws). */
  extraTargets?(): readonly WebGLRenderTarget[];

  /** A tap or move while this world is on screen. Return true when consumed. */
  pointer?(ctx: StoryContext, event: StoryPointerEvent, time: number): boolean;

  /** The quality tier changed: counts, sizes and uniforms only (never new programs). */
  setTier(tier: StoryTier) {
    this.tier = tier;
  }

  /** Shows every object for a compile pass, then restores (hidden objects never compile). */
  warm(on: boolean) {
    this.scene.traverse((object: Object3D) => {
      if (on) {
        object.userData.worldsWasVisible = object.visible;
        object.visible = true;
      } else if (typeof object.userData.worldsWasVisible === "boolean") {
        object.visible = object.userData.worldsWasVisible;
        delete object.userData.worldsWasVisible;
      }
    });
  }

  /** `entry` and `exit` from positions and forward directions (rift-local -z maps to `forward`). */
  protected setFrames(
    entryAt: Vector3,
    entryForward: Vector3,
    exitAt: Vector3 | null,
    exitForward: Vector3 | null,
  ) {
    frameMatrix(this.entry, entryAt, entryForward, this.entryRotation);
    if (exitAt && exitForward) {
      this.exit = frameMatrix(this.exit ?? new Matrix4(), exitAt, exitForward, this.exitRotation);
    } else {
      this.exit = null;
    }
  }

  /** A point given in the entry's local frame, in world coordinates. */
  fromEntry(x: number, y: number, z: number, out = new Vector3()) {
    return out.set(x, y, z).applyMatrix4(this.entry);
  }

  /** A point given in the exit rift's local frame, in world coordinates. */
  fromExit(x: number, y: number, z: number, out = new Vector3()) {
    out.set(x, y, z);
    return this.exit ? out.applyMatrix4(this.exit) : out;
  }

  /** The scene's clear colour (the sky's base; alpha 1 so the page never shows through). */
  protected setBackground(hex: number) {
    this.scene.background = new Color(hex);
  }

  dispose() {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const target of this.targets) target.dispose();
    this.rig.spill.dispose();
    this.rig.key.dispose();
    this.rig.hemi.dispose();
    this.scene.clear();
  }
}

const fx = new Vector3();
const fy = new Vector3();
const fz = new Vector3();
const UP = new Vector3(0, 1, 0);

/** A rigid frame at `at` whose local -z points along `forward` (y as close to up as it can). */
export function frameMatrix(
  out: Matrix4,
  at: Vector3,
  forward: Vector3,
  rotation = new Quaternion(),
) {
  fz.copy(forward).normalize().negate();
  fx.crossVectors(UP, fz);
  if (fx.lengthSq() < 1e-6) fx.set(1, 0, 0);
  fx.normalize();
  fy.crossVectors(fz, fx).normalize();
  out.makeBasis(fx, fy, fz);
  rotation.setFromRotationMatrix(out);
  out.setPosition(at);
  return out;
}

const tmpPos = new Vector3();
const tmpTarget = new Vector3();
const tmpHeading = new Vector3();

/** Moves a pose and a shot given in a local frame (rift or wormhole) into a world by `m`. */
export function transformPose(pose: FlightPose, shot: CameraShot | null, m: Matrix4) {
  pose.position.applyMatrix4(m);
  tmpHeading.copy(pose.heading).transformDirection(m);
  pose.heading.copy(tmpHeading);
  const speed = pose.velocity.length();
  if (speed > 1e-6) pose.velocity.transformDirection(m).multiplyScalar(speed);
  if (pose.look) pose.look.applyMatrix4(m);
  if (shot) {
    tmpPos.copy(shot.position).applyMatrix4(m);
    tmpTarget.copy(shot.target).applyMatrix4(m);
    shot.position.copy(tmpPos);
    shot.target.copy(tmpTarget);
  }
}
