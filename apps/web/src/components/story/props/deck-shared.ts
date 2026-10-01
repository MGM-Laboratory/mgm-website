import type { StoryTier } from "@/components/story/assets/types";
import {
  Color,
  Vector2,
  Vector3,
  type Material,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";

/**
 * Pieces the deck's prop modules share: the brand palette as three.js
 * colours, a reproducible per-index hash (the story must look the same at
 * the same scroll position, so no clock-seeded randomness), and the satin
 * print patch that makes the box and the card backs read as varnished
 * board with glossy white linework and a moving glint.
 */

export const DECK_BASE_URL = "/story/v1/deck/";
export const LETTERS_BASE_URL = "/story/v1/letters/";

export const BRAND = {
  blue: 0x3a6dc5,
  yellow: 0xf7bf33,
  red: 0xf94141,
  green: 0x0f8657,
  ink: 0x0e1116,
  navy: 0x2d318a,
  paper: 0xfbfaf6,
  warm: 0xffc978,
} as const;

/** One value per quality tier, without indexing an object by a runtime key. */
export function tierPick<T>(tier: StoryTier, high: T, medium: T, low: T): T {
  return tier === "low" ? low : tier === "medium" ? medium : high;
}

/** A three.js shader chunk directive, built so no literal reads as markup to static analysers. */
export function shaderChunk(name: string): string {
  return `#include ${String.fromCharCode(60)}${name}${String.fromCharCode(62)}`;
}

/**
 * Edits a three.js shader source chunk by chunk: `after` keeps the chunk and
 * appends code, `replace` swaps it for code (which may re-include it).
 */
export function patchShader(
  source: string,
  edits: readonly (readonly ["after" | "replace", string, string])[],
): string {
  let out = source;
  for (const [mode, name, code] of edits) {
    const token = shaderChunk(name);
    out = out.replace(token, mode === "after" ? `${token}\n${code}` : code);
  }
  return out;
}

/** A float in [0, 1) from an integer and a salt. Same inputs, same output, on every device. */
export function hash01(index: number, salt = 0): number {
  let h =
    Math.imul((index | 0) ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul((salt | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** A float in [-1, 1) from an integer and a salt. */
export function hashSigned(index: number, salt = 0): number {
  return hash01(index, salt) * 2 - 1;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

/** The uniforms the print patch adds. One object per material; the prop updates it. */
export type PrintUniforms = {
  /** Glint band: position along `uGlintDir` (object space, metres), half width, strength. */
  uGlint: { value: Vector3 };
  uGlintDir: { value: Vector3 };
  uGlintColor: { value: Color };
  /** Warm light from inside the box (0..1), its origin (object space) and reach (metres). */
  uGlow: { value: number };
  uGlowColor: { value: Color };
  uGlowOrigin: { value: Vector3 };
  uGlowReach: { value: number };
  /** Roughness of the flat ink and of the white linework (spot gloss). */
  uRough: { value: Vector2 };
  /** Emboss of the linework (slope scale; 0 flat). */
  uEmboss: { value: number };
};

export function createPrintUniforms(): PrintUniforms {
  return {
    uGlint: { value: new Vector3(-1, 0.012, 0) },
    uGlintDir: { value: new Vector3(0, 0.8, -0.6).normalize() },
    uGlintColor: { value: new Color(0xfff4e2) },
    uGlow: { value: 0 },
    uGlowColor: { value: new Color(BRAND.warm) },
    uGlowOrigin: { value: new Vector3() },
    uGlowReach: { value: 0.05 },
    uRough: { value: new Vector2(0.62, 0.3) },
    uEmboss: { value: 0.00006 },
  };
}

/**
 * GLSL shared by the print patch and the card shader. `printLineMask` is 1
 * on the white linework and 0 on the ink fields, taken from the albedo
 * itself (linear space), so no extra map is needed. `printGrain` is a
 * cheap, stable hash for the paper's micro roughness.
 */
export const PRINT_GLSL = /* glsl */ `
float printLineMask(vec3 albedo) {
  return smoothstep(0.3, 0.72, min(albedo.r, min(albedo.g, albedo.b)));
}
float printGrain(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
`;

const VERTEX_DECL = /* glsl */ `
attribute vec4 aMask;
varying vec4 vPrintMask;
varying vec3 vPrintLocal;
`;

const FRAGMENT_DECL = /* glsl */ `
uniform vec3 uGlint;
uniform vec3 uGlintDir;
uniform vec3 uGlintColor;
uniform float uGlow;
uniform vec3 uGlowColor;
uniform vec3 uGlowOrigin;
uniform float uGlowReach;
uniform vec2 uRough;
uniform float uEmboss;
varying vec4 vPrintMask;
varying vec3 vPrintLocal;
float printLine = 0.0;
${PRINT_GLSL}
`;

// The inside of the box is uncoated board: matte, no varnish (so the navy stays navy in the light).
const PRINT_ROUGHNESS = /* glsl */ `
roughnessFactor = mix(uRough.x, uRough.y, printLine) + (printGrain(gl_FragCoord.xy + vPrintLocal.xy * 4000.0) - 0.5) * 0.06;
roughnessFactor = mix(roughnessFactor, 0.86, step(0.75, vPrintMask.x));
`;

const PRINT_COAT = /* glsl */ `
#ifdef USE_CLEARCOAT
material.clearcoat *= 1.0 - step(0.75, vPrintMask.x);
#endif
`;

// Raised linework: the line mask as a height field perturbing the normal (three's bump maths),
// faded out where a line is thinner than a couple of pixels so it never sparkles.
const PRINT_EMBOSS = /* glsl */ `
{
  vec2 dH = vec2(dFdx(printLine), dFdy(printLine)) * uEmboss;
  float fine = 1.0 - smoothstep(0.35, 0.9, fwidth(printLine));
  vec3 dpdx = dFdx(-vViewPosition);
  vec3 dpdy = dFdy(-vViewPosition);
  vec3 r1 = cross(dpdy, normal);
  vec3 r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2) * fine;
  normal = normalize(abs(det) * normal - grad);
}
`;

// The glint band (a varnish sheen on the ink, a flash on the linework) and the warm light that
// the open box throws on its own inside.
const PRINT_OUTPUT = /* glsl */ `
{
  float along = dot(vPrintLocal, uGlintDir) - uGlint.x;
  float band = exp(-along * along / max(uGlint.y * uGlint.y, 1e-6));
  vec3 sheen = mix(diffuseColor.rgb * 0.5 + 0.08, uGlintColor * 2.2, printLine);
  outgoingLight += sheen * band * uGlint.z * (1.0 - vPrintMask.x);
  float reach = length(vPrintLocal - uGlowOrigin) / uGlowReach;
  float inside = step(0.75, vPrintMask.x);
  outgoingLight += diffuseColor.rgb * 1.6 * uGlowColor * uGlow * inside * exp(-reach * reach);
}
${shaderChunk("opaque_fragment")}
`;

/**
 * Turns a MeshStandardMaterial or MeshPhysicalMaterial with a `map` into
 * varnished printed board. The geometry must carry `aMask` (x: 1 on the
 * unprinted inside, 0.5 on cut edges, 0 on the print). The material keeps
 * three's lighting, environment and tone mapping; the patch only changes
 * roughness per texel and adds the glint and the inner glow.
 */
export function applyPrintPatch(
  material: MeshStandardMaterial | MeshPhysicalMaterial,
  uniforms: PrintUniforms,
) {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = patchShader(shader.vertexShader, [
      ["after", "common", VERTEX_DECL],
      ["after", "begin_vertex", "vPrintLocal = transformed;\nvPrintMask = aMask;"],
    ]);
    shader.fragmentShader = patchShader(shader.fragmentShader, [
      ["after", "common", FRAGMENT_DECL],
      [
        "after",
        "map_fragment",
        "printLine = printLineMask(diffuseColor.rgb) * (1.0 - step(0.75, vPrintMask.x));",
      ],
      ["after", "roughnessmap_fragment", PRINT_ROUGHNESS],
      ["after", "normal_fragment_maps", PRINT_EMBOSS],
      ["after", "lights_physical_fragment", PRINT_COAT],
      ["replace", "opaque_fragment", PRINT_OUTPUT],
    ]);
  };
  material.customProgramCacheKey = () => "story-print-v1";
  material.needsUpdate = true;
}

/** Sets the environment map on every material of a list (null clears it). */
export function setMaterialsEnvironment(
  materials: readonly (MeshStandardMaterial | MeshPhysicalMaterial)[],
  texture: Texture | null,
  intensity: number,
) {
  for (const material of materials) {
    material.envMap = texture;
    material.envMapIntensity = intensity;
    material.needsUpdate = true;
  }
}

export function disposeMaterials(materials: readonly Material[]) {
  for (const material of materials) material.dispose();
}
