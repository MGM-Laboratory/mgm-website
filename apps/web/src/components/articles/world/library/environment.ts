import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Shape,
  Vector3,
  type BufferGeometry as Geometry,
} from "three";

import { WORLD_PALETTE } from "@/components/articles/world/palette";
import type { QualityTier } from "@/components/articles/world/world-api";
import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The forbidden library: an endless nave of white stacks under repeating
 * arches, a river of light along the marble floor, shafts of light from
 * high windows, books and loose pages drifting in the air and dust motes
 * everywhere, all sinking into thick fog.
 *
 * Modelled in its own units (1 unit is `uEnvScale` CSS px, set by the
 * engine from the viewport height) inside one group, so it frames the same
 * at every window size. Everything is instanced or a single mesh: the whole
 * library is a dozen draw calls. Every material reads the shared world
 * uniforms, so the scheme wave and the article theme tint sweep through it
 * like everything else.
 *
 * The layout is deterministic (a fixed-seed generator): every visitor walks
 * into the same library.
 */

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIER_COUNTS: Record<
  QualityTier,
  { bays: number; pages: number; motes: number; floaters: number; galleries: boolean }
> = {
  high: { bays: 26, pages: 90, motes: 2400, floaters: 46, galleries: true },
  medium: { bays: 18, pages: 60, motes: 1400, floaters: 30, galleries: true },
  low: { bays: 12, pages: 36, motes: 700, floaters: 18, galleries: false },
};

type Item = {
  p: [number, number, number];
  s: [number, number, number];
  r?: number;
  ry?: number;
  light: string;
  dark: string;
};

const INSTANCED_VERTEX = /* glsl */ `
  attribute vec3 aColorLight;
  attribute vec3 aColorDark;
  varying vec3 vColL;
  varying vec3 vColD;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    vColL = aColorLight;
    vColD = aColorDark;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const INSTANCED_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  uniform float uRim;
  varying vec3 vColL;
  varying vec3 vColD;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vDepth;
  const vec3 LIGHT_DIR = normalize(vec3(-0.5, 0.8, 0.35));
  void main() {
    float dark = darkAt();
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, LIGHT_DIR), 0.0);
    vec3 base = mix(vColL, vColD, dark);
    float amb = mix(0.8, 0.36, dark);
    vec3 color = base * (amb + diff * mix(0.3, 0.55, dark));
    // Moonlight catching the edges in the dark.
    float rim = pow(1.0 - abs(n.z), 3.0) * uRim * dark;
    color += vec3(0.23, 0.43, 0.77) * rim * 0.22;
    gl_FragColor = vec4(applyWorldFog(color, vDepth, vWorld.y, dark), 1.0);
  }
`;

function instancedMaterial(uniforms: WorldUniforms, rim: number) {
  return new ShaderMaterial({
    uniforms: { ...uniforms, uRim: { value: rim } },
    vertexShader: INSTANCED_VERTEX,
    fragmentShader: INSTANCED_FRAGMENT,
  });
}

function buildInstanced(items: readonly Item[], geometry: Geometry, material: ShaderMaterial) {
  const mesh = new InstancedMesh(geometry.clone(), material, items.length);
  const light = new Float32Array(items.length * 3);
  const dark = new Float32Array(items.length * 3);
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const color = new Color();
  const position = new Vector3();
  const scale = new Vector3();
  items.forEach((item, index) => {
    euler.set(item.r ?? 0, item.ry ?? 0, 0);
    quaternion.setFromEuler(euler);
    matrix.compose(position.set(...item.p), quaternion, scale.set(...item.s));
    mesh.setMatrixAt(index, matrix);
    color.set(item.light);
    light.set([color.r, color.g, color.b], index * 3);
    color.set(item.dark);
    dark.set([color.r, color.g, color.b], index * 3);
  });
  mesh.geometry.setAttribute("aColorLight", new InstancedBufferAttribute(light, 3));
  mesh.geometry.setAttribute("aColorDark", new InstancedBufferAttribute(dark, 3));
  mesh.frustumCulled = false;
  return mesh;
}

