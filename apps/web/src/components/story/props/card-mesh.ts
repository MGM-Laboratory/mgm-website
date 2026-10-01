import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Matrix4,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";

import type { StoryLoaderLike, StoryTier } from "@/components/story/assets/types";
import { STAR_SDF_GLSL } from "@/components/story/props/fx/star-sdf.glsl";
import {
  BRAND,
  DECK_BASE_URL,
  PRINT_GLSL,
  hash01,
  patchShader,
  shaderChunk,
  tierPick,
} from "@/components/story/props/deck-shared";

/**
 * The playing cards: one rounded, 0.3 mm thick card geometry, the owner's
 * back (`back.svg`, UASTC KTX2), a front that is either the generic printed
 * face or a live texture the cards act draws, and two ways to draw them:
 *
 * - the swarm: one InstancedMesh for every card in flight (one draw call),
 *   with per-instance flip (about the card's long axis) and bend (a curl
 *   along the length and a flex across the width) done in the vertex
 *   shader before the instance matrix;
 * - hero cards: plain meshes with their own front texture, bend and glint.
 *
 * Card frame: x across the width, y along the length, z the normal. The
 * back faces +z, the front -z (so a card seen from +z shows its back, and a
 * flip of pi about y turns it face up). The card's aspect is the back
 * artwork's (641 x 1078): the owner's back is never stretched.
 */

export const CARD_H = 0.088;
export const CARD_W = (CARD_H * 641) / 1078;
/** The artwork's own corner (rx 50 of 641). */
export const CARD_RADIUS = (CARD_W * 50) / 641;
export const CARD_THICKNESS = 0.0003;
/** The most cards a swarm allocates (a full deck); tiers draw fewer. */
export const SWARM_CAPACITY = 52;
/** Swarm size per tier (SPEC 1, `c-spring`): 52, 36, 24. */
export function swarmCountFor(tier: StoryTier): number {
  return tierPick(tier, 52, 36, 24);
}

export function cardBackUrl(tier: StoryTier): string {
  return `${DECK_BASE_URL}${tierPick(tier, "card-back-1k", "card-back-1k", "card-back-512")}.ktx2`;
}

function resolutionFor(tier: StoryTier) {
  return tierPick(
    tier,
    { arc: 5, middle: 10, cols: 6 },
    { arc: 4, middle: 8, cols: 5 },
    { arc: 3, middle: 5, cols: 3 },
  );
}

/** Face ids in the `aFace` attribute. */
const FACE_BACK = 0;
const FACE_FRONT = 1;
const FACE_EDGE = 2;

/**
 * Rows of vertices from the bottom edge to the top edge. Rows inside the
 * corner zones sit on the corner arcs, so each row's two end points lie on
 * the rounded outline and the face stays one clean grid (good for bending).
 */
function cardRows(arc: number, middle: number) {
  const hh = CARD_H / 2;
  const hw = CARD_W / 2;
  const r = CARD_RADIUS;
  const rows: { y: number; half: number }[] = [];
  for (let j = 0; j <= arc; j++) {
    const phi = (Math.PI / 2) * (1 - j / arc);
    rows.push({ y: -(hh - r + r * Math.sin(phi)), half: hw - r + r * Math.cos(phi) });
  }
  for (let j = 1; j < middle; j++) {
    rows.push({ y: -(hh - r) + (2 * (hh - r) * j) / middle, half: hw });
  }
  for (let j = 0; j <= arc; j++) {
    const phi = (Math.PI / 2) * (j / arc);
    rows.push({ y: hh - r + r * Math.sin(phi), half: hw - r + r * Math.cos(phi) });
  }
  return rows;
}

