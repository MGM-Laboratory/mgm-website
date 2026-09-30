import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  ShaderMaterial,
  Vector3,
  type Object3D,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";

import type { StoryLoaderLike, StoryTier } from "@/components/story/assets/types";
import {
  CARD_H,
  CARD_THICKNESS,
  CARD_W,
  loadCards,
  type CardKit,
  type HeroCard,
} from "@/components/story/props/card-mesh";
import {
  BRAND,
  DECK_BASE_URL,
  PRINT_GLSL,
  applyPrintPatch,
  clamp01,
  createPrintUniforms,
  hash01,
  patchShader,
  shaderChunk,
  smoothstep,
  tierPick,
  type PrintUniforms,
} from "@/components/story/props/deck-shared";
import { BILLBOARD_VERTEX } from "@/components/story/props/fx/star-sdf.glsl";

/**
 * The card box: the owner's wrap (`packaging.svg`, mapped exactly onto the
 * four walls), a lid hinged on the back top edge with its tuck flap, two
 * dust flaps, a bottom, a navy inside and a stack of cards. The lid, the
 * flap and the dust flaps bend on paper folds (arcs of constant length
 * that straighten as they open) and are rebuilt into one dynamic mesh when
 * their angles change, so the whole box costs a handful of draw calls.
 *
 * Box frame (metres): origin at the centre of the walls, +x the front's
 * outward normal, +y up, z across (seen from the front, screen left is
 * +z). The root is meant to sit at the story's stage point S with the
 * front toward the camera. `dropPose()` moves it along the baked fall.
 */

export const DECK_BOX_URL = `${DECK_BASE_URL}box.glb`;
export const DECK_DROP_URL = `${DECK_BASE_URL}box-drop.json`;

export function deckBoxTextureUrls(tier: StoryTier) {
  return {
    wrap: `${DECK_BASE_URL}${tierPick(tier, "box-wrap-4k", "box-wrap-4k", "box-wrap-2k")}.ktx2`,
    panels: `${DECK_BASE_URL}${tierPick(tier, "box-panels-2k", "box-panels-2k", "box-panels-1k")}.ktx2`,
  };
}

/** Lid angle (degrees) at `setLid(1)`: a little past upright. */
export const LID_OPEN_DEGREES = 118;
/** How far the dust flaps spring up (degrees) once the lid is out of their way. */
const DUST_SPRING_DEGREES = 34;
/** The tease card rises this far at `peek(1)` (half its length). */
export const PEEK_RISE = CARD_H / 2;
/** Cards in a full deck, for the stack's edge lines. */
const DECK_CARDS = 52;

export type DeckBoxDims = Readonly<{
  W: number;
  H: number;
  D: number;
  t: number;
  rc: number;
  rb: number;
  rh: number;
  rf: number;
  rd: number;
  gap: number;
  flapLen: number;
  flapCorner: number;
  dustLen: number;
  dustChamfer: number;
  lidX0: number;
  lidLen: number;
  flapHalf: number;
  dustHalf: number;
}>;

/** The baked fall (Rapier, see the deck pipeline): a pose every 1/hz s in the room frame. */
export type DeckDrop = Readonly<{
  hz: number;
  duration: number;
  /** x, y, z, qx, qy, qz, qw per frame. */
  frames: Float32Array;
  /** Seconds: first touch of the table, each later impact, and when it lies still. */
  firstContact: number;
  impacts: readonly number[];
  settled: number;
}>;

type DropJson = {
  hz: number;
  frames: number[][];
  events: { firstContact: number; impacts: number[]; settled: number };
};

export type DeckBox = {
  /** Place this at the stage point; everything else is its children. */
  readonly root: Group;
  readonly dims: DeckBoxDims;
  readonly drop: DeckDrop;
  /** The tease card (a real card mesh; its back faces the box front). */
  readonly peekCard: HeroCard;
  /** 0 closed, 1 open (LID_OPEN_DEGREES); up to 1.25 for an overshoot. */
  setLid(open: number): void;
  /** 0 tucked (folded 90 degrees), 1 straight; up to 1.3 for a flick back. */
  setFlap(open: number): void;
  /** 0 in the box, 1 half out. It lifts the lid and the flap as it rises. */
  peek(amount: number): void;
  /** Cards left in the box, 0 empty to 1 full. */
  setStack(fill: number): void;
  /** Warm light inside the open box and the rays out of it (0..1). */
  setGlow(amount: number): void;
  /**
   * A glint band sweeping the box: `phase` 0 enters at the bottom left (seen
   * from the front), 1 leaves at the top right. Brightest on the linework.
   */
  setGlint(phase: number, strength?: number): void;
  /** The baked fall at `progress` 0..1 (writes `target`, default the root). */
  dropPose(progress: number, target?: Object3D): void;
  /** The baked fall at `seconds` from the release. */
  dropAt(seconds: number, target?: Object3D): void;
  setEnvironment(texture: Texture | null, intensity?: number): void;
  /** Clock-driven life (the rays' flicker). Never changes the story state. */
  update(time: number): void;
  dispose(): void;
};

