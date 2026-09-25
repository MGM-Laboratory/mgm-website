import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Mesh,
  OneFactor,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  ZeroFactor,
  type Texture,
} from "three";

import { FRONT_AHEAD } from "@/components/articles/world/fx/theme-front";
import { WORLD_PALETTE } from "@/components/articles/world/palette";
import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The world's one screen pass, over the scene render target:
 *
 * - A lens: barrel distortion with a radial spectral split, so content far
 *   from the centre (the corners, a card at the edge) fringes into red and
 *   blue while the middle stays sharp. The list wears it fully; article
 *   pages keep only the grain (`uLens`). A first visit starts with the lens
 *   strongly warped and lets it settle (`uDistort`), the library coming out
 *   of a veil of its own fog meanwhile (`uVeil`).
 * - Motion blur: a vertical smear along the scroll direction, as long as
 *   the list is fast. The same taps carry the spectral split, so a fast
 *   scroll fringes more at the edges, like a real lens.
 * - Pulses: rings that ripple out from a click or an arrival, bending the
 *   picture like a drop in still water; a ring of ink by day, of light by
 *   night.
 * - The theme switch's front: by night-fall a band of deep ink with blue
 *   fire along its edge (and a brief chromatic shiver over the screen), by
 *   dawn a rim of gold with a warm haze behind it and a bloom from the
 *   great window as it floods with light.
 * - Vignette and animated grain, weighted by scheme (a dirty vignette on
 *   white fog reads as smudge, so the light world keeps it faint).
 * - The transition wipe: a flat colour sweeping in from the right edge with
 *   a very soft front, which the list-to-article transition drives.
 */

/** The lens at rest (about 17 px of fringe in a 1440 px corner, like unseen.co's). */
export const REST_DISTORT = -0.05;

/**
 * The brightest the library may get behind an article's text by night
 * (relative luminance), and where its highlights start to roll off. At the
 * ceiling, the palest dark-theme text (luminance about 0.8) still reads
 * 7.4:1, and its 70 % muted shade (lib/project-themes.ts) 4.6:1.
 */
const READABLE_KNEE = 0.03;
const READABLE_CEILING = 0.065;

