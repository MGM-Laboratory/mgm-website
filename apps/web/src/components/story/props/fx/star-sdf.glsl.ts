/**
 * The four-point compass star from the card back, as signed distance
 * functions for fragment shaders, plus the camera-facing quad the fx share.
 *
 * Measured on `back.svg` (research/inspiration.md 4.2): the hero compass
 * star is a straight-edged 8-vertex polygon, points on the axes, inner
 * radius 0.314 of the outer one. The small constellation stars use 0.402
 * and sit about 31 degrees off the axes.
 */

export const STAR_RATIO_COMPASS = 0.314;
export const STAR_RATIO_TWINKLE = 0.402;

export const STAR_SDF_GLSL = /* glsl */ `
// Signed distance to the four-point star polygon: outer radius R on the axes, inner radius R * k
// at 45 degrees. Negative inside. Exact (the polygon is folded into one mirror sector).
float sdStar4(vec2 p, float R, float k) {
  p = abs(p);
  if (p.y > p.x) p = p.yx;
  vec2 A = vec2(R, 0.0);
  vec2 B = vec2(R * k * 0.70710678);
  vec2 e = B - A;
  vec2 w = p - A;
  float h = clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
  float d = length(w - e * h);
  float s = e.x * w.y - e.y * w.x;
  return s > 0.0 ? -d : d;
}

// The same star turned by angle a (radians).
float sdStar4Rot(vec2 p, float R, float k, float a) {
  float c = cos(a);
  float s = sin(a);
  return sdStar4(mat2(c, -s, s, c) * p, R, k);
}

// A soft astroid variant for glows: |x|^(2/3) + |y|^(2/3) = R^(2/3), approximate distance.
float sdAstroid(vec2 p, float R) {
  p = abs(p) / R;
  float v = pow(p.x, 0.6667) + pow(p.y, 0.6667);
  return (pow(v, 1.5) - 1.0) * R * 0.5;
}

// Anti-aliased fill of a signed distance (negative inside) in the units of the distance.
float sdFill(float d, float aa) {
  return 1.0 - smoothstep(-aa, aa, d);
}
`;

/**
 * Vertex shader body for a camera-facing quad (a PlaneGeometry 1 x 1).
 * Declares `vQuad` (-1..1 across the quad). `uSize` is the world size and
 * `uSpin` a rotation in the view plane.
 */
export const BILLBOARD_VERTEX = /* glsl */ `
uniform float uSize;
uniform float uSpin;
varying vec2 vQuad;
void main() {
  vQuad = position.xy * 2.0;
  float c = cos(uSpin);
  float s = sin(uSpin);
  vec2 q = mat2(c, -s, s, c) * position.xy * uSize;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
}
`;
