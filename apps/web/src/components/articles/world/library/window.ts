import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  Group,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";

import { FLOOR_Y, farZ } from "@/components/articles/world/library/layout";
import {
  LIBRARY_COMMON,
  type LibraryUniforms,
} from "@/components/articles/world/library/library-glsl";
import { mulberry32 } from "@/components/articles/world/library/materials";
import { WORLD_PALETTE } from "@/components/articles/world/palette";
import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The great window at the end of the nave, and the light it pours down the
 * library: a pointed window as tall as the arcade, with three lancets, a
 * rose in its head and leaded quarries, blazing white-gold by day and
 * showing a moon in a deep blue night by night; a soft halo around it that
 * the fog can't swallow; and a fan of god rays streaming from it toward the
 * visitor.
 *
 * Light effects use premultiplied "glow" blending: by day they are laid
 * over the pale fog like light washing a page (a shade can only brighten
 * toward white), by night they add, like light in the dark.
 */

export const GLOW_BLENDING = {
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  transparent: true,
  depthWrite: false,
} as const;

/** Sill height above the floor. */
const SILL = 1.4;
/** Where the window stands: just before the far wall. */
const INSET = 0.8;
/** The window's apex (library units): the head of the list sits above it on screen. */
const WINDOW_TOP = 10.5;
/** How close to the visitor the longest rays reach (library units of z). */
const NEAR_REACH = -2;

const WINDOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WINDOW_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  ${LIBRARY_COMMON}
  uniform vec2 uWindow;
  uniform vec3 uSunLight;
  uniform vec3 uMoonLight;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vDepth;

  // Positive inside an equilateral pointed arch (half width a, springing
  // at ys) centred at cx, standing on y0.
  float pointed(vec2 q, float cx, float a, float ys, float y0) {
    vec2 p = q - vec2(cx, 0.0);
    float d = min(a - abs(p.x), p.y - y0);
    if (p.y > ys) d = min(d, 2.0 * a - length(vec2(abs(p.x) + a, p.y - ys)));
    return d;
  }

  void main() {
    float dark = darkAt();
    float A = uWindow.x;
    float H = uWindow.y;
    vec2 q = vec2((vUv.x - 0.5) * 2.0 * A, vUv.y * H);
    float ys = H - A * 1.7320508;
    float open = pointed(q, 0.0, A, ys, 0.0);
    if (open < 0.0) discard;

    // Tracery: lancets under a rose, with transoms and leaded quarries.
    float bar = 0.16 + A * 0.02;
    float n = A > 2.6 ? 3.0 : 2.0;
    float b = A / n - bar * 0.5;
    float lys = ys - 0.25 - b * 1.7320508;
    float glass = 0.0;
    for (int i = 0; i < 3; i++) {
      if (float(i) >= n) break;
      float cx = -A + (2.0 * A / n) * (float(i) + 0.5);
      float l = pointed(q, cx, b, lys, bar);
      glass = max(glass, smoothstep(0.0, 0.05, l));
    }
    float transom = step(0.07, abs(fract(q.y / 3.6) - 0.5) * 3.6) + step(lys, q.y);
    glass *= clamp(transom, 0.0, 1.0);
    vec2 rc = vec2(0.0, ys + A * 0.52);
    float rr = A * 0.6;
    vec2 rp = q - rc;
    float rd = length(rp);
    float ang = atan(rp.y, rp.x);
    float spoke = abs(fract(ang / 6.2831853 * 8.0 + 0.5) - 0.5) * rd * 0.785;
    float rose = step(rd, rr - bar) * step(bar * 0.45, spoke) * step(rr * 0.24, abs(rd - rr * 0.08));
    rose *= step(bar * 0.5, abs(rd - rr * 0.55));
    glass = max(glass, rose);
    glass *= smoothstep(bar * 1.6, bar * 2.2, open);
    float lead = min(abs(fract((q.x + q.y) * 1.3) - 0.5), abs(fract((q.x - q.y) * 1.3) - 0.5));
    glass *= mix(0.8, 1.0, smoothstep(0.0, 0.07, lead));

    // By day a white-gold blaze, brightest high in the window; by night a
    // deep blue sky, a few stars and a moon in the rose.
    float high = clamp(q.y / H, 0.0, 1.0);
    vec3 sun = uSunLight * (1.05 + 0.25 * high) + vec3(0.06, 0.04, 0.0) * exp(-dot(rp, rp) / (A * A));
    vec2 mp = q - (rc + vec2(A * 0.14, A * 0.02));
    float moon = smoothstep(A * 0.36, A * 0.33, length(mp));
    float halo = exp(-dot(mp, mp) / (A * A * 0.5));
    float stars = step(0.985, worldHash(floor(q * 5.0))) * (0.5 + 0.5 * sin(uTime * 2.0 + q.x * 7.0));
    vec3 night = uMoonLight * (0.32 + 0.28 * high) + uMoonLight * halo * 0.45 + vec3(1.0) * moon * 0.85 + stars * 0.25;
    vec3 light = themeTint(mix(sun, night, dark), dark);
    light += uFlood * vec3(0.4, 0.34, 0.22);

    vec3 fog = worldFogColor(dark);
    // Light carries through fog that swallows stone: the glass shows far
    // past where the tracery fades into a soft silhouette.
    float beyond = max(vDepth - uFogStart, 0.0) * uFogDensity;
    float through = exp(-beyond * 0.12) * (1.0 - uSwallow) * (1.0 - uDetail * 0.55);
    vec3 stone = fog * mix(0.86, 1.0, dark) + vec3(0.02, 0.03, 0.06) * dark;
    vec3 color = mix(fog, stone, 0.65 * through);
    color = mix(color, light, glass * clamp(through * 1.25, 0.0, 1.0));
    gl_FragColor = vec4(color, 1.0);
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  ${LIBRARY_COMMON}
  uniform vec3 uSunLight;
  uniform vec3 uMoonLight;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    float dark = darkAt();
    vec2 p = (vUv - vec2(0.5, 0.52)) * vec2(1.0, 1.35);
    float r2 = dot(p, p);
    float g = exp(-r2 * 7.0) * 0.8 + exp(-r2 * 26.0) * 0.6;
    g *= (0.92 + 0.08 * sin(uTime * 0.35)) * (1.0 - uSwallow) * (1.0 + uFlood * 1.5);
    g *= 1.0 - uDetail * 0.6;
    vec3 color = themeTint(mix(uSunLight, uMoonLight * 0.55, dark), dark);
    float over = mix(0.42, 0.0, dark) * g;
    gl_FragColor = vec4(color * g * mix(0.42, 0.34, dark), over);
  }