/** How many pulses can ripple at once (the oldest gives way). */
export const PULSE_SLOTS = 4;
/** How long a pulse's ring travels. */
export const PULSE_SECONDS = 1.1;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  uniform sampler2D tScene;
  uniform float uLens;
  uniform float uDistort;
  /** The settle's fog veil over the whole picture (0 none). */
  uniform float uVeil;
  uniform float uBlur;
  uniform vec3 uWipeColor;
  uniform float uWipe;
  uniform float uGrainSeed;
  /** The list's fixed head: left, right, bottom (CSS px) and how much it veils. */
  uniform vec4 uHead;
  /** Pulses: x, y (CSS px), start (world seconds), strength (0 = free slot). */
  uniform vec4 uPulses[${PULSE_SLOTS}];
  uniform vec3 uPulseInk;
  uniform vec3 uPulseLight;
  /** The theme front's looks. */
  uniform float uShiver;
  uniform float uBloom;
  uniform vec2 uBloomAt;
  uniform vec3 uFireInk;
  uniform vec3 uFireDawn;
  uniform vec3 uInkDeep;
  /** How far ahead of the front the DOM's clip runs (CSS px). */
  uniform float uFrontAhead;
  varying vec2 vUv;

  #define TAPS 10

  // Red at t = 0, green in the middle, blue at t = 1; the weights of all
  // taps sum to the same white, so a sharp picture keeps its colours.
  vec3 spectral(float t) {
    return clamp(vec3(1.5 - 3.0 * t, 1.0 - abs(2.0 * t - 1.0) * 1.6, 3.0 * t - 1.5), 0.0, 1.0) + 0.04;
  }

  void main() {
    vec2 uv = vUv;
    vec2 css = worldFragCss();
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);
    float lens = uLens * uDistort;
    float blur = uBlur / uViewport.y;
    // Ten taps can't spread tens of pixels smoothly: each samples a mip of
    // the scene about as coarse as the gap between taps, so a scroll smear
    // reads as one soft streak, and the settle's strong warp as a soft
    // fringe, instead of combs of copies. Only the warp beyond the resting
    // lens counts (the engine builds the mips while either runs), so at
    // rest every tap reads level 0.
    float settle = uLens * max(0.0, abs(uDistort) - ${(-REST_DISTORT).toFixed(3)});
    float lensGap = length(c * r2 * uViewport) * settle * uPixelRatio / float(TAPS);
    float blurGap = abs(uBlur) * uPixelRatio * 1.6 / float(TAPS);
    float lod = log2(max(1.0, max(blurGap, lensGap * 0.6)));
    float jitter = worldHash(gl_FragCoord.xy + uGrainSeed);
    // And while the warp is strong, every pixel slides its taps by up to a
    // whole gap (a dither that changes every frame): the copies melt into a
    // continuous fringe that reads as the grain. At rest the taps sit still.
    float dither = (jitter - 0.5) * smoothstep(0.0, 0.12, settle);

    // Pulses bend the picture outward along their rings, and remember how
    // much ring passes here for the tint below.
    vec2 bend = vec2(0.0);
    float ring = 0.0;
    for (int i = 0; i < ${PULSE_SLOTS}; i++) {
      vec4 pulse = uPulses[i];
      if (pulse.w <= 0.0) continue;
      float t = (uTime - pulse.z) / ${PULSE_SECONDS.toFixed(2)};
      if (t < 0.0 || t > 1.0) continue;
      vec2 to = css - pulse.xy;
      float dist = length(to);
      float radius = (1.0 - pow(1.0 - t, 3.0)) * 460.0 * (0.6 + 0.4 * pulse.w);
      float width = 10.0 + 46.0 * t;
      // A crest with a trough behind it, like a ripple on water.
      float x = (dist - radius) / width;
      float crest = exp(-x * x) - 0.45 * exp(-pow(x + 1.6, 2.0));
      float fade = (1.0 - t) * (1.0 - t) * min(pulse.w, 1.5);
      bend += to / max(dist, 1.0) * crest * fade * 20.0;
      ring += max(crest, 0.0) * fade;
    }
    uv -= bend / uViewport;

    // The chromatic shiver of a night-fall: the channels tremble apart for a moment.
    vec2 shiver = uShiver * vec2(sin(uTime * 71.0 + css.y * 0.021), cos(uTime * 53.0 + css.x * 0.013) * 0.35) * 0.006;

    vec3 sum = vec3(0.0);
    vec3 weight = vec3(0.0);
    for (int i = 0; i < TAPS; i++) {
      float t = (float(i) + 0.5 + dither) / float(TAPS);
      // Barrel: each wavelength bends by its own amount (red not at all,
      // blue the most), so the corners fringe and the centre stays sharp.
      vec2 tapUv = uv + c * r2 * lens * t;
      tapUv += shiver * (t - 0.5);
      // Motion blur along the scroll direction. The blur position of a tap
      // is shuffled against its wavelength (golden-ratio steps), so every
      // colour spreads over the whole smear and a fast scroll blurs
      // instead of splitting into rainbows.
      tapUv.y += blur * (fract(float(i) * 0.618034 + jitter) - 0.5);
      vec3 w = spectral(t);
      sum += textureLod(tScene, tapUv, lod).rgb * w;
      weight += w;
    }
    vec3 color = sum / weight;

    float dark = darkAt();
    // On an article by night, nothing of the library may outshine the
    // page's text: a lantern, a moonlit sheet or a spark behind a line rolls
    // off softly under a ceiling that keeps light text (and its 70 % muted
    // shade) above 4.5:1. Only the library's own pixels (the scene target's
    // alpha is cleared under them, see createComposite): a page's 3D, like
    // the article cover, keeps its full range.
    float library = 1.0 - textureLod(tScene, uv, 0.0).a;
    float ceiling = uDetail * dark * library;
    if (ceiling > 0.0) {
      vec3 lit = pow(max(color, 0.0), vec3(2.2));
      float l = dot(lit, vec3(0.2126, 0.7152, 0.0722));
      if (l > ${READABLE_KNEE.toFixed(3)}) {
        float room = ${(READABLE_CEILING - READABLE_KNEE).toFixed(3)};
        float rolled = ${READABLE_KNEE.toFixed(3)} + room * (1.0 - exp(-(l - ${READABLE_KNEE.toFixed(3)}) / room));
        color = mix(color, color * pow(rolled / l, 1.0 / 2.2), ceiling);
      }
    }

    // A bank of mist behind the list's head (and the site header above it):
    // whatever the world draws there (a lantern, the moon, a card folding
    // away) stays a whisper under the title, the search and the filters.
    if (uHead.w > 0.0) {
      float under = 1.0 - smoothstep(uHead.z - 70.0, uHead.z + 24.0, css.y);
      float across = smoothstep(uHead.x - 90.0, uHead.x + 30.0, css.x)
                   * (1.0 - smoothstep(uHead.y - 30.0, uHead.y + 90.0, css.x));
      color = mix(color, worldFogColor(dark), under * across * uHead.w);
    }

    // Pulse rings: ink laid on the pale fog by day, light added by night.
    if (ring > 0.0) {
      float k = clamp(ring, 0.0, 1.0);
      color = mix(color, uPulseInk, k * 0.3 * (1.0 - dark));
      color += uPulseLight * k * 0.55 * dark;
    }

    // The theme front, just behind its edge (the DOM's clip runs a few
    // pixels ahead, so all of this shows through the new page).
    if (uWave.w > 0.5) {
      float d = waveDistance(css);
      float fleck = worldNoise(css * 0.07 + uTime * 1.3);
      float feather = d + (fleck - 0.5) * 22.0;
      float behind = smoothstep(uFrontAhead, -8.0, feather);
      float falling = step(uWaveFrom, uWaveTo - 0.5);
      // Night-fall: a band of rich ink behind the front, blue fire on it.
      float ink = behind * smoothstep(-260.0, -40.0, feather);
      float fire = exp(-pow((d + 6.0) / 7.0, 2.0)) * (0.55 + 0.9 * fleck);
      vec3 night = mix(color, uInkDeep, ink * 0.7);
      night += uFireInk * fire * 0.85 + vec3(0.7, 0.8, 1.0) * pow(fire, 3.0) * 0.35;
      // Dawn: a gold rim, and warm haze lingering behind it.
      float haze = behind * smoothstep(-260.0, -40.0, feather);
      float rim = exp(-pow((d + 5.0) / 10.0, 2.0)) * (0.6 + 0.7 * fleck);
      vec3 dawn = color + uFireDawn * haze * 0.22;
      dawn = mix(dawn, vec3(1.0, 0.97, 0.88), rim * 0.55) + uFireDawn * rim * 0.35;
      color = mix(dawn, night, falling);
    }
    // The window floods with light as the dawn reaches it: a bloom over the nave.
    if (uBloom > 0.0) {
      vec2 b = (css - uBloomAt) / uViewport.y;
      float glow = exp(-dot(b, b) * 3.0) * 0.8 + exp(-dot(b, b) * 0.6) * 0.35;
      color += uFireDawn * glow * uBloom * 0.4 + vec3(uBloom * 0.05);
    }

    // A first visit's veil: the library comes out of its own fog while the
    // lens is still at its strongest (unseen's peak warp plays under its
    // loader's fade), so what shows of the warp is its last, gentlest part.
    color = mix(color, worldFogColor(dark), uVeil);

    float vig = smoothstep(0.95, 0.25, length(c * vec2(1.0, 1.12)));
    float vignette = mix(mix(0.94, 1.0, vig), mix(0.52, 1.0, vig), dark);
    color *= mix(1.0, vignette, uLens);

    // The wipe: covered on the right first, a front 0.6 screens wide.
    if (uWipe > 0.0) {
      float soft = 0.6;
      float front = (1.0 - uWipe) * (1.0 + soft);
      float m = smoothstep(front - soft, front, vUv.x);
      if (uWipe >= 1.0) m = 1.0;
      color = mix(color, uWipeColor, m);
    }

    float grain = worldHash(gl_FragCoord.xy * 0.73 + uGrainSeed * 17.0) - 0.5;
    color += grain * mix(0.045, 0.06, dark);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export type Composite = {
  scene: Scene;
  camera: OrthographicCamera;
  /** Clears the scene target's alpha under the library (see the readable ceiling). */
  libraryMask: Scene;
  uniforms: {
    tScene: { value: Texture | null };
    uLens: { value: number };
    uDistort: { value: number };
    uVeil: { value: number };
    uBlur: { value: number };
    uWipeColor: { value: Color };
    uWipe: { value: number };
    uGrainSeed: { value: number };
    uHead: { value: Vector4 };
    uPulses: { value: Vector4[] };
    uPulseInk: { value: Color };
    uPulseLight: { value: Color };
    uShiver: { value: number };
    uBloom: { value: number };
    uBloomAt: { value: Vector2 };
    uFireInk: { value: Color };
    uFireDawn: { value: Color };
    uInkDeep: { value: Color };
    uFrontAhead: { value: number };
  };
  resolution: Vector2;
  dispose(): void;
};

