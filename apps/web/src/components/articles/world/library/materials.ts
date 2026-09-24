import {
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
} from "three";

import {
  LIBRARY_COMMON,
  type LibraryUniforms,
} from "@/components/articles/world/library/library-glsl";
import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The library's solid material (stone, wood, book cloth), shared by every
 * instanced part: per-instance colours for both schemes, a soft key light
 * from the high windows, moonlight on the edges at night, the lanterns'
 * pools of light, the theme tint on article pages and the library fog.
 */

export type Part = {
  p: readonly [number, number, number];
  s: readonly [number, number, number];
  /** Euler rotation (x, y, z), radians. */
  r?: readonly [number, number, number];
  light: string;
  dark: string;
};

const VERTEX = /* glsl */ `
  uniform float uEnvScale;
  attribute vec3 aColorLight;
  attribute vec3 aColorDark;
  varying vec3 vColL;
  varying vec3 vColD;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    vColL = aColorLight;
    vColD = aColorDark;
    mat4 model = modelMatrix * instanceMatrix;
    vec4 wp = model * vec4(position, 1.0);
    vWorld = wp.xyz;
    vLocal = wp.xyz / uEnvScale;
    vNormal = normalize(mat3(model) * normal);
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  ${LIBRARY_COMMON}
  uniform float uRim;
  uniform float uGloss;
  varying vec3 vColL;
  varying vec3 vColD;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying float vDepth;
  const vec3 KEY = normalize(vec3(-0.45, 0.82, 0.36));
  void main() {
    float dark = darkAt();
    vec2 css = worldFragCss();
    vec3 n = normalize(vNormal);
    vec3 base = themeTint(mix(vColL, vColD, dark), dark);
    float key = max(dot(n, KEY), 0.0);
    // Soft sky from above, a little bounce from the luminous floor.
    float sky = 0.5 + 0.5 * n.y;
    float amb = mix(0.74 + 0.12 * sky, 0.3 + 0.1 * sky, dark);
    vec3 color = base * (amb + key * mix(0.24, 0.36, dark));
    // Recesses darken: the deeper into a wall, the less light reaches
    // (books between their shelves, the back of the cases).
    float inWall = abs(vLocal.x) - uNaveHalf;
    color *= 1.0 - smoothstep(-0.1, 1.25, inWall) * mix(0.22, 0.45, dark);
    // Moonlight catches the edges that face across the nave at night.
    float rim = pow(1.0 - abs(n.z), 3.0) * uRim * dark;
    color += vec3(0.24, 0.38, 0.72) * rim * 0.16;
    // Lantern pools.
    color += (base + uGloss) * lanternLight(vLocal, n, css) * mix(1.0, 1.6, dark);
    // The dawn flood washes everything toward the light.
    color += uFlood * vec3(1.0, 0.93, 0.78) * 0.35;
    gl_FragColor = vec4(libraryFog(color, vDepth, vWorld.y, dark), 1.0);
  }
`;

export function solidMaterial(
  world: WorldUniforms,
  library: LibraryUniforms,
  options: { rim?: number; gloss?: number } = {},
) {
  return new ShaderMaterial({
    uniforms: {
      ...world,
      ...library,
      uRim: { value: options.rim ?? 0.6 },
      uGloss: { value: options.gloss ?? 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}

/** Builds an InstancedMesh for `parts` (per-instance matrix and both colours). */
export function instancedParts(
  parts: readonly Part[],
  geometry: BufferGeometry,
  material: ShaderMaterial,
) {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, parts.length));
  const light = new Float32Array(Math.max(1, parts.length) * 3);
  const dark = new Float32Array(Math.max(1, parts.length) * 3);
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const color = new Color();
  const position = new Vector3();
  const scale = new Vector3();
  parts.forEach((part, index) => {
    const r = part.r ?? [0, 0, 0];
    euler.set(r[0], r[1], r[2]);
    quaternion.setFromEuler(euler);
    matrix.compose(position.set(...part.p), quaternion, scale.set(...part.s));
    mesh.setMatrixAt(index, matrix);
    color.set(part.light);
    light[index * 3] = color.r;
    light[index * 3 + 1] = color.g;
    light[index * 3 + 2] = color.b;
    color.set(part.dark);
    dark[index * 3] = color.r;
    dark[index * 3 + 1] = color.g;
    dark[index * 3 + 2] = color.b;
  });
  mesh.count = parts.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.geometry.setAttribute("aColorLight", new InstancedBufferAttribute(light, 3));
  mesh.geometry.setAttribute("aColorDark", new InstancedBufferAttribute(dark, 3));
  mesh.frustumCulled = false;
  return mesh;
}

/** A deterministic generator: every visitor walks into the same library. */
export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
