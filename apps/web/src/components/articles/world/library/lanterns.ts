import {
  BoxGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  CylinderGeometry,
  ConeGeometry,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";

import {
  LANTERN_SPREAD,
  lanternCount,
  lanternPosition,
} from "@/components/articles/world/library/layout";
import {
  LIBRARY_COMMON,
  type LibraryUniforms,
} from "@/components/articles/world/library/library-glsl";
import { instancedParts, type Part } from "@/components/articles/world/library/materials";
import { VAULT_APEX } from "@/components/articles/world/library/vault";
import { GLOW_BLENDING } from "@/components/articles/world/library/window";
import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * Lanterns hanging down the nave on long chains from the vault. By day they
 * are pearl glass orbs with a warm white light; by night candle embers that
 * flicker and pool orange light on the books around them (the stone and
 * paper shaders take that light through lanternLight(), at the same
 * positions). When the theme switches, each flame gutters out as the front
 * reaches it and relights in the new scheme behind it.
 */

const GLASS_VERTEX = /* glsl */ `
  attribute float aIndex;
  varying float vIndex;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  varying vec2 vCss;
  uniform vec2 uViewport;
  void main() {
    vIndex = aIndex;
    mat4 model = modelMatrix * instanceMatrix;
    vec4 wp = model * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(model) * normal);
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    // The lantern's centre on screen decides how its flame burns.
    vec4 c = projectionMatrix * viewMatrix * model * vec4(0.0, 0.0, 0.0, 1.0);
    vCss = vec2(c.x / c.w * 0.5 + 0.5, 0.5 - c.y / c.w * 0.5) * uViewport;
  }
`;

const GLASS_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  ${LIBRARY_COMMON}
  varying float vIndex;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  varying vec2 vCss;
  void main() {
    float dark = darkAt();
    vec2 state = lanternState(vCss);
    vec3 n = normalize(vNormal);
    float facing = abs(n.z);
    float flame = lanternFlicker(vIndex) * state.x;
    vec3 flameColor = normalize(lanternColor(state.y) + 1e-4) * 1.2;
    vec3 pearl = themeTint(mix(vec3(0.97, 0.96, 0.93), vec3(0.12, 0.1, 0.09), dark), dark);
    vec3 color = pearl * (0.75 + 0.25 * facing) + flameColor * flame * (0.35 + 0.65 * facing) * mix(0.35, 1.0, state.y);
    gl_FragColor = vec4(libraryFog(color, vDepth, vWorld.y, dark), 1.0);
  }
`;

const GLOW_VERTEX = /* glsl */ `
  attribute float aIndex;
  varying float vIndex;
  varying vec2 vUv;
  varying vec2 vCss;
  varying float vDepth;
  uniform vec2 uViewport;
  void main() {
    vIndex = aIndex;
    vUv = uv;
    mat4 model = modelMatrix * instanceMatrix;
    vec4 centre = model * vec4(0.0, 0.0, 0.0, 1.0);
    float size = length(model[0].xyz);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec4 wp = vec4(centre.xyz + (right * position.x + up * position.y) * size, 1.0);
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    vec4 c = projectionMatrix * viewMatrix * centre;
    vCss = vec2(c.x / c.w * 0.5 + 0.5, 0.5 - c.y / c.w * 0.5) * uViewport;
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  ${LIBRARY_COMMON}
  varying float vIndex;
  varying vec2 vUv;
  varying vec2 vCss;
  varying float vDepth;
  void main() {
    float dark = darkAt();
    vec2 state = lanternState(vCss);
    vec2 p = vUv - 0.5;
    float r2 = dot(p, p) * 4.0;
    float g = exp(-r2 * 5.5) * 0.9 + exp(-r2 * 30.0) * 0.8;
    g *= lanternFlicker(vIndex) * state.x;
    // Deep in the fog a lantern is only a warm smudge.
    float beyond = max(vDepth - uFogStart, 0.0) * uFogDensity;
    g *= exp(-beyond * 0.35) * (1.0 - uSwallow) * (1.0 - uDetail * 0.6);
    vec3 color = normalize(lanternColor(state.y) + 1e-4);
    float strength = mix(0.34, 0.95, state.y);
    float over = mix(0.3, 0.0, dark) * g;
    gl_FragColor = vec4(color * g * strength, over);
  }
`;

export type Lanterns = {
  group: Group;
  setNaveHalf(half: number): void;
  dispose(): void;
};

export function createLanterns(
  world: WorldUniforms,
  library: LibraryUniforms,
  solid: ShaderMaterial,
  options: { bays: number },
): Lanterns {
  const count = lanternCount(options.bays);
  library.uLanternCount.value = count;
  const indices = new Float32Array(count);
  for (let k = 0; k < count; k++) indices[k] = k;

  // A hexagonal lantern: a glass prism (the flame's light), under a pointed
  // cap and over a small base (in the solid material with the chain).
  const glassGeometry = new CylinderGeometry(0.82, 0.62, 1.5, 6, 1);
  glassGeometry.setAttribute("aIndex", new InstancedBufferAttribute(indices, 1));
  const glassMaterial = new ShaderMaterial({
    uniforms: { ...world, ...library },
    vertexShader: GLASS_VERTEX,
    fragmentShader: GLASS_FRAGMENT,
  });
  const glass = new InstancedMesh(glassGeometry, glassMaterial, count);
  glass.frustumCulled = false;

  const glowGeometry = new PlaneGeometry(1, 1);
  glowGeometry.setAttribute("aIndex", new InstancedBufferAttribute(indices, 1));
  const glowMaterial = new ShaderMaterial({
    uniforms: { ...world, ...library },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    ...GLOW_BLENDING,
  });
  const glow = new InstancedMesh(glowGeometry, glowMaterial, count);
  glow.frustumCulled = false;
  glow.renderOrder = 4;

  // Chains and bases: two parts per lantern, caps a third, in the solid material.
  const hardware: Part[] = [];
  const caps: Part[] = [];
  for (let k = 0; k < count; k++) {
    hardware.push({ p: [0, 0, 0], s: [1, 1, 1], light: "#D5CFC4", dark: "#1B1A18" });
    hardware.push({ p: [0, 0, 0], s: [1, 1, 1], light: "#E4DED3", dark: "#221E19" });
    caps.push({ p: [0, 0, 0], s: [1, 1, 1], light: "#E4DED3", dark: "#221E19" });
  }
  const hardwareGeometry = new BoxGeometry(1, 1, 1);
  const chains = instancedParts(hardware, hardwareGeometry, solid);
  const capGeometry = new ConeGeometry(1, 1, 6, 1);
  const capMesh = instancedParts(caps, capGeometry, solid);

  const group = new Group();
  group.add(chains, capMesh, glass, glow);

  const matrix = new Matrix4();
  const q = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();

  return {
    group,
    setNaveHalf(half) {
      for (let k = 0; k < count; k++) {
        const lantern = lanternPosition(k);
        const x = lantern.side * LANTERN_SPREAD * half;
        matrix.compose(position.set(x, lantern.y, lantern.z), q, scale.set(0.3, 0.42, 0.3));
        glass.setMatrixAt(k, matrix);
        matrix.compose(position.set(x, lantern.y + 0.5, lantern.z), q, scale.set(0.32, 0.36, 0.32));
        capMesh.setMatrixAt(k, matrix);
        matrix.compose(position.set(x, lantern.y, lantern.z), q, scale.setScalar(4.2));
        glow.setMatrixAt(k, matrix);
        const top = VAULT_APEX - 1.2;
        const chainBottom = lantern.y + 0.66;
        matrix.compose(
          position.set(x, (top + chainBottom) / 2, lantern.z),
          q,
          scale.set(0.035, top - chainBottom, 0.035),
        );
        chains.setMatrixAt(k * 2, matrix);
        matrix.compose(position.set(x, lantern.y - 0.36, lantern.z), q, scale.set(0.3, 0.08, 0.3));
        chains.setMatrixAt(k * 2 + 1, matrix);
      }
      glass.instanceMatrix.needsUpdate = true;
      glow.instanceMatrix.needsUpdate = true;
      chains.instanceMatrix.needsUpdate = true;
      capMesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      glassGeometry.dispose();
      glowGeometry.dispose();
      hardwareGeometry.dispose();
      capGeometry.dispose();
      capMesh.dispose();
      glassMaterial.dispose();
      glowMaterial.dispose();
      glass.dispose();
      glow.dispose();
      chains.dispose();
    },
  };
}
