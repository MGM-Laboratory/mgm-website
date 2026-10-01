import { GLSL_COMMON } from "./common";

/**
 * Bauhaus Dunes' shaders (World 02): "A desert where the dunes are circles
 * and triangles, and the wind is a line." Poster light: the sand is drawn in
 * three tones (cream where the low sun hits it, brand yellow, ochre in the
 * lee), the primitives in two (lit and shaded, a hard terminator), and every
 * shadow is ink blue and hard edged.
 *
 * The shadows are analytic: the ground shader tests the ray toward the sun
 * against each caster (cylinders, cones, spheres, rings, arches, domes and
 * her, as two spheres), so they are exact, long and cost a few operations
 * each; no shadow map, no extra pass.
 */

export const SHADOW_MAX = 26;
/** Monuments with their own bounce clock (world-dunes.ts `PRIM_MAX`). */
export const PRIM_COUNT = 64;

/** The dunes: long swells, a few round hills, flattened along her course. Shared by the CPU (`duneHeight`). */
export const DUNE_GLSL = /* glsl */ `
uniform vec4 uHills[6];
float duneHeight(vec2 p) {
  float h = 1.6 * sin(p.x * 0.045 + p.y * 0.021) + 1.1 * sin(p.x * -0.028 + p.y * 0.052 + 1.3) + 0.5 * sin(p.x * 0.11 + p.y * 0.07 + 2.0);
  h = h + 2.2;
  for (int i = 0; i < 6; i++) {
    vec4 c = uHills[i];
    vec2 d = p - c.xy;
    h += c.z * exp(-dot(d, d) / (c.w * c.w));
  }
  return h * corridor(p);
}
`;

/** Path x as a function of z (the slalom weave), mirrored from `dunesPathX` in world-dunes.ts. */
export const DUNE_PATH_GLSL = /* glsl */ `
float dunePathX(float z) {
  float env = smoothstep(-20.0, -40.0, z) * (1.0 - smoothstep(-180.0, -200.0, z));
  return 6.0 * sin(6.2831853 * (z + 30.0) / 60.0) * env;
}
float corridor(vec2 p) {
  float d = abs(p.x - dunePathX(p.y));
  return mix(0.3, 1.0, smoothstep(5.0, 32.0, d));
}
`;

