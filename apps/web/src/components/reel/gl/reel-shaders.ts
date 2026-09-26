/**
 * The reel's shaders. Screen space throughout: positions are CSS pixels
 * with y down (the DOM's convention) until the very last step, which flips
 * y for the camera (lib/gl-host.ts: y up from the viewport's top edge).
 * Colours stay in display values: textures are sampled without decoding
 * and nothing converts on output, so max(blue, grey) is the blend the eye
 * sees.
 */

/**
 * The video plane: one 32 x 32 grid that runs from the thumbnail rect to
 * the big frame. Each vertex has its own delay (the top right corner
 * leads, the bottom left trails), so the sheet is pulled into place like
 * cloth, with a slight tilt and a sideways bulge in flight.
 */
export const VIDEO_VERTEX = /* glsl */ `
uniform vec4 u_from;      // thumbnail: x, y, width, height (px, y down)
uniform vec4 u_to;        // big frame, pin included
uniform float u_progress; // 0 thumbnail .. 1 big frame

varying vec2 v_uv;        // 0..1 across the sheet, y down
varying vec2 v_size;      // the sheet's size here, px
varying float v_progress; // this vertex's own progress

const float PI = 3.14159265;

void main() {
  float x = position.x;
  float y = 1.0 - position.y;
  // 0 at the top right corner, 1 at the bottom left.
  float lag = 1.0 - (pow(x, 1.5) + pow(1.0 - y, 1.5)) * 0.5;
  float v = smoothstep(lag * 0.3, 0.7 + lag * 0.3, u_progress);

  vec2 origin = mix(u_from.xy, u_to.xy, v);
  vec2 size = mix(u_from.zw, u_to.zw, v);
  float s = sin(PI * v);
  origin.x += size.x * 0.1 * s * s;

  // A small tilt that comes and goes, about the big frame's centre size.
  vec2 pivot = u_to.zw * 0.5;
  vec2 local = vec2(x, y) * size - pivot;
  float angle = v - smoothstep(0.0, 1.0, v);
  float c = cos(angle);
  float sn = sin(angle);
  vec2 turned = vec2(local.x * c - local.y * sn, local.x * sn + local.y * c);
  vec2 screen = turned + pivot + origin;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(screen.x, -screen.y, 0.0, 1.0);
  v_uv = vec2(x, y);
  v_size = size;
  v_progress = v;
}
`;

export const VIDEO_FRAGMENT = /* glsl */ `
uniform sampler2D u_map;
uniform vec3 u_tint;        // brand blue, display values
uniform float u_radius;     // corner radius, px
uniform vec2 u_coverFrom;   // uv scale that covers the thumbnail's shape
uniform vec2 u_coverTo;     // and the big frame's
uniform float u_hover;      // 0..1
uniform vec2 u_hoverCenter; // sheet uv, y down
uniform float u_ready;      // 0 until the picture has a frame

varying vec2 v_uv;
varying vec2 v_size;
varying float v_progress;

float roundedBox(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
  vec2 px = (v_uv - 0.5) * v_size;
  float radius = min(u_radius, 0.5 * min(v_size.x, v_size.y));
  float d = roundedBox(px, 0.5 * v_size, radius);
  float alpha = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);

  // The hover lens: under the pointer the picture swells a little and
  // shows its true colours through the blue.
  vec2 fromCenter = (v_uv - u_hoverCenter) * v_size;
  float reach = 0.3 * min(v_size.x, v_size.y) + 60.0;
  float lens = u_hover * (1.0 - smoothstep(reach * 0.3, reach, length(fromCenter)));
  vec2 uv = v_uv - (v_uv - u_hoverCenter) * 0.07 * lens;

  vec2 cover = mix(u_coverFrom, u_coverTo, v_progress);
  vec2 sampleUv = (uv - 0.5) * cover + 0.5;
  vec3 color = texture2D(u_map, vec2(sampleUv.x, 1.0 - sampleUv.y)).rgb;
  color = mix(vec3(0.055, 0.067, 0.086), color, u_ready);

  // Lighten brand blue over the grey picture: blacks turn blue, highlights stay light.
  float grey = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 tinted = max(u_tint, vec3(grey));
  vec3 outColor = mix(tinted, color, max(v_progress, lens));
  outColor += lens * 0.04;

  gl_FragColor = vec4(outColor, alpha);
}
`;

/**
 * The ribbon. Its centreline lives in "line units" scaled by the viewport
 * diagonal (reel-line.ts). It is drawn up to the reveal ratio, wiggles
 * slowly along its normal (more where it was just drawn), and darkens a
 * touch where the later strand crosses over the earlier one once the head
 * has passed there.
 */
export const LINE_VERTEX = /* glsl */ `
attribute vec2 a_center;
attribute vec2 a_normal;
attribute float a_side;
attribute float a_t;
attribute float a_ao;

uniform float u_diag;
uniform float u_sectionY;
uniform float u_halfWidth;
uniform float u_time;
uniform float u_reveal;

varying float v_t;
varying float v_side;
varying float v_ao;

float wiggle(float t) {
  float fresh = exp(-max(0.0, u_reveal - t) / 0.06);
  float amp = 0.0024 + 0.0042 * fresh;
  float wave = sin(t * 21.0 - u_time * 0.9) * 0.6
    + sin(t * 47.0 + u_time * 1.4 + 1.7) * 0.25
    + sin(t * 8.0 - u_time * 0.45 + 0.4) * 0.15;
  return amp * wave;
}

void main() {
  vec2 center = a_center + a_normal * wiggle(a_t);
  vec2 screen = vec2((center.x - 0.05) * u_diag, u_sectionY + (0.8 - center.y) * u_diag);
  screen += vec2(a_normal.x, -a_normal.y) * a_side * u_halfWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(screen.x, -screen.y, 0.0, 1.0);
  v_t = a_t;
  v_side = a_side;
  v_ao = a_ao;
}
`;

export const LINE_FRAGMENT = /* glsl */ `
uniform vec3 u_tail;
uniform vec3 u_head;
uniform float u_reveal;
uniform float u_crossT;

varying float v_t;
varying float v_side;
varying float v_ao;

void main() {
  if (v_t > u_reveal) discard;
  float k = 1.0 - pow(1.0 - clamp(v_t, 0.0, 1.0), 2.0);
  vec3 color = mix(u_tail, u_head, k);
  float shaded = smoothstep(u_crossT - 0.02, u_crossT + 0.02, u_reveal);
  color *= mix(1.0, 0.84 + 0.16 * v_ao, shaded);
  float edge = abs(v_side);
  float alpha = 1.0 - smoothstep(1.0 - fwidth(edge) * 1.5, 1.0, edge);
  gl_FragColor = vec4(color, alpha);
}
`;

/** The ribbon's round head: a disc the ribbon's width, at the reveal point. */
export const CAP_VERTEX = /* glsl */ `
uniform vec2 u_center;   // px, y down
uniform float u_radius;  // px
varying vec2 v_local;

void main() {
  vec2 screen = u_center + position.xy * u_radius;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(screen.x, -screen.y, 0.0, 1.0);
  v_local = position.xy;
}
`;

export const CAP_FRAGMENT = /* glsl */ `
uniform vec3 u_color;
varying vec2 v_local;

void main() {
  float d = length(v_local);
  float alpha = 1.0 - smoothstep(1.0 - fwidth(d) * 1.5, 1.0, d);
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(u_color, alpha);
}
`;