export type DeckBoxOptions = {
  tier: StoryTier;
  /** The card kit to share with the swarm (loaded if omitted). */
  cards?: CardKit;
};

// ---------------------------------------------------------------------------------------- geometry

type FlatGeometry = {
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  mask: Float32Array;
  index: number[];
};

/**
 * Reads a (possibly quantized) glTF mesh into plain floats in the frame of
 * `frame` (the box node), so meshopt's dequantization transforms on the
 * nodes are baked in and every vertex is in box metres.
 */
function flatten(mesh: Mesh, frame: Object3D): FlatGeometry {
  frame.updateMatrixWorld(true);
  const matrix = new Matrix4().copy(frame.matrixWorld).invert().multiply(mesh.matrixWorld);
  const normalMatrix = new Matrix3().getNormalMatrix(matrix);
  const g = mesh.geometry;
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  const c = g.hasAttribute("color") ? g.getAttribute("color") : null;
  const count = p.count;
  const out: FlatGeometry = {
    pos: new Float32Array(count * 3),
    nrm: new Float32Array(count * 3),
    uv: new Float32Array(count * 2),
    mask: new Float32Array(count * 4),
    index: [],
  };
  const v = new Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(p, i)
      .applyMatrix4(matrix)
      .toArray(out.pos, i * 3);
    v.fromBufferAttribute(n, i)
      .applyMatrix3(normalMatrix)
      .normalize()
      .toArray(out.nrm, i * 3);
    out.uv.set([uv.getX(i), uv.getY(i)], i * 2);
    out.mask.set(c ? [c.getX(i), c.getY(i), c.getZ(i), 1] : [0, 0, 0, 1], i * 4);
  }
  const index = g.getIndex();
  if (index) for (let i = 0; i < index.count; i++) out.index.push(index.getX(i));
  return out;
}

function toGeometry(flat: FlatGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(flat.pos, 3));
  geometry.setAttribute("normal", new BufferAttribute(flat.nrm, 3));
  geometry.setAttribute("uv", new BufferAttribute(flat.uv, 2));
  geometry.setAttribute("aMask", new BufferAttribute(flat.mask, 4));
  geometry.setIndex(flat.index);
  geometry.computeBoundingSphere();
  return geometry;
}

/** A paper fold: an arc of constant length from a root frame, bending by `phi` toward `N0`. */
type Fold = {
  P0: Vector3;
  T0: Vector3;
  N0: Vector3;
  Z: Vector3;
  w0: number;
  w1: number;
  length: number;
};

const FOLD_SEGMENTS = 6;
const FOLD_VERTS = (FOLD_SEGMENTS + 1) * 8;

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpN = new Vector3();

/** Point, tangent and printed-side normal at arc length `s` of a fold bent by `phi`. */
function foldAt(fold: Fold, phi: number, s: number, p: Vector3, tangent: Vector3, normal: Vector3) {
  const k = phi / fold.length;
  const alpha = k * s;
  const along = Math.abs(k) < 1e-6 ? s : Math.sin(alpha) / k;
  const across = Math.abs(k) < 1e-6 ? 0 : (1 - Math.cos(alpha)) / k;
  p.copy(fold.P0).addScaledVector(fold.T0, along).addScaledVector(fold.N0, across);
  tangent.copy(fold.T0).multiplyScalar(Math.cos(alpha)).addScaledVector(fold.N0, Math.sin(alpha));
  normal.copy(fold.T0).multiplyScalar(Math.sin(alpha)).addScaledVector(fold.N0, -Math.cos(alpha));
}

/** The frame at a fold's end: x = tangent, y = printed normal, z = the width axis. */
function foldEndMatrix(fold: Fold, phi: number, out: Matrix4) {
  const p = new Vector3();
  const tangent = new Vector3();
  const normal = new Vector3();
  foldAt(fold, phi, fold.length, p, tangent, normal);
  return out.makeBasis(tangent, normal, fold.Z).setPosition(p);
}

