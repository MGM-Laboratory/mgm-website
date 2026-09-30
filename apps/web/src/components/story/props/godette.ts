import {
  AdditiveBlending,
  AnimationClip,
  AnimationMixer,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  Euler,
  Group,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  MeshStandardMaterial,
  Quaternion,
  ShaderMaterial,
  SkinnedMesh,
  SphereGeometry,
  Vector3,
  type AnimationAction,
  type Bone,
  type BufferGeometry,
  type Camera,
  type Scene,
  type WebGLRenderer,
  type Interpolant,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { random, randomBetween } from "@/lib/random";
import type { StoryLoaderLike, StoryTier } from "../assets/types";
import {
  GODETTE_CLIP_LIST,
  GODETTE_FACES,
  type GodetteClip,
  type GodetteClipGroup,
  type GodetteClipSpec,
  type GodetteFace,
} from "./godette-clips";

export { GODETTE_CLIP_LIST, GODETTE_FACES };
export type { GodetteClip, GodetteClipGroup, GodetteClipSpec, GodetteFace };

/**
 * Godette, the story's toy who learns to fly. One skinned mesh (one draw
 * call, two with the glow halo), baked body clips in three act files, face
 * and lid poses, and a procedural layer on top: blink, gaze, head look,
 * breathing, nervous tremble, flight sway, hair and backpack follow-through,
 * the glow, and hover or click reactions.
 *
 * Units are her model's: metres at life size (1.848 m tall), Y up, her front
 * is +Z, her left is +X. Place her with `root` (origin between her feet) and
 * turn her about her centre with `pivot`. `update(dt)` runs the layers in the
 * order that keeps them stable: reset the procedural bones, set the mixer's
 * weights and times, evaluate, then add the offsets.
 */

export const GODETTE_BASE = "/story/v1/character/";
/** Sole to top bun, in model units. */
export const GODETTE_HEIGHT = 1.848;
/** Scale that makes her a 16.9 cm figure, 17.5 cm on her stand (real metres). */
export const GODETTE_TABLE_SCALE = 0.0915;
/** Height of her centre (pelvis) above the root, in model units. `pivot` sits here. */
export const GODETTE_CENTRE = 1.0;
/** The figure stand, real metres: radius, height (top at y = 0 of its group). */
export const GODETTE_STAND = { radius: 0.039, height: 0.007 } as const;

export type GodetteReaction = "hover" | "click" | "poke" | "yawn" | "stretch";
export type GodetteContext = "toy" | "ground" | "flight";
export type GodetteSocket =
  "head" | "eyes" | "chest" | "back" | "hips" | "hand_L" | "hand_R" | "foot_L" | "foot_R";

export type Vec3Like = Readonly<{ x: number; y: number; z: number }>;

/**
 * One body layer for this frame. Give `time` (seconds) or `progress` (0..1
 * of the clip) to scrub; give neither and the clip runs on her own clock
 * (`speed` times dt), restarting when the layer reappears after a gap.
 */
export type GodetteBodyLayer = Readonly<{
  clip: GodetteClip;
  weight: number;
  time?: number;
  progress?: number;
  speed?: number;
}>;

export type GodetteFlight = Readonly<{
  /** World velocity, units per second. Hair streams against it. */
  velocity?: Vec3Like;
  /** Extra roll into a turn, radians (+ banks to her right). */
  bank?: number;
  /** Extra pitch about her left axis, radians, the same sign as the pivot's prone pitch (+ tips her forward). */
  pitch?: number;
  /** 0..1: how much flight sway and wind play on top of the clip. */
  amount?: number;
}>;

export type GodetteLook = Readonly<{
  /** Rim light amount and colour (a soft back light that reads on any backdrop). */
  rim?: number;
  rimColor?: number;
  rimPower?: number;
  /** Glossy plastic (1) to soft painted (0). She starts the table beat as a toy. */
  toy?: number;
  /** Self light that keeps her readable in dark shots, 0..0.3. */
  lift?: number;
  /** Glow colour (the spark's yellow by default). */
  glowColor?: number;
  envMapIntensity?: number;
}>;

export type GodetteLoadOptions = Readonly<{
  tier?: StoryTier;
  base?: string;
  /** Which clip files to load now (all three by default). */
  groups?: readonly GodetteClipGroup[];
}>;

export interface Godette {
  /** Placement group: origin between her feet. Scale it with `scale`. */
  readonly root: Group;
  /** Rotation group at her centre: pitch, roll and spin her here. */
  readonly pivot: Group;
  /** The figure stand, real metres, origin at its top centre. Add it to a scene yourself. */
  readonly stand: Group;
  /** A soft contact shadow; add it to the scene and call setShadow. */
  readonly shadow: Mesh;
  /** Invisible capsules parented to her bones, for raycasting (userData.part names the part). */
  readonly hitProxy: readonly Mesh[];
  /** The skinned mesh (one draw call). */
  readonly mesh: SkinnedMesh;
  scale: number;
  readonly clips: readonly GodetteClip[];
  clipSpec(name: GodetteClip): GodetteClipSpec;
  clipDuration(name: GodetteClip): number;
  hasClip(name: GodetteClip): boolean;
  loadClips(group: GodetteClipGroup): Promise<void>;
  setBody(layers: readonly GodetteBodyLayer[]): void;
  setFace(name: GodetteFace | "auto", weight?: number): void;
  lookAt(point: Vec3Like | null, headWeight?: number): void;
  setGaze(yaw: number, pitch: number): void;
  setNervous(amount: number): void;
  setBreath(amount: number): void;
  setFlight(flight: GodetteFlight | null): void;
  setGlow(amount: number): void;
  setLook(look: GodetteLook): void;
  setContext(context: GodetteContext): void;
  setShadow(shadow: Readonly<{ y: number; opacity: number; size?: number }> | null): void;
  setAutoIdle(seconds: number | null): void;
  react(kind: GodetteReaction): boolean;
  blink(double?: boolean): void;
  /** Multiplies the blink rate (1 default, 0 stops the automatic blinks; blink() still works). */
  setBlinkRate(rate: number): void;
  socket(name: GodetteSocket, target?: Vector3): Vector3;
  attach(name: GodetteSocket, object: Object3D): void;
  rootMotion(clip: GodetteClip, time: number, target?: Vector3): Vector3;
  update(dt: number): void;
  /**
   * Compile every program she can show (the halo, the shadow and the stand included) against `scene`'s
   * lights, so nothing compiles on first sight. Call it once her scene is lit, during the loader.
   */
  compile(renderer: WebGLRenderer, camera: Camera, scene: Scene): Promise<void>;
  dispose(): void;
}

/* ------------------------------------------------------------------------ */
/* Tables                                                                    */
/* ------------------------------------------------------------------------ */

const SPEC = new Map<GodetteClip, GodetteClipSpec>(GODETTE_CLIP_LIST.map((c) => [c.name, c]));
const CLIP_NAMES: readonly GodetteClip[] = GODETTE_CLIP_LIST.map((c) => c.name);
const GROUPS: readonly GodetteClipGroup[] = ["room", "flight", "finale"];

type LidPose = "half" | "wide" | "squint" | "closed";
const LID_POSES: readonly LidPose[] = ["half", "wide", "squint", "closed"];

/** What each face does to the lids and the pupils. */
const FACE_EYES = new Map<
  GodetteFace,
  Readonly<{ lids: ReadonlyMap<LidPose, number>; pupil: number }>
>([
  ["neutral", { lids: new Map(), pupil: 1 }],
  ["smile", { lids: new Map([["squint", 0.12]]), pupil: 1.05 }],
  ["big_smile", { lids: new Map([["squint", 0.32]]), pupil: 1.12 }],
  ["nervous", { lids: new Map([["wide", 0.18]]), pupil: 0.82 }],
  ["surprised", { lids: new Map([["wide", 0.85]]), pupil: 0.6 }],
  ["oh_no", { lids: new Map([["wide", 0.7]]), pupil: 0.42 }],
  ["determined", { lids: new Map([["half", 0.28]]), pupil: 0.92 }],
  ["dizzy", { lids: new Map([["half", 0.62]]), pupil: 0.9 }],
  ["shy", { lids: new Map([["half", 0.3]]), pupil: 1.18 }],
  ["laugh", { lids: new Map([["squint", 0.95]]), pupil: 1 }],
  ["pout", { lids: new Map([["half", 0.18]]), pupil: 1 }],
  ["yawn", { lids: new Map([["closed", 0.85]]), pupil: 1 }],
  ["frown", { lids: new Map([["half", 0.22]]), pupil: 0.95 }],
]);

type SocketDef = Readonly<{ bone: string; offset: readonly [number, number, number] }>;
const SOCKETS = new Map<GodetteSocket, SocketDef>([
  ["head", { bone: "Head", offset: [0, 0.09, 0.0] }],
  ["eyes", { bone: "Head", offset: [0, 0.035, 0.1] }],
  ["chest", { bone: "Ribcage", offset: [0, 0.1, 0.02] }],
  ["back", { bone: "Backpack", offset: [0, 0.05, -0.08] }],
  ["hips", { bone: "Hip", offset: [0, 0.0, 0.0] }],
  ["hand_L", { bone: "Hand_L", offset: [0, 0.07, 0] }],
  ["hand_R", { bone: "Hand_R", offset: [0, 0.07, 0] }],
  ["foot_L", { bone: "Foot_L", offset: [0, 0, 0] }],
  ["foot_R", { bone: "Foot_R", offset: [0, 0, 0] }],
]);

/** Share of a head turn per bone, the same spread the source rig's neck control uses. */
const NECK_SPREAD: readonly (readonly [string, number])[] = [
  ["Neck_1", 0.09 / 0.892],
  ["Neck_2", 0.303 / 0.892],
  ["Neck_3", 0.277 / 0.892],
  ["Head", 0.222 / 0.892],
];

const PROC_BONES = [
  "Neck_1",
  "Neck_2",
  "Neck_3",
  "Head",
  "Spine_1",
  "Spine_2",
  "Ribcage",
  "Clavic_L",
  "Clavic_R",
  "Arm_Upper_1_L",
  "Arm_Upper_1_R",
  "EyeRoot_L",
  "EyeRoot_R",
  "Pupil_L",
  "Pupil_R",
  "Backpack",
] as const;
type ProcBone = (typeof PROC_BONES)[number];

const GAZE_YAW = MathUtils.degToRad(17);
const GAZE_UP = MathUtils.degToRad(10);
const GAZE_DOWN = MathUtils.degToRad(9);
const HEAD_YAW = MathUtils.degToRad(40);
const HEAD_PITCH = MathUtils.degToRad(25);

/* ------------------------------------------------------------------------ */
/* Shaders                                                                   */
/* ------------------------------------------------------------------------ */

type BodyUniforms = {
  uHairOffset: { value: Vector3 };
  uHairFlutter: { value: number };
  uTime: { value: number };
  uRimColor: { value: Color };
  uRim: { value: number };
  uRimPower: { value: number };
  uGlowColor: { value: Color };
  uGlow: { value: number };
  uLift: { value: number };
};

const HAIR_VERTEX = /* glsl */ `
transformed += hairMask * (uHairOffset + uHairFlutter * vec3(
  sin(uTime * 13.0 + position.y * 31.0),
  0.5 * sin(uTime * 11.0 + position.x * 27.0),
  cos(uTime * 12.0 + position.z * 29.0)));
`;

const BODY_VERTEX_DECL = /* glsl */ `
attribute float hairMask;
uniform vec3 uHairOffset;
uniform float uHairFlutter;
uniform float uTime;
`;

const BODY_FRAGMENT_DECL = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRim;
uniform float uRimPower;
uniform vec3 uGlowColor;
uniform float uGlow;
uniform float uLift;
`;

/** Rim light, the magic glow and a little self light, added before the lights so tone mapping treats them alike. */
const BODY_FRAGMENT_LIGHT = /* glsl */ `
{
  float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float fres = pow(1.0 - nv, uRimPower);
  totalEmissiveRadiance += uRimColor * (fres * uRim);
  totalEmissiveRadiance += uGlowColor * uGlow * (fres * fres * 1.1 + 0.035);
  totalEmissiveRadiance += diffuseColor.rgb * uLift;
}
`;

function bodyMaterial(map: Texture, uniforms: BodyUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map,
    roughness: 0.62,
    metalness: 0,
    envMapIntensity: 0.6,
  });
  material.name = "godette";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const vs = shader.vertexShader
      .replace(/#include .common./, (m) => m + "\n" + BODY_VERTEX_DECL)
      .replace(/#include .skinning_vertex./, (m) => m + "\n" + HAIR_VERTEX);
    const fs = shader.fragmentShader
      .replace(/#include .common./, (m) => m + "\n" + BODY_FRAGMENT_DECL)
      .replace(/#include .lights_fragment_begin./, (m) => BODY_FRAGMENT_LIGHT + "\n" + m);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => "godette-body-v1";
  return material;
}

/** A soft halo behind her: a quad turned to the camera in the vertex shader, sized in world units. */
function haloMaterial(uniforms: BodyUniforms, size: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    name: "godette-halo",
    uniforms: {
      uGlowColor: uniforms.uGlowColor,
      uGlow: uniforms.uGlow,
      uTime: uniforms.uTime,
      uSize: size,
    },
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * uSize;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGlowColor;
      uniform float uGlow;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float a = atan(p.y, p.x);
        float rays = 0.85 + 0.15 * sin(a * 4.0 + uTime * 0.8) * sin(a * 7.0 - uTime * 1.3);
        float soft = exp(-r * r * 5.5) * rays;
        float core = exp(-r * r * 26.0);
        vec3 col = mix(uGlowColor, vec3(1.0), 0.55 * core);
        float k = uGlow * (soft * 0.42 + core * 0.3);
        gl_FragColor = vec4(col * k, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    toneMapped: false,
  });
}

function shadowMaterial(opacity: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    name: "godette-shadow",
    uniforms: { uOpacity: opacity },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.0, 1.0, d)) * (0.55 + 0.45 * (1.0 - smoothstep(0.0, 0.45, d)));
        gl_FragColor = vec4(0.03, 0.035, 0.05, a * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

/* ------------------------------------------------------------------------ */
/* Small maths                                                               */
/* ------------------------------------------------------------------------ */

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

/** Critically damped spring toward a target (returns the new value and velocity). */
function spring1(state: { x: number; v: number }, target: number, omega: number, dt: number) {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const det = 1 / (f + hhoo);
  const x = (f * state.x + dt * state.v + hhoo * target) * det;
  const v = (state.v + hoo * (target - state.x)) * det;
  state.x = x;
  state.v = v;
}

/** Layered sines, a cheap smooth noise in [-1, 1]. */
const wobble = (t: number, seed: number) =>
  Math.sin(t * 1.7 + seed) * 0.5 +
  Math.sin(t * 2.9 + seed * 1.3) * 0.3 +
  Math.sin(t * 4.3 + seed * 2.1) * 0.2;

function cueAt(cues: readonly (readonly [number, number])[], t: number, fallback: number): number {
  let out = fallback;
  for (const cue of cues) {
    if (cue[0] <= t + 1e-4) out = cue[1];
    else break;
  }
  return out;
}

function faceCue(spec: GodetteClipSpec, t: number): readonly [GodetteFace, number] {
  let face: GodetteFace = "neutral";
  let weight = 1;
  for (const cue of spec.face) {
    if (cue[0] <= t + 1e-4) {
      face = cue[1];
      weight = cue[2];
    } else break;
  }
  return [face, weight];
}

/* ------------------------------------------------------------------------ */
/* Loader                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * The story's asset cache parses each file once per visit and hands the same objects to every caller, so a
 * second load (a rebuilt stage, a lost context) sees the bones where the last session left them. The first load
 * records every bone's bind transform here; every load starts by putting them back.
 */
const BIND_POSE = new WeakMap<Bone, Readonly<{ p: Vector3; q: Quaternion; s: Vector3 }>>();

function restoreBindPose(bones: readonly Bone[]) {
  for (const b of bones) {
    const saved = BIND_POSE.get(b);
    if (saved) {
      b.position.copy(saved.p);
      b.quaternion.copy(saved.q);
      b.scale.copy(saved.s);
    } else {
      BIND_POSE.set(b, { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() });
    }
  }
}

/**
 * A bone the procedural layer offsets. `base` is the value the mixer left on it last frame. The mixer only
 * writes a bone when its mixed value changes, so each frame starts by putting `base` back (never the rest
 * pose, or a held clip pose would be lost), then evaluates, then records the new base before the offsets.
 */
type Proc = Readonly<{
  bone: Bone;
  rest: Quaternion;
  restScale: Vector3;
  base: Quaternion;
  baseScale: Vector3;
}>;

type Reaction = {
  clip: GodetteClip | null;
  kind: GodetteReaction;
  t: number;
  duration: number;
  holdUntil: number;
  face: GodetteFace | null;
  jolt: number;
};

export async function loadGodette(
  assets: StoryLoaderLike,
  options: GodetteLoadOptions = {},
): Promise<Godette> {
  const base = options.base ?? GODETTE_BASE;
  const tier = options.tier ?? "high";
  const groups = options.groups ?? GROUPS;
  const textureFiles =
    tier === "high"
      ? ["godette-2k.ktx2", "godette-1k.ktx2"]
      : ["godette-1k.ktx2", "godette-2k.ktx2"];
  const loadTexture = async (): Promise<Texture> => {
    try {
      return await assets.texture(base + textureFiles[0], { srgb: true, flipY: false });
    } catch {
      // the loader preloads one texture per tier; an act that passed another tier still gets a face
      return await assets.texture(base + textureFiles[1], { srgb: true, flipY: false });
    }
  };
  const [gltf, texture, standGltf, ...clipGltfs] = await Promise.all([
    assets.gltf(base + "godette.glb"),
    loadTexture(),
    assets.gltf(base + "stand.glb"),
    ...groups.map((g) => assets.gltf(base + "clips-" + g + ".glb")),
  ]);

  const skinnedMeshes: SkinnedMesh[] = [];
  gltf.scene.traverse((o) => {
    if (o instanceof SkinnedMesh) skinnedMeshes.push(o);
  });
  const mesh = skinnedMeshes.at(0);
  if (!mesh) throw new Error("godette.glb has no skinned mesh");
  restoreBindPose(mesh.skeleton.bones);
  const bones = new Map<string, Bone>();
  for (const b of mesh.skeleton.bones) bones.set(b.name, b);
  const bone = (name: string): Bone => {
    const b = bones.get(name);
    if (!b) throw new Error("godette: missing bone " + name);
    return b;
  };

  const geometry: BufferGeometry = mesh.geometry;
  if (geometry.hasAttribute("_hair")) {
    geometry.setAttribute("hairMask", geometry.getAttribute("_hair"));
    geometry.deleteAttribute("_hair");
  }

  const uniforms: BodyUniforms = {
    uHairOffset: { value: new Vector3() },
    uHairFlutter: { value: 0 },
    uTime: { value: 0 },
    uRimColor: { value: new Color(0xdfe9ff) },
    uRim: { value: 0.18 },
    uRimPower: { value: 3 },
    uGlowColor: { value: new Color(0xf7bf33) },
    uGlow: { value: 0 },
    uLift: { value: 0.04 },
  };
  const oldMaterial = mesh.material;
  if (Array.isArray(oldMaterial)) for (const m of oldMaterial) m.dispose();
  else oldMaterial.dispose();
  const material = bodyMaterial(texture, uniforms);
  mesh.material = material;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const haloSize = { value: 2.2 };
  const haloMat = haloMaterial(uniforms, haloSize);
  const haloGeo = new PlaneGeometry(1, 1);
  const halo = new Mesh(haloGeo, haloMat);
  halo.name = "godette-halo";
  halo.frustumCulled = false;
  halo.visible = false;
  halo.renderOrder = -1;

  // hierarchy: root (feet) -> pivot (centre) -> sway (procedural) -> offset -> glTF scene
  const root = new Group();
  root.name = "godette";
  const pivot = new Group();
  pivot.position.y = GODETTE_CENTRE;
  const sway = new Group();
  const offset = new Group();
  offset.position.y = -GODETTE_CENTRE;
  root.add(pivot);
  pivot.add(sway);
  sway.add(offset);
  offset.add(gltf.scene);
  root.scale.setScalar(GODETTE_TABLE_SCALE);
  bone("Ribcage").add(halo);
  halo.position.set(0, 0.05, -0.12);

  const stand = new Group();
  stand.name = "godette-stand";
  stand.add(standGltf.scene);

  const shadowOpacity = { value: 0 };
  const shadowMat = shadowMaterial(shadowOpacity);
  const shadow = new Mesh(new CircleGeometry(0.5, 32), shadowMat);
  shadow.name = "godette-shadow";
  shadow.rotation.x = -Math.PI / 2;
  shadow.visible = false;
  shadow.renderOrder = 1;

  // hit proxies (invisible, raycastable)
  const proxyMat = new MeshBasicMaterial({ visible: false });
  const proxies: Mesh[] = [];
  const proxyGeos: BufferGeometry[] = [];
  const addProxy = (
    boneName: string,
    geo: BufferGeometry,
    part: string,
    pos: readonly [number, number, number],
  ) => {
    const m = new Mesh(geo, proxyMat);
    m.visible = false;
    m.userData = { part, godette: true };
    m.position.set(pos[0], pos[1], pos[2]);
    bone(boneName).add(m);
    proxies.push(m);
    proxyGeos.push(geo);
  };
  addProxy("Head", new SphereGeometry(0.19, 12, 8), "head", [0, 0.1, 0.01]);
  addProxy("Ribcage", new CapsuleGeometry(0.17, 0.22, 4, 10), "body", [0, 0.08, 0]);
  addProxy("Hip", new CapsuleGeometry(0.16, 0.08, 4, 10), "body", [0, 0.0, 0]);
  for (const s of ["L", "R"] as const) {
    addProxy("Leg_Upper_" + s, new CapsuleGeometry(0.08, 0.3, 4, 8), "legs", [0, 0.2, 0]);
    addProxy("Leg_Lower_" + s, new CapsuleGeometry(0.07, 0.32, 4, 8), "legs", [0, 0.2, 0]);
    addProxy("Hand_" + s, new SphereGeometry(0.08, 8, 6), "hands", [0, 0.05, 0]);
    addProxy("Arm_Lower_1_" + s, new CapsuleGeometry(0.05, 0.18, 4, 8), "arms", [0, 0.1, 0]);
  }

  // procedural bones: store the loaded (bind = rest) transforms before any action binds
  const proc = new Map<ProcBone, Proc>();
  for (const n of PROC_BONES) {
    const b = bone(n);
    proc.set(n, {
      bone: b,
      rest: b.quaternion.clone(),
      restScale: b.scale.clone(),
      base: b.quaternion.clone(),
      baseScale: b.scale.clone(),
    });
  }
  const procOf = (n: ProcBone): Proc => {
    const p = proc.get(n);
    if (!p) throw new Error("godette: missing proc bone " + n);
    return p;
  };

  // eye frame in Head space: forward from the eye roots to the pupils, up = the head bone's axis
  gltf.scene.updateMatrixWorld(true);
  const headInv = new Matrix4().copy(bone("Head").matrixWorld).invert();
  const eyeL = new Vector3()
    .setFromMatrixPosition(bone("EyeRoot_L").matrixWorld)
    .applyMatrix4(headInv);
  const eyeR = new Vector3()
    .setFromMatrixPosition(bone("EyeRoot_R").matrixWorld)
    .applyMatrix4(headInv);
  const pupL = new Vector3()
    .setFromMatrixPosition(bone("Pupil_L").matrixWorld)
    .applyMatrix4(headInv);
  const pupR = new Vector3()
    .setFromMatrixPosition(bone("Pupil_R").matrixWorld)
    .applyMatrix4(headInv);
  const eyeMid = eyeL.clone().add(eyeR).multiplyScalar(0.5);
  const headFwd = pupL.clone().add(pupR).multiplyScalar(0.5).sub(eyeMid).normalize();
  const headUp = new Vector3(0, 1, 0);
  headUp.sub(headFwd.clone().multiplyScalar(headUp.dot(headFwd))).normalize();
  const headLeft = new Vector3().crossVectors(headUp, headFwd).normalize();

  // mixer and actions: every action plays from the start, paused, weight 0, so bindings capture rest
  const mixer = new AnimationMixer(gltf.scene);
  const body = new Map<GodetteClip, AnimationAction>();
  const durations = new Map<GodetteClip, number>();
  const rootTracks = new Map<GodetteClip, Interpolant>();
  const faces = new Map<GodetteFace, AnimationAction>();
  const lids = new Map<LidPose, AnimationAction>();
  let blinkScrub: AnimationAction | null = null;
  const actions: AnimationAction[] = [];
  const clipsOwned: AnimationClip[] = [];

  const prime = (clip: AnimationClip, loop: boolean) => {
    const a = mixer.clipAction(clip);
    a.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    a.paused = true;
    actions.push(a);
    clipsOwned.push(clip);
    return a;
  };

  for (const clip of gltf.animations) {
    if (clip.name.startsWith("face_")) {
      const name = GODETTE_FACES.find((f) => "face_" + f === clip.name);
      if (name) faces.set(name, prime(clip, false));
    } else if (clip.name === "lids_scrub") {
      blinkScrub = prime(clip, false);
    } else if (clip.name.startsWith("lids_")) {
      const pose = LID_POSES.find((p) => "lids_" + p === clip.name);
      if (pose) lids.set(pose, prime(clip, false));
    }
  }

  const addBodyClips = (anims: readonly AnimationClip[]) => {
    for (const clip of anims) {
      const spec = SPEC.get(clip.name as GodetteClip);
      if (!spec || body.has(spec.name as GodetteClip)) continue;
      const name = spec.name as GodetteClip;
      let playable = clip;
      if (spec.rootMotion) {
        const track = clip.tracks.find((t) => t.name === "Root.position");
        if (track) {
          // the root's travel is read by rootMotion(); the mixer plays a copy without it (the cached clip stays whole)
          rootTracks.set(name, track.InterpolantFactoryMethodLinear());
          playable = new AnimationClip(
            clip.name,
            clip.duration,
            clip.tracks.filter((t) => t !== track),
          );
        }
      }
      durations.set(name, clip.duration);
      body.set(name, prime(playable, spec.loop));
    }
  };
  for (const g of clipGltfs) addBodyClips(g.animations);

  /* ---------------------------------------------------------------------- */
  /* State                                                                  */
  /* ---------------------------------------------------------------------- */

  let clock = 0;
  let layers: readonly GodetteBodyLayer[] = [];
  const liveTime = new Map<GodetteClip, number>();
  const lastSeen = new Map<GodetteClip, number>();
  const weights = new Map<AnimationAction, number>();

  let faceMode: "auto" | "manual" = "auto";
  let manualFace: GodetteFace = "neutral";
  let manualWeight = 1;
  const faceW = new Map<GodetteFace, number>(
    GODETTE_FACES.map((f) => [f, f === "neutral" ? 1 : 0]),
  );
  let pupil = 1;

  let nervous = 0;
  let breath = 1;
  let context: GodetteContext = "ground";
  let glow = 0;
  let glowShown = 0;
  let flight: GodetteFlight | null = null;
  let flightAmount = 0;
  const bank = { x: 0, v: 0 };
  const pitch = { x: 0, v: 0 };

  let lookPoint: Vector3 | null = null;
  let lookWeightTarget = 0;
  let lookWeight = 0;
  const headYaw = { x: 0, v: 0 };
  const headPitch = { x: 0, v: 0 };
  let gazeYawManual = 0;
  let gazePitchManual = 0;
  const gazeYaw = { x: 0, v: 0 };
  const gazePitch = { x: 0, v: 0 };
  let dartYaw = 0;
  let dartPitch = 0;
  let nextDart = 1;
  let microYaw = 0;
  let microPitch = 0;
  let nextMicro = 0.4;

  let blinkRate = 1;
  let blinkT = -1;
  let blinkDouble = false;
  let nextBlink = randomBetween(1.2, 3);

  let reaction: Reaction | null = null;
  let lastClickClip: GodetteClip | null = null;
  let lastHoverClip: GodetteClip | null = null;
  let autoIdle: number | null = null;
  let idleClock = 0;
  let lastIdle: GodetteReaction = "stretch";

  const hairPos = new Vector3();
  const hairVel = new Vector3();
  const hairLag = new Vector3();
  let hairReady = false;
  const packFwd = { x: 0, v: 0 };
  const packSide = { x: 0, v: 0 };
  const packPrev = new Vector3();
  let packReady = false;

  let shadowY: number | null = null;
  let shadowSize = 0.9;

  const tmpV = new Vector3();
  const tmpV2 = new Vector3();
  const tmpV3 = new Vector3();
  const tmpQ = new Quaternion();
  const swayAxis = new Vector3();
  const swayRoll = new Quaternion();
  const swayRest = new Quaternion();
  const tmpE = new Euler();
  const tmpM = new Matrix4();
  const socketOffset = new Vector3();

  const clipSpec = (name: GodetteClip): GodetteClipSpec => {
    const s = SPEC.get(name);
    if (!s) throw new Error("godette: unknown clip " + name);
    return s;
  };
  const clipDuration = (name: GodetteClip) => durations.get(name) ?? clipSpec(name).duration;
  const clampTime = (name: GodetteClip, t: number) => {
    const d = clipDuration(name);
    if (clipSpec(name).loop) return ((t % d) + d) % d;
    return MathUtils.clamp(t, 0, Math.max(0, d - 1e-4));
  };

  /* ---------------------------------------------------------------------- */
  /* Reactions                                                              */
  /* ---------------------------------------------------------------------- */

  const startReaction = (
    kind: GodetteReaction,
    clip: GodetteClip | null,
    face: GodetteFace | null,
    dur: number,
  ) => {
    const spec = clip ? clipSpec(clip) : null;
    reaction = {
      kind,
      clip: clip && body.has(clip) ? clip : null,
      t: 0,
      duration: clip && body.has(clip) ? clipDuration(clip) : dur,
      holdUntil: spec?.hold ? clock + 0.9 : 0,
      face,
      jolt: 0,
    };
    idleClock = 0;
  };

  const react = (kind: GodetteReaction): boolean => {
    idleClock = 0;
    if (kind === "hover" && reaction && reaction.kind === "hover") {
      reaction.holdUntil = clock + 0.6;
      return true;
    }
    if (reaction && reaction.kind !== "hover" && reaction.t < reaction.duration * 0.6) return false;
    if (context === "toy") {
      // a toy cannot move: she flinches inside the pose, eyes wide, a blink burst
      startReaction(
        kind,
        null,
        kind === "hover" ? "nervous" : "surprised",
        kind === "hover" ? 0.9 : 0.7,
      );
      if (reaction) reaction.jolt = kind === "hover" ? 0.35 : 1;
      blink(kind !== "hover");
      return true;
    }
    if (context === "flight") {
      startReaction(kind, null, kind === "hover" ? "smile" : "laugh", kind === "hover" ? 1.2 : 0.9);
      if (reaction) reaction.jolt = kind === "click" ? 1 : 0.4;
      return true;
    }
    if (kind === "hover") {
      const pick: GodetteClip = lastHoverClip === "hover_shy" ? "hover_curious" : "hover_shy";
      const clip = random() < 0.7 ? pick : (lastHoverClip ?? pick);
      lastHoverClip = clip;
      startReaction(kind, clip, null, 2);
      return true;
    }
    if (kind === "click") {
      const options: GodetteClip[] = ["click_giggle", "click_hop"];
      const choices = options.filter((c) => c !== lastClickClip);
      const clip = choices.at(Math.floor(random() * choices.length)) ?? "click_giggle";
      lastClickClip = clip;
      startReaction(kind, clip, null, 1.3);
      return true;
    }
    if (kind === "poke") {
      startReaction(kind, "poke_flinch", null, 0.9);
      return true;
    }
    startReaction(kind, kind === "yawn" ? "idle_yawn" : "idle_stretch", null, 3);
    return true;
  };

  const blink = (double = false) => {
    if (blinkT < 0) {
      blinkT = 0;
      blinkDouble = double;
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Per-frame parts                                                        */
  /* ---------------------------------------------------------------------- */

  const setW = (a: AnimationAction, w: number) => {
    weights.set(a, (weights.get(a) ?? 0) + w);
  };

  const reactionEnvelope = (): number => {
    const r = reaction;
    if (!r) return 0;
    const spec = r.clip ? clipSpec(r.clip) : null;
    const bi = spec ? spec.blendIn : 0.15;
    const bo = spec ? spec.blendOut : 0.25;
    const inW = MathUtils.clamp(r.t / Math.max(0.001, bi), 0, 1);
    const outW = MathUtils.clamp((r.duration - r.t) / Math.max(0.001, bo), 0, 1);
    return MathUtils.smootherstep(Math.min(inW, outW), 0, 1);
  };

  const stepReaction = (dt: number) => {
    const r = reaction;
    if (!r) return;
    const spec = r.clip ? clipSpec(r.clip) : null;
    const hold = spec ? spec.hold : null;
    let t = r.t + dt;
    if (hold && clock < r.holdUntil && t > hold[1])
      t = hold[0] + ((t - hold[0]) % Math.max(0.05, hold[1] - hold[0]));
    r.t = t;
    if (r.t >= r.duration) reaction = null;
  };

  const updateBody = (dt: number) => {
    weights.clear();
    const env = reactionEnvelope();
    const keep = 1 - env;
    for (const layer of layers) {
      const a = body.get(layer.clip);
      if (!a || layer.weight <= 0) continue;
      let t: number;
      if (layer.time !== undefined) t = layer.time;
      else if (layer.progress !== undefined) t = layer.progress * clipDuration(layer.clip);
      else {
        const seen = lastSeen.get(layer.clip) ?? -1;
        const prev = clock - seen > 0.5 ? 0 : (liveTime.get(layer.clip) ?? 0);
        t = prev + dt * (layer.speed ?? 1);
        liveTime.set(layer.clip, t);
      }
      lastSeen.set(layer.clip, clock);
      a.time = clampTime(layer.clip, t);
      setW(a, layer.weight * keep);
    }
    const r = reaction;
    if (r?.clip) {
      const a = body.get(r.clip);
      if (a) {
        a.time = clampTime(r.clip, r.t);
        setW(a, env);
      }
    }
    for (const a of body.values()) a.setEffectiveWeight(weights.get(a) ?? 0);
  };

  /** The clip that leads this frame (highest weight), for auto faces and head cues. */
  const leadClip = (): { clip: GodetteClip; time: number } | null => {
    let best: { clip: GodetteClip; time: number } | null = null;
    let bestW = 0;
    for (const [clip, a] of body) {
      const w = a.getEffectiveWeight();
      if (w > bestW) {
        bestW = w;
        best = { clip, time: a.time };
      }
    }
    return best;
  };

  const updateFace = (dt: number, lead: { clip: GodetteClip; time: number } | null) => {
    let target: GodetteFace = "neutral";
    let targetW = 1;
    if (faceMode === "manual") {
      target = manualFace;
      targetW = manualWeight;
    } else if (lead) {
      const cue = faceCue(clipSpec(lead.clip), lead.time);
      target = cue[0];
      targetW = cue[1];
    }
    const r = reaction;
    if (r) {
      const env = reactionEnvelope();
      if (r.face && env > 0.3) {
        target = r.face;
        targetW = 1;
      } else if (r.clip && env > 0.3) {
        target = faceCue(clipSpec(r.clip), r.t)[0];
        targetW = 1;
      }
    }
    let sum = 0;
    for (const f of GODETTE_FACES) {
      if (f === "neutral") continue;
      const goal = f === target ? targetW : 0;
      const w = damp(faceW.get(f) ?? 0, goal, 14, dt);
      faceW.set(f, w);
      sum += w;
    }
    const scale = sum > 1 ? 1 / sum : 1;
    const lidW = new Map<LidPose, number>();
    let pupilGoal = 0;
    let pupilSum = 0;
    for (const [f, a] of faces) {
      const w = f === "neutral" ? Math.max(0, 1 - sum) : (faceW.get(f) ?? 0) * scale;
      a.time = 0;
      a.setEffectiveWeight(w);
      const eyes = FACE_EYES.get(f);
      if (eyes) {
        for (const [pose, lw] of eyes.lids) lidW.set(pose, (lidW.get(pose) ?? 0) + lw * w);
        pupilGoal += eyes.pupil * w;
        pupilSum += w;
      }
    }
    if (nervous > 0) lidW.set("wide", (lidW.get("wide") ?? 0) + 0.1 * nervous);
    return { lidW, pupilGoal: pupilSum > 0 ? pupilGoal / pupilSum : 1 };
  };

  const blinkAmount = (dt: number): number => {
    const rate = MathUtils.lerp(1, 2.6, nervous) * blinkRate;
    nextBlink -= dt * rate;
    if (nextBlink <= 0 && blinkT < 0) {
      blinkT = 0;
      blinkDouble = random() < 0.16 + 0.14 * nervous;
      nextBlink = randomBetween(2, 5.5);
    }
    if (blinkT < 0) return 0;
    blinkT += dt;
    // close 0.07 s, hold 0.03 s, open 0.12 s; nervous blinks are quicker; a double blink repeats once
    const q = MathUtils.lerp(1, 0.62, nervous);
    const close = 0.07 * q;
    const hold = close + 0.03 * q;
    const one = hold + 0.12 * q;
    const total = blinkDouble ? one * 2 : one;
    const t = blinkT % one;
    let b: number;
    if (t < close) b = t / close;
    else if (t < hold) b = 1;
    else b = 1 - (t - hold) / (one - hold);
    if (blinkT >= total) {
      blinkT = -1;
      return 0;
    }
    return MathUtils.clamp(b, 0, 1);
  };

  const updateLids = (dt: number, lidW: Map<LidPose, number>, extraClose: number) => {
    const b = MathUtils.clamp(blinkAmount(dt) + extraClose, 0, 1);
    let sumE = 0;
    for (const w of lidW.values()) sumE += w;
    const norm = sumE > 1 ? 1 / sumE : 1;
    sumE = Math.min(1, sumE);
    for (const [pose, a] of lids) {
      const e = (lidW.get(pose) ?? 0) * norm;
      a.time = 0;
      a.setEffectiveWeight(pose === "closed" ? e * (1 - b) + sumE * b : e * (1 - b));
    }
    if (blinkScrub) {
      blinkScrub.time = MathUtils.clamp(b, 0, 1 - 1e-4);
      blinkScrub.setEffectiveWeight(1 - sumE);
    }
  };

  const resetProc = () => {
    for (const p of proc.values()) {
      p.bone.quaternion.copy(p.base);
      p.bone.scale.copy(p.baseScale);
    }
  };

  const captureBase = () => {
    for (const p of proc.values()) {
      p.base.copy(p.bone.quaternion);
      p.baseScale.copy(p.bone.scale);
    }
  };

  const rotLocal = (n: ProcBone, x: number, y: number, z: number) => {
    const b = procOf(n).bone;
    tmpQ.setFromEuler(tmpE.set(x, y, z, "XYZ"));
    b.quaternion.multiply(tmpQ);
  };

  const updateHeadLook = (dt: number, lead: { clip: GodetteClip; time: number } | null) => {
    const clipHead = lead ? cueAt(clipSpec(lead.clip).head, lead.time, 1) : 1;
    const flightDamp = 1 - 0.6 * flightAmount;
    lookWeight = damp(lookWeight, lookPoint ? lookWeightTarget * clipHead * flightDamp : 0, 6, dt);
    let yaw = 0;
    let pit = 0;
    if (lookPoint) {
      const head = procOf("Head").bone;
      tmpM.copy(head.matrixWorld).invert();
      tmpV.copy(lookPoint).applyMatrix4(tmpM).sub(eyeMid);
      const f = tmpV.dot(headFwd);
      const l = tmpV.dot(headLeft);
      const u = tmpV.dot(headUp);
      yaw = MathUtils.clamp(Math.atan2(l, Math.max(0.05, f)), -HEAD_YAW, HEAD_YAW);
      pit = MathUtils.clamp(Math.atan2(u, Math.hypot(f, l)), -HEAD_PITCH, HEAD_PITCH);
      if (f < 0) yaw = Math.sign(l || 1) * HEAD_YAW;
    }
    const omega = MathUtils.lerp(7, 11, nervous);
    spring1(headYaw, yaw * lookWeight, omega, dt);
    spring1(headPitch, pit * lookWeight, omega, dt);
    for (const [name, share] of NECK_SPREAD) {
      rotLocal(name as ProcBone, -headPitch.x * share, headYaw.x * share, 0);
    }
  };

  const updateGaze = (dt: number, pupilGoal: number) => {
    // darts: nervous eyes jump away and back; micro saccades always
    nextDart -= dt;
    if (nextDart <= 0) {
      if (nervous > 0.05 && (dartYaw === 0 || random() < 0.5)) {
        dartYaw = MathUtils.degToRad(randomBetween(-15, 15) * (0.5 + 0.5 * nervous));
        dartPitch = MathUtils.degToRad(randomBetween(-5, 5));
      } else {
        dartYaw = 0;
        dartPitch = 0;
      }
      nextDart =
        dartYaw === 0 ? randomBetween(0.5, 2.4) / (0.4 + nervous) : randomBetween(0.18, 0.45);
    }
    nextMicro -= dt;
    if (nextMicro <= 0) {
      microYaw = MathUtils.degToRad(randomBetween(-1, 1));
      microPitch = MathUtils.degToRad(randomBetween(-0.8, 0.8));
      nextMicro = randomBetween(0.25, 0.9);
    }
    let yaw = gazeYawManual + microYaw + dartYaw * (lookPoint ? 0.35 : 1);
    let pit = gazePitchManual + microPitch + dartPitch * (lookPoint ? 0.35 : 1);
    if (lookPoint) {
      const head = procOf("Head").bone;
      tmpM.copy(head.matrixWorld).invert();
      tmpV.copy(lookPoint).applyMatrix4(tmpM).sub(eyeMid);
      const f = tmpV.dot(headFwd);
      yaw += Math.atan2(tmpV.dot(headLeft), Math.max(0.05, f));
      pit += Math.atan2(tmpV.dot(headUp), Math.hypot(f, tmpV.dot(headLeft)));
    }
    yaw = MathUtils.clamp(yaw, -GAZE_YAW, GAZE_YAW);
    pit = MathUtils.clamp(pit, -GAZE_DOWN, GAZE_UP);
    // saccade: very fast spring, so jumps take about two frames
    spring1(gazeYaw, yaw, 38, dt);
    spring1(gazePitch, pit, 38, dt);
    // direction in head space, then the rotation from the rest forward, applied in the eye's parent (Head) space
    const cy = Math.cos(gazeYaw.x);
    tmpV
      .copy(headFwd)
      .multiplyScalar(cy * Math.cos(gazePitch.x))
      .addScaledVector(headLeft, Math.sin(gazeYaw.x) * Math.cos(gazePitch.x))
      .addScaledVector(headUp, Math.sin(gazePitch.x))
      .normalize();
    tmpQ.setFromUnitVectors(headFwd, tmpV);
    for (const n of ["EyeRoot_L", "EyeRoot_R"] as const) {
      const p = procOf(n);
      p.bone.quaternion.copy(tmpQ).multiply(p.base);
    }
    pupil = damp(pupil, pupilGoal * (1 - 0.12 * nervous), 8, dt);
    for (const n of ["Pupil_L", "Pupil_R"] as const)
      procOf(n).bone.scale.copy(procOf(n).baseScale).multiplyScalar(pupil);
    // the upper lid follows a downward look
    return Math.max(0, -gazePitch.x / GAZE_DOWN) * 0.14;
  };

  const updateBreath = () => {
    const rate = MathUtils.lerp(0.26, 0.45, nervous);
    const phase = clock * rate * Math.PI * 2;
    // a toy holding her breath: small, with a hitch
    const hide = context === "toy" ? 0.45 : 1;
    const s = Math.sin(phase) * breath * hide;
    const hitch = context === "toy" ? Math.max(0, Math.sin(phase * 0.5 + 1)) ** 8 * 0.6 : 0;
    const a = MathUtils.degToRad(1.9) * (s + hitch);
    rotLocal("Spine_2", -a * 0.4, 0, 0);
    rotLocal("Ribcage", -a * 0.6, 0, 0);
    rotLocal("Clavic_L", 0, 0, a * 0.7);
    rotLocal("Clavic_R", 0, 0, -a * 0.7);
  };

  const updateTremble = () => {
    const toy = context === "toy" ? 1 : 0.25;
    const amp = MathUtils.degToRad(0.55) * nervous * toy;
    if (amp <= 0) return;
    const t = clock;
    const n1 = Math.sin(t * 47) * 0.5 + Math.sin(t * 61 + 1.3) * 0.3 + Math.sin(t * 83 + 2.1) * 0.2;
    const n2 = Math.sin(t * 53 + 0.7) * 0.5 + Math.sin(t * 71 + 2.9) * 0.5;
    rotLocal("Arm_Upper_1_R", amp * n1, 0, amp * n2);
    rotLocal("Arm_Upper_1_L", amp * 0.5 * n2, 0, amp * 0.5 * n1);
    rotLocal("Spine_2", amp * 0.2 * n2, 0, amp * 0.25 * n1);
  };

  const updateFlight = (dt: number) => {
    const goal = flight ? MathUtils.clamp(flight.amount ?? 1, 0, 1) : 0;
    flightAmount = damp(flightAmount, goal, 4, dt);
    spring1(bank, flight ? (flight.bank ?? 0) : 0, 5, dt);
    spring1(pitch, flight ? (flight.pitch ?? 0) : 0, 5, dt);
    const a = flightAmount;
    const t = clock;
    const r = reaction;
    let spin = 0;
    let jolt = 0;
    if (r && r.jolt > 0) {
      const k = MathUtils.clamp(r.t / r.duration, 0, 1);
      if (context === "flight" && r.kind === "click")
        spin = MathUtils.smootherstep(k, 0, 1) * Math.PI * 2;
      else jolt = Math.sin(k * Math.PI) * Math.exp(-3 * k) * r.jolt;
    }
    // roll about the way she is travelling: her front when upright, her head when the pivot lays her prone
    const along = MathUtils.clamp(pivot.rotation.x, 0, Math.PI / 2);
    swayAxis.set(0, Math.sin(along), Math.cos(along));
    swayRoll.setFromAxisAngle(
      swayAxis,
      bank.x + a * 0.07 * wobble(t * 0.6, 3) + spin + jolt * 0.03 * Math.sin(t * 40),
    );
    swayRest.setFromEuler(
      tmpE.set(
        pitch.x + a * 0.05 * wobble(t * 0.7, 1) + jolt * 0.05,
        a * 0.04 * wobble(t * 0.5, 2),
        0,
        "XYZ",
      ),
    );
    sway.quaternion.copy(swayRoll).multiply(swayRest);
    sway.position.set(0, a * 0.03 * Math.sin(t * 1.4) + jolt * 0.012, 0);
    // the upper body leans into the bank more than the hips
    if (a > 0.001) rotLocal("Spine_1", 0, 0, bank.x * 0.25 * a);
  };

  const updateHair = (dt: number) => {
    // a damped spring on a point below the head: its lag is the hair's swing (world space)
    const head = procOf("Head").bone;
    tmpV.set(0, -0.05, 0).applyMatrix4(head.matrixWorld);
    if (!hairReady) {
      hairPos.copy(tmpV);
      hairVel.set(0, 0, 0);
      hairReady = true;
    }
    const s = root.scale.x;
    const k = 60;
    const c = 2 * Math.sqrt(k) * 0.32;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      tmpV2.copy(tmpV).sub(hairPos).multiplyScalar(k).addScaledVector(hairVel, -c);
      hairVel.addScaledVector(tmpV2, h);
      hairPos.addScaledVector(hairVel, h);
    }
    hairLag.copy(hairPos).sub(tmpV);
    const max = 0.045 * s;
    if (hairLag.length() > max) {
      hairLag.setLength(max);
      hairPos.copy(tmpV).add(hairLag);
    }
    // to the mesh's local space
    mesh.updateWorldMatrix(true, false);
    tmpM.copy(mesh.matrixWorld).invert();
    tmpV3
      .copy(hairLag)
      .transformDirection(tmpM)
      .multiplyScalar(hairLag.length() / Math.max(1e-6, s));
    if (flight?.velocity && flightAmount > 0.01) {
      tmpV2.set(flight.velocity.x, flight.velocity.y, flight.velocity.z);
      const speed = tmpV2.length() / Math.max(1e-6, s);
      if (speed > 1e-4) {
        tmpV2
          .transformDirection(tmpM)
          .multiplyScalar(-0.025 * Math.min(1, speed / 6) * flightAmount);
        tmpV3.add(tmpV2);
      }
    }
    uniforms.uHairOffset.value.copy(tmpV3);
    uniforms.uHairFlutter.value = 0.0025 * flightAmount;
  };

  const updateBackpack = (dt: number) => {
    const pack = procOf("Backpack").bone;
    tmpV.set(0, -0.12, -0.1).applyMatrix4(pack.matrixWorld);
    const s = root.scale.x;
    if (!packReady) {
      packPrev.copy(tmpV);
      packReady = true;
    }
    tmpV2
      .copy(tmpV)
      .sub(packPrev)
      .divideScalar(Math.max(1e-4, dt) * Math.max(1e-6, s));
    packPrev.copy(tmpV);
    // local velocity drives a swing opposite to the motion
    tmpM.copy(pack.matrixWorld).invert();
    tmpV2.transformDirection(tmpM).multiplyScalar(Math.min(4, tmpV2.length()));
    spring1(packFwd, MathUtils.clamp(tmpV2.z * 0.05, -0.14, 0.14), 9, dt);
    spring1(packSide, MathUtils.clamp(-tmpV2.x * 0.04, -0.1, 0.1), 9, dt);
    rotLocal("Backpack", packFwd.x, 0, packSide.x);
  };

  const updateShadow = () => {
    if (shadowY === null) {
      shadow.visible = false;
      return;
    }
    shadow.visible = shadowOpacity.value > 0.001;
    procOf("Spine_1").bone.getWorldPosition(tmpV);
    const s = root.scale.x;
    const height = Math.max(0, tmpV.y - shadowY) / Math.max(1e-6, s);
    shadow.position.set(tmpV.x, shadowY + 0.0002, tmpV.z);
    const spread = shadowSize * s * (1 + height * 0.35);
    shadow.scale.set(spread, spread, spread);
  };

  let lidFollow = 0;
  const update = (dtIn: number) => {
    const dt = MathUtils.clamp(dtIn, 0, 0.1);
    clock += dt;
    uniforms.uTime.value = clock;

    // idle life (yawn, stretch) when left alone on the ground
    if (autoIdle !== null && context === "ground" && !reaction) {
      idleClock += dt;
      if (idleClock > autoIdle) {
        lastIdle = lastIdle === "yawn" ? "stretch" : "yawn";
        react(lastIdle);
      }
    }
    stepReaction(dt);

    // 1. procedural bones back to rest, 2. weights and times, 3. evaluate, 4. offsets on top
    resetProc();
    updateBody(dt);
    const lead = leadClip();
    const { lidW, pupilGoal } = updateFace(dt, lead);
    updateLids(dt, lidW, lidFollow);
    mixer.update(0);
    captureBase();

    updateBreath();
    updateTremble();
    updateFlight(dt);
    root.updateMatrixWorld(true);
    updateHeadLook(dt, lead);
    procOf("Neck_1").bone.updateMatrixWorld(true);
    lidFollow = updateGaze(dt, pupilGoal);
    updateBackpack(dt);
    root.updateMatrixWorld(true);
    updateHair(dt);

    glowShown = damp(glowShown, glow, 18, dt);
    uniforms.uGlow.value = glowShown;
    halo.visible = glowShown > 0.004;
    haloSize.value = (1.9 + 0.5 * glowShown) * root.scale.x;
    updateShadow();
  };

  /* ---------------------------------------------------------------------- */
  /* API                                                                    */
  /* ---------------------------------------------------------------------- */

  const socket = (name: GodetteSocket, target = new Vector3()): Vector3 => {
    const def = SOCKETS.get(name);
    if (!def) return target.set(0, 0, 0);
    const b = bone(def.bone);
    b.updateWorldMatrix(true, false);
    socketOffset.set(def.offset[0], def.offset[1], def.offset[2]);
    return target.copy(socketOffset).applyMatrix4(b.matrixWorld);
  };

  const godette: Godette = {
    root,
    pivot,
    stand,
    shadow,
    hitProxy: proxies,
    mesh,
    get scale() {
      return root.scale.x;
    },
    set scale(value: number) {
      root.scale.setScalar(value);
    },
    clips: CLIP_NAMES,
    clipSpec,
    clipDuration,
    hasClip: (name) => body.has(name),
    async loadClips(group) {
      const g = await assets.gltf(base + "clips-" + group + ".glb");
      addBodyClips(g.animations);
    },
    setBody(next) {
      layers = next;
    },
    setFace(name, weight = 1) {
      if (name === "auto") {
        faceMode = "auto";
        return;
      }
      faceMode = "manual";
      manualFace = name;
      manualWeight = MathUtils.clamp(weight, 0, 1);
    },
    lookAt(point, headWeight = 1) {
      if (point === null) {
        lookPoint = null;
        return;
      }
      lookPoint = (lookPoint ?? new Vector3()).set(point.x, point.y, point.z);
      lookWeightTarget = MathUtils.clamp(headWeight, 0, 1);
    },
    setGaze(yaw, pitchValue) {
      gazeYawManual = yaw;
      gazePitchManual = pitchValue;
    },
    setNervous(amount) {
      nervous = MathUtils.clamp(amount, 0, 1);
    },
    setBreath(amount) {
      breath = Math.max(0, amount);
    },
    setFlight(next) {
      flight = next;
    },
    setGlow(amount) {
      glow = MathUtils.clamp(amount, 0, 1.5);
    },
    setLook(look) {
      if (look.rim !== undefined) uniforms.uRim.value = look.rim;
      if (look.rimColor !== undefined) uniforms.uRimColor.value.setHex(look.rimColor);
      if (look.rimPower !== undefined) uniforms.uRimPower.value = look.rimPower;
      if (look.lift !== undefined) uniforms.uLift.value = look.lift;
      if (look.glowColor !== undefined) uniforms.uGlowColor.value.setHex(look.glowColor);
      if (look.envMapIntensity !== undefined) material.envMapIntensity = look.envMapIntensity;
      if (look.toy !== undefined) {
        const toy = MathUtils.clamp(look.toy, 0, 1);
        material.roughness = MathUtils.lerp(0.62, 0.3, toy);
        material.metalness = MathUtils.lerp(0, 0.04, toy);
      }
    },
    setContext(next) {
      context = next;
    },
    setShadow(next) {
      if (next === null) {
        shadowY = null;
        return;
      }
      shadowY = next.y;
      shadowOpacity.value = MathUtils.clamp(next.opacity, 0, 1);
      if (next.size !== undefined) shadowSize = next.size;
    },
    setAutoIdle(seconds) {
      autoIdle = seconds;
      idleClock = 0;
    },
    react,
    blink,
    setBlinkRate(rate) {
      blinkRate = Math.max(0, rate);
    },
    socket,
    attach(name, object) {
      const def = SOCKETS.get(name);
      if (!def) return;
      object.position.set(def.offset[0], def.offset[1], def.offset[2]);
      bone(def.bone).add(object);
    },
    rootMotion(clip, time, target = new Vector3()) {
      const interp = rootTracks.get(clip);
      if (!interp) return target.set(0, 0, 0);
      const out = interp.evaluate(clampTime(clip, time));
      const x = out.at(0) ?? 0;
      const y = out.at(1) ?? 0;
      const z = out.at(2) ?? 0;
      return target.set(x, y, z);
    },
    update,
    async compile(renderer, camera, scene) {
      const was = [halo.visible, shadow.visible];
      halo.visible = true;
      shadow.visible = true;
      const holder = new Group();
      const parents = [shadow.parent, stand.parent];
      holder.add(shadow, stand);
      await renderer.compileAsync(root, camera, scene);
      await renderer.compileAsync(holder, camera, scene);
      holder.remove(shadow, stand);
      if (parents[0]) parents[0].add(shadow);
      if (parents[1]) parents[1].add(stand);
      halo.visible = was[0];
      shadow.visible = was[1];
    },
    dispose() {
      mixer.stopAllAction();
      for (const clip of clipsOwned) mixer.uncacheClip(clip);
      mixer.uncacheRoot(gltf.scene);
      for (const m of proxies) m.removeFromParent();
      gltf.scene.removeFromParent();
      standGltf.scene.removeFromParent();
      restoreBindPose(mesh.skeleton.bones);
      root.removeFromParent();
      shadow.removeFromParent();
      stand.removeFromParent();
      halo.removeFromParent();
      haloGeo.dispose();
      const mats = new Set<Material>([material, haloMat, shadowMat, proxyMat]);
      stand.traverse((o) => {
        if (o instanceof Mesh) {
          (o.geometry as BufferGeometry).dispose();
          const m = o.material as Material | Material[];
          if (Array.isArray(m)) for (const x of m) mats.add(x);
          else mats.add(m);
        }
      });
      for (const m of mats) {
        if (m instanceof MeshStandardMaterial) {
          m.map?.dispose();
        }
        m.dispose();
      }
      geometry.dispose();
      shadow.geometry.dispose();
      for (const g of proxyGeos) g.dispose();
      texture.dispose();
    },
  };
  return godette;
}
