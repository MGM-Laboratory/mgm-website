/**
 * GLSL ES 3.00 for the project detail pages' topography background, ported
 * from React Bits' "Topography" (MIT, https://reactbits.dev).
 *
 * The field, contour, glow, contrast, elevation and grain maths are the
 * original's. What changed:
 *
 * - The output is premultiplied colour over a transparent canvas, so the
 *   page's own theme background shows through (the original's light-mode
 *   branch painted a white page into the canvas instead).
 * - The three elevation stops arrive already premultiplied, each with the
 *   alpha that puts it a fixed luma step away from the page background
 *   (computed per palette in topography-engine.ts). A palette crossfade is
 *   then a plain lerp of those stops: compositing is linear in premultiplied
 *   colour, so lerping the stops is exactly a crossfade of the two
 *   finished frames, with no moment where the line alpha has to be derived
 *   from a half-tweened background.
 * - The field is sampled in square coordinates (the longer canvas side
 *   spans one period) instead of stretched 0..1 uv, so contours keep their
 *   shape on a phone held upright as well as on a wide desktop.
 * - A horizontal drift offset (one period wide, so it wraps seamlessly) lets
 *   the field follow the page's horizontal scroll a little.
 * - Dropped options the detail pages don't use: pixelation, filled bands and
 *   the uniform/alternating colour modes.
 */

/** One full-screen triangle generated from gl_VertexID: no vertex buffer. */
export const TOPOGRAPHY_VERTEX = /* glsl */ `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const TOPOGRAPHY_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uResolution;     // drawing buffer size (device px)
uniform float uBands;         // contour lines per unit of field height
uniform float uThickness;     // line half-width, as a fraction of one band
uniform float uScale;         // zoom of the field
uniform float uGlow;          // soft halo radius around each line (band fraction)
uniform float uContrast;      // exponent that sharpens line coverage
uniform float uMorphAmount;   // amplitude of the control points (normalises elevation)
uniform vec4 uCtrlA;
uniform vec4 uCtrlB;
uniform vec4 uCtrlC;
uniform vec4 uCtrlD;
uniform vec2 uOffset;         // field drift, in periods (wraps at 1)
uniform vec2 uMouse;          // cursor in drawing buffer px (y up)
uniform float uMouseActive;   // 0..1; 0 whenever the bump is off
uniform float uMouseRadius;   // relative to the shorter canvas side
uniform float uMouseStrength;
uniform float uGrainSeed;
uniform float uGrainIntensity;
uniform vec4 uLow;            // premultiplied elevation stops (rgb * a, a)
uniform vec4 uMid;
uniform vec4 uHigh;
uniform float uOpacity;       // intensity multiplier

out vec4 fragColor;

float bez(float t, vec4 c) {
  float w = 6.2831853 * t;
  return 0.5 * (c.x * sin(w) + c.y * cos(w) + c.z * sin(2.0 * w) + c.w * cos(2.0 * w));
}

float field(vec2 uv) {
  vec2 a = vec2(bez(uv.x, uCtrlA), bez(uv.x, uCtrlB));
  vec2 b = vec2(bez(uv.y, uCtrlC), bez(uv.y, uCtrlD));
  return distance(a, b);
}

vec4 elevationColor(float e) {
  vec4 c = mix(uLow, uMid, smoothstep(0.0, 0.5, e));
  return mix(c, uHigh, smoothstep(0.5, 1.0, e));
}

void main() {
  vec2 res = uResolution;
  vec2 square = (gl_FragCoord.xy - 0.5 * res) / max(res.x, res.y);
  vec2 suv = square / max(uScale, 0.001) + 0.5 + uOffset;

  float fv = field(suv);

  if (uMouseActive > 0.0) {
    vec2 d = (gl_FragCoord.xy - uMouse) / max(min(res.x, res.y), 1.0);
    float r = max(uMouseRadius, 0.001);
    fv += exp(-dot(d, d) / (r * r)) * uMouseStrength * uMouseActive;
  }

  float f = fv * uBands;
  float frac = fract(f);
  float lineDist = min(frac, 1.0 - frac);

  float aa = fwidth(f) + 0.0001;
  float mask = 1.0 - smoothstep(uThickness - aa, uThickness + aa, lineDist);

  float glowR = uThickness + uGlow * 0.5 + aa;
  float glow = (1.0 - smoothstep(uThickness, glowR, lineDist)) * step(0.0001, uGlow);

  float elev = clamp(fv / (uMorphAmount * 2.5 + 0.001), 0.0, 1.0);

  float coverage = clamp(mask + glow * 0.55, 0.0, 1.0);
  coverage = pow(coverage, max(uContrast, 0.001));

  // The original's film grain. At these alphas it is far below one 8-bit
  // step on its own and works as dither on the soft halo edges.
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uGrainSeed) * 43758.5453);
  coverage = clamp(coverage + (g - 0.5) * uGrainIntensity, 0.0, 1.0);

  fragColor = elevationColor(elev) * (coverage * uOpacity);
}
`;
