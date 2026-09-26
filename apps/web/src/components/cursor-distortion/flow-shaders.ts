/**
 * GLSL for the cursor flow (see flow-engine.ts): a low-resolution paint
 * field the cursor stamps and that flows along its own velocity, and a
 * full-screen pass that drags the stage's pixels along it and adds a thin
 * iridescent sheen where the paint thins out. GLSL ES 3.00, for
 * RawShaderMaterial (nothing is prepended but the version line).
 *
 * Field texel layout (RGBA8): xy = velocity + 0.5 (0.5 is at rest),
 * z = the slow weight, w = the fast weight.
 */

/** A full-screen triangle; its uv runs 0..1 over the viewport. */
export const FULLSCREEN_VERTEX = /* glsl */ `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Writes one value everywhere (a render target clear that ignores premultiplied alpha). */
export const FILL_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec4 uValue;
out vec4 outColor;
void main() {
  outColor = uValue;
}
`;

/** A straight copy (the field's ping-pong, and the 1/8 resolution downsample). */
export const COPY_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
in vec2 vUv;
out vec4 outColor;
void main() {
  outColor = texture(tSource, vUv);
}
`;

/** One direction of a separable 9-tap Gaussian (weights sum to 1). */
export const BLUR_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
uniform vec2 uStep;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 sum = texture(tSource, vUv) * 0.1633;
  sum += (texture(tSource, vUv + uStep) + texture(tSource, vUv - uStep)) * 0.1531;
  sum += (texture(tSource, vUv + uStep * 2.0) + texture(tSource, vUv - uStep * 2.0)) * 0.12245;
  sum += (texture(tSource, vUv + uStep * 3.0) + texture(tSource, vUv - uStep * 3.0)) * 0.0918;
  sum += (texture(tSource, vUv + uStep * 4.0) + texture(tSource, vUv - uStep * 4.0)) * 0.051;
  outColor = sum;
}
`;

/**
 * Two published helpers, both MIT licensed:
 * - hash22: David Hoskins, "Hash without Sine" (shadertoy.com/view/4djSRW),
 *   remapped to -1..1.
 * - gradientNoise: Inigo Quilez, "Gradient Noise - derivatives"
 *   (iquilezles.org, shadertoy.com/view/XdXBRH): the value in x and its
 *   analytic gradient in yz, with a quintic fade.
 */
const NOISE = /* glsl */ `
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

vec3 gradientNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = hash22(cell);
  vec2 gb = hash22(cell + vec2(1.0, 0.0));
  vec2 gc = hash22(cell + vec2(0.0, 1.0));
  vec2 gd = hash22(cell + vec2(1.0, 1.0));
  float va = dot(ga, f);
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0, 1.0));
  float k = va - vb - vc + vd;
  float value = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k;
  vec2 grad = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
    + du * (u.yx * k + vec2(vb, vc) - va);
  return vec3(value, grad);
}
`;

/**
 * One step of the paint field, in field pixels.
 *
 * 1. The brush: a soft capsule from the last brush point to this one, its
 *    radius and strength interpolated along it.
 * 2. Advection: every texel looks upstream along the blurred coarse
 *    velocity (one step old), so the paint keeps flowing forward after the
 *    cursor stops. A static noise gradient, scaled by how fresh the paint
 *    is, bends the flow into the sideways wobble.
 * 3. Decay and injection. The weights always move by at least 1/255 when
 *    they move at all, so faded paint really reaches zero in 8 bits.
 *
 * The step constants (uKeep, uAdvect, uWarpAmp, uGain) arrive already
 * scaled to this step's length, so the look holds at any frame rate.
 */