export const GROUND_VERTEX = /* glsl */ `
uniform vec3 uOrigin;
varying vec3 vWorld;
${DUNE_PATH_GLSL}
${DUNE_GLSL}
void main() {
  vec3 p = position + vec3(uOrigin.x, 0.0, uOrigin.z);
  p.y = duneHeight(p.xz);
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const GROUND_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFlow;
uniform float uFreeze;
uniform vec3 uCamPos;
uniform vec3 uSun;
uniform vec3 uCream;
uniform vec3 uSand;
uniform vec3 uOchre;
uniform vec3 uInk;
uniform vec3 uHaze;
uniform float uHazeDensity;
uniform vec4 uCasters[${SHADOW_MAX}];
uniform vec4 uCasterDims[${SHADOW_MAX}];
uniform int uCasterCount;
uniform vec4 uGust;
uniform vec3 uPointerGround;
varying vec3 vWorld;
${GLSL_COMMON}
${DUNE_PATH_GLSL}
${DUNE_GLSL}

// Does the ray from p toward the sun hit caster i? kind in uCasters[i].w.
float shadowOf(vec3 p, vec3 L, vec4 c, vec4 dim) {
  float kind = c.w;
  vec3 C = c.xyz;
  if (kind < 0.5 || (kind > 0.5 && kind < 1.5)) {
    // A vertical cylinder (0) or cone (1): radius dim.x, height dim.y, from its base C.
    vec2 Lh = L.xz;
    float lh = dot(Lh, Lh);
    float t = dot(C.xz - p.xz, Lh) / max(lh, 1e-5);
    if (t <= 0.0) return 0.0;
    float y = p.y + t * L.y - C.y;
    if (y < 0.0 || y > dim.y) return 0.0;
    float r = kind < 0.5 ? dim.x : dim.x * (1.0 - y / dim.y);
    float d = length(p.xz + Lh * t - C.xz);
    return 1.0 - smoothstep(r - 0.12, r + 0.12, d);
  }
  if (kind < 2.5 || (kind > 4.5 && kind < 5.5)) {
    // A sphere (2) or a dome (5): radius dim.x around C.
    vec3 o = p - C;
    float b = dot(o, L);
    float q = dot(o, o) - dim.x * dim.x;
    float disc = b * b - q;
    if (disc < 0.0 || -b < 0.0) return 0.0;
    float t1 = -b - sqrt(disc);
    if (kind > 4.5 && p.y + max(t1, 0.0) * L.y < C.y) return 0.0;
    return smoothstep(0.0, 0.25, sqrt(disc));
  }
  // A ring (3) or an arch (4, the top half only): radius dim.x, tube dim.y, facing angle dim.z.
  vec3 N = vec3(sin(dim.z), 0.0, cos(dim.z));
  float dn = dot(L, N);
  if (abs(dn) < 1e-4) return 0.0;
  float t = dot(C - p, N) / dn;
  if (t <= 0.0) return 0.0;
  vec3 q = p + L * t - C;
  if (kind > 3.5 && q.y < 0.0) return 0.0;
  float d = abs(length(q) - dim.x);
  return 1.0 - smoothstep(dim.y - 0.1, dim.y + 0.1, d);
}

void main() {
  vec3 p = vWorld;
  // The surface normal from the dune function itself (crisp at any grid size).
  float e = 0.35;
  float hx = duneHeight(p.xz + vec2(e, 0.0)) - duneHeight(p.xz - vec2(e, 0.0));
  float hz = duneHeight(p.xz + vec2(0.0, e)) - duneHeight(p.xz - vec2(0.0, e));
  vec3 n = normalize(vec3(-hx, 2.0 * e, -hz));
  vec3 L = normalize(uSun);
  float lit = dot(n, L);
  // Poster tones: three flat bands with soft steps.
  vec3 col = mix(uOchre, uSand, smoothstep(0.02, 0.1, lit));
  col = mix(col, uCream, smoothstep(0.44, 0.5, lit));
  // Ripples: thin lines across the slope, drifting with the wind (the treadmill).
  float rip = sin((p.x * 0.9 + p.z * 0.35 + 3.0 * sin(p.z * 0.07) + uFlow * 1.6) * 2.2);
  vec3 view = p - uCamPos;
  float dist = length(view);
  float fw = fwidth(rip);
  float line = smoothstep(0.86 - fw, 0.95 + fw, rip);
  col = mix(col, uOchre * 0.82, line * 0.5 * (1.0 - smoothstep(30.0, 120.0, dist)));
  // Hard ink shadows from every caster.
  float shade = 0.0;
  for (int i = 0; i < ${SHADOW_MAX}; i++) {
    if (i >= uCasterCount) break;
    shade = max(shade, shadowOf(p, L, uCasters[i], uCasterDims[i]));
  }
  col = mix(col, mix(col, uInk, 0.62), shade);
  // A tap's gust: a ring of wind running out across the sand; the cursor's warm spot.
  float g = uGust.w >= 0.0 ? exp(-pow(length(p.xz - uGust.xy) - uGust.w * 22.0, 2.0) * 0.08) * exp(-uGust.w * 0.9) : 0.0;
  col = mix(col, uCream * 1.08, g * 0.55);
  float pd = length(p.xz - uPointerGround.xy);
  col = mix(col, uCream * 1.05, uPointerGround.z * exp(-pd * pd * 0.04) * 0.28);
  // Aerial haze toward the cream horizon.
  col = mix(col, uHaze, clamp(1.0 - exp(-dist * uHazeDensity), 0.0, 1.0));
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

/**
 * The primitives (cylinders, cones, spheres, rings, arches, prisms, domes,
 * crosses): one program for all, an instanced draw per shape. Two flat tones
 * with a hard terminator, a sky fill, a dark foot where they meet the sand,
 * haze. A tap makes one bounce: squash and stretch on the clock.
 */
export const PRIM_VERTEX = /* glsl */ `
attribute vec3 aColour;
attribute vec3 aPivot;
attribute float aPrim;
uniform float uTime;
uniform float uBounce[${PRIM_COUNT}];
varying vec3 vColour;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  float age = uTime - uBounce[int(aPrim + 0.5)];
  float b = age > 0.0 && age < 1.4 ? sin(age * 14.0) * exp(-age * 4.0) * 0.18 : 0.0;
  vec3 local = (position - aPivot) * vec3(1.0 + b * 0.5, 1.0 - b, 1.0 + b * 0.5);
  vec3 world = aPivot + local;
  vWorld = world;
  vNormal = normal;
  vColour = aColour;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const PRIM_FRAGMENT = /* glsl */ `
uniform float uFreeze;
uniform vec3 uCamPos;
uniform vec3 uSun;
uniform vec3 uSkyFill;
uniform vec3 uHaze;
uniform float uHazeDensity;
varying vec3 vColour;
varying vec3 vNormal;
varying vec3 vWorld;
${GLSL_COMMON}
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = vWorld - uCamPos;
  if (dot(n, view) > 0.0) n = -n;
  float lit = smoothstep(-0.02, 0.06, dot(n, normalize(uSun)));
  vec3 col = vColour * mix(0.58, 1.0, lit);
  col += uSkyFill * 0.1 * max(n.y, 0.0);
  // Where it meets the sand, a dark foot.
  col *= 0.72 + 0.28 * smoothstep(0.0, 2.2, vWorld.y);
  float dist = length(view);
  col = mix(col, uHaze, clamp(1.0 - exp(-dist * uHazeDensity), 0.0, 1.0));
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

/** The sky: brand blue to a cream horizon, a flat sun, Bauhaus clouds (white discs and half discs) drifting. */
export const DUNES_SKY = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uSkyMid;
uniform vec3 uHaze;
uniform vec3 uSunColour;
uniform vec3 uSun;
uniform float uTime;
uniform float uFreeze;
${GLSL_COMMON}
vec3 skyColour(vec3 d) {
  float y = d.y;
  vec3 col = mix(uHaze, uSkyMid, smoothstep(0.0, 0.22, y));
  col = mix(col, uZenith, smoothstep(0.22, 0.85, y));
  // The sun: a flat disc with a thin halo ring.
  vec3 L = normalize(uSun);
  float a = acos(clamp(dot(d, L), -1.0, 1.0));
  col = mix(col, uSunColour, 1.0 - smoothstep(0.052, 0.056, a));
  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.004, 0.008, abs(a - 0.085))) * 0.5);
  // Clouds: flat white discs and half discs on a slow wind.
  float az = atan(d.x, -d.z);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(fract(fi * 0.137 + uTime * 0.0025 * (1.0 + fi * 0.2)) * 6.2831853 - 3.14159, 0.12 + 0.05 * fract(fi * 0.71) + 0.12 * fract(fi * 0.37));
    vec2 q = vec2((az - c.x) * cos(y), y - c.y);
    q.x = mod(q.x + 3.14159, 6.2831853) - 3.14159;
    float r = 0.035 + 0.04 * fract(fi * 0.53);
    float disc = 1.0 - smoothstep(r - 0.002, r + 0.002, length(q * vec2(0.8, 1.0)));
    if (fract(fi * 0.5) > 0.2) disc *= step(0.0, q.y);
    col = mix(col, vec3(1.0, 0.99, 0.96), disc * 0.92);
  }
  return freezeGrade(col, uFreeze);
}
`;