// ---------------------------------------------------------------------------------------- shaders

const STACK_VERTEX_DECL = /* glsl */ `
attribute float aFace;
varying float vFace;
varying vec3 vStackLocal;
`;

const STACK_FRAGMENT_DECL = /* glsl */ `
uniform float uCount;
uniform float uThickness;
uniform float uGlowAmount;
uniform vec3 uGlowTint;
uniform vec3 uEdgeTint;
varying float vFace;
varying vec3 vStackLocal;
${PRINT_GLSL}
`;

const STACK_MAP = /* glsl */ `
vec4 stackTexel;
if (vFace < 0.5) {
  stackTexel = texture2D(map, vMapUv);
} else {
  // Card edges: one fine groove per card across the stack's thickness, anti-aliased away.
  float u = -vStackLocal.x / uThickness * uCount;
  float w = fwidth(u);
  float groove = 1.0 - smoothstep(0.0, max(w, 0.02), abs(fract(u) - 0.5) - 0.36);
  groove *= 1.0 - smoothstep(0.35, 1.2, w);
  float tone = 0.94 + 0.05 * printGrain(vec2(floor(u), 7.0));
  stackTexel = vec4(uEdgeTint * mix(tone, 0.8, groove), 1.0);
}
diffuseColor *= stackTexel;
`;

const STACK_OUTPUT = /* glsl */ `
outgoingLight += uGlowTint * uGlowAmount * step(0.5, vFace) * smoothstep(-0.04, 0.045, vStackLocal.y) * 0.45;
${shaderChunk("opaque_fragment")}
`;

const RAYS_VERTEX = /* glsl */ `
attribute vec4 aRay;
uniform float uTime;
varying vec2 vRayUv;
varying float vRayFlicker;
void main() {
  vRayUv = uv;
  float yaw = aRay.x + uTime * 0.12 * (aRay.w - 0.5);
  float c = cos(yaw);
  float s = sin(yaw);
  vec3 p = vec3(position.x * aRay.y, position.y * aRay.z, 0.0);
  p = vec3(c * p.x, p.y, -s * p.x);
  vRayFlicker = 0.72 + 0.28 * sin(uTime * (1.3 + aRay.w * 1.7) + aRay.x * 3.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const RAYS_FRAGMENT = /* glsl */ `