export function createCardGeometry(tier: StoryTier): BufferGeometry {
  const { arc, middle, cols } = resolutionFor(tier);
  const rows = cardRows(arc, middle);
  const hz = CARD_THICKNESS / 2;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const face: number[] = [];
  const idx: number[] = [];
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, f: number) => {
    pos.push(x, y, z);
    nrm.push(nx, ny, nz);
    uv.push(x / CARD_W + 0.5, 0.5 - y / CARD_H);
    face.push(f);
    return face.length - 1;
  };
  // The two faces: the back at +z (counter-clockwise seen from +z), the front at -z (reversed).
  for (const side of [1, -1]) {
    const grid = rows.map((row) => {
      const line: number[] = [];
      for (let i = 0; i <= cols; i++) {
        const x = -row.half + (2 * row.half * i) / cols;
        line.push(push(x, row.y, hz * side, 0, 0, side, side > 0 ? FACE_BACK : FACE_FRONT));
      }
      return line;
    });
    for (let r = 0; r < grid.length - 1; r++) {
      const lo = grid.at(r) ?? [];
      const hi = grid.at(r + 1) ?? [];
      for (let i = 0; i < cols; i++) {
        const a = lo.at(i) ?? 0;
        const b = lo.at(i + 1) ?? 0;
        const c = hi.at(i + 1) ?? 0;
        const d = hi.at(i) ?? 0;
        if (side > 0) idx.push(a, b, c, a, c, d);
        else idx.push(a, c, b, a, d, c);
      }
    }
  }
  // The edge ring: up the right side, then down the left side (counter-clockwise seen from +z).
  const outline: { x: number; y: number }[] = [
    ...rows.map((row) => ({ x: row.half, y: row.y })),
    ...rows.map((row) => ({ x: -row.half, y: row.y })).reverse(),
  ];
  const n = outline.length;
  const ring = outline.map((p, k) => {
    const prev = outline.at((k - 1 + n) % n) ?? p;
    const next = outline.at((k + 1) % n) ?? p;
    const ex = next.x - prev.x;
    const ey = next.y - prev.y;
    const len = Math.hypot(ex, ey) || 1;
    const nx = ey / len;
    const ny = -ex / len;
    return [push(p.x, p.y, hz, nx, ny, 0, FACE_EDGE), push(p.x, p.y, -hz, nx, ny, 0, FACE_EDGE)];
  });
  for (let k = 0; k < n; k++) {
    const [b0, f0] = ring.at(k) ?? [0, 0];
    const [b1, f1] = ring.at((k + 1) % n) ?? [0, 0];
    idx.push(b0, f0, f1, b0, f1, b1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(nrm), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  geometry.setAttribute("aFace", new BufferAttribute(new Float32Array(face), 1));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------------------------------- shader

const CARD_VERTEX_DECL = /* glsl */ `
attribute float aFace;
#ifdef CARD_SWARM
attribute float aFlip;
attribute vec2 aBend;
attribute float aSeed;
#else
uniform float uFlip;
uniform vec2 uBend;
uniform float uSeed;
#endif
uniform vec2 uCardHalf;
varying float vFace;
varying vec2 vCardPos;
varying float vSeed;
mat3 cardFlipMatrix(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}
`;

const CARD_NORMAL = /* glsl */ `
#ifdef CARD_SWARM
float cFlip = aFlip;
vec2 cBend = aBend;
vSeed = aSeed;
#else
float cFlip = uFlip;
vec2 cBend = uBend;
vSeed = uSeed;
#endif
vFace = aFace;
vCardPos = position.xy;
vec2 cGrad = vec2(2.0 * cBend.y * position.x / uCardHalf.x, 2.0 * cBend.x * position.y / uCardHalf.y);
objectNormal = normalize(objectNormal + vec3(-cGrad, 0.0) * objectNormal.z);
mat3 cRot = cardFlipMatrix(cFlip);
objectNormal = cRot * objectNormal;
`;

const CARD_POSITION = /* glsl */ `
transformed.z += cBend.x * position.y * position.y / uCardHalf.y + cBend.y * position.x * position.x / uCardHalf.x;
transformed = cRot * transformed;
`;

const CARD_FRAGMENT_DECL = /* glsl */ `
uniform vec2 uCardHalf;
uniform float uCardRadius;
uniform sampler2D uFront;
uniform float uFrontMode;
uniform float uFrontFlipY;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uEdge;
uniform vec3 uCardGlint;
uniform vec3 uCardGlintColor;
uniform float uPaperLift;
varying float vFace;
varying vec2 vCardPos;
varying float vSeed;
float cardLine = 0.0;
${PRINT_GLSL}
${STAR_SDF_GLSL}
float sdRoundRect(vec2 p, vec2 half_, float r) {
  vec2 q = abs(p) - half_ + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// The generic printed face of every card in the swarm: paper, a fine double frame, star pips.
vec3 genericFront(vec2 p) {
  float px = fwidth(p.x) * 1.2;
  vec2 half_ = uCardHalf;
  float f1 = abs(sdRoundRect(p, half_ - 0.0026, uCardRadius - 0.0022));
  float f2 = abs(sdRoundRect(p, half_ - 0.0034, uCardRadius - 0.0028));
  float frame = max(1.0 - smoothstep(0.00012, 0.00012 + px, f1), (1.0 - smoothstep(0.00006, 0.00006 + px, f2)) * 0.7);
  vec2 pip = vec2(half_.x - 0.0062, half_.y - 0.0078);
  float pips = sdFill(min(sdStar4(p - vec2(-pip.x, pip.y), 0.0032, 0.314), sdStar4(p - vec2(pip.x, -pip.y), 0.0032, 0.314)), px);
  float centre = sdStar4(p, 0.0105, 0.314);
  float ring = abs(length(p) - 0.0128);
  float ringLine = 1.0 - smoothstep(0.00009, 0.00009 + px, ring);
  float mark = sdFill(centre, px);
  vec3 col = uPaper * (0.985 + 0.015 * vSeed);
  col = mix(col, uInk, max(max(frame, pips), ringLine) * 0.92);
  col = mix(col, vec3(0.042, 0.153, 0.558), mark);
  cardLine = max(frame, max(pips, mark)) * 0.6;
  return col;
}
`;

const CARD_MAP = /* glsl */ `
vec4 cardTexel;
if (vFace < 0.5) {
  cardTexel = texture2D(map, vMapUv);
  cardLine = printLineMask(cardTexel.rgb);
} else if (vFace < 1.5) {
  vec2 fuv = vec2(1.0 - vMapUv.x, vMapUv.y);
  fuv.y = mix(fuv.y, 1.0 - fuv.y, uFrontFlipY);
  vec4 live = texture2D(uFront, fuv);
  vec3 generic = genericFront(vec2(-vCardPos.x, vCardPos.y));
  cardTexel = vec4(mix(generic, live.rgb, uFrontMode * live.a), 1.0);
} else {
  cardTexel = vec4(uEdge, 1.0);
}
diffuseColor *= cardTexel;
`;

const CARD_ROUGHNESS = /* glsl */ `
roughnessFactor = (vFace < 0.5 ? mix(0.55, 0.28, cardLine) : 0.5 - cardLine * 0.15) + (printGrain(gl_FragCoord.xy) - 0.5) * 0.05;
`;

const CARD_OUTPUT = /* glsl */ `
{
  vec2 q = vCardPos / uCardHalf;
  float along = dot(q, vec2(0.6, -0.8)) - uCardGlint.x;
  float band = exp(-along * along / max(uCardGlint.y * uCardGlint.y, 1e-6)) * uCardGlint.z;
  float onBack = 1.0 - step(0.5, vFace);
  float onFront = step(0.5, vFace) * (1.0 - step(1.5, vFace));
  outgoingLight += uCardGlintColor * band * mix(0.35, cardLine + 0.1, onBack);
  // Printed fronts stay paper white in the story's soft light (the owner's white card).
  outgoingLight += diffuseColor.rgb * uPaperLift * onFront;
}
${shaderChunk("opaque_fragment")}
`;

type CardUniforms = {
  uCardHalf: { value: Vector2 };
  uCardRadius: { value: number };
  uFront: { value: Texture | null };
  uFrontMode: { value: number };
  uFrontFlipY: { value: number };
  uPaper: { value: Color };
  uInk: { value: Color };
  uEdge: { value: Color };
  /** Glint band across the face: position (-1.4..1.4 sweeps corner to corner), half width, strength. */
  uCardGlint: { value: Vector3 };
  uCardGlintColor: { value: Color };
  /** Extra light on the printed front so its paper reads white (0..0.4). */
  uPaperLift: { value: number };
  uFlip: { value: number };
  uBend: { value: Vector2 };
  uSeed: { value: number };
};

function createCardUniforms(): CardUniforms {
  return {
    uCardHalf: { value: new Vector2(CARD_W / 2, CARD_H / 2) },
    uCardRadius: { value: CARD_RADIUS },
    uFront: { value: null },
    uFrontMode: { value: 0 },
    uFrontFlipY: { value: 0 },
    uPaper: { value: new Color(BRAND.paper) },
    uInk: { value: new Color(BRAND.navy) },
    uEdge: { value: new Color(0xf0ebdf) },
    uCardGlint: { value: new Vector3(-2, 0.18, 0) },
    uCardGlintColor: { value: new Color(0xfff2dc) },
    uPaperLift: { value: 0.2 },
    uFlip: { value: 0 },
    uBend: { value: new Vector2() },
    uSeed: { value: 0 },
  };
}

function createCardMaterial(back: Texture, uniforms: CardUniforms, swarm: boolean) {
  const material = new MeshStandardMaterial({
    map: back,
    roughness: 0.5,
    metalness: 0,
    envMapIntensity: 0.9,
  });
  material.name = swarm ? "story-card-swarm" : "story-card-hero";
  if (swarm) material.defines = { CARD_SWARM: "" };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = patchShader(shader.vertexShader, [
      ["after", "common", CARD_VERTEX_DECL],
      ["after", "beginnormal_vertex", CARD_NORMAL],
      ["after", "begin_vertex", CARD_POSITION],
    ]);
    shader.fragmentShader = patchShader(shader.fragmentShader, [
      ["after", "common", CARD_FRAGMENT_DECL],
      ["replace", "map_fragment", CARD_MAP],
      ["after", "roughnessmap_fragment", CARD_ROUGHNESS],
      ["replace", "opaque_fragment", CARD_OUTPUT],
    ]);
  };
  material.customProgramCacheKey = () => (swarm ? "story-card-swarm-v1" : "story-card-hero-v1");
  return material;
}

// ---------------------------------------------------------------------------------------- API

export type CardSwarm = {
  readonly mesh: InstancedMesh;
  /** Cards drawn this frame (<= capacity). */
  count: number;
  readonly capacity: number;
  /** Per-instance flip about the card's long axis, radians (0 = back toward +z). */
  readonly flip: Float32Array;
  /** Per-instance bend: [curl along the length, flex across the width], as a share of the half size. */
  readonly bend: Float32Array;
  setMatrixAt(index: number, matrix: Matrix4): void;
  setFlipAt(index: number, radians: number): void;
  setBendAt(index: number, curl: number, flex?: number): void;
  /** Uploads what changed this frame. */
  commit(): void;
  /** A glint band crossing every back (position -1.4..1.4, strength 0..1). */
  setGlint(position: number, strength: number, width?: number): void;
  dispose(): void;
};

export type HeroCard = {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  /**
   * A live front (a CanvasTexture drawn at CARD_W : CARD_H, or a render target texture); null
   * shows the generic printed face. Either flipY setting works; colour textures should be sRGB.
   */
  setFront(texture: Texture | null): void;
  setBend(curl: number, flex?: number): void;
  setGlint(position: number, strength: number, width?: number): void;
  dispose(): void;
};

export type CardKit = {
  readonly back: Texture;
  readonly geometry: BufferGeometry;
  readonly tier: StoryTier;
  createSwarm(count?: number): CardSwarm;
  createHeroCard(front?: Texture | null): HeroCard;
  dispose(): void;
};

const kits = new WeakMap<StoryLoaderLike, Map<StoryTier, Promise<CardKit>>>();

/**
 * Loads the card back and builds the shared geometry once per loader and
 * tier (the box's peek card and stack reuse the same kit).
 */
export function loadCards(assets: StoryLoaderLike, tier: StoryTier): Promise<CardKit> {
  let byTier = kits.get(assets);
  if (!byTier) {
    byTier = new Map();
    kits.set(assets, byTier);
  }
  const cached = byTier.get(tier);
  if (cached) return cached;
  const made = buildKit(assets, tier);
  byTier.set(tier, made);
  // A failed build (a texture that would not transcode) is not kept: the next call tries again.
  const forget = byTier;
  made.catch(() => {
    if (forget.get(tier) === made) forget.delete(tier);
  });
  return made;
}

async function buildKit(assets: StoryLoaderLike, tier: StoryTier): Promise<CardKit> {
  const back = await assets.texture(cardBackUrl(tier), { srgb: true, flipY: false });
  back.colorSpace = SRGBColorSpace;
  back.anisotropy = 4;
  const geometry = createCardGeometry(tier);
  // Live swarms and heroes, so `kit.dispose()` frees what the acts forgot; each leaves on its own dispose.
  const owned = new Set<{ dispose(): void }>();

  const createSwarm = (count = swarmCountFor(tier)): CardSwarm => {
    const capacity = SWARM_CAPACITY;
    // Instanced attributes live on a clone: a geometry shared with meshes of another instance
    // count cannot carry them (docs/animation-system.md gotcha 24).
    const swarmGeometry = geometry.clone();
    const flip = new Float32Array(capacity);
    const bend = new Float32Array(capacity * 2);
    const seed = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) seed.set([hash01(i, 11)], i);
    const flipAttr = new InstancedBufferAttribute(flip, 1).setUsage(DynamicDrawUsage);
    const bendAttr = new InstancedBufferAttribute(bend, 2).setUsage(DynamicDrawUsage);
    swarmGeometry.setAttribute("aFlip", flipAttr);
    swarmGeometry.setAttribute("aBend", bendAttr);
    swarmGeometry.setAttribute("aSeed", new InstancedBufferAttribute(seed, 1));
    const uniforms = createCardUniforms();
    const material = createCardMaterial(back, uniforms, true);
    const mesh = new InstancedMesh(swarmGeometry, material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = Math.min(count, capacity);
    // The swarm spans the screen; its bounding sphere would be the rest pose's.
    mesh.frustumCulled = false;
    mesh.name = "story-card-swarm";
    const swarm: CardSwarm = {
      mesh,
      capacity,
      flip,
      bend,
      get count() {
        return mesh.count;
      },
      set count(value: number) {
        mesh.count = Math.max(0, Math.min(capacity, Math.floor(value)));
      },
      setMatrixAt(index, matrix) {
        mesh.setMatrixAt(index, matrix);
      },
      setFlipAt(index, radians) {
        flipAttr.setX(index, radians);
      },
      setBendAt(index, curl, flex = 0) {
        bendAttr.setXY(index, curl, flex);
      },
      commit() {
        mesh.instanceMatrix.needsUpdate = true;
        flipAttr.needsUpdate = true;
        bendAttr.needsUpdate = true;
      },
      setGlint(position, strength, width = 0.18) {
        uniforms.uCardGlint.value.set(position, width, strength);
      },
      dispose() {
        owned.delete(swarm);
        swarmGeometry.dispose();
        material.dispose();
        mesh.dispose();
      },
    };
    owned.add(swarm);
    return swarm;
  };

  const createHeroCard = (front: Texture | null = null): HeroCard => {
    const uniforms = createCardUniforms();
    const material = createCardMaterial(back, uniforms, false);
    const mesh = new Mesh(geometry, material);
    mesh.name = "story-card-hero";
    const hero: HeroCard = {
      mesh,
      material,
      setFront(texture) {
        uniforms.uFront.value = texture;
        uniforms.uFrontMode.value = texture ? 1 : 0;
        // A canvas uploaded with flipY, or a render target (drawn bottom up), reads v upward.
        uniforms.uFrontFlipY.value =
          texture && (texture.flipY || texture.isRenderTargetTexture) ? 1 : 0;
      },
      setBend(curl, flex = 0) {
        uniforms.uBend.value.set(curl, flex);
      },
      setGlint(position, strength, width = 0.22) {
        uniforms.uCardGlint.value.set(position, width, strength);
      },
      dispose() {
        owned.delete(hero);
        // Drop the live front too, so a disposed hero never keeps an act's canvas reachable.
        uniforms.uFront.value = null;
        material.dispose();
      },
    };
    hero.setFront(front);
    uniforms.uSeed.value = 0.5;
    owned.add(hero);
    return hero;
  };

  return {
    back,
    geometry,
    tier,
    createSwarm,
    createHeroCard,
    dispose() {
      for (const item of [...owned]) item.dispose();
      owned.clear();
      geometry.dispose();
    },
  };
}

/** Forgets the cached kit of a loader (after `kit.dispose()`), so the next load builds a new one. */
export function forgetCards(assets: StoryLoaderLike) {
  kits.delete(assets);
}
