import { Color, Vector4 } from "three";

import {
  LANTERN_AMP,
  LANTERN_SPREAD,
  LANTERN_STEP,
  LANTERN_Y,
  LANTERN_Z0,
} from "@/components/articles/world/library/layout";
import { WORLD_PALETTE } from "@/components/articles/world/palette";

/**
 * Uniforms and GLSL the library's own materials share (on top of the world's
 * WORLD_COMMON): the nave's width, the lanterns' light, the dawn flood, the
 * theme tint of the stone and the library fog.
 */

export function createLibraryUniforms() {
  return {
    /** Half the nave's width, library units (the walls' inner faces). */
    uNaveHalf: { value: 6 },
    uLanternCount: { value: 8 },
    /** Lantern light, pre-scaled per scheme (a warm hint by day, embers by night). */
    uLanternLight: { value: new Color(WORLD_PALETTE.light.lantern).multiplyScalar(0.12) },
    uLanternDark: { value: new Color(WORLD_PALETTE.dark.lantern).multiplyScalar(0.95) },
    /** The dawn flood: the window pours light through the whole nave (0..1). */
    uFlood: { value: 0 },
    /** The river's flow phase (advances faster while the list scrolls). */
    uFlow: { value: 0 },
    /**
     * The great window on screen, for the light it scatters into the fog:
     * centre (CSS px), half its width on screen (CSS px), unused.
     */
    uWindowScreen: { value: new Vector4(0, 0, 200, 0) },
  };
}

export type LibraryUniforms = ReturnType<typeof createLibraryUniforms>;

const f = (value: number) => value.toFixed(5);

/** Needs WORLD_COMMON before it. */
export const LIBRARY_COMMON = /* glsl */ `
uniform float uNaveHalf;
uniform float uLanternCount;
uniform vec3 uLanternLight;
uniform vec3 uLanternDark;
uniform float uFlood;
uniform float uFlow;
uniform vec4 uWindowScreen;

const float LANTERN_STEP = ${f(LANTERN_STEP)};
const float LANTERN_Z0 = ${f(LANTERN_Z0)};
const float LANTERN_Y = ${f(LANTERN_Y)};
const float LANTERN_AMP = ${f(LANTERN_AMP)};
const float LANTERN_SPREAD = ${f(LANTERN_SPREAD)};

float libraryLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

/** Lantern k's glass (library units). Mirrors layout.ts lanternPosition(). */
vec3 lanternPos(float k) {
  float side = mod(k, 2.0) < 0.5 ? -1.0 : 1.0;
  return vec3(
    side * LANTERN_SPREAD * uNaveHalf,
    LANTERN_Y + LANTERN_AMP * sin(k * 2.39996 + 0.7),
    LANTERN_Z0 - k * LANTERN_STEP
  );
}

float lanternFlicker(float k) {
  float h = fract(sin(k * 91.7 + 3.1) * 43758.5453);
  return 0.84
    + 0.09 * sin(uTime * (5.0 + h * 4.0) + h * 20.0)
    + 0.07 * sin(uTime * (11.0 + h * 9.0) + h * 7.0);
}

/**
 * How the lanterns burn at a screen point: x the power, y the scheme of the
 * flame (0 a warm white light, 1 an ember). At rest it is the resting
 * scheme. While a theme wave passes, a flame gutters out just behind the
 * front and relights, in the new scheme, well behind it.
 */
vec2 lanternState(vec2 css) {
  if (uWave.w < 0.5) return vec2(1.0, uDark);
  float d = waveDistance(css);
  float dying = smoothstep(30.0, -120.0, d);
  float relit = smoothstep(-210.0, -460.0, d);
  float power = (1.0 - dying) + relit * (1.0 + 0.35 * (1.0 - relit));
  power *= 1.0 - 0.7 * dying * (1.0 - relit) * (0.5 + 0.5 * sin(uTime * 37.0 + d * 0.07));
  float scheme = mix(uWaveFrom, uWaveTo, step(d, -170.0));
  return vec2(power, scheme);
}

vec3 lanternColor(float scheme) {
  return mix(uLanternLight, uLanternDark, scheme);
}

/** The light the nearest lanterns throw on a surface (p: library units, n: its normal). */
vec3 lanternLight(vec3 p, vec3 n, vec2 css) {
  vec2 state = lanternState(css);
  float k0 = floor((LANTERN_Z0 - p.z) / LANTERN_STEP + 0.5);
  float sum = 0.0;
  for (int i = -1; i <= 1; i++) {
    float k = k0 + float(i);
    if (k < 0.0 || k >= uLanternCount) continue;
    vec3 d = lanternPos(k) - p;
    float r2 = dot(d, d);
    float wrap = dot(n, d) * inversesqrt(max(r2, 1e-4)) * 0.6 + 0.4;
    sum += lanternFlicker(k) * max(wrap, 0.0) / (1.0 + r2 * 0.22);
  }
  return lanternColor(state.y) * sum * state.x;
}

/** Stone and paper lean toward an article's theme colour on its page. */
vec3 themeTint(vec3 color, float dark) {
  if (uTheme <= 0.0) return color;
  vec3 theme = mix(uThemeLight, uThemeDark, dark);
  vec3 tinted = theme * (0.62 + 0.55 * (libraryLuma(color) - libraryLuma(theme)));
  return mix(color, tinted, uTheme * 0.8);
}

/**
 * The world fog, plus the library's own haze: a pale veil even close up,
 * so the stacks read as a dream behind the cards and never as clutter, and
 * on an article a much thicker one, so body text always sits on something
 * close to the page colour.
 */
/**
 * The window's light scattered in the fog toward the eye: the mist glows
 * around the window (warm white by day, moonlight blue by night), so what
 * stands far off in its direction becomes a silhouette against luminous
 * air instead of fading into a flat grey. Added to the fog colour, so it
 * weighs as much as the fog does.
 */
vec3 windowScatter(vec2 css, float dark) {
  vec2 d = (css - uWindowScreen.xy) / max(uWindowScreen.z, 1.0);
  d.y *= 0.62;
  float r2 = dot(d, d);
  float g = exp(-r2 * 0.55) * 0.7 + exp(-r2 * 0.09) * 0.3;
  g *= (1.0 - uSwallow) * (1.0 - uDetail * 0.75) * (1.0 + uFlood * 1.5);
  vec3 day = vec3(0.035, 0.03, 0.012);
  vec3 night = vec3(0.05, 0.085, 0.19);
  return mix(day, night, dark) * g;
}

vec3 libraryFogReach(vec3 color, float depth, float worldY, float dark, float reach) {
  // reach > 1 lets a surface carry further through the fog (a silhouette
  // against the light behind it): its depth past the fog's start counts less.
  float f = worldFogAmount(uFogStart + (depth - uFogStart) / reach, worldY);
  float veil = mix(0.2, 0.08, dark);
  f = max(f, veil);
  f = mix(f, 1.0 - (1.0 - f) * 0.28, uDetail);
  vec3 fog = worldFogColor(dark) + windowScatter(worldFragCss(), dark);
  return mix(color, fog, clamp(f, 0.0, 1.0));
}

vec3 libraryFog(vec3 color, float depth, float worldY, float dark) {
  return libraryFogReach(color, depth, worldY, dark, 1.0);
}
`;
