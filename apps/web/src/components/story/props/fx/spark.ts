import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";

import { BRAND } from "@/components/story/props/deck-shared";
import { createMagicTrail, type MagicTrail } from "@/components/story/props/fx/magic-trail";
import {
  BILLBOARD_VERTEX,
  STAR_RATIO_COMPASS,
  STAR_SDF_GLSL,
} from "@/components/story/props/fx/star-sdf.glsl";

/**
 * The spark: the card back's compass star come alive. A camera-facing
 * star with a white core, a brand-yellow glow, fine cross flares and a
 * soft halo that breathes, trailing a short ribbon of light.
 *
 * Put `spark.object` in a scene (identity parent) and move `spark.position`
 * in that frame; `update(time)` twinkles it, spins it and feeds the trail.
 * `setIntensity(0)` hides it (no draw calls).
 */

export type SparkOptions = {
  /** Star radius, metres (the star on a card back is about 4 mm). */
  size?: number;
  colour?: number;
  trail?: boolean;
  /** Over the light page: normal blending with an ink rim so the star still reads on white. */
  onLight?: boolean;
};

export type Spark = {
  readonly object: Group;
  readonly position: Vector3;
  readonly trail: MagicTrail | null;
  setIntensity(amount: number): void;
  setSize(size: number): void;
  /** Clock life: twinkle, spin, trail. Set `position` first. */
  update(time: number): void;
  dispose(): void;
};

const FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uIntensity;
uniform float uTime;
uniform float uRatio;
uniform float uWhiten;
varying vec2 vQuad;
${STAR_SDF_GLSL}
void main() {
  vec2 q = vQuad;
  float r = length(q);
  float breath = 0.9 + 0.1 * sin(uTime * 5.3) + 0.05 * sin(uTime * 13.1);
  // The star occupies the inner 45% of the quad; the rest is glow.
  float d = sdStar4(q, 0.45 * breath, uRatio);
  float core = sdFill(d + 0.02, 0.02);
  float glow = exp(-max(d, 0.0) * 14.0);
  float flare = exp(-abs(q.y) * 90.0) * exp(-abs(q.x) * 2.6) + exp(-abs(q.x) * 90.0) * exp(-abs(q.y) * 2.6);
  float halo = exp(-r * r * 5.0) * 0.35;
  float fadeEdge = 1.0 - smoothstep(0.82, 1.0, r);
  float light = glow * 0.9 + halo + flare * 0.55;
  vec3 col = mix(uColour, vec3(1.0, 0.98, 0.93), clamp(core * 1.4 + flare * 0.35, 0.0, 1.0) * uWhiten);
  // Over white the star keeps a thin rim of its own colour, a little darker, so it stays a star.
  float rim = (1.0 - uWhiten) * sdFill(abs(d) - 0.012, 0.012);
  col = mix(col, uColour * 0.7, rim);
  float alpha = clamp(light + core + rim, 0.0, 1.0) * uIntensity * fadeEdge;
  gl_FragColor = vec4(col, alpha);
}
`;

export function createSpark(options: SparkOptions = {}): Spark {
  const object = new Group();
  object.name = "story-spark";
  const uniforms = {
    uSize: { value: (options.size ?? 0.006) * 2.4 },
    uSpin: { value: 0 },
    uColour: { value: new Color(options.colour ?? BRAND.yellow) },
    uIntensity: { value: 1 },
    uTime: { value: 0 },
    uRatio: { value: STAR_RATIO_COMPASS },
    uWhiten: { value: options.onLight ? 0 : 1 },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: FRAGMENT,
    blending: options.onLight ? NormalBlending : AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const geometry = new PlaneGeometry(1, 1);
  const star = new Mesh(geometry, material);
  star.name = "story-spark-star";
  star.frustumCulled = false;
  star.renderOrder = 4;
  object.add(star);

  const trail =
    options.trail === false
      ? null
      : createMagicTrail({
          points: 28,
          width: (options.size ?? 0.006) * 0.45,
          life: 0.35,
          head: options.onLight ? BRAND.yellow : 0xfff4d4,
          tail: options.onLight ? BRAND.blue : BRAND.yellow,
          onLight: options.onLight,
        });
  if (trail) object.add(trail.mesh);

  const position = new Vector3();
  let intensity = 1;
  const spark: Spark = {
    object,
    position,
    trail,
    setIntensity(amount) {
      intensity = Math.max(0, amount);
      uniforms.uIntensity.value = intensity;
      star.visible = intensity > 0.001;
      trail?.setIntensity(intensity);
    },
    setSize(size) {
      uniforms.uSize.value = size * 2.4;
      trail?.setWidth(size * 0.45);
    },
    update(time) {
      uniforms.uTime.value = time;
      // A slow turn with a flick now and then, like a compass needle settling.
      uniforms.uSpin.value = time * 0.6 + Math.sin(time * 1.7) * 0.25;
      star.position.copy(position);
      if (trail) {
        trail.push(position, time);
        trail.update(time);
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      trail?.dispose();
      object.removeFromParent();
    },
  };
  return spark;
}
