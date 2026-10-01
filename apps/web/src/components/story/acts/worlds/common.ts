import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  LinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PointLight,
  Quaternion,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type IUniform,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from "three";

import type { StoryContext, StoryTier } from "@/components/story/engine/act";
import type { GodetteClip, GodetteFace } from "@/components/story/props/godette";

/**
 * Pieces every world of Act 3 shares: the pose and shot records the
 * choreography passes around, the light rig (the same in every scene, so
 * Godette compiles one program set), the GLSL helpers, the render targets
 * and the life clock.
 *
 * Colour rule for every shader in this act: inputs are linear (three's
 * `Color.setHex` converts the brand hex), the shader ends with
 * `linearToOutputTexel(...)` and the material is `toneMapped: false`. On the
 * canvas and on the display targets below that lands the brand hex exactly;
 * in a plain sRGB target (the TV feed) it stays linear, which is what that
 * storage expects. A shader that samples a display target writes the sample
 * as it is (it already holds display bytes).
 */

// ------------------------------------------------------------------ records

/** One body layer for Godette this frame (the same shape as `GodetteBodyLayer`). */
export type FlightLayer = {
  clip: GodetteClip;
  weight: number;
  time?: number;
  progress?: number;
};

/** Everything that places and poses Godette in one frame, in the current world's frame. */
export type FlightPose = {
  /** Her root (between her feet). */
  position: Vector3;
  /** Unit travel direction: her root's +Z faces it. */
  heading: Vector3;
  /** Pivot pitch, radians (about 1.4 for the prone glides). */
  pitch: number;
  /** Roll of the root about the heading (a barrel roll), radians. */
  roll: number;
  /** Extra yaw of the root about its up axis (the skim stance), radians. */
  yaw: number;
  /** Spin of the pivot about her long axis (the play spin), radians. */
  spin: number;
  /** `setFlight` bank, radians (+ into a right turn). */
  bank: number;
  /** `setFlight` extra pitch, radians. */
  lean: number;
  /** Relative wind for her hair, units per second. */
  velocity: Vector3;
  /** Flight sway, 0..1. */
  sway: number;
  layers: FlightLayer[];
  face: GodetteFace | "auto";
  faceWeight: number;
  glow: number;
  glowColor: number;
  rim: number;
  rimColor: number;
  lift: number;
  /** Where her eyes go (null: ahead); `lookWeight` is the head's share. */
  look: Vector3 | null;
  lookWeight: number;
  /** Nervous life, 0..1 (blinks, darts). */
  nervous: number;
  /** Visible at all (false during a crossing she is not part of). */
  visible: boolean;
};

export function createPose(): FlightPose {
  return {
    position: new Vector3(),
    heading: new Vector3(0, 0, -1),
    pitch: 0,
    roll: 0,
    yaw: 0,
    spin: 0,
    bank: 0,
    lean: 0,
    velocity: new Vector3(),
    sway: 1,
    layers: [],
    face: "auto",
    faceWeight: 1,
    glow: 1,
    glowColor: 0xf7bf33,
    rim: 0.6,
    rimColor: 0xffffff,
    lift: 0.08,
    look: null,
    lookWeight: 0,
    nervous: 0,
    visible: true,
  };
}

/** A camera for one frame: where it is, what it looks at, lens and life. */
export type CameraShot = {
  position: Vector3;
  target: Vector3;
  /** Vertical FOV, degrees. */
  fov: number;
  /** Dutch roll about the view axis, radians. */
  roll: number;
  /** Handheld noise amplitude, radians. */
  shake: number;
  /** How far the cursor steers the view, radians. */
  look: number;
  /**
   * 0..1: how much a narrow (portrait) viewport widens the lens. Shots are
   * authored on 16:9; at 1 a phone held upright sees the same subject with
   * a taller lens (`portraitFov`), at 0 the lens is exactly `fov` (the
   * wormhole's first frame must match the TV's crop).
   */
  widen: number;
  /** Her centre this frame (the act fills it in): a narrow screen aims part way toward it. */
  subject: Vector3;
  /** 0..1: how much a narrow screen pulls the aim toward `subject` (0 lets her leave frame). */
  hold: number;
};