uniform float uGlowAmount;
uniform vec3 uGlowTint;
varying vec2 vRayUv;
varying float vRayFlicker;
void main() {
  float across = 1.0 - abs(vRayUv.x * 2.0 - 1.0);
  float along = vRayUv.y;
  float a = pow(across, 2.2) * pow(1.0 - along, 1.6) * smoothstep(0.0, 0.06, along);
  gl_FragColor = vec4(uGlowTint * a * uGlowAmount * vRayFlicker * 0.32, 1.0);
}
`;

const HALO_FRAGMENT = /* glsl */ `
uniform float uGlowAmount;
uniform vec3 uGlowTint;
varying vec2 vQuad;
void main() {
  float r = length(vQuad * vec2(1.0, 1.7));
  float a = exp(-r * r * 6.0) * 0.28 + exp(-r * r * 48.0) * 0.3;
  vec3 col = mix(uGlowTint, vec3(1.0, 0.95, 0.84), exp(-r * r * 30.0));
  gl_FragColor = vec4(col * a * uGlowAmount, 1.0);
}
`;

// ---------------------------------------------------------------------------------------- loader

export async function loadDeckBox(
  assets: StoryLoaderLike,
  options: DeckBoxOptions,
): Promise<DeckBox> {
  const { tier } = options;
  const urls = deckBoxTextureUrls(tier);
  const [gltf, wrapTex, panelsTex, dropJson, kit] = await Promise.all([
    assets.gltf(DECK_BOX_URL),
    assets.texture(urls.wrap, { srgb: true, flipY: false }),
    assets.texture(urls.panels, { srgb: true, flipY: false }),
    assets.json<DropJson>(DECK_DROP_URL),
    options.cards ? Promise.resolve(options.cards) : loadCards(assets, tier),
  ]);
  for (const texture of [wrapTex, panelsTex]) {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
  }

  const boxNode = gltf.scene.getObjectByName("deck_box");
  const dims = (boxNode?.userData as { deckBox?: DeckBoxDims } | undefined)?.deckBox;
  if (!boxNode || !dims) throw new Error("deck box: box.glb is missing its deck_box node");

  const meshesOf = (name: string) => {
    const found: Mesh[] = [];
    boxNode.getObjectByName(name)?.traverse((child) => {
      if (child instanceof Mesh) found.push(child);
    });
    return found;
  };
  const partOf = (name: string) => {
    const mesh = meshesOf(name).at(0);
    if (!mesh) throw new Error(`deck box: box.glb is missing ${name}`);
    return flatten(mesh, boxNode);
  };

  const { W, H, D, t } = dims;
  const a = D / 2;
  const b = W / 2;

  // ---------------------------------------------------------------- materials
  const uniforms: PrintUniforms = createPrintUniforms();
  uniforms.uGlowOrigin.value.set(0, H / 2 - 0.012, 0);
  uniforms.uGlowReach.value = 0.034;
  const wrapMaterial = new MeshPhysicalMaterial({
    map: wrapTex,
    roughness: 0.6,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
    envMapIntensity: 1,
  });
  wrapMaterial.name = "story-box-wrap";
  applyPrintPatch(wrapMaterial, uniforms);
  const panelsMaterial = new MeshPhysicalMaterial({
    map: panelsTex,
    roughness: 0.6,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
    envMapIntensity: 1,
    side: DoubleSide,
  });
  panelsMaterial.name = "story-box-panels";
  applyPrintPatch(panelsMaterial, uniforms);
  // The panels material is double sided only for the thin boards seen edge on; the shell's own
  // inside faces carry their own geometry, so back faces never show through.
  panelsMaterial.side = DoubleSide;

  const root = new Group();
  root.name = "story-deck-box";

  // ---------------------------------------------------------------- the static shell
  const shellParts = meshesOf("box_shell");
  const shellGroup = new Group();
  shellGroup.name = "box-shell";
  for (const mesh of shellParts) {
    const materialName = Array.isArray(mesh.material) ? "" : mesh.material.name;
    const geometry = toGeometry(flatten(mesh, boxNode));
    const shellMesh = new Mesh(
      geometry,
      materialName === "box_wrap" ? wrapMaterial : panelsMaterial,
    );
    shellMesh.name = materialName === "box_wrap" ? "box-wrap" : "box-panels";
    shellGroup.add(shellMesh);
  }
  root.add(shellGroup);

  // ---------------------------------------------------------------- the moving boards (one mesh)
  const lidPart = partOf("box_lid");
  const flapPart = partOf("box_flap");
  const dustPart = partOf("box_dust");
  const atlasSwatch = (
    boxNode.userData as { deckBox?: { atlas?: { blue: number[]; navy: number[]; edge: number[] } } }
  ).deckBox?.atlas ?? { blue: [0.8, 0.77], navy: [0.94, 0.77], edge: [0.745, 0.77] };

  const lidFold: Fold = {
    P0: new Vector3(-a, H / 2, 0),
    T0: new Vector3(0, 1, 0),
    N0: new Vector3(1, 0, 0),
    Z: new Vector3(0, 0, 1),
    w0: -b,
    w1: b,
    length: (dims.rh * Math.PI) / 2,
  };
  const flapFold: Fold = {
    P0: new Vector3(dims.lidLen, 0, 0),
    T0: new Vector3(1, 0, 0),
    N0: new Vector3(0, -1, 0),
    Z: new Vector3(0, 0, 1),
    w0: -dims.flapHalf,
    w1: dims.flapHalf,
    length: (dims.rf * Math.PI) / 2,
  };
  const dustFolds: Fold[] = [1, -1].map((side) => ({
    P0: new Vector3(0, H / 2, side * b),
    T0: new Vector3(0, 1, 0),
    N0: new Vector3(0, 0, -side),
    Z: new Vector3(side, 0, 0),
    w0: -dims.dustHalf,
    w1: dims.dustHalf,
    length: (dims.rd * Math.PI) / 2,
  }));

  // Layout of the dynamic mesh: [lid fold][lid][flap fold][flap][dust fold +z][dust +z][dust fold -z][dust -z]
  const templates = [null, lidPart, null, flapPart, null, dustPart, null, dustPart] as const;
  const offsets: number[] = [];
  let totalVerts = 0;
  for (const part of templates) {
    offsets.push(totalVerts);
    totalVerts += part ? part.pos.length / 3 : FOLD_VERTS;
  }
  const dynPos = new Float32Array(totalVerts * 3);
  const dynNrm = new Float32Array(totalVerts * 3);
  const dynUv = new Float32Array(totalVerts * 2);
  const dynMask = new Float32Array(totalVerts * 4);
  const dynIndex: number[] = [];

  // Static attributes: template UVs and masks, fold swatches.
  templates.forEach((part, slot) => {
    const base = offsets.at(slot) ?? 0;
    if (part) {
      dynUv.set(part.uv, base * 2);
      dynMask.set(part.mask, base * 4);
      for (const i of part.index) dynIndex.push(i + base);
      return;
    }
    // A fold: 8 vertices per arc sample: outer w0, outer w1, inner w0, inner w1, side0 (outer, inner), side1 (outer, inner).
    for (let s = 0; s <= FOLD_SEGMENTS; s++) {
      const v = base + s * 8;
      const uvFor = (k: number) =>
        k < 2 ? atlasSwatch.blue : k < 4 ? atlasSwatch.navy : atlasSwatch.edge;
      const maskFor = (k: number) => (k < 2 ? 0 : k < 4 ? 1 : 0.5);
      for (let k = 0; k < 8; k++) {
        dynUv.set(uvFor(k).slice(0, 2), (v + k) * 2);
        dynMask.set([maskFor(k), 0, 0, 1], (v + k) * 4);
      }
    }
  });

  const partMatrix = new Matrix4();
  const partNormal = new Matrix3();
  const writeTemplate = (slot: number, part: FlatGeometry, matrix: Matrix4) => {
    const base = offsets.at(slot) ?? 0;
    partNormal.getNormalMatrix(matrix);
    const count = part.pos.length / 3;
    for (let i = 0; i < count; i++) {
      tmpA
        .fromArray(part.pos, i * 3)
        .applyMatrix4(matrix)
        .toArray(dynPos, (base + i) * 3);
      tmpN
        .fromArray(part.nrm, i * 3)
        .applyMatrix3(partNormal)
        .normalize()
        .toArray(dynNrm, (base + i) * 3);
    }
  };
  const foldP = new Vector3();
  const foldT = new Vector3();
  const foldN = new Vector3();
  const outer0 = new Vector3();
  const outer1 = new Vector3();
  const inner0 = new Vector3();
  const inner1 = new Vector3();
  const inward = new Vector3();
  const side0 = new Vector3();
  let foldBase = 0;
  let foldMatrix: Matrix4 | null = null;
  const put = (k: number, point: Vector3, normal: Vector3) => {
    tmpA.copy(point);
    tmpB.copy(normal);
    if (foldMatrix) {
      tmpA.applyMatrix4(foldMatrix);
      tmpB.applyMatrix3(partNormal).normalize();
    }
    tmpA.toArray(dynPos, (foldBase + k) * 3);
    tmpB.toArray(dynNrm, (foldBase + k) * 3);
  };
  const writeFold = (slot: number, fold: Fold, phi: number, matrix: Matrix4 | null) => {
    const base = offsets.at(slot) ?? 0;
    foldMatrix = matrix;
    if (matrix) partNormal.getNormalMatrix(matrix);
    for (let s = 0; s <= FOLD_SEGMENTS; s++) {
      foldAt(fold, phi, (fold.length * s) / FOLD_SEGMENTS, foldP, foldT, foldN);
      foldBase = base + s * 8;
      outer0.copy(foldP).addScaledVector(fold.Z, fold.w0);
      outer1.copy(foldP).addScaledVector(fold.Z, fold.w1);
      inner0.copy(outer0).addScaledVector(foldN, -t);
      inner1.copy(outer1).addScaledVector(foldN, -t);
      inward.copy(foldN).negate();
      side0.copy(fold.Z).negate();
      put(0, outer0, foldN);
      put(1, outer1, foldN);
      put(2, inner0, inward);
      put(3, inner1, inward);
      put(4, outer0, side0);
      put(5, inner0, side0);
      put(6, outer1, fold.Z);
      put(7, inner1, fold.Z);
    }
  };

  const dynGeometry = new BufferGeometry();
  const dynPosAttr = new BufferAttribute(dynPos, 3).setUsage(DynamicDrawUsage);
  const dynNrmAttr = new BufferAttribute(dynNrm, 3).setUsage(DynamicDrawUsage);
  dynGeometry.setAttribute("position", dynPosAttr);
  dynGeometry.setAttribute("normal", dynNrmAttr);
  dynGeometry.setAttribute("uv", new BufferAttribute(dynUv, 2));
  dynGeometry.setAttribute("aMask", new BufferAttribute(dynMask, 4));

  // Pose state.
  let lidOpen = 0;
  let flapOpen = 0;
  let peekAmount = 0;
  const lidMatrix = new Matrix4();
  const flapEnd = new Matrix4();

  const rebuild = () => {
    const peekLid = smoothstep(0.02, 0.45, peekAmount) * 0.36;
    const peekFlap = smoothstep(0.0, 0.35, peekAmount) * 0.95;
    const lid = Math.max(lidOpen, peekLid);
    const flap = Math.max(flapOpen, peekFlap);
    const phiLid = ((90 - lid * LID_OPEN_DEGREES) * Math.PI) / 180;
    const phiFlap = (90 * (1 - flap) * Math.PI) / 180;
    const dustLift = smoothstep(0.04, 0.42, lid) * DUST_SPRING_DEGREES;
    const phiDust = ((90 - dustLift) * Math.PI) / 180;

    writeFold(0, lidFold, phiLid, null);
    foldEndMatrix(lidFold, phiLid, lidMatrix);
    writeTemplate(1, lidPart, lidMatrix);
    writeFold(2, flapFold, phiFlap, lidMatrix);
    foldEndMatrix(flapFold, phiFlap, flapEnd);
    partMatrix.multiplyMatrices(lidMatrix, flapEnd);
    writeTemplate(3, flapPart, partMatrix);
    dustFolds.forEach((fold, i) => {
      writeFold(4 + i * 2, fold, phiDust, null);
      writeTemplate(5 + i * 2, dustPart, foldEndMatrix(fold, phiDust, partMatrix));
    });
    dynPosAttr.needsUpdate = true;
    dynNrmAttr.needsUpdate = true;
  };

  // Fold quads: orient each against its intended normal once, in the closed pose.
  rebuild();
  templates.forEach((part, slot) => {
    if (part) return;
    const base = offsets.at(slot) ?? 0;
    const quads: [number, number, number, number, number][] = [
      [0, 1, 1, 0, 0],
      [2, 3, 3, 2, 2],
      [4, 5, 5, 4, 4],
      [6, 7, 7, 6, 6],
    ];
    for (let s = 0; s < FOLD_SEGMENTS; s++) {
      const r0 = base + s * 8;
      const r1 = r0 + 8;
      for (const [k0, k1, k2, k3, kn] of quads) {
        const i0 = r0 + k0;
        const i1 = r0 + k1;
        const i2 = r1 + k2;
        const i3 = r1 + k3;
        tmpA.fromArray(dynPos, i1 * 3).sub(tmpB.fromArray(dynPos, i0 * 3));
        tmpN.fromArray(dynPos, i2 * 3).sub(tmpB);
        const face = tmpA.cross(tmpN);
        const want = tmpB.fromArray(dynNrm, (r0 + kn) * 3);
        if (face.dot(want) >= 0) dynIndex.push(i0, i1, i2, i0, i2, i3);
        else dynIndex.push(i0, i2, i1, i0, i3, i2);
      }
    }
  });
  dynGeometry.setIndex(dynIndex);
  dynGeometry.computeBoundingSphere();
  if (dynGeometry.boundingSphere) dynGeometry.boundingSphere.radius = Math.max(W, H) * 0.9;
  const boards = new Mesh(dynGeometry, panelsMaterial);
  boards.name = "box-boards";
  root.add(boards);

  // ---------------------------------------------------------------- the stack and the tease card
  const stackThickness = DECK_CARDS * CARD_THICKNESS * 1.12;
  const stackFront = a - t - dims.gap - t - CARD_THICKNESS * 1.8;
  const cardBottom = -H / 2 + t;
  const stackGeometry = createStackGeometry(stackThickness);
  const stackMaterial = new MeshStandardMaterial({ map: kit.back, roughness: 0.7, metalness: 0 });
  stackMaterial.name = "story-box-stack";
  const stackUniforms = {
    uCount: { value: DECK_CARDS },
    uThickness: { value: stackThickness },
    uGlowAmount: { value: 0 },
    uGlowTint: { value: new Color(BRAND.warm) },
    uEdgeTint: { value: new Color(0xf2ede2) },
  };
  stackMaterial.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, stackUniforms);
    shader.vertexShader = patchShader(shader.vertexShader, [
      ["after", "common", STACK_VERTEX_DECL],
      ["after", "begin_vertex", "vFace = aFace;\nvStackLocal = position;"],
    ]);
    shader.fragmentShader = patchShader(shader.fragmentShader, [
      ["after", "common", STACK_FRAGMENT_DECL],
      ["replace", "map_fragment", STACK_MAP],
      ["replace", "opaque_fragment", STACK_OUTPUT],
    ]);
  };
  stackMaterial.customProgramCacheKey = () => "story-box-stack-v1";
  const stack = new Mesh(stackGeometry, stackMaterial);
  stack.name = "box-stack";
  // Behind the tease card: the stack's front face sits one card behind it.
  stack.position.set(stackFront - CARD_THICKNESS * 1.5, cardBottom + CARD_H / 2, 0);
  root.add(stack);

  const peekCard = kit.createHeroCard(null);
  // Card +z (its back) looks out of the box front, card x runs toward -z.
  peekCard.mesh.quaternion.setFromRotationMatrix(
    new Matrix4().makeBasis(new Vector3(0, 0, -1), new Vector3(0, 1, 0), new Vector3(1, 0, 0)),
  );
  const peekRest = new Vector3(stackFront, cardBottom + CARD_H / 2, 0);
  peekCard.mesh.position.copy(peekRest);
  peekCard.mesh.name = "box-peek-card";
  root.add(peekCard.mesh);

  // ---------------------------------------------------------------- glow: rays and a halo
  const glowUniforms = {
    uTime: { value: 0 },
    uGlowAmount: { value: 0 },
    uGlowTint: { value: new Color(BRAND.warm) },
    uSize: { value: W * 1.1 },
    uSpin: { value: 0 },
  };
  const rays = createRays(W, H, glowUniforms);
  rays.position.set(0, H / 2 + 0.001, 0);
  rays.visible = false;
  root.add(rays);
  const haloMaterial = new ShaderMaterial({
    uniforms: glowUniforms,
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const halo = new Mesh(new PlaneGeometry(1, 1), haloMaterial);
  halo.position.set(0, H / 2 + 0.004, 0);
  halo.renderOrder = 2;
  halo.frustumCulled = false;
  halo.visible = false;
  root.add(halo);

  // ---------------------------------------------------------------- drop
  const drop = parseDrop(dropJson);
  const qa = new Quaternion();
  const qb = new Quaternion();

  const materials = [wrapMaterial, panelsMaterial, stackMaterial, peekCard.material];
  const box: DeckBox = {
    root,
    dims,
    drop,
    peekCard,
    setLid(open) {
      const next = Math.max(0, Math.min(1.25, open));
      if (next === lidOpen) return;
      lidOpen = next;
      rebuild();
    },
    setFlap(open) {
      const next = Math.max(0, Math.min(1.3, open));
      if (next === flapOpen) return;
      flapOpen = next;
      rebuild();
    },
    peek(amount) {
      const next = clamp01(amount);
      if (next === peekAmount) return;
      peekAmount = next;
      peekCard.mesh.position.set(peekRest.x, peekRest.y + next * PEEK_RISE, 0);
      rebuild();
    },
    setStack(fill) {
      const f = clamp01(fill);
      stack.visible = f > 0.001;
      stack.scale.set(Math.max(f, 0.001), 1, 1);
      stackUniforms.uCount.value = Math.max(1, Math.round(DECK_CARDS * f));
    },
    setGlow(amount) {
      const g = clamp01(amount);
      uniforms.uGlow.value = g;
      stackUniforms.uGlowAmount.value = g;
      glowUniforms.uGlowAmount.value = g;
      rays.visible = g > 0.002;
      halo.visible = g > 0.002;
    },
    setGlint(phase, strength = 1) {
      // The band runs along (0, 0.8, -0.6): bottom left to top right seen from the front.
      const reach = H * 0.62;
      uniforms.uGlint.value.set(-reach + clamp01(phase) * reach * 2, 0.0065, strength);
    },
    dropPose(progress, target) {
      box.dropAt(clamp01(progress) * drop.duration, target);
    },
    dropAt(seconds, target = root) {
      const frames = drop.frames;
      const last = frames.length / 7 - 1;
      const f = Math.max(0, Math.min(last, seconds * drop.hz));
      const i0 = Math.floor(f);
      const i1 = Math.min(last, i0 + 1);
      const k = f - i0;
      const p0 = frames.subarray(i0 * 7, i0 * 7 + 7);
      const p1 = frames.subarray(i1 * 7, i1 * 7 + 7);
      const [x0, y0, z0, ax, ay, az, aw] = p0;
      const [x1, y1, z1, bx, by, bz, bw] = p1;
      target.position.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k);
      qa.set(ax, ay, az, aw);
      qb.set(bx, by, bz, bw);
      target.quaternion.slerpQuaternions(qa, qb, k);
    },
    setEnvironment(texture, intensity = 1) {
      for (const material of materials) {
        material.envMap = texture;
        material.envMapIntensity = intensity;
        material.needsUpdate = true;
      }
    },
    update(time) {
      glowUniforms.uTime.value = time;
    },
    dispose() {
      for (const child of shellGroup.children) (child as Mesh).geometry.dispose();
      dynGeometry.dispose();
      stackGeometry.dispose();
      rays.geometry.dispose();
      (rays.material as ShaderMaterial).dispose();
      halo.geometry.dispose();
      haloMaterial.dispose();
      wrapMaterial.dispose();
      panelsMaterial.dispose();
      stackMaterial.dispose();
      peekCard.dispose();
      root.removeFromParent();
    },
  };
  box.setGlint(0, 0);
  return box;
}

function parseDrop(json: DropJson): DeckDrop {
  const frames = new Float32Array(json.frames.length * 7);
  json.frames.forEach((frame, i) => {
    frames.set(frame.slice(0, 7), i * 7);
  });
  return {
    hz: json.hz,
    duration: (json.frames.length - 1) / json.hz,
    frames,
    firstContact: json.events.firstContact,
    impacts: json.events.impacts,
    settled: json.events.settled,
  };
}

/** A block of cards standing in the box: its front and back show the card back, the rest the edges. */
function createStackGeometry(thickness: number): BufferGeometry {
  const hw = CARD_W / 2;
  const hh = CARD_H / 2;
  const x0 = -thickness;
  const x1 = 0;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const face: number[] = [];
  const idx: number[] = [];
  // quad corners given counter-clockwise seen from outside
  type V3 = readonly [number, number, number];
  type V2 = readonly [number, number];
  const quad = (corners: readonly V3[], normal: V3, f: number, uvs?: readonly V2[]) => {
    const base = face.length;
    corners.forEach(([x, y, z], k) => {
      pos.push(x, y, z);
      nrm.push(...normal);
      const [u, v] = uvs?.at(k) ?? [0, 0];
      uv.push(u, v);
      face.push(f);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // Seen from +x (the box front), card x runs toward -z: u = 0.5 - z / W.
  quad(
    [
      [x1, -hh, hw],
      [x1, -hh, -hw],
      [x1, hh, -hw],
      [x1, hh, hw],
    ],
    [1, 0, 0],
    0,
    [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  );
  quad(
    [
      [x0, -hh, -hw],
      [x0, -hh, hw],
      [x0, hh, hw],
      [x0, hh, -hw],
    ],
    [-1, 0, 0],
    0,
    [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  );
  quad(
    [
      [x0, hh, hw],
      [x1, hh, hw],
      [x1, hh, -hw],
      [x0, hh, -hw],
    ],
    [0, 1, 0],
    1,
  );
  quad(
    [
      [x0, -hh, -hw],
      [x1, -hh, -hw],
      [x1, -hh, hw],
      [x0, -hh, hw],
    ],
    [0, -1, 0],
    1,
  );
  quad(
    [
      [x0, -hh, hw],
      [x1, -hh, hw],
      [x1, hh, hw],
      [x0, hh, hw],
    ],
    [0, 0, 1],
    1,
  );
  quad(
    [
      [x1, -hh, -hw],
      [x0, -hh, -hw],
      [x0, hh, -hw],
      [x1, hh, -hw],
    ],
    [0, 0, -1],
    1,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(nrm), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  geometry.setAttribute("aFace", new BufferAttribute(new Float32Array(face), 1));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Soft light rays fanning up out of the opening: vertical quads turned around the box's axis. */
function createRays(W: number, H: number, uniforms: Record<string, { value: unknown }>): Mesh {
  const count = 7;
  const pos: number[] = [];
  const uv: number[] = [];
  const ray: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = pos.length / 3;
    const yaw = (i / count) * Math.PI + hash01(i, 3) * 0.4;
    const width = W * (0.35 + hash01(i, 5) * 0.4);
    const height = H * (0.55 + hash01(i, 7) * 0.6);
    const corners: readonly (readonly [number, number, number, number])[] = [
      [-0.5, 0, 0, 0],
      [0.5, 0, 1, 0],
      [0.5, 1, 1, 1],
      [-0.5, 1, 0, 1],
    ];
    for (const [x, y, u, v] of corners) {
      pos.push(x, y, 0);
      uv.push(u, v);
      ray.push(yaw, width, height, hash01(i, 9));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  geometry.setAttribute("aRay", new BufferAttribute(new Float32Array(ray), 4));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: RAYS_VERTEX,
    fragmentShader: RAYS_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "box-rays";
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return mesh;
}
