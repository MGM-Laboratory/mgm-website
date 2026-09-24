import { Color, Vector2, Vector4 } from "three";

import { WORLD_PALETTE } from "@/components/articles/world/palette";

/**
 * Uniforms every world material shares (by reference: one object per
 * uniform, handed to every ShaderMaterial, so the engine updates each value
 * once per frame) and the GLSL chunk that reads them.
 *
 * The scheme switch is per pixel: `darkAt()` is the dark amount at the
 * current fragment. At rest it is the resting scheme (0 light, 1 dark).
 * While a theme wave runs it follows a ragged circular front spreading from
 * the toggle, so every material (stone, paper, fog, text, particles and
 * the screen pass) flips in the same place at the same moment, and the
 * whole world changes like ink spreading through water.
 */

export function createWorldUniforms() {
  return {
    uTime: { value: 0 },
    /** Drawing buffer size, device px. */
    uResolution: { value: new Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    /** Viewport size, CSS px. */
    uViewport: { value: new Vector2(1, 1) },
    /** The resting scheme: 0 light, 1 dark. */
    uDark: { value: 0 },
    /** Theme wave: origin (CSS px, top-left), front radius (CSS px), active flag. */
    uWave: { value: new Vector4(0, 0, 0, 0) },
    uWaveFrom: { value: 0 },
    uWaveTo: { value: 0 },
    uFogLight: { value: new Color(WORLD_PALETTE.light.fog) },
    uFogDark: { value: new Color(WORLD_PALETTE.dark.fog) },
    /** Fog density per CSS px of depth (the engine scales it with the viewport). */
    uFogDensity: { value: 0.0003 },
    /** View depth (CSS px) where the fog starts: the card plane stays clear. */
    uFogStart: { value: 2000 },
    /** Extra fog pulled toward the camera during transitions (0..1). */
    uSwallow: { value: 0 },
    /** Article theme tint over the library (0 none, 1 fully the theme). */
    uTheme: { value: 0 },
    uThemeLight: { value: new Color(WORLD_PALETTE.light.fog) },
    uThemeDark: { value: new Color(WORLD_PALETTE.dark.fog) },
    /** CSS px per environment unit (the library is modelled in its own units). */
    uEnvScale: { value: 64 },
    /** 0 on the list, 1 on an article (eased): thicker fog, quieter life. (WP2) */
    uDetail: { value: 0 },
  };
}

export type WorldUniforms = ReturnType<typeof createWorldUniforms>;

export const WORLD_COMMON = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform vec2 uViewport;
uniform float uDark;
uniform vec4 uWave;
uniform float uWaveFrom;
uniform float uWaveTo;
uniform vec3 uFogLight;
uniform vec3 uFogDark;
uniform float uFogDensity;
uniform float uFogStart;
uniform float uSwallow;
uniform float uTheme;
uniform vec3 uThemeLight;
uniform vec3 uThemeDark;
uniform float uEnvScale;
uniform float uDetail;

float worldHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float worldNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(worldHash(i), worldHash(i + vec2(1.0, 0.0)), u.x),
    mix(worldHash(i + vec2(0.0, 1.0)), worldHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

/** This fragment in viewport CSS px, top-left origin. */
vec2 worldFragCss() {
  return vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uPixelRatio;
}

/** How far a theme wave's front is from this fragment (negative inside it). */
float waveDistance(vec2 css) {
  float edge = (worldNoise(css * 0.009 + uTime * 0.15) - 0.5) * 140.0
             + (worldNoise(css * 0.031 - uTime * 0.4) - 0.5) * 36.0;
  return distance(css, uWave.xy) + edge - uWave.z;
}

/** The dark amount at this fragment: the resting scheme, or the wave's. */
float darkAt() {
  if (uWave.w < 0.5) return uDark;
  float k = smoothstep(26.0, -26.0, waveDistance(worldFragCss()));
  return mix(uWaveFrom, uWaveTo, k);
}

vec3 schemed(vec3 light, vec3 dark, float k) {
  return mix(light, dark, k);
}

/** The fog colour for a dark amount, tinted toward the article theme. */
vec3 worldFogColor(float dark) {
  vec3 library = mix(uFogLight, uFogDark, dark);
  vec3 theme = mix(uThemeLight, uThemeDark, dark);
  return mix(library, theme, uTheme);
}

/**
 * Exponential fog that thickens toward the floor and with distance past the
 * card plane (which stays clear). depth is view-space distance in CSS px,
 * worldY the fragment's height in CSS px.
 */
float worldFogAmount(float depth, float worldY) {
  float h = clamp((worldY / uEnvScale + 8.0) / 30.0, 0.0, 1.0);
  float density = uFogDensity * mix(1.35, 0.75, h) * (1.0 + uSwallow * 6.0);
  float beyond = max(depth - uFogStart * (1.0 - uSwallow), 0.0);
  float f = 1.0 - exp(-pow(beyond * density, 1.6));
  return clamp(max(f, uSwallow * uSwallow), 0.0, 1.0);
}

vec3 applyWorldFog(vec3 color, float depth, float worldY, float dark) {
  return mix(color, worldFogColor(dark), worldFogAmount(depth, worldY));
}
`;
