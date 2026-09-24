import {
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";

import { FLOOR_Y, NEAR_Z, farZ } from "@/components/articles/world/library/layout";
import {
  LIBRARY_COMMON,
  type LibraryUniforms,
} from "@/components/articles/world/library/library-glsl";
import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The air of the library: the void behind everything (the fog colour
 * itself, brightening toward the window), and veils of mist drifting across
 * the nave at several depths, thicker toward the floor, so the depth reads
 * in layers like a stage lit through gauze.
 */

const SHEET_DEPTHS = [-7, -17, -30, -47, -70];

const BACKDROP_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  ${LIBRARY_COMMON}
  varying vec2 vUv;
  void main() {
    float dark = darkAt();
    vec3 fog = worldFogColor(dark);
    vec2 p = (vUv - vec2(0.5, 0.47)) * vec2(1.6, 2.1);
    float lift = exp(-dot(p, p) * 3.2);
    vec3 glow = mix(vec3(1.0, 0.98, 0.93), vec3(0.22, 0.36, 0.72), dark);
    fog += lift * mix(0.035, 0.055, dark) * glow * (1.0 + uFlood * 2.0) * (1.0 - uDetail * 0.7);
    fog += windowScatter(worldFragCss(), dark);
    gl_FragColor = vec4(fog, 1.0);
  }
`;

const SHEET_VERTEX = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHEET_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  ${LIBRARY_COMMON}
  uniform float uStrength;
  varying vec2 vUv;
  varying float vSeed;
  varying vec3 vWorld;
  varying float vDepth;
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 3; i++) {
      v += worldNoise(p) * a;
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }
  void main() {
    float dark = darkAt();
    vec2 p = vUv * vec2(3.2, 2.0) + vec2(uTime * (0.012 + vSeed * 0.01) + vSeed * 9.0, -uTime * 0.004);
    float mist = fbm(p + fbm(p * 0.7 + uTime * 0.01) * 0.8);
    mist = smoothstep(0.32, 0.85, mist);
    // Heavier low down, thin toward the vault; soft at the edges.
    float low = mix(1.0, 0.25, smoothstep(0.0, 0.75, vUv.y));
    float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(1.0, 0.7, vUv.y);
    float near = smoothstep(uFogStart * 1.08, uFogStart * 1.6, vDepth);
    float a = mist * low * edge * near * uStrength * (1.0 - uSwallow);
    a *= mix(1.0, 0.45, uDetail);
    vec3 fog = worldFogColor(dark);
    vec3 veil = mix(fog + vec3(0.035, 0.03, 0.02), fog + vec3(0.02, 0.035, 0.07), dark);
    veil += uFlood * vec3(0.05, 0.04, 0.02);
    // Mist in front of the window is lit by it: it glows, and thins, rather
    // than laying grey gauze over the glass.
    vec3 scatter = windowScatter(worldFragCss(), dark);
    float lit = clamp(libraryLuma(scatter) * mix(28.0, 9.0, dark), 0.0, 1.0);
    veil += scatter * 2.2;
    a *= 1.0 - lit * 0.55;
    gl_FragColor = vec4(veil, a * mix(0.55, 0.7, dark));
  }
`;

export type Atmosphere = {
  group: Group;
  setNaveHalf(half: number): void;
  setSheetCount(count: number): void;
  dispose(): void;
};

export function createAtmosphere(
  world: WorldUniforms,
  library: LibraryUniforms,
  options: { bays: number; sheets: number },
): Atmosphere {
  const far = farZ(options.bays);
  const plane = new PlaneGeometry(1, 1);
  plane.translate(0, 0.5, 0);

  const backdropMaterial = new ShaderMaterial({
    uniforms: { ...world, ...library },
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: BACKDROP_FRAGMENT,
  });
  const backdrop = new Mesh(plane, backdropMaterial);
  backdrop.scale.set(1200, 700, 1);
  backdrop.position.set(0, FLOOR_Y - 300, far - 40);
  backdrop.renderOrder = -10;

  const sheets = SHEET_DEPTHS.filter((z) => z > far + 2 && z < NEAR_Z);
  const seeds = new Float32Array(sheets.map((_, i) => (i * 0.618) % 1));
  const sheetMaterial = new ShaderMaterial({
    uniforms: { ...world, ...library, uStrength: { value: 0.75 } },
    vertexShader: SHEET_VERTEX,
    fragmentShader: SHEET_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const sheetGeometry = plane.clone();
  sheetGeometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
  const sheetMesh = new InstancedMesh(sheetGeometry, sheetMaterial, Math.max(1, sheets.length));
  sheetMesh.frustumCulled = false;
  sheetMesh.renderOrder = 1;
  // Far sheets first, so the nearer veils lay over them.
  const order = sheets.map((z, i) => ({ z, i })).sort((a, b) => a.z - b.z);

  const matrix = new Matrix4();
  const q = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  const place = (half: number) => {
    order.forEach(({ z }, slot) => {
      const width = 2 * half + 26 + Math.abs(z) * 0.4;
      matrix.compose(position.set(0, FLOOR_Y - 1, z), q, scale.set(width, 26, 1));
      sheetMesh.setMatrixAt(slot, matrix);
    });
    sheetMesh.instanceMatrix.needsUpdate = true;
  };

  const group = new Group();
  group.add(backdrop, sheetMesh);

  return {
    group,
    setNaveHalf: place,
    setSheetCount(count) {
      sheetMesh.count = Math.min(sheets.length, count);
    },
    dispose() {
      plane.dispose();
      sheetGeometry.dispose();
      backdropMaterial.dispose();
      sheetMaterial.dispose();
      sheetMesh.dispose();
    },
  };
}
