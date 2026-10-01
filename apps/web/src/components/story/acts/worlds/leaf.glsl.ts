import { GLSL_COMMON } from "./common";

/**
 * Leafhold's shaders (World 04): a garden of giant leaves seen by someone
 * the size of a ladybird. Linear colours in, `linearToOutputTexel` out,
 * `toneMapped: false`, the freeze grade in every one.
 *
 * Leaves are one instanced draw of a bent grid: the Bauhaus leaf (a lens of
 * two arcs) is cut out in the fragment shader, with its midrib and veins,
 * lit from the front and glowing yellow green when the sun is behind it.
 * They sway on the clock; the cursor and a tap's gust make them flutter.
 */

/** The canopy as seen through a macro lens: warm light above, soft bokeh, deep blue green shade below. */
export const CANOPY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uCanopyTop;
uniform vec3 uCanopyMid;
uniform vec3 uCanopyLow;
uniform vec3 uBokehA;
uniform vec3 uBokehB;
vec3 canopy(vec3 d, float time) {
  float y = d.y;
  vec3 col = mix(uCanopyLow, uCanopyMid, smoothstep(-0.6, 0.1, y));
  col = mix(col, uCanopyTop, smoothstep(0.05, 0.85, y));
  // The sun through the leaves: a hot blob and a wide warm wash.
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += vec3(1.0, 0.95, 0.75) * (pow(s, 90.0) * 1.6 + pow(s, 8.0) * 0.35);
  // Bokeh: soft discs of out-of-focus leaves and light, drifting slowly.
  float az = atan(d.x, -d.z);
  for (int k = 0; k < 2; k++) {
    float scale = k == 0 ? 7.0 : 13.0;
    vec2 g = vec2(az * scale / 3.14159, y * scale) + vec2(time * 0.01 * (1.0 + float(k)), 0.0);
    vec2 id = floor(g);
    vec3 h = hash33(vec3(id, 21.0 + float(k)));
    vec2 c = fract(g) - 0.25 - 0.5 * h.xy;
    float r = 0.18 + 0.24 * h.z;
    float disc = 1.0 - smoothstep(r - 0.04, r, length(c));
    float rim = smoothstep(r - 0.08, r - 0.02, length(c)) * disc;
    vec3 tint = h.z > 0.6 ? uBokehA : h.z > 0.25 ? uBokehB : vec3(1.0, 0.97, 0.85);
    float on = step(0.45, h.x) * (0.25 + 0.75 * smoothstep(-0.3, 0.6, y));
    col = mix(col, tint, disc * on * 0.35);
    col += tint * rim * on * 0.12;
  }
  return col;
}
`;

export const LEAF_SKY = /* glsl */ `
uniform float uTime;
uniform float uFreeze;
${GLSL_COMMON}
${CANOPY_GLSL}
vec3 skyColour(vec3 d) {
  return freezeGrade(canopy(d, uTime), uFreeze);
}
`;

export const LEAF_VERTEX = /* glsl */ `
attribute vec4 aLeaf;
attribute vec3 aTint;
uniform float uTime;
uniform vec3 uPointer;
uniform float uAspect;
uniform vec4 uGust;
uniform float uFall;
uniform mat4 uFallMatrix;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTint;
varying float vSeed;
void main() {
  // position: x across the leaf (-0.5..0.5), y along it (0 at the stalk, 1 at the tip).
  float u = position.x;
  float v = position.y;
  float seed = aLeaf.x;
  float curl = aLeaf.y;
  float cup = aLeaf.z;
  // Bend: the leaf droops along its length and cups across it; it sways and flutters on the clock.
  vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float gustAge = uGust.w;
  float gust = gustAge >= 0.0 ? exp(-pow(length(base.xyz - uGust.xyz) - gustAge * 18.0, 2.0) * 0.01) * exp(-gustAge * 1.2) : 0.0;
  // The cursor rustles the leaves under it (screen space).
  vec4 clip0 = projectionMatrix * viewMatrix * base;
  vec2 ndc0 = clip0.xy / max(clip0.w, 1e-4);
  float near = uPointer.z * exp(-dot((ndc0 - uPointer.xy) * vec2(uAspect, 1.0), (ndc0 - uPointer.xy) * vec2(uAspect, 1.0)) * 6.0);
  float flutter = sin(uTime * (1.3 + seed) + seed * 40.0) * (0.05 + 0.2 * near + 0.5 * gust);
  float sway = sin(uTime * 0.6 + seed * 13.0) * 0.06;
  float droop = curl * v * v + flutter * v * v;
  vec3 local = vec3(u, -droop - cup * u * u * 4.0 * (0.4 + v), v);
  // The leaf's own normal from its bend (before the sway).
  vec3 du = vec3(1.0, -cup * 8.0 * u * (0.4 + v), 0.0);
  vec3 dv = vec3(0.0, -2.0 * (curl + flutter) * v - cup * u * u * 4.0, 1.0);
  vec3 n = normalize(cross(dv, du));
  float c = cos(sway);
  float s = sin(sway);
  mat3 rz = mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
  local = rz * local;
  n = rz * n;
  mat4 M = uFall > 0.5 && aLeaf.w > 0.5 ? uFallMatrix : instanceMatrix;
  vec4 world = modelMatrix * M * vec4(local, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix * M) * n);
  vUv = vec2(u, v);
  vTint = aTint;
  vSeed = seed;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const LEAF_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFreeze;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uHaze;