export function createShot(): CameraShot {
  return {
    position: new Vector3(0, 0, 5),
    target: new Vector3(),
    fov: 45,
    roll: 0,
    shake: 0,
    look: 0.03,
    widen: 1,
    subject: new Vector3(),
    hold: 1,
  };
}

export function copyShot(out: CameraShot, from: CameraShot) {
  out.position.copy(from.position);
  out.target.copy(from.target);
  out.fov = from.fov;
  out.roll = from.roll;
  out.shake = from.shake;
  out.look = from.look;
  out.widen = from.widen;
  out.subject.copy(from.subject);
  out.hold = from.hold;
  return out;
}

/** `out = mix(a, b, w)`: positions and targets on straight lines, lens and roll linearly. */
export function mixShot(out: CameraShot, a: CameraShot, b: CameraShot, w: number) {
  out.position.lerpVectors(a.position, b.position, w);
  out.target.lerpVectors(a.target, b.target, w);
  out.fov = a.fov + (b.fov - a.fov) * w;
  out.roll = a.roll + (b.roll - a.roll) * w;
  out.shake = a.shake + (b.shake - a.shake) * w;
  out.look = a.look + (b.look - a.look) * w;
  out.widen = a.widen + (b.widen - a.widen) * w;
  out.subject.lerpVectors(a.subject, b.subject, w);
  out.hold = a.hold + (b.hold - a.hold) * w;
  return out;
}

/**
 * The chase every crossing ends on (the rifts, the wormhole) and every world
 * starts from: `back` metres behind her along her heading, `up` above her
 * root, looking `ahead` metres past her.
 */
export const ARRIVAL_CHASE = { back: 13, up: 0.9, ahead: 1, lift: 0.1, fov: 50 } as const;

const chaseUp = new Vector3(0, 1, 0);

export function chaseShot(
  out: CameraShot,
  her: Vector3,
  heading: Vector3,
  back: number = ARRIVAL_CHASE.back,
  up: number = ARRIVAL_CHASE.up,
  ahead: number = ARRIVAL_CHASE.ahead,
  fov: number = ARRIVAL_CHASE.fov,
) {
  out.position.copy(her).addScaledVector(heading, -back).addScaledVector(chaseUp, up);
  out.target.copy(her).addScaledVector(heading, ahead).addScaledVector(chaseUp, ARRIVAL_CHASE.lift);
  out.fov = fov;
  return out;
}

/** Copies `from` into `out` (layers by value). */
export function copyPose(out: FlightPose, from: FlightPose) {
  out.position.copy(from.position);
  out.heading.copy(from.heading);
  out.pitch = from.pitch;
  out.roll = from.roll;
  out.yaw = from.yaw;
  out.spin = from.spin;
  out.bank = from.bank;
  out.lean = from.lean;
  out.velocity.copy(from.velocity);
  out.sway = from.sway;
  out.layers = from.layers.map((layer) => ({ ...layer }));
  out.face = from.face;
  out.faceWeight = from.faceWeight;
  out.glow = from.glow;
  out.glowColor = from.glowColor;
  out.rim = from.rim;
  out.rimColor = from.rimColor;
  out.lift = from.lift;
  out.look = from.look ? from.look.clone() : null;
  out.lookWeight = from.lookWeight;
  out.nervous = from.nervous;
  out.visible = from.visible;
  return out;
}

const mixColour = new Color();
const mixColourB = new Color();

function mixHex(a: number, b: number, w: number) {
  if (a === b) return a;
  return mixColour.setHex(a).lerp(mixColourB.setHex(b), w).getHex();
}

/**
 * `out = mix(a, b, w)`. Body layers are concatenated with their weights
 * scaled (Godette's weights are relative); a clip present in both keeps the
 * timing of the side that weighs more. The face and the look follow the
 * heavier side.
 */