/**
 * The wind, as lines: thin strokes skimming the dunes in the wind's
 * direction, drawing themselves in and out (a moving dash), bending away from
 * the cursor. One instanced strip each; a gust (a tap) throws them wide.
 */
export const WIND_VERTEX = /* glsl */ `
attribute float aU;
attribute float aSide;
attribute vec4 aSeed;
uniform float uTime;
uniform float uFlow;
uniform vec3 uCamPos;
uniform vec3 uCentre;
uniform vec3 uBox;
uniform vec3 uWind;
uniform vec3 uPointer;
uniform float uAspect;
uniform vec4 uGust;
varying float vU;
varying float vSide;
varying float vFade;
varying float vSeed;
${DUNE_PATH_GLSL}
${DUNE_GLSL}
void main() {
  float len = 20.0 + 26.0 * aSeed.z;
  vec3 W = normalize(uWind);
  vec3 across = normalize(cross(vec3(0.0, 1.0, 0.0), W));
  // Each stroke travels with the wind (on the clock and the treadmill), wrapped around the box.
  // Fixed in the world, travelling with the wind, wrapped into a box around the lens.
  float travel = uTime * (6.0 + 6.0 * aSeed.w) + uFlow * 4.0;
  float c = dot(uCentre, W);
  float ca = dot(uCentre, across);
  float along = mod(aSeed.x * uBox.x + travel - c + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
  float side = mod(aSeed.y * uBox.z - ca + uBox.z * 0.5, uBox.z) - uBox.z * 0.5;
  vec3 p = W * (c + along + aU * len) + across * (ca + side);
  float wave = sin(aU * 6.2831853 * (0.6 + aSeed.w) + uTime * 1.3 + aSeed.x * 20.0);
  p += across * wave * 0.8;
  p.y = duneHeight(p.xz) + 0.6 + 1.8 * aSeed.w + 0.4 * wave;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  // The cursor parts them (screen space), a gust lifts them.
  vec2 ndc = clip.xy / max(clip.w, 1e-4);
  vec2 dlt = (ndc - uPointer.xy) * vec2(uAspect, 1.0);
  float r = length(dlt);
  vec2 push = (r > 1e-4 ? dlt / r : vec2(0.0)) * uPointer.z * 0.12 * exp(-r * r * 14.0);
  ndc += push / vec2(uAspect, 1.0);
  clip.xy = ndc * clip.w;
  // Width in screen space, a hair thicker near the lens.
  vec4 clip2 = projectionMatrix * viewMatrix * vec4(p + W * 0.5, 1.0);
  vec2 dir = normalize(clip2.xy / max(clip2.w, 1e-4) - clip.xy / max(clip.w, 1e-4) + 1e-6);
  vec2 normal2 = vec2(-dir.y, dir.x);
  clip.xy += normal2 * aSide * 0.0036 * clip.w * (1.0 + 3.0 / max(-mv.z, 1.0));
  gl_Position = clip;
  vU = aU;
  vSide = aSide;
  vSeed = aSeed.w;
  float edge = smoothstep(0.5, 0.36, abs(along / uBox.x));
  vFade = edge * smoothstep(1.0, 4.0, -mv.z);
}
`;

export const WIND_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFreeze;
uniform vec3 uInk;
varying float vU;
varying float vSide;
varying float vFade;
varying float vSeed;
${GLSL_COMMON}
void main() {
  // A dash that draws itself along the stroke and wipes out behind.
  float head = fract(uTime * (0.25 + 0.2 * vSeed) + vSeed * 7.0) * 1.6 - 0.3;
  float on = smoothstep(head - 0.55, head - 0.25, vU) * (1.0 - smoothstep(head, head + 0.05, vU));
  float a = on * vFade * (1.0 - smoothstep(0.45, 1.0, abs(vSide))) * 0.95;
  if (a < 0.01) discard;
  vec3 col = vSeed > 0.8 ? uInk : vec3(1.0, 0.99, 0.95);
  col = freezeGrade(col, uFreeze);
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb * a, a);
}
`;
