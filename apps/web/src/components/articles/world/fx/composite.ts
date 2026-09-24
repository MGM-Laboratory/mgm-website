import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  type Texture,
} from "three";

import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The world's one screen pass, over the scene render target:
 *
 * - A lens: barrel distortion with a radial spectral split, so content far
 *   from the centre (the corners, a card at the edge) fringes into red and
 *   blue while the middle stays sharp. The list wears it fully; article
 *   pages keep only the grain (`uLens`). A first visit starts with the lens
 *   strongly warped and lets it settle (`uDistort`).
 * - Motion blur: a vertical smear along the scroll direction, as long as
 *   the list is fast. The same taps carry the spectral split, so a fast
 *   scroll fringes more at the edges, like a real lens.
 * - Vignette and animated grain, weighted by scheme (a dirty vignette on
 *   white fog reads as smudge, so the light world keeps it faint).
 * - The transition wipe: a flat colour sweeping in from the right edge with
 *   a very soft front, which the list-to-article transition drives.
 */

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
  uniform float uBlur;
  uniform vec3 uWipeColor;
  uniform float uWipe;
  uniform float uGrainSeed;
  /** The list's fixed head: left, right, bottom (CSS px) and how much it veils. */
  uniform vec4 uHead;
  varying vec2 vUv;

  #define TAPS 10

  // Red at t = 0, green in the middle, blue at t = 1; the weights of all
  // taps sum to the same white, so a sharp picture keeps its colours.
  vec3 spectral(float t) {
    return clamp(vec3(1.5 - 3.0 * t, 1.0 - abs(2.0 * t - 1.0) * 1.6, 3.0 * t - 1.5), 0.0, 1.0) + 0.04;
  }

  void main() {
    vec2 uv = vUv;
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);
    float lens = uLens * uDistort;
    float blur = uBlur / uViewport.y;
    float jitter = worldHash(gl_FragCoord.xy + uGrainSeed);

    vec3 sum = vec3(0.0);
    vec3 weight = vec3(0.0);
    for (int i = 0; i < TAPS; i++) {
      float t = (float(i) + 0.5) / float(TAPS);
      // Barrel: each wavelength bends by its own amount (red not at all,
      // blue the most), so the corners fringe and the centre stays sharp.
      vec2 tapUv = uv + c * r2 * lens * t;
      // Motion blur along the scroll direction. The blur position of a tap
      // is shuffled against its wavelength (golden-ratio steps), so every
      // colour spreads over the whole smear and a fast scroll blurs
      // instead of splitting into rainbows.
      tapUv.y += blur * (fract(float(i) * 0.618034 + jitter) - 0.5);
      vec3 w = spectral(t);
      sum += texture2D(tScene, tapUv).rgb * w;
      weight += w;
    }
    vec3 color = sum / weight;

    float dark = darkAt();
    // A bank of mist behind the list's head (and the site header above it):
    // whatever the world draws there (a lantern, the moon, a card folding
    // away) stays a whisper under the title, the search and the filters.
    if (uHead.w > 0.0) {
      vec2 css = worldFragCss();
      float under = 1.0 - smoothstep(uHead.z - 70.0, uHead.z + 24.0, css.y);
      float across = smoothstep(uHead.x - 90.0, uHead.x + 30.0, css.x)
                   * (1.0 - smoothstep(uHead.y - 30.0, uHead.y + 90.0, css.x));
      color = mix(color, worldFogColor(dark), under * across * uHead.w);
    }
    float vig = smoothstep(0.95, 0.25, length(c * vec2(1.0, 1.12)));
    float vignette = mix(mix(0.94, 1.0, vig), mix(0.52, 1.0, vig), dark);
    color *= mix(1.0, vignette, uLens);

    // The wipe: covered on the right first, a front 0.6 screens wide.
    if (uWipe > 0.0) {
      float soft = 0.6;
      float front = (1.0 - uWipe) * (1.0 + soft);
      float m = smoothstep(front - soft, front, uv.x);
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
  uniforms: {
    tScene: { value: Texture | null };
    uLens: { value: number };
    uDistort: { value: number };
    uBlur: { value: number };
    uWipeColor: { value: Color };
    uWipe: { value: number };
    uGrainSeed: { value: number };
    uHead: { value: Vector4 };
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
    uDistort: { value: -0.05 },
    uBlur: { value: 0 },
    uWipeColor: { value: new Color("#000000") },
    uWipe: { value: 0 },
    uGrainSeed: { value: 0 },
    uHead: { value: new Vector4(0, 0, 0, 0) },
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
  return {
    scene,
    camera,
    uniforms,
    resolution: new Vector2(),
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