export function mixPose(out: FlightPose, a: FlightPose, b: FlightPose, w: number) {
  const k = w < 0 ? 0 : w > 1 ? 1 : w;
  out.position.lerpVectors(a.position, b.position, k);
  out.heading.lerpVectors(a.heading, b.heading, k);
  if (out.heading.lengthSq() < 1e-8) out.heading.copy(b.heading);
  out.heading.normalize();
  out.pitch = a.pitch + (b.pitch - a.pitch) * k;
  out.roll = a.roll + (b.roll - a.roll) * k;
  out.yaw = a.yaw + (b.yaw - a.yaw) * k;
  out.spin = a.spin + (b.spin - a.spin) * k;
  out.bank = a.bank + (b.bank - a.bank) * k;
  out.lean = a.lean + (b.lean - a.lean) * k;
  out.velocity.lerpVectors(a.velocity, b.velocity, k);
  out.sway = a.sway + (b.sway - a.sway) * k;
  const merged = new Map<GodetteClip, FlightLayer>();
  const add = (layer: FlightLayer, scale: number) => {
    const weight = layer.weight * scale;
    if (weight <= 1e-4) return;
    const seen = merged.get(layer.clip);
    if (!seen) {
      merged.set(layer.clip, { ...layer, weight });
      return;
    }
    const heavier = weight > seen.weight ? layer : seen;
    merged.set(layer.clip, {
      clip: layer.clip,
      weight: seen.weight + weight,
      time: heavier.time,
      progress: heavier.progress,
    });
  };
  for (const layer of a.layers) add(layer, 1 - k);
  for (const layer of b.layers) add(layer, k);
  out.layers = [...merged.values()];
  const lead = k < 0.5 ? a : b;
  out.face = lead.face;
  out.faceWeight = lead.faceWeight;
  out.glow = a.glow + (b.glow - a.glow) * k;
  out.glowColor = mixHex(a.glowColor, b.glowColor, k);
  out.rim = a.rim + (b.rim - a.rim) * k;
  out.rimColor = mixHex(a.rimColor, b.rimColor, k);
  out.lift = a.lift + (b.lift - a.lift) * k;
  out.look = lead.look ? lead.look.clone() : null;
  out.lookWeight = a.lookWeight + (b.lookWeight - a.lookWeight) * k;
  out.nervous = a.nervous + (b.nervous - a.nervous) * k;
  out.visible = lead.visible;
  return out;
}

/**
 * One shot of a world's camera grammar: from `at` (course time, vh), easing
 * in over `blend` before it. With `pivot`, the move into this shot swings
 * around that point (her) instead of a straight line, so a camera going from
 * behind her to ahead of her circles her rather than passing through her.
 */
export type ShotKey = Readonly<{
  at: number;
  blend: number;
  shot: (T: number, out: CameraShot) => void;
  pivot?: (T: number, out: Vector3) => Vector3;
}>;

const orbitA = new Vector3();
const orbitB = new Vector3();
const orbitC = new Vector3();
const orbitAxis = new Vector3();
const orbitQ = new Quaternion();

/** Like `mixShot`, with the camera position swung around `pivot` (slerp of the offsets, radius mixed). */
export function orbitShot(
  out: CameraShot,
  a: CameraShot,
  b: CameraShot,
  w: number,
  pivot: Vector3,
) {
  orbitA.copy(a.position).sub(pivot);
  orbitB.copy(b.position).sub(pivot);
  const ra = orbitA.length();
  const rb = orbitB.length();
  mixShot(out, a, b, w);
  if (ra < 1e-4 || rb < 1e-4) return out;
  orbitA.divideScalar(ra);
  orbitB.divideScalar(rb);
  const angle = Math.acos(Math.min(1, Math.max(-1, orbitA.dot(orbitB))));
  orbitAxis.crossVectors(orbitA, orbitB);
  if (orbitAxis.lengthSq() < 1e-8) orbitAxis.set(0, 1, 0);
  orbitAxis.normalize();
  orbitQ.setFromAxisAngle(orbitAxis, angle * w);
  orbitC
    .copy(orbitA)
    .applyQuaternion(orbitQ)
    .multiplyScalar(ra + (rb - ra) * w);
  out.position.copy(pivot).add(orbitC);
  return out;
}