`;

const RAY_VERTEX = /* glsl */ `
  attribute vec2 aRay;
  attribute float aSeed;
  varying vec2 vRay;
  varying float vSeed;
  varying float vDepth;
  void main() {
    vRay = aRay;
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const RAY_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  ${LIBRARY_COMMON}
  uniform vec3 uSunLight;
  uniform vec3 uMoonLight;
  uniform float uStrength;
  varying vec2 vRay;
  varying float vSeed;
  varying float vDepth;
  void main() {
    float dark = darkAt();
    float across = 1.0 - abs(vRay.x * 2.0 - 1.0);
    across = across * across * (3.0 - 2.0 * across);
    float along = smoothstep(0.0, 0.06, vRay.y) * pow(1.0 - vRay.y, 1.5);
    float streak = 0.55 + 0.45 * worldNoise(vec2(vRay.x * 6.0 + vSeed * 13.0, vRay.y * 2.0 - uTime * 0.05));
    float shimmer = 0.7 + 0.3 * sin(uTime * (0.21 + vSeed * 0.25) + vSeed * 17.0);
    // Beams fade before they reach the card plane, so they light the depth
    // and never the text.
    float near = smoothstep(uFogStart * 1.05, uFogStart * 1.9, vDepth);
    float a = across * along * streak * shimmer * near * uStrength;
    a *= (1.0 - uSwallow) * (1.0 - uDetail * 0.7) * (1.0 + uFlood * 2.0);
    vec3 color = themeTint(mix(uSunLight, uMoonLight, dark), dark);
    float over = mix(0.5, 0.0, dark) * a;
    gl_FragColor = vec4(color * a * mix(0.5, 0.42, dark), over);
  }
`;

export type GreatWindow = {
  group: Group;
  setNaveHalf(half: number): void;
  setRayCount(count: number): void;
  dispose(): void;
};

export function createGreatWindow(
  world: WorldUniforms,
  library: LibraryUniforms,
  options: { bays: number; rays: number },
): GreatWindow {
  const far = farZ(options.bays) - INSET;
  // Shorter than the arcade: its blaze stays below the list's head, where
  // the gap between the columns and the end of the list show it.
  const height = WINDOW_TOP - (FLOOR_Y + SILL);
  const shared = {
    ...world,
    ...library,
    uSunLight: { value: new Color(WORLD_PALETTE.light.window) },
    uMoonLight: { value: new Color(WORLD_PALETTE.dark.window) },
  };

  const windowUniforms = { ...shared, uWindow: { value: new Vector2(5, height) } };
  const windowMaterial = new ShaderMaterial({
    uniforms: windowUniforms,
    vertexShader: WINDOW_VERTEX,
    fragmentShader: WINDOW_FRAGMENT,
  });
  const plane = new PlaneGeometry(1, 1);
  plane.translate(0, 0.5, 0);
  const pane = new Mesh(plane, windowMaterial);
  pane.position.set(0, FLOOR_Y + SILL, far);
  pane.renderOrder = -5;

  const haloMaterial = new ShaderMaterial({
    uniforms: shared,
    vertexShader: WINDOW_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    ...GLOW_BLENDING,
  });
  const halo = new Mesh(plane, haloMaterial);
  halo.position.set(0, FLOOR_Y + SILL - height * 0.3, far + 2);
  halo.renderOrder = 2;

  // God rays: a fan of long quads streaming from the glass toward the
  // visitor, each continuing the line from a light source behind the window.
  const rand = mulberry32(777);
  const rb = (a: number, b: number) => a + (b - a) * rand();
  const count = 18;
  const positions = new Float32Array(count * 4 * 3);
  const rays = new Float32Array(count * 4 * 2);
  const seeds = new Float32Array(count * 4);
  const indices: number[] = [];
  const source = new Vector3(0, FLOOR_Y + SILL + height * 0.7, far - 60);
  const start = new Vector3();
  const end = new Vector3();
  const dir = new Vector3();
  const side = new Vector3();
  const view = new Vector3();
  const nominalHalf = 5;
  for (let i = 0; i < count; i++) {
    start.set(rb(-0.85, 0.85) * nominalHalf, FLOOR_Y + SILL + height * rb(0.25, 0.85), far + 0.5);
    dir.copy(start).sub(source).normalize();
    const reach = rb(0.45, 0.85) * (NEAR_REACH - far);
    end.copy(start).addScaledVector(dir, reach / Math.max(dir.z, 0.2));
    view.set(0, 0, 25).sub(start.clone().lerp(end, 0.5)).normalize();
    side.crossVectors(dir, view).normalize();
    const w0 = rb(0.35, 0.9);
    const w1 = w0 * rb(3, 5.5);
    const corners = [
      start.clone().addScaledVector(side, -w0),
      start.clone().addScaledVector(side, w0),
      end.clone().addScaledVector(side, -w1),
      end.clone().addScaledVector(side, w1),
    ];
    const seed = rand();
    corners.forEach((corner, c) => {
      positions.set([corner.x, corner.y, corner.z], (i * 4 + c) * 3);
      rays.set([c % 2, c < 2 ? 0 : 1], (i * 4 + c) * 2);
      seeds[i * 4 + c] = seed;
    });
    const o = i * 4;
    indices.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  }
  const rayGeometry = new BufferGeometry();
  rayGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  rayGeometry.setAttribute("aRay", new BufferAttribute(rays, 2));
  rayGeometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  rayGeometry.setIndex(indices);
  const rayMaterial = new ShaderMaterial({
    uniforms: { ...shared, uStrength: { value: 0.55 } },
    vertexShader: RAY_VERTEX,
    fragmentShader: RAY_FRAGMENT,
    side: DoubleSide,
    ...GLOW_BLENDING,
  });
  const rayMesh = new Mesh(rayGeometry, rayMaterial);
  rayMesh.frustumCulled = false;
  rayMesh.renderOrder = 3;
  const rayGroup = new Group();
  rayGroup.add(rayMesh);

  const group = new Group();
  group.add(pane, halo, rayGroup);

  const setRayCount = (n: number) => {
    rayGeometry.setDrawRange(0, Math.min(count, n) * 6);
  };
  setRayCount(options.rays);

  return {
    group,
    setNaveHalf(half) {
      const a = Math.max(0.3, half - 0.3) * 0.82;
      pane.scale.set(2 * a, height, 1);
      windowUniforms.uWindow.value.x = a;
      halo.scale.set(Math.max(2 * a * 3.2, height * 1.3), height * 1.6, 1);
      rayGroup.scale.x = a / nominalHalf;
    },
    setRayCount,
    dispose() {
      plane.dispose();
      rayGeometry.dispose();
      windowMaterial.dispose();
      haloMaterial.dispose();
      rayMaterial.dispose();
    },
  };
}
