/**
 * Deep space as GLSL, shared by the wormhole and The Edge: brand tinted
 * stars on a cube-face grid (stable on every GPU, one soft dot per lit cell,
 * three layers, drawn as smooth streaks along a shutter's travel when the
 * camera flies fast), a 3D value noise, and a navy nebula with guilloche
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

// The cube face a direction falls on, its coordinates there, and the face's major axis.
vec2 starFace(vec3 d, out float face, out vec3 axis) {
  vec3 a = abs(d);
  if (a.x > a.y && a.x > a.z) { face = d.x > 0.0 ? 0.0 : 1.0; axis = vec3(1.0, 0.0, 0.0); return d.yz / a.x; }
  if (a.y > a.z) { face = d.y > 0.0 ? 2.0 : 3.0; axis = vec3(0.0, 1.0, 0.0); return d.xz / a.y; }
  face = d.z > 0.0 ? 4.0 : 5.0;
  axis = vec3(0.0, 0.0, 1.0);
  return d.xy / a.z;
}

// The other end of a streak on the same face (a streak that crosses a face edge is cut there).
vec2 starFaceAs(vec3 d, vec3 axis) {
  if (axis.x > 0.5) return d.yz / max(abs(d.x), 1e-4);
  if (axis.y > 0.5) return d.xz / max(abs(d.y), 1e-4);
  return d.xy / max(abs(d.z), 1e-4);
}

// One lit cell's star seen along the segment g0..g1 (grid units): a soft dot when the two meet,
// a streak when they do not. g0 is the pixel's own direction and g1 the direction a shutter's
// travel toward the vanishing point, so a star streams outward: the streak's head (where the
// star is now) is its outer end, bright, and its tail fades toward where it came from.
vec3 starInCell(vec2 cell, vec2 g0, vec2 g1, float scale, float density, float salt, float face) {
  vec3 h = hash33(vec3(cell, face * 7.0 + salt));
  if (h.z < 1.0 - density) return vec3(0.0);
  vec2 s = cell + 0.15 + 0.7 * h.xy;
  vec2 seg = g1 - g0;
  float len2 = dot(seg, seg);
  float k = len2 > 1e-8 ? clamp(dot(s - g0, seg) / len2, 0.0, 1.0) : 0.0;
  float dist = length(g0 + seg * k - s) / scale;
  float size = uPix * (0.55 + 0.9 * h.x * h.x);
  float glint = exp(-dist * dist / (size * size));
  float lenPix = sqrt(len2) / (scale * size);
  // The tail's fade only applies to a real streak; a still star is one even dot.
  float spread = mix(1.0, mix(0.25, 1.0, k * k), smoothstep(0.5, 2.0, lenPix)) / (1.0 + 0.08 * lenPix);
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * h.y) + h.x * 40.0);
  vec3 tint = h.y > 0.86 ? uStarYellow : h.y > 0.52 ? uStarBlue : vec3(1.0);
  return tint * glint * spread * tw * (0.25 + 1.1 * h.y * h.y * h.y);
}

// Stars on a cube-face grid, brand tinted, seen along the arc from d0 to d1 (a shutter's worth of
// travel): the cells at both ends and in the middle, so a streak is one smooth line.
vec3 starLayer(vec3 d0, vec3 d1, float scale, float density, float salt) {
  float face;
  vec3 axis;
  vec2 g0 = starFace(d0, face, axis) * scale;
  vec2 g1 = starFaceAs(d1, axis) * scale;
  vec2 c0 = floor(g0);
  vec2 c1 = floor(g1);
  vec2 cm = floor((g0 + g1) * 0.5);
  vec3 col = starInCell(c0, g0, g1, scale, density, salt, face);
  if (any(notEqual(cm, c0))) col = max(col, starInCell(cm, g0, g1, scale, density, salt, face));
  if (any(notEqual(c1, c0)) && any(notEqual(c1, cm))) col = max(col, starInCell(c1, g0, g1, scale, density, salt, face));
  return col;
}

vec3 starsAlong(vec3 d0, vec3 d1) {
  return starLayer(d0, d1, 22.0, 0.12, 1.0) + starLayer(d0, d1, 55.0, 0.08, 2.0) * 0.7 + starLayer(d0, d1, 130.0, 0.06, 3.0) * 0.45;
}

vec3 stars(vec3 d) {
  return starsAlong(d, d);
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