function archGeometry(span: number, rise: number, thickness: number, depth: number) {
  const shape = new Shape();
  const r = span / 2;
  shape.moveTo(-r - thickness, -20);
  shape.lineTo(-r - thickness, rise);
  shape.absarc(0, rise, r + thickness, Math.PI, 0, true);
  shape.lineTo(r + thickness, -20);
  shape.lineTo(r, -20);
  shape.lineTo(r, rise);
  shape.absarc(0, rise, r, 0, Math.PI, false);
  shape.lineTo(-r, -20);
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

export type LibraryEnvironment = {
  group: Group;
  update(time: number, dt: number, scrollSpeed: number): void;
  /** Thins the library for a weaker device (the quality governor steps down). */
  setTier(tier: QualityTier): void;
  dispose(): void;
};

export function createLibraryEnvironment(
  uniforms: WorldUniforms,
  tier: QualityTier,
): LibraryEnvironment {
  const rand = mulberry32(1337);
  const rb = (a: number, b: number) => a + (b - a) * rand();
  const counts = TIER_COUNTS[tier];
  const group = new Group();
  const disposables: { dispose(): void }[] = [];
  const light = WORLD_PALETTE.light;
  const dark = WORLD_PALETTE.dark;

  // ------------------------------------------------------------ stacks
  const books: Item[] = [];
  const shelves: Item[] = [];
  const pickBook = () => {
    const index = Math.floor(rand() * light.books.length);
    return { light: light.books[index], dark: dark.books[index] };
  };

  const bookcase = (x: number, z: number, facing: 1 | -1, tiers: number, width: number) => {
    const gap = 1.55;
    const depth = 1.1;
    const baseY = -8;
    const stone = { light: light.stone, dark: dark.stone };
    const tall = tiers * gap + 0.4;
    shelves.push({
      p: [x - facing * depth * 0.55, baseY + tall / 2 - 0.2, z],
      s: [0.12, tall, width],
      ...stone,
    });
    for (let t = 0; t <= tiers; t++) {
      shelves.push({ p: [x, baseY + t * gap, z], s: [depth, 0.12, width], ...stone });
    }
    shelves.push({
      p: [x, baseY + tall / 2 - 0.2, z - width / 2],
      s: [depth + 0.1, tall, 0.16],
      ...stone,
    });
    shelves.push({
      p: [x, baseY + tall / 2 - 0.2, z + width / 2],
      s: [depth + 0.1, tall, 0.16],
      ...stone,
    });
    for (let t = 0; t < tiers; t++) {
      let cz = z - width / 2 + 0.12;
      const end = z + width / 2 - 0.12;
      while (cz < end) {
        const w = rb(0.1, 0.26);
        if (cz + w > end) break;
        if (rand() < 0.05) {
          cz += rb(0.2, 0.6);
          continue;
        }
        const h = rb(0.85, 1.35);
        const d = rb(0.75, 0.98);
        const lean = rand() < 0.06 ? rb(-0.25, 0.25) : 0;
        books.push({
          p: [x + facing * (depth / 2 - d / 2) * 0.2, baseY + t * gap + 0.06, cz + w / 2],
          s: [d, h, w],
          r: lean,
          ...pickBook(),
        });
        cz += w + (rand() < 0.3 ? rb(0, 0.05) : 0.005);
      }
    }
  };

  for (let i = 0; i < counts.bays; i++) {
    const z = 6 - i * 4.4;
    const spread = 11.5 + Math.max(0, i - 8) * 0.25;
    const tiers = 12 + Math.floor(rand() * 4);
    bookcase(-spread, z, 1, tiers, 4.2);
    bookcase(spread, z, -1, tiers, 4.2);
    if (counts.galleries && i % 2 === 0) {
      bookcase(-spread - 4, z - 1, 1, 10, 4.2);
      bookcase(spread + 4, z - 1, -1, 10, 4.2);
    }
  }

  const bookGeometry = new BoxGeometry(1, 1, 1);
  bookGeometry.translate(0, 0.5, 0);
  const boxGeometry = new BoxGeometry(1, 1, 1);
  disposables.push(bookGeometry, boxGeometry);

  const stackMaterial = instancedMaterial(uniforms, 1);
  const stoneMaterial = instancedMaterial(uniforms, 0.6);
  disposables.push(stackMaterial, stoneMaterial);
  const bookMesh = buildInstanced(books, bookGeometry, stackMaterial);
  const shelfMesh = buildInstanced(shelves, boxGeometry, stoneMaterial);
  group.add(bookMesh, shelfMesh);
  disposables.push(bookMesh.geometry, shelfMesh.geometry);

  // ------------------------------------------------------------ arches
  const arches: Item[] = [];
  for (let i = 0; i < 14; i++) {
    arches.push({ p: [0, 0, -4 - i * 11], s: [1, 1, 1], light: light.stone, dark: dark.stone });
  }
  const archGeo = archGeometry(30, 12, 1.6, 1.4);
  disposables.push(archGeo);
  const archMesh = buildInstanced(arches, archGeo, stoneMaterial);
  group.add(archMesh);
  disposables.push(archMesh.geometry);

  // ------------------------------------------------------------ floor + river
  const floorMaterial = new ShaderMaterial({
    uniforms: {
      ...uniforms,
      uFlow: { value: 0 },
      uStoneLight: { value: new Color(light.stone) },
      uStoneDark: { value: new Color(dark.stone) },
      uRiverLight: { value: new Color(light.river) },
      uRiverDark: { value: new Color(dark.river) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${WORLD_COMMON}
      uniform float uFlow;
      uniform vec3 uStoneLight;
      uniform vec3 uStoneDark;
      uniform vec3 uRiverLight;
      uniform vec3 uRiverDark;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        float dark = darkAt();
        vec2 p = vWorld.xz / uEnvScale;
        vec2 tile = abs(fract(p / 3.0) - 0.5);
        float grout = smoothstep(0.49, 0.5, max(tile.x, tile.y));
        vec3 stone = mix(uStoneLight * 0.99 - grout * 0.04, uStoneDark * 0.6 + grout * 0.02, dark);
        // The river of light runs down the middle of the nave and flows
        // toward the far window, faster while the list scrolls.
        float band = exp(-pow(p.x / 5.5, 2.0));
        float flow = worldNoise(vec2(p.x * 0.6, p.y * 0.25 + uFlow)) * 0.6
                   + worldNoise(vec2(p.x * 1.7, p.y * 0.9 + uFlow * 1.8)) * 0.4;
        vec3 river = mix(uRiverLight, uRiverDark, dark);
        vec3 color = mix(stone, river, band * (0.35 + 0.4 * flow));
        gl_FragColor = vec4(applyWorldFog(color, vDepth, vWorld.y, dark), 1.0);
      }
    `,
  });
  const floorGeometry = new PlaneGeometry(80, 320, 1, 1);
  const floor = new Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -8, -150);
  group.add(floor);
  disposables.push(floorGeometry, floorMaterial);

  // ------------------------------------------------------------ backdrop
  // The void behind everything: the fog colour itself (so the scheme wave
  // and the theme tint reach it like every surface), a little brighter
  // toward the far window.
  const backdropMaterial = new ShaderMaterial({
    uniforms: { ...uniforms },
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${WORLD_COMMON}
      varying vec2 vUv;
      void main() {
        float dark = darkAt();
        vec3 fog = worldFogColor(dark);
        float lift = exp(-pow(length((vUv - vec2(0.5, 0.52)) * vec2(1.6, 2.2)), 2.0) * 3.0);
        fog += lift * mix(0.035, 0.05, dark) * mix(vec3(1.0), vec3(0.23, 0.43, 0.77), dark);
        gl_FragColor = vec4(fog, 1.0);
      }
    `,
  });
  const backdropGeometry = new PlaneGeometry(900, 600);
  const backdrop = new Mesh(backdropGeometry, backdropMaterial);
  backdrop.position.set(0, 20, -230);
  backdrop.renderOrder = -10;
  group.add(backdrop);
  disposables.push(backdropGeometry, backdropMaterial);

  // ------------------------------------------------------------ far window of light
  const glowMaterial = new ShaderMaterial({
    uniforms: {
      ...uniforms,
      uGlowLight: { value: new Color(light.glow) },
      uGlowDark: { value: new Color(dark.glow) },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${WORLD_COMMON}
      uniform vec3 uGlowLight;
      uniform vec3 uGlowDark;
      varying vec2 vUv;
      void main() {
        float dark = darkAt();
        vec2 p = vUv - 0.5;
        float d = length(p * vec2(1.0, 0.8));
        float g = exp(-d * 3.2) * 1.6 * smoothstep(0.5, 0.3, max(abs(p.x), abs(p.y)));
        g *= 0.85 + 0.15 * sin(uTime * 0.4);
        vec3 color = mix(uGlowLight * 0.6, uGlowDark * 0.55, dark) * (1.0 - uTheme * 0.6);
        gl_FragColor = vec4(color * g, 1.0);
      }
    `,
  });
  const glowGeometry = new PlaneGeometry(120, 90);
  const glow = new Mesh(glowGeometry, glowMaterial);
  glow.position.set(0, 6, -170);
  group.add(glow);
  disposables.push(glowGeometry, glowMaterial);

  // ------------------------------------------------------------ light shafts
  const shaftMaterial = new ShaderMaterial({
    uniforms: {
      ...uniforms,
      uShaftLight: { value: new Color(light.shaft) },
      uShaftDark: { value: new Color(dark.shaft) },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${WORLD_COMMON}
      uniform vec3 uShaftLight;
      uniform vec3 uShaftDark;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        float dark = darkAt();
        float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float fall = smoothstep(0.0, 0.25, vUv.y) * (0.35 + 0.65 * vUv.y);
        float streak = 0.6 + 0.4 * sin(vUv.x * 40.0 + uTime * 0.3) * sin(vUv.x * 13.0 - uTime * 0.2);
        float near = smoothstep(uFogStart + 4.0 * uEnvScale, uFogStart + 20.0 * uEnvScale, vDepth);
        float a = edge * fall * streak * mix(0.075, 0.06, dark) * near * (1.0 - uSwallow);
        vec3 color = mix(uShaftLight, uShaftDark * 0.8, dark);
        gl_FragColor = vec4(color * a, 1.0);
      }
    `,
  });
  disposables.push(shaftMaterial);
  for (let i = 0; i < 9; i++) {
    const geometry = new PlaneGeometry(rb(3, 7), 60);
    disposables.push(geometry);
    const shaft = new Mesh(geometry, shaftMaterial);
    shaft.position.set(rb(-14, 10), 12, -10 - i * 14 + rb(-4, 4));
    shaft.rotation.set(0, rb(-0.4, 0.4), 0.45 + rb(-0.08, 0.08));
    group.add(shaft);
  }

  // ------------------------------------------------------------ floating books
  type Floater = Item & { spin: number; bob: number };
  const floaters: Floater[] = [];
  for (let i = 0; i < counts.floaters; i++) {
    floaters.push({
      p: [rb(-9, 9), rb(-4, 14), rb(-80, -8)],
      s: [rb(0.9, 1.5), rb(1.2, 1.9), rb(0.18, 0.4)],
      r: rb(-1, 1),
      ry: rb(-3, 3),
      ...pickBook(),
      spin: rb(0.05, 0.25),
      bob: rb(0, Math.PI * 2),
    });
  }
  const floatMesh = buildInstanced(floaters, bookGeometry, stackMaterial);
  group.add(floatMesh);
  disposables.push(floatMesh.geometry);

  // ------------------------------------------------------------ loose pages
  const pageMaterial = new ShaderMaterial({
    uniforms: {
      ...uniforms,
      uPaperLight: { value: new Color(light.paper) },
      uPaperDark: { value: new Color(dark.paper) },
    },
    side: DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec4 aSeed;
      varying float vDepth;
      varying vec3 vWorld;
      varying vec2 vUv;
      varying float vShade;
      mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      void main() {
        vUv = uv;
        float t = uTime * (0.2 + aSeed.w * 0.2) + aSeed.x * 10.0;
        vec3 p = position;
        p.z += sin(p.x * 3.0 + t * 3.0) * 0.08;
        mat3 r = rotY(t * 0.7 + aSeed.y * 6.0) * rotX(sin(t) * 0.8);
        p = r * p;
        vec3 c = vec3(
          aSeed.x * 30.0 - 15.0,
          mod(aSeed.y * 40.0 + uTime * (0.3 + aSeed.z * 0.4), 34.0) - 12.0,
          -aSeed.z * 90.0 - 6.0
        );
        c.x += sin(t * 0.5) * 1.5;
        vec4 wp = modelMatrix * vec4(p + c, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        vShade = 0.85 + 0.15 * (r * vec3(0.0, 0.0, 1.0)).z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${WORLD_COMMON}
      uniform vec3 uPaperLight;
      uniform vec3 uPaperDark;
      varying float vDepth;
      varying vec3 vWorld;
      varying vec2 vUv;
      varying float vShade;
      void main() {
        float dark = darkAt();
        vec3 color = mix(uPaperLight, uPaperDark, dark) * vShade;
        float lines = step(0.5, fract(vUv.y * 14.0)) * step(0.12, vUv.x) * step(vUv.x, 0.88)
                    * step(0.1, vUv.y) * step(vUv.y, 0.9);
        color = mix(color, color * mix(0.86, 1.6, dark), lines * 0.5);
        gl_FragColor = vec4(applyWorldFog(color, vDepth, vWorld.y, dark), 1.0);
      }
    `,
  });
  const pageGeometry = new PlaneGeometry(0.7, 0.95, 4, 4);
  const pages = new InstancedMesh(pageGeometry, pageMaterial, counts.pages);
  const seeds = new Float32Array(counts.pages * 4);
  const identity = new Matrix4();
  for (let i = 0; i < counts.pages; i++) {
    seeds.set([rand(), rand(), rand(), rand()], i * 4);
    pages.setMatrixAt(i, identity);
  }
  pages.geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 4));
  pages.frustumCulled = false;
  group.add(pages);
  disposables.push(pageGeometry, pageMaterial);

  // ------------------------------------------------------------ dust motes
  const moteGeometry = new BufferGeometry();
  const motePositions = new Float32Array(counts.motes * 3);
  const moteSeeds = new Float32Array(counts.motes);
  for (let i = 0; i < counts.motes; i++) {
    motePositions.set([rb(-16, 16), rb(-8, 18), rb(-120, 12)], i * 3);
    moteSeeds[i] = rand();
  }
  moteGeometry.setAttribute("position", new BufferAttribute(motePositions, 3));
  moteGeometry.setAttribute("aSeed", new BufferAttribute(moteSeeds, 1));
  const moteMaterial = new ShaderMaterial({
    uniforms: {
      ...uniforms,
      uMoteLight: { value: new Color(light.mote) },
      uMoteDark: { value: new Color(dark.mote) },
      uEmberLight: { value: new Color(light.ember) },
      uEmberDark: { value: new Color(dark.ember) },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uEnvScale;
      uniform vec2 uViewport;
      attribute float aSeed;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.3 + aSeed * 30.0) * 0.6 + uTime * 0.05 * (0.5 + aSeed);
        p.y = mod(p.y + 8.0, 26.0) - 8.0;
        p.x += sin(uTime * 0.2 + aSeed * 12.0) * 0.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z / uEnvScale;
        gl_PointSize = uPixelRatio * (6.0 + aSeed * 14.0) * (uViewport.y / 900.0) * (22.0 / d);
        vAlpha = smoothstep(110.0, 18.0, d) * (0.55 + 0.45 * sin(uTime * (0.5 + aSeed) + aSeed * 40.0));
        vSeed = aSeed;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${WORLD_COMMON}
      uniform vec3 uMoteLight;
      uniform vec3 uMoteDark;
      uniform vec3 uEmberLight;
      uniform vec3 uEmberDark;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        float dark = darkAt();
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= a;
        vec3 light = mix(uEmberLight, uMoteLight, vSeed) * 0.55;
        vec3 darkColor = mix(uEmberDark, uMoteDark, step(0.4, vSeed));
        gl_FragColor = vec4(mix(light, darkColor, dark) * a * vAlpha * (1.0 - uSwallow), 1.0);
      }
    `,
  });
  const motes = new Points(moteGeometry, moteMaterial);
  motes.frustumCulled = false;
  group.add(motes);
  disposables.push(moteGeometry, moteMaterial);

  // ------------------------------------------------------------ per frame
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();
  let flow = 0;

  return {
    group,
    update(time, dt, scrollSpeed) {
      // The river runs toward the far window; scrolling the list speeds it up.
      flow += dt * (0.6 + Math.min(Math.abs(scrollSpeed), 6) * 1.4);
      (floorMaterial.uniforms.uFlow as { value: number }).value = flow;
      floaters.forEach((f, index) => {
        euler.set(
          (f.r ?? 0) + Math.sin(time * f.spin + f.bob) * 0.3,
          (f.ry ?? 0) + time * f.spin,
          Math.sin(time * 0.3 + f.bob) * 0.2,
        );
        quaternion.setFromEuler(euler);
        matrix.compose(
          position.set(f.p[0], f.p[1] + Math.sin(time * 0.5 + f.bob) * 0.5, f.p[2]),
          quaternion,
          scale.set(...f.s),
        );
        floatMesh.setMatrixAt(index, matrix);
      });
      floatMesh.instanceMatrix.needsUpdate = true;
    },
    setTier(next) {
      const limits = TIER_COUNTS[next];
      pages.count = Math.min(counts.pages, limits.pages);
      floatMesh.count = Math.min(counts.floaters, limits.floaters);
      moteGeometry.setDrawRange(0, Math.min(counts.motes, limits.motes));
    },
    dispose() {
      for (const item of disposables) item.dispose();
      group.clear();
    },
  };
}