/**
 * A world's shots in order. Between two keys the camera eases from one to
 * the next over the later key's `blend` (both shots keep moving while they
 * mix), so a world reads as a sequence of camera moves without any cut.
 */
export class ShotTrack {
  private readonly a = createShot();
  private readonly b = createShot();
  private readonly pivot = new Vector3();

  constructor(private readonly keys: readonly ShotKey[]) {}

  sample(T: number, out: CameraShot) {
    let index = 0;
    this.keys.forEach((key, i) => {
      if (T >= key.at) index = i;
    });
    const current = this.keys.at(index);
    if (!current) return out;
    current.shot(T, this.a);
    const next = this.keys.at(index + 1);
    if (next && T > next.at - next.blend) {
      next.shot(T, this.b);
      const w = ease01(T, next.at - next.blend, next.at);
      if (next.pivot) return orbitShot(out, this.a, this.b, w, next.pivot(T, this.pivot));
      return mixShot(out, this.a, this.b, w);
    }
    return copyShot(out, this.a);
  }
}

// ------------------------------------------------------------------ life

/**
 * The act's life clock. `time` is visible time scaled by the freeze (press
 * and hold runs life at 0.3x); `flow` is the treadmill: it runs in the last
 * input direction, so a world keeps flowing past while nobody scrolls. It
 * advances at most once per stage frame, whoever asks first (the act, or the
 * TV feed the table act draws).
 */
export class LifeClock {
  time = 0;
  flow = 0;
  /** Seconds of this frame's step, after the freeze and any speed ramp. */
  dt = 0;
  private stamp = -1;

  advance(ctx: StoryContext, rate = 1) {
    if (ctx.clock.time === this.stamp) return;
    this.stamp = ctx.clock.time;
    this.dt = ctx.clock.storyDt * rate;
    this.time += this.dt;
    this.flow += this.dt * ctx.director.direction;
  }
}

// ------------------------------------------------------------------ light rig

export type LightRig = {
  readonly group: Group;
  readonly hemi: HemisphereLight;
  readonly key: DirectionalLight;
  readonly spill: PointLight;
};

/**
 * The same three lights in every scene of the act (sky and ground fill, a
 * key, and the rift's light spill), on every layer, so Godette's material
 * compiles once for all of them. Only colours, intensities and positions
 * change between worlds.
 */
export function createLightRig(): LightRig {
  const group = new Group();
  group.name = "worlds-light-rig";
  const hemi = new HemisphereLight(0xffffff, 0x404050, 1);
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(3, 5, 4);
  const spill = new PointLight(0xffffff, 0, 30, 1.6);
  spill.position.set(0, 0, -8);
  group.add(hemi, key, key.target, spill);
  for (const light of [hemi, key, spill]) light.layers.enableAll();
  return { group, hemi, key, spill };
}

// ------------------------------------------------------------------ targets

/**
 * A target that behaves like the canvas (the spine's post target recipe:
 * three's XR flag, plain RGBA8, sRGB tag): lit materials are tone mapped and
 * encoded with the same programs as the direct path, so a world rendered
 * here needs no extra compile and looks the same as on screen. Sample it
 * and write the bytes as they are.
 */
export function createDisplayTarget(width: number, height: number, depth = true) {
  const target = new WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: UnsignedByteType,
    samples: 0,
    depthBuffer: depth,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
  });
  target.texture.colorSpace = SRGBColorSpace;
  target.texture.internalFormat = "RGBA8";
  Object.assign(target, { isXRRenderTarget: true });
  return target;
}

/** A big triangle that covers the screen in clip space (no camera needed). */
export function fullscreenGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  return geometry;
}

const SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