export const SIM_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tPrev;
uniform sampler2D tCoarse;
uniform vec2 uTexel;
uniform vec2 uScroll;
uniform vec4 uFrom;
uniform vec4 uTo;
uniform vec2 uInject;
uniform vec3 uKeep;
uniform float uAdvect;
uniform float uWarpFreq;
uniform float uWarpAmp;
uniform float uGain;
in vec2 vUv;
out vec4 outColor;
${NOISE}
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 ab = uTo.xy - uFrom.xy;
  vec2 ap = px - uFrom.xy;
  float len2 = dot(ab, ab);
  // A still brush is a disc: guard the zero-length segment.
  float t = len2 > 1e-6 ? clamp(dot(ap, ab) / len2, 0.0, 1.0) : 0.0;
  float dist = length(ap - ab * t);
  vec2 radiusStrength = mix(uFrom.zw, uTo.zw, t);
  float brush = 1.0 - smoothstep(-0.01, radiusStrength.x, dist);

  vec2 source = vUv - uScroll;
  vec4 coarse = texture(tCoarse, source);
  vec2 upstream = (0.5 - coarse.xy) * uAdvect;
  vec3 n1 = gradientNoise(px * uWarpFreq * (1.0 - coarse.xy));
  vec2 bend = gradientNoise(px * uWarpFreq * (2.0 - coarse.xy * (0.5 + n1.x)) + n1.yz * 0.1).yz;
  upstream += bend * (coarse.z + coarse.w) * uWarpAmp;

  vec4 field = texture(tPrev, source + upstream * uTexel);
  vec2 velocity = field.xy - 0.5;
  vec2 dv = velocity * (uKeep.x - 1.0) + uInject * brush;
  vec2 dw = field.zw * (uKeep.yz - 1.0) + radiusStrength.y * brush * uGain;
  dw = sign(dw) * max(abs(dw), vec2(0.004));
  outColor = clamp(vec4(velocity + dv + 0.5, field.zw + dw), 0.0, 1.0);
}
`;

/**
 * The full-screen pass. It averages nine samples of the stage along the
 * local paint velocity (the stage is dragged forward with the stroke), the
 * start jittered per pixel by white noise re-seeded every frame, so the
 * smear carries a fine, shimmering grain. The hash is Hoskins' again: an
 * interleaved gradient noise was tried first, and its regular pattern
 * showed as a hatch in the head of a fast stroke. Then it adds a sine of
 * the velocity where the paint has faded (weight under 0.4): thin rainbow
 * contour lines on the trail's tail, an oil-on-water sheen.
 *
 * Variants: STAGE samples the rendered scene; without it the stage is the
 * flat page colour (nothing to smear, so only the sheen shows, and the
 * nine taps fold away); GRID samples a debug grid (development only).
 * uAbs folds the sine's negative lobes up and uPearl pulls the colour a
 * little toward grey (the dark theme: on a dark page the negative lobes
 * would clip to black and leave only hard, bright streaks).
 */
export const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tField;
uniform vec2 uFieldTexel;
uniform vec2 uViewport;
uniform vec3 uBackground;
uniform float uStep;
uniform float uPhase;
uniform float uTint;
uniform float uAbs;
uniform float uPearl;
uniform float uFrame;
in vec2 vUv;
out vec4 outColor;

vec2 grain(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec4 stage(vec2 uv) {
#if defined(STAGE)
  return texture(tScene, uv);
#elif defined(GRID)
  vec2 cssPx = uv * uViewport;
  vec2 cell = abs(fract(cssPx / 24.0) - 0.5);
  float line = smoothstep(0.40, 0.5, max(cell.x, cell.y));
  vec2 block = floor(cssPx / 96.0);
  float checker = mod(block.x + block.y, 2.0);
  vec3 base = mix(vec3(0.93, 0.94, 0.98), vec3(0.80, 0.83, 0.95), checker);
  return vec4(mix(base, vec3(0.08, 0.1, 0.2), line), 1.0);
#else
  return vec4(uBackground, 1.0);
#endif
}

void main() {
  vec4 field = texture(tField, vUv);
  float weight = 0.5 * (field.z + field.w);
  // Against the motion: each pixel shows what lies behind it on the stroke.
  vec2 velocity = (0.5 - field.xy - 0.001) * 2.0 * weight;
  vec3 color;
#if defined(STAGE) || defined(GRID)
  vec2 stepUv = velocity * uStep * uFieldTexel;
  vec2 jitter = grain(gl_FragCoord.xy + uFrame * vec2(37.0, 61.0));
  vec2 uv = vUv + jitter * stepUv;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 9; i++) {
    sum += stage(uv);
    uv += stepUv;
  }
  color = sum.rgb / 9.0;
#else
  color = uBackground;
#endif
  float fade = 1.0 - smoothstep(-0.9, 0.4, weight);
  vec3 wave = sin(vec3(velocity.x + velocity.y) * 40.0 + vec3(0.0, 2.0, 4.0) * uPhase);
  wave = mix(wave, abs(wave), uAbs);
  wave = mix(wave, vec3(dot(wave, vec3(0.3333))), uPearl);
  color += wave * fade * uTint * max(abs(velocity.x), abs(velocity.y));
  outColor = vec4(color, 1.0);
}
`;
