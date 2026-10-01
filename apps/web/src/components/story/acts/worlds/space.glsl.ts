/**
 * Deep space as GLSL, shared by the wormhole and The Edge: brand tinted
 * stars on a cube-face grid (stable on every GPU, one soft dot per lit cell,
 * three layers), a 3D value noise, and a navy nebula with guilloche
 * filaments. Linear colours (the caller encodes). Needs GLSL_COMMON, and the
 * shader must declare `uniform float uTime;`.
 *
 * `uPix` is the angular size of one output pixel (2 tan(fov / 2) / height),
 * so stars stay one or two pixels wide at any resolution.
 */
export const SPACE_GLSL = /* glsl */ `
uniform vec3 uStarBlue;
uniform vec3 uStarYellow;
uniform float uPix;

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

// Stars on a cube-face grid: a soft dot per lit cell, brand tinted.
vec3 starCell(vec3 d, float scale, float density, float salt) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.x > a.y && a.x > a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y > a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec2 g = uv * scale;
  vec2 cell = floor(g);
  vec3 h = hash33(vec3(cell, face * 7.0 + salt));
  if (h.z < 1.0 - density) return vec3(0.0);
  vec2 pos = 0.15 + 0.7 * h.xy;
  float dist = length(fract(g) - pos) / scale;
  float size = uPix * (0.55 + 0.9 * h.x * h.x);
  float glint = exp(-dist * dist / (size * size));
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * h.y) + h.x * 40.0);
  vec3 tint = h.y > 0.86 ? uStarYellow : h.y > 0.52 ? uStarBlue : vec3(1.0);
  return tint * glint * tw * (0.25 + 1.1 * h.y * h.y * h.y);
}

vec3 stars(vec3 d) {
  return starCell(d, 22.0, 0.12, 1.0) + starCell(d, 55.0, 0.08, 2.0) * 0.7 + starCell(d, 130.0, 0.06, 3.0) * 0.45;
}

// A navy nebula band with three thin guilloche filaments (the card back's engraving, in the sky).
vec3 nebula(vec3 d, vec3 base, vec3 band, vec3 filament) {
  float n = vnoise3(d * 2.2 + vec3(0.0, uTime * 0.01, 0.0)) * 0.6 + vnoise3(d * 5.1) * 0.4;
  float b = exp(-abs(d.y + 0.25 * d.x) * 2.6);
  vec3 col = mix(base, band, clamp(b * n * n * 0.9, 0.0, 0.7));
  float fil = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 axis = normalize(vec3(sin(fi * 2.1 + 0.4), 0.55 + 0.2 * fi, cos(fi * 1.7)));
    float lat = dot(d, axis);
    float lon = atan(dot(d, cross(axis, vec3(0.0, 0.0, 1.0))), dot(d, vec3(0.0, 0.0, 1.0)));
    float w = lat - 0.07 * sin(lon * (4.0 + fi) + uTime * 0.04 + fi);
    fil += exp(-abs(w) * 260.0) * 0.16;
  }
  return col + filament * fil;
}
`;