/**
 * A screen-covering layer drawn first, behind everything (a world's
 * background rendered at half resolution into a display target, upscaled
 * here). It writes the target's bytes as they are.
 */
export function createScreenLayer(geometry: BufferGeometry, texture: Texture | null = null) {
  const material = new ShaderMaterial({
    vertexShader: SCREEN_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0);
      }
    `,
    uniforms: { tMap: { value: texture } },
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, material };
}

/** A full-screen shader pass for a target (its own scene-less draw). */
export function createScreenPass(
  geometry: BufferGeometry,
  fragmentShader: string,
  uniforms: Record<string, IUniform>,
) {
  const material = new ShaderMaterial({
    vertexShader: SCREEN_VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

const SKY_VERTEX = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const skyRot = new Matrix3();

/**
 * A world's sky (and anything else seen along a view ray: a far sea, a
 * lensed disk) drawn first, behind everything, at full resolution. `body`
 * defines `vec3 skyColour(vec3 dir)` in linear colour; it may read `uCamPos`
 * (the camera, world frame). `aim(camera)` once a frame before the render.
 */
export function createSkyLayer(
  geometry: BufferGeometry,
  body: string,
  uniforms: Record<string, IUniform>,
) {
  const all: Record<string, IUniform> = {
    ...uniforms,
    uCamRot: { value: new Matrix3() },
    uTan: { value: new Vector2(1, 1) },
    uCamPos: { value: new Vector3() },
  };
  const material = new ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: /* glsl */ `
      uniform mat3 uCamRot;
      uniform vec2 uTan;
      uniform vec3 uCamPos;
      varying vec2 vNdc;
      ${body}
      void main() {
        vec3 dir = normalize(uCamRot * vec3(vNdc.x * uTan.x, vNdc.y * uTan.y, -1.0));
        gl_FragColor = linearToOutputTexel(vec4(skyColour(dir), 1.0));
      }
    `,
    uniforms: all,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  const aim = (camera: PerspectiveCamera) => {
    camera.updateMatrixWorld();
    skyRot.setFromMatrix4(camera.matrixWorld);
    (all.uCamRot.value as Matrix3).copy(skyRot);
    const tanV = Math.tan((camera.fov * Math.PI) / 360) / Math.max(1e-3, camera.zoom);
    (all.uTan.value as Vector2).set(tanV * camera.aspect, tanV);
    (all.uCamPos.value as Vector3).copy(camera.position);
  };
  return { mesh, material, uniforms: all, aim };
}

/**
 * A world's expensive background (a lensed black hole, a sky full of
 * moving light) drawn by a full-screen shader at a share of the canvas
 * resolution into a display target, and shown in the world's scene by a
 * screen layer behind everything (`layer`). Two targets, so the world can
 * be on screen (`main`) or seen through a rift (`portal`, smaller) without
 * reallocating. The shader gets the camera as `uCamRot` (camera to world),
 * `uTan` (tan of the half FOVs), `uCamPos` and `uPix` (one output pixel's
 * angle); it ends with `linearToOutputTexel`. Call `draw()` once a frame
 * from the world's `frame()`, with the camera that will render the scene.
 */
export class BackgroundPass {
  readonly layer: { mesh: Mesh; material: ShaderMaterial };
  readonly material: ShaderMaterial;
  readonly uniforms: Record<string, IUniform>;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly main: WebGLRenderTarget;
  private readonly portal: WebGLRenderTarget;
  private readonly state = new RendererState();

  constructor(
    geometry: BufferGeometry,
    fragmentShader: string,
    uniforms: Record<string, IUniform>,
  ) {
    this.uniforms = {
      ...uniforms,
      uCamRot: { value: new Matrix3() },
      uTan: { value: new Vector2(1, 1) },
      uCamPos: { value: new Vector3() },
      uPix: { value: 0.002 },
    };
    const pass = createScreenPass(geometry, fragmentShader, this.uniforms);
    this.material = pass.material;
    this.scene.add(pass.mesh);
    this.main = createDisplayTarget(2, 2, false);
    this.portal = createDisplayTarget(2, 2, false);
    this.layer = createScreenLayer(geometry, this.main.texture);
  }

  /** Renders the background for `camera` into the view's target and points the layer at it. */
  draw(ctx: StoryContext, camera: PerspectiveCamera, view: "main" | "portal", scale: number) {
    const target = view === "main" ? this.main : this.portal;
    const size = scaledSize(ctx, scale);
    if (target.width !== size.width || target.height !== size.height) {
      target.setSize(size.width, size.height);
    }
    camera.updateMatrixWorld();
    skyRot.setFromMatrix4(camera.matrixWorld);
    const u = this.uniforms;
    (u.uCamRot.value as Matrix3).copy(skyRot);
    const tanV = Math.tan((camera.fov * Math.PI) / 360) / Math.max(1e-3, camera.zoom);
    (u.uTan.value as Vector2).set(tanV * camera.aspect, tanV);
    (u.uCamPos.value as Vector3).copy(camera.position);
    u.uPix.value = (2 * tanV) / Math.max(64, size.height);
    this.render(ctx.stage.renderer, target);
    this.layer.material.uniforms.tMap.value = target.texture;
  }

  /** One draw into each target (pipelines are built on a first draw), for the loader. */
  warm(renderer: WebGLRenderer) {
    this.render(renderer, this.main);
    this.render(renderer, this.portal);
  }

  private render(renderer: WebGLRenderer, target: WebGLRenderTarget) {
    this.state.save(renderer);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
    this.state.restore(renderer);
  }

  dispose() {
    this.material.dispose();
    this.layer.material.dispose();
    this.main.dispose();
    this.portal.dispose();
  }
}

/** Everything a render into a target changes, so a draw inside another act's frame leaves no trace. */
export class RendererState {
  private target: WebGLRenderTarget | null = null;
  private readonly clear = new Color();
  private alpha = 0;
  private autoClear = false;
  private exposure = 1;
  private readonly viewport = new Vector2();

  save(renderer: WebGLRenderer) {
    this.target = renderer.getRenderTarget();
    renderer.getClearColor(this.clear);
    this.alpha = renderer.getClearAlpha();
    this.autoClear = renderer.autoClear;
    this.exposure = renderer.toneMappingExposure;
    renderer.getSize(this.viewport);
  }

  restore(renderer: WebGLRenderer) {
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(this.clear, this.alpha);
    renderer.autoClear = this.autoClear;
    renderer.toneMappingExposure = this.exposure;
  }
}

/** Device pixels for a share of the canvas, at least 2 x 2. */
export function scaledSize(ctx: StoryContext, scale: number) {
  const { width, height, dpr } = ctx.size;
  return {
    width: Math.max(2, Math.round(width * dpr * scale)),
    height: Math.max(2, Math.round(height * dpr * scale)),
  };
}

/** Half-resolution share for full-screen shaders by tier. */
export function backgroundScale(tier: StoryTier) {
  return tier === "low" ? 0.42 : tier === "medium" ? 0.5 : 0.6;
}

// ------------------------------------------------------------------ uniforms

/**
 * Uniforms every world shader shares (one object per world, the same
 * references in each of its materials): the life clock, the freeze, the
 * treadmill, the pointer and the drawing buffer.
 */
export type WorldUniforms = {
  uTime: IUniform<number>;
  uFreeze: IUniform<number>;
  uFlow: IUniform<number>;
  /** Pointer over the canvas in NDC, and how present it is (0 when it left). */
  uPointer: IUniform<Vector3>;
  /** The last tap: world position and the life time it happened. */
  uTap: IUniform<Vector3>;
  uTapTime: IUniform<number>;
  /** Drawing buffer size, device pixels. */
  uRes: IUniform<Vector2>;
  /** Device pixels per CSS pixel (point sizes). */
  uDpr: IUniform<number>;
};

export function createWorldUniforms(): WorldUniforms {
  return {
    uTime: { value: 0 },
    uFreeze: { value: 0 },
    uFlow: { value: 0 },
    uPointer: { value: new Vector3(0, 0, 0) },
    uTap: { value: new Vector3(0, 0, 0) },
    uTapTime: { value: -100 },
    uRes: { value: new Vector2(1, 1) },
    uDpr: { value: 1 },
  };
}

// ------------------------------------------------------------------ GLSL

/**
 * Hashes (PCG on integers, so they are stable on every GPU), value noise and
 * fbm, the freeze's desaturation, and a soft exponential fog. Our own code.
 */
export const GLSL_COMMON = /* glsl */ `
uint pcgHash(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float hash11(float x) {
  return float(pcgHash(uint(int(floor(x)) + 65536))) / 4294967295.0;
}
float hash21(vec2 p) {
  ivec2 i = ivec2(floor(p)) + 32768;
  return float(pcgHash(uint(i.x) + pcgHash(uint(i.y)))) / 4294967295.0;
}
vec2 hash22(vec2 p) {
  ivec2 i = ivec2(floor(p)) + 32768;
  uint h = pcgHash(uint(i.x) + pcgHash(uint(i.y)));
  return vec2(float(h), float(pcgHash(h))) / 4294967295.0;
}
float hash31(vec3 p) {
  ivec3 i = ivec3(floor(p)) + 32768;
  return float(pcgHash(uint(i.x) + pcgHash(uint(i.y) + pcgHash(uint(i.z))))) / 4294967295.0;
}
vec3 hash33(vec3 p) {
  ivec3 i = ivec3(floor(p)) + 32768;
  uint h = pcgHash(uint(i.x) + pcgHash(uint(i.y) + pcgHash(uint(i.z))));
  uint h2 = pcgHash(h);
  return vec3(float(h), float(h2), float(pcgHash(h2))) / 4294967295.0;
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return v;
}
float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
// Press and hold: a quieter, cooler, slightly desaturated world.
vec3 freezeGrade(vec3 c, float freeze) {
  float l = luma(c);
  vec3 cool = mix(c, vec3(l) * vec3(0.92, 0.97, 1.08), 0.38);
  return mix(c, cool, freeze);
}
vec3 fogMix(vec3 c, vec3 fogColour, float dist, float density) {
  float f = 1.0 - exp(-dist * density);
  return mix(c, fogColour, clamp(f, 0.0, 1.0));
}
`;

// ------------------------------------------------------------------ maths

const basisX = new Vector3();
const basisY = new Vector3();
const basisZ = new Vector3();
const basisM = new Matrix4();
const WORLD_UP = new Vector3(0, 1, 0);
const ALT_UP = new Vector3(0, 0, 1);

/** The rotation that turns +Z to `forward` with +Y as close to `up` as it can. */
export function headingQuaternion(forward: Vector3, out: Quaternion, up: Vector3 = WORLD_UP) {
  basisZ.copy(forward).normalize();
  basisX.crossVectors(up, basisZ);
  if (basisX.lengthSq() < 1e-6) basisX.crossVectors(ALT_UP, basisZ);
  basisX.normalize();
  basisY.crossVectors(basisZ, basisX).normalize();
  basisM.makeBasis(basisX, basisY, basisZ);
  return out.setFromRotationMatrix(basisM);
}

/** Smooth 0..1 across [a, b] (smoothstep), clamped. */
export function ease01(t: number, a: number, b: number) {
  const x = b === a ? (t >= b ? 1 : 0) : (t - a) / (b - a);
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

/** Linear 0..1 across [a, b], clamped. */
export function lin01(t: number, a: number, b: number) {
  const x = b === a ? (t >= b ? 1 : 0) : (t - a) / (b - a);
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** A smooth sum of three sines in -1..1, for handheld noise and drift. */
export function wobble(t: number, seed: number) {
  return (
    0.5 * Math.sin(t * 1.13 + seed * 1.7) +
    0.3 * Math.sin(t * 2.31 + seed * 4.1) +
    0.2 * Math.sin(t * 3.97 + seed * 2.3)
  );
}
