import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";

import { FLOOR_Y, farZ } from "@/components/articles/world/library/layout";
import {
  LIBRARY_COMMON,
  type LibraryUniforms,
} from "@/components/articles/world/library/library-glsl";
import {
  instancedParts,
  mulberry32,
  type Part,
} from "@/components/articles/world/library/materials";
import { GLOW_BLENDING } from "@/components/articles/world/library/window";
import { WORLD_PALETTE } from "@/components/articles/world/palette";
import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * What drifts in the library's air: a few books floating open-winged in the
 * depth, loose pages turning over as they rise, dust motes glittering in the
 * light, and by night glyphs that have slipped off their pages and float up
 * glowing. Everything keeps clear of the card plane (it all lives behind the
 * list, deep in the nave) and fades into the fog.
 */

const GLYPHS = "ΣΩλπ∂∫∞ΨΦ§¶αβγθ√";

function glyphAtlas() {
  const cell = 64;
  const columns = 4;
  const canvas = document.createElement("canvas");
  canvas.width = cell * columns;
  canvas.height = cell * columns;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#fff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `500 ${cell * 0.62}px "Iowan Old Style", "Palatino", "Georgia", serif`;
    [...GLYPHS].slice(0, columns * columns).forEach((glyph, i) => {
      context.fillText(
        glyph,
        (i % columns) * cell + cell / 2,
        Math.floor(i / columns) * cell + cell / 2,
      );
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

export type Drift = {
  group: Group;
  update(time: number, half: number): void;
  setCounts(counts: { pages: number; motes: number; floaters: number; glyphs: number }): void;
  dispose(): void;
};

export function createDrift(
  world: WorldUniforms,
  library: LibraryUniforms,
  solid: ShaderMaterial,
  options: { bays: number; pages: number; motes: number; floaters: number; glyphs: number },
): Drift {
  const rand = mulberry32(4242);
  const rb = (a: number, b: number) => a + (b - a) * rand();
  const far = farZ(options.bays);
  const depth = Math.min(40, -far - 8);
  const disposables: { dispose(): void }[] = [];
  const group = new Group();
  const light = WORLD_PALETTE.light;
  const dark = WORLD_PALETTE.dark;

  // ---------------------------------------------------------------- floating books
  type Floater = { x: number; y: number; z: number; spin: number; phase: number; tilt: number };
  const floaterData: Floater[] = [];
  const floaterParts: Part[] = [];
  for (let i = 0; i < options.floaters; i++) {
    const index = Math.floor(rand() * light.books.length);
    floaterData.push({
      x: rb(-0.75, 0.75),
      y: rb(-3.5, 9),
      z: rb(-12, -12 - depth * 0.7),
      spin: rb(0.04, 0.16) * (rand() < 0.5 ? -1 : 1),
      phase: rb(0, Math.PI * 2),
      tilt: rb(-0.6, 0.6),
    });
    floaterParts.push({
      p: [0, 0, 0],
      s: [rb(0.7, 1.1), rb(1.0, 1.45), rb(0.14, 0.3)],
      light: light.books[index],
      dark: dark.books[index],
    });
  }
  const floaterGeometry = new BoxGeometry(1, 1, 1);
  disposables.push(floaterGeometry);
  const floaters = instancedParts(floaterParts, floaterGeometry, solid);
  group.add(floaters);
  disposables.push(floaters);

  // ---------------------------------------------------------------- pages
  const pageMaterial = new ShaderMaterial({
    uniforms: {
      ...world,
      ...library,
      uPaperLight: { value: new Color(light.paper) },
      uPaperDark: { value: new Color(dark.paper) },
      uDepthSpan: { value: depth },
    },
    side: DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uEnvScale;
      uniform float uNaveHalf;
      uniform float uDepthSpan;
      attribute vec4 aSeed;
      varying float vDepth;
      varying vec3 vWorld;
      varying vec3 vLocal;
      varying vec2 vUv;
      varying float vShade;
      mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      void main() {
        vUv = uv;
        float t = uTime * (0.18 + aSeed.w * 0.18) + aSeed.x * 10.0;
        vec3 p = position;
        // The sheet curls as it turns.
        p.z += sin(p.x * 3.4 + t * 3.0) * 0.1 + p.x * p.x * 0.18 * sin(t * 1.3);
        mat3 r = rotY(t * 0.6 + aSeed.y * 6.0) * rotX(sin(t) * 0.9);
        p = r * p;
        vec3 c = vec3(
          (aSeed.x * 1.7 - 0.85) * uNaveHalf,
          mod(aSeed.y * 30.0 + uTime * (0.22 + aSeed.z * 0.3), 26.0) - 9.0,
          -8.0 - aSeed.z * uDepthSpan
        );
        c.x += sin(t * 0.5) * 1.2;
        vec4 wp = modelMatrix * vec4(p + c, 1.0);
        vWorld = wp.xyz;
        vLocal = p + c;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        vShade = 0.84 + 0.16 * (r * vec3(0.0, 0.0, 1.0)).z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${WORLD_COMMON}
      ${LIBRARY_COMMON}
      uniform vec3 uPaperLight;
      uniform vec3 uPaperDark;
      varying float vDepth;
      varying vec3 vWorld;
      varying vec3 vLocal;
      varying vec2 vUv;
      varying float vShade;
      void main() {
        float dark = darkAt();
        vec2 css = worldFragCss();
        vec3 paper = themeTint(mix(uPaperLight, uPaperDark, dark), dark) * vShade;
        float lines = step(0.55, fract(vUv.y * 13.0)) * step(0.14, vUv.x) * step(vUv.x, 0.86)
                    * step(0.12, vUv.y) * step(vUv.y, 0.88);
        vec3 color = mix(paper, paper * mix(0.9, 1.5, dark), lines * 0.45);
        color += paper * lanternLight(vLocal, vec3(0.0, 0.0, 1.0), css) * 1.4;
        gl_FragColor = vec4(libraryFog(color, vDepth, vWorld.y, dark), 1.0);
      }
    `,
  });
  const pageGeometry = new PlaneGeometry(0.62, 0.84, 4, 3);
  const pages = new InstancedMesh(pageGeometry, pageMaterial, Math.max(1, options.pages));
  const pageSeeds = new Float32Array(Math.max(1, options.pages) * 4);
  const identity = new Matrix4();
  for (let i = 0; i < options.pages; i++) {
    pageSeeds.set([rand(), rand(), rand(), rand()], i * 4);
    pages.setMatrixAt(i, identity);
  }
  pages.count = options.pages;
  pages.geometry.setAttribute("aSeed", new InstancedBufferAttribute(pageSeeds, 4));
  pages.frustumCulled = false;
  group.add(pages);
  disposables.push(pageGeometry, pageMaterial, pages);

  // ---------------------------------------------------------------- dust motes
  const moteGeometry = new BufferGeometry();
  const motePositions = new Float32Array(options.motes * 3);
  const moteSeeds = new Float32Array(options.motes);
  for (let i = 0; i < options.motes; i++) {
    motePositions.set([rb(-1, 1), rb(FLOOR_Y, 20), rb(-4, -4 - depth)], i * 3);
    moteSeeds[i] = rand();
  }
  moteGeometry.setAttribute("position", new BufferAttribute(motePositions, 3));
  moteGeometry.setAttribute("aSeed", new BufferAttribute(moteSeeds, 1));
  const moteMaterial = new ShaderMaterial({
    uniforms: {
      ...world,
      ...library,
      uMoteLight: { value: new Color(light.ember) },
      uMoteDark: { value: new Color(dark.mote) },
      uEmberDark: { value: new Color(dark.ember) },
    },
    ...GLOW_BLENDING,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uEnvScale;
      uniform float uNaveHalf;
      uniform vec2 uViewport;
      attribute float aSeed;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        vec3 p = position;
        p.x *= uNaveHalf + 1.0;
        p.y += sin(uTime * 0.3 + aSeed * 30.0) * 0.6 + uTime * 0.06 * (0.4 + aSeed);
        p.y = mod(p.y + 9.0, 29.0) - 9.0;
        p.x += sin(uTime * 0.2 + aSeed * 12.0) * 0.7;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z / uEnvScale;
        gl_PointSize = uPixelRatio * (3.5 + aSeed * 7.0) * (uViewport.y / 900.0) * (24.0 / d);
        float twinkle = 0.45 + 0.55 * sin(uTime * (0.6 + aSeed * 1.4) + aSeed * 40.0);
        vAlpha = smoothstep(95.0, 22.0, d) * smoothstep(20.0, 26.0, d) * twinkle;
        vSeed = aSeed;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${WORLD_COMMON}
      ${LIBRARY_COMMON}
      uniform vec3 uMoteLight;
      uniform vec3 uMoteDark;
      uniform vec3 uEmberDark;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        float dark = darkAt();
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= a * vAlpha * (1.0 - uSwallow) * (1.0 - uDetail * 0.6);
        vec3 color = mix(uMoteLight, mix(uEmberDark, uMoteDark, step(0.3, vSeed)), dark);
        gl_FragColor = vec4(color * a * mix(0.8, 0.9, dark), a * mix(0.55, 0.0, dark));
      }
    `,
  });
  const motes = new Points(moteGeometry, moteMaterial);
  motes.frustumCulled = false;
  motes.renderOrder = 5;
  group.add(motes);
  disposables.push(moteGeometry, moteMaterial);

  // ---------------------------------------------------------------- glyphs
  const glyphTexture = glyphAtlas();
  const glyphGeometry = new BufferGeometry();
  const glyphPositions = new Float32Array(options.glyphs * 3);
  const glyphSeeds = new Float32Array(options.glyphs * 2);
  for (let i = 0; i < options.glyphs; i++) {
    glyphPositions.set([rb(-0.9, 0.9), rb(FLOOR_Y, 18), rb(-10, -10 - depth * 0.6)], i * 3);
    glyphSeeds.set([rand(), Math.floor(rand() * 16)], i * 2);
  }
  glyphGeometry.setAttribute("position", new BufferAttribute(glyphPositions, 3));
  glyphGeometry.setAttribute("aSeed", new BufferAttribute(glyphSeeds, 2));
  const glyphMaterial = new ShaderMaterial({
    uniforms: {
      ...world,
      ...library,
      uAtlas: { value: glyphTexture },
      uGlyphLight: { value: new Color(light.glyph) },
      uGlyphDark: { value: new Color(dark.glyph) },
    },
    ...GLOW_BLENDING,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uEnvScale;
      uniform float uNaveHalf;
      uniform vec2 uViewport;
      attribute vec2 aSeed;
      varying float vAlpha;
      varying vec2 vCell;
      void main() {
        vec3 p = position;
        p.x *= uNaveHalf;
        float rise = uTime * (0.18 + aSeed.x * 0.22);
        p.y = mod(p.y - FLOOR + rise, 27.0) + FLOOR;
        p.x += sin(uTime * 0.25 + aSeed.x * 20.0) * 0.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z / uEnvScale;
        gl_PointSize = uPixelRatio * (24.0 + aSeed.x * 18.0) * (uViewport.y / 900.0) * (24.0 / d);
        float breathe = 0.5 + 0.5 * sin(uTime * (0.7 + aSeed.x) + aSeed.x * 50.0);
        float life = smoothstep(0.0, 3.0, mod(p.y - FLOOR, 27.0)) * smoothstep(27.0, 20.0, mod(p.y - FLOOR, 27.0));
        vAlpha = smoothstep(80.0, 26.0, d) * smoothstep(20.0, 28.0, d) * breathe * life;
        vCell = vec2(mod(aSeed.y, 4.0), floor(aSeed.y / 4.0));
        gl_Position = projectionMatrix * mv;
      }
    `.replace(/FLOOR/g, `(${FLOOR_Y.toFixed(1)})`),
    fragmentShader: /* glsl */ `
      ${WORLD_COMMON}
      ${LIBRARY_COMMON}
      uniform sampler2D uAtlas;
      uniform vec3 uGlyphLight;
      uniform vec3 uGlyphDark;
      varying float vAlpha;
      varying vec2 vCell;
      void main() {
        float dark = darkAt();
        vec2 uv = (vCell + vec2(gl_PointCoord.x, gl_PointCoord.y)) / 4.0;
        float glyph = texture2D(uAtlas, uv).a;
        float halo = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * 0.25;
        float a = (glyph + halo) * vAlpha * (1.0 - uSwallow) * (1.0 - uDetail * 0.5);
        // The night library's glyphs glow; by day they are faint gilt.
        a *= mix(0.35, 1.0, dark);
        vec3 color = themeTint(mix(uGlyphLight, uGlyphDark, dark), dark);
        gl_FragColor = vec4(color * a, a * mix(0.6, 0.0, dark));
      }
    `,
  });
  const glyphs = new Points(glyphGeometry, glyphMaterial);
  glyphs.frustumCulled = false;
  glyphs.renderOrder = 6;
  group.add(glyphs);
  disposables.push(glyphGeometry, glyphMaterial, glyphTexture);

  // ---------------------------------------------------------------- per frame
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();

  return {
    group,
    update(time, half) {
      for (let i = 0; i < floaters.count; i++) {
        const f = floaterData[i];
        const part = floaterParts[i];
        euler.set(
          f.tilt + Math.sin(time * f.spin * 2 + f.phase) * 0.35,
          time * f.spin + f.phase,
          Math.sin(time * 0.27 + f.phase) * 0.25,
        );
        quaternion.setFromEuler(euler);
        matrix.compose(
          position.set(f.x * half, f.y + Math.sin(time * 0.45 + f.phase) * 0.45, f.z),
          quaternion,
          scale.set(part.s[0], part.s[1], part.s[2]),
        );
        floaters.setMatrixAt(i, matrix);
      }
      floaters.instanceMatrix.needsUpdate = true;
    },
    setCounts(counts) {
      pages.count = Math.min(options.pages, counts.pages);
      floaters.count = Math.min(options.floaters, counts.floaters);
      moteGeometry.setDrawRange(0, Math.min(options.motes, counts.motes));
      glyphGeometry.setDrawRange(0, Math.min(options.glyphs, counts.glyphs));
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