uniform float uHazeDensity;
uniform vec3 uRib;
uniform vec3 uGlow;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTint;
varying float vSeed;
${GLSL_COMMON}
void main() {
  // The Bauhaus leaf: a lens of two arcs, pointed at both ends.
  float v = vUv.y;
  float halfWidth = 0.5 * pow(sin(3.14159 * clamp(v, 0.0, 1.0)), 0.85);
  float edge = abs(vUv.x) - halfWidth;
  float fw = fwidth(edge);
  float inside = 1.0 - smoothstep(-fw, fw, edge);
  if (inside < 0.5) discard;
  vec3 n = normalize(vNormal);
  vec3 view = normalize(vWorld - uCamPos);
  bool front = dot(n, view) < 0.0;
  if (!front) n = -n;
  vec3 L = normalize(uSunDir);
  float lit = max(dot(n, L), 0.0);
  // Colour: deeper at the stalk and the edges, lighter toward the tip.
  vec3 col = vTint * (0.62 + 0.25 * v + 0.2 * (1.0 - abs(vUv.x) * 2.0));
  // The midrib and veins, pale lines.
  float rib = 1.0 - smoothstep(0.004, 0.012 + fwidth(vUv.x), abs(vUv.x));
  float veinCoord = (v - abs(vUv.x) * 0.9) * 9.0;
  float vein = (1.0 - smoothstep(0.03, 0.08 + fwidth(veinCoord), abs(fract(veinCoord) - 0.5))) * smoothstep(0.03, 0.1, abs(vUv.x)) * smoothstep(0.0, 0.1, halfWidth - abs(vUv.x));
  col = mix(col, uRib, rib * 0.7 + vein * 0.22);
  col *= 0.55 + 0.6 * lit;
  // Backlit: the sun behind the leaf makes it glow yellow green.
  float back = pow(max(dot(view, L), 0.0), 2.0) * (dot(normalize(vNormal), L) * (front ? -1.0 : 1.0) > 0.0 ? 0.0 : 1.0);
  back = max(back, pow(max(dot(view, L), 0.0), 3.0) * 0.6);
  col += uGlow * back * 0.55 * (0.6 + 0.4 * v);
  // A sheen of light along the cupped surface.
  vec3 r = reflect(view, n);
  col += vec3(1.0, 0.98, 0.9) * pow(max(dot(r, L), 0.0), 40.0) * 0.25;
  float dist = length(vWorld - uCamPos);
  col = mix(col, uHaze, clamp(1.0 - exp(-dist * uHazeDensity), 0.0, 0.92));
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

/** Stems, berries: simple lit solids with a vertical stripe and haze. */
export const SOLID_VERTEX = /* glsl */ `
attribute vec3 aTint;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTint;
varying float vH;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vTint = aTint;
  vH = position.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const SOLID_FRAGMENT = /* glsl */ `
uniform float uFreeze;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uHaze;
uniform float uHazeDensity;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTint;
varying float vH;
${GLSL_COMMON}
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(vWorld - uCamPos);
  float lit = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 col = vTint * (0.5 + 0.65 * lit);
  float rim = pow(1.0 - abs(dot(n, -view)), 3.0);
  col += vec3(0.9, 1.0, 0.75) * rim * 0.25;
  float dist = length(vWorld - uCamPos);
  col = mix(col, uHaze, clamp(1.0 - exp(-dist * uHazeDensity), 0.0, 0.92));
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

/**
 * Dew drops: little ball lenses. Inside, the garden is seen upside down
 * (the refracted ray leaves through the far side, flipped); outside, a thin
 * fresnel rim of the sky and a hot glint of the sun. A tap makes one wobble.
 */
export const DROP_VERTEX = /* glsl */ `
attribute float aBounce;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCentre;
void main() {
  float age = uTime - aBounce;
  float b = age > 0.0 && age < 1.6 ? sin(age * 18.0) * exp(-age * 3.5) * 0.16 : 0.0;
  vec3 local = position * vec3(1.0 + b * 0.5, 1.0 - b, 1.0 + b * 0.5);
  vec4 world = modelMatrix * instanceMatrix * vec4(local, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vCentre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const DROP_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFreeze;
uniform vec3 uCamPos;
uniform vec3 uHaze;
uniform float uHazeDensity;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCentre;
${GLSL_COMMON}
${CANOPY_GLSL}
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(vWorld - uCamPos);
  // A ball lens: the ray bends in, crosses, and leaves flipped.
  vec3 inside = refract(view, n, 1.0 / 1.33);
  vec3 out0 = normalize(reflect(inside, -n) * vec3(-1.0, -1.0, 1.0));
  vec3 seen = canopy(normalize(mix(-view, out0, 0.8)), uTime);
  float fres = pow(1.0 - max(dot(n, -view), 0.0), 3.0);
  vec3 sky = canopy(reflect(view, n), uTime);
  vec3 col = mix(seen * vec3(0.92, 1.0, 0.94), sky, 0.15 + 0.6 * fres);
  vec3 L = normalize(uSunDir);
  col += vec3(1.0, 0.97, 0.88) * pow(max(dot(reflect(view, n), L), 0.0), 120.0) * 2.4;
  col += vec3(1.0) * pow(fres, 2.0) * 0.18;
  float dist = length(vWorld - uCamPos);
  col = mix(col, uHaze, clamp(1.0 - exp(-dist * uHazeDensity), 0.0, 0.9));
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

/** Light shafts through the canopy: soft additive beams along the sun's direction, shimmering. */
export const SHAFT_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aShaft;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
varying vec2 vQuad;
varying float vSeed;
void main() {
  vec3 dir = -normalize(uSunDir);
  vec3 base = aShaft.xyz;
  vec3 mid = base + dir * 40.0;
  vec3 toCam = normalize(uCamPos - mid);
  vec3 side = normalize(cross(dir, toCam) + 1e-5);
  float along = aCorner.x + 0.5;
  float width = 1.2 + 2.6 * aShaft.w + along * 1.5;
  vec3 p = base + dir * (along * 90.0 - 10.0) + side * aCorner.y * width;
  vQuad = vec2(along, aCorner.y);
  vSeed = aShaft.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const SHAFT_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFreeze;
uniform vec3 uShaft;
varying vec2 vQuad;
varying float vSeed;
${GLSL_COMMON}
void main() {
  float across = exp(-vQuad.y * vQuad.y * 4.0);
  float fade = smoothstep(0.0, 0.15, vQuad.x) * (1.0 - smoothstep(0.55, 1.0, vQuad.x));
  float shimmer = 0.7 + 0.3 * sin(uTime * (0.7 + vSeed) + vSeed * 30.0 + vQuad.x * 6.0);
  float a = across * fade * shimmer * 0.16;
  vec3 col = freezeGrade(uShaft, uFreeze) * a;
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb, 0.0);
}
`;

/**
 * Depth of field: the garden rendered into a target with depth, then each
 * pixel gathers a disc of its neighbours as wide as its circle of confusion
 * (thin lens: |z - focus| / z). Samples from the sharp foreground are kept
 * out of a blurred background (weighted by their own blur), so the in-focus
 * subject keeps a clean edge. The target holds display bytes; it writes them
 * as they are.
 */
export const DOF_FRAGMENT = /* glsl */ `
uniform sampler2D tColour;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uAperture;
uniform float uMaxRadius;
varying vec2 vUv;
float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
float coc(float z) {
  return clamp(abs(z - uFocus) / max(z, 1e-3) * uAperture, 0.0, uMaxRadius);
}
void main() {
  float z0 = viewZ(vUv);
  float c0 = coc(z0);
  vec3 sum = texture2D(tColour, vUv).rgb;
  float wsum = 1.0;
  // Look as far as a blurred neighbour could reach, so a soft foreground spills over a sharp middle.
  float R = max(c0, uMaxRadius * 0.5);
  for (int i = 1; i < 24; i++) {
    float fi = float(i);
    float r = sqrt(fi / 23.0) * R;
    float a = fi * 2.39996323;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
    float zi = viewZ(uv);
    float ci = coc(zi);
    // A sample in front spreads by its own blur; one behind never by more than ours (no halo).
    float reach = zi < z0 ? ci : min(ci, c0);
    float w = smoothstep(r - 1.0, r + 0.5, reach);
    sum += texture2D(tColour, uv).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}
`;