export function createComposite(world: WorldUniforms): Composite {
  const geometry = new BufferGeometry();
  // One triangle covering the screen.
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const uniforms = {
    tScene: { value: null as Texture | null },
    uLens: { value: 1 },
    uDistort: { value: REST_DISTORT },
    uVeil: { value: 0 },
    uBlur: { value: 0 },
    uWipeColor: { value: new Color("#000000") },
    uWipe: { value: 0 },
    uGrainSeed: { value: 0 },
    uHead: { value: new Vector4(0, 0, 0, 0) },
    uPulses: { value: Array.from({ length: PULSE_SLOTS }, () => new Vector4(0, 0, -100, 0)) },
    uPulseInk: { value: new Color("#1C2A4F") },
    uPulseLight: { value: new Color(WORLD_PALETTE.dark.mote) },
    uShiver: { value: 0 },
    uBloom: { value: 0 },
    uBloomAt: { value: new Vector2() },
    uFireInk: { value: new Color(WORLD_PALETTE.dark.front) },
    uFireDawn: { value: new Color(WORLD_PALETTE.light.front) },
    uInkDeep: { value: new Color("#081133") },
    uFrontAhead: { value: FRONT_AHEAD },
  };
  const material = new ShaderMaterial({
    uniforms: { ...world, ...uniforms },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Drawn over the library before anything else joins it: keeps every
  // colour and clears the alpha, so the screen pass can tell the library's
  // pixels (alpha 0) from what the cards and the pages' layers draw over
  // them (their own alpha). The world's particles keep the alpha they find.
  const maskMaterial = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: "void main() { gl_FragColor = vec4(0.0); }",
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: ZeroFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: ZeroFactor,
    depthTest: false,
    depthWrite: false,
  });
  const maskMesh = new Mesh(geometry, maskMaterial);
  maskMesh.frustumCulled = false;
  const libraryMask = new Scene();
  libraryMask.add(maskMesh);

  return {
    scene,
    camera,
    libraryMask,
    uniforms,
    resolution: new Vector2(),
    dispose() {
      geometry.dispose();
      material.dispose();
      maskMaterial.dispose();
    },
  };
}
