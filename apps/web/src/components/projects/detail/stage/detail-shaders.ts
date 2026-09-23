/**
 * Shaders for the project detail stage, in two passes:
 *
 * 1. Items: one quad per media item, positioned in CSS pixels straight into
 *    clip space, drawn into an offscreen target the size of the canvas. Each
 *    item plays the emerge (a rounded mask opening from EMERGE_START of the
 *    box to all of it while the picture pulls back from 1 / EMERGE_START),
 *    shows the palette's highlight colour until its texture is ready, then
 *    crossfades to it.
 * 2. Screen: one full-screen pass that samples that target and bends it
 *    with the scroll speed (an arch plus a travelling ripple, both
 *    vertical), smears it along the travel direction with a split of the
 *    red and blue channels, and lenses it around the cursor.
 *
 * Written against three's GLSL prefix (GLSL ES 3.00 on WebGL2, with
 * `varying` and `gl_FragColor` mapped). Colours stay in the media's own sRGB
 * encoding end to end, like the list page's cover stage, so a drawn item
 * matches its DOM image. Everything is premultiplied: the textures, the
 * offscreen target and the canvas.
 */

/** Mask and picture scale at the first frame of the emerge (60% box, 1.667x picture). */
export const EMERGE_START = 0.6;

// Ripple shape (the amplitude comes from the scroll speed, see detail-wave.ts).
// Two sines of different wavelengths (fractions of the viewport width) keep
// it from reading as a mechanical sine; the second is weaker.
export const RIPPLE_WAVELENGTHS = [0.62, 0.29] as const;
const RIPPLE_SECOND_WEIGHT = 0.4;
// The ripple is calmer mid-screen, where the eye rests, than at the edges.
const RIPPLE_CENTRE_WEIGHT = 0.45;

// Cursor lens: radius in CSS px and the magnification pull at its centre.
const LENS_RADIUS = 120;
const LENS_BULGE = 0.1;

const float = (value: number) => (Number.isInteger(value) ? `${value}.0` : `${value}`);

export const itemVertexShader = /* glsl */ `
uniform vec4 u_rect;      // the item's box on screen: left, top, width, height (CSS px)
uniform vec2 u_viewport;  // CSS px

varying vec2 v_uv;        // 0..1 across the box, top-left origin (a little beyond inside the pad)

// One CSS px of spare quad around the box, so the mask's antialiased edge
// is never cut by the quad's own edge.
const float PAD = 1.0;

void main() {
  // PlaneGeometry spans -0.5..0.5 with +y up; the stage works top-down.
  vec2 t = vec2(position.x + 0.5, 0.5 - position.y);
  vec2 px = u_rect.xy - PAD + t * (u_rect.zw + 2.0 * PAD);
  v_uv = (px - u_rect.xy) / u_rect.zw;
  gl_Position = vec4(px.x / u_viewport.x * 2.0 - 1.0, 1.0 - px.y / u_viewport.y * 2.0, 0.0, 1.0);
}
`;

export const itemFragmentShader = /* glsl */ `
uniform sampler2D u_map;
uniform vec4 u_mapRect;     // box uv -> texture uv (object-fit: cover): offset.xy, scale.zw
uniform vec4 u_rect;
uniform float u_radius;     // corner radius, CSS px
uniform float u_emerge;     // 0..1, eased
uniform float u_fullscreen; // 1 keeps the mask fully open
uniform float u_ready;      // 0..1: highlight -> texture
uniform vec3 u_highlight;   // placeholder colour (sRGB)
uniform float u_zoom;       // hover magnification (1 = none)
uniform vec2 u_zoomOrigin;  // the point the hover zoom leans into, box uv

varying vec2 v_uv;

const float EMERGE_START = ${float(EMERGE_START)};

// Signed distance to a box with rounded corners (negative inside).
float roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 corner = abs(p) - halfSize + radius;
  return length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - radius;
}

void main() {
  vec2 size = u_rect.zw;
  vec2 halfSize = 0.5 * size * mix(EMERGE_START, 1.0, max(u_fullscreen, u_emerge));
  float radius = min(u_radius, min(halfSize.x, halfSize.y));
  float d = roundedBox((v_uv - 0.5) * size, halfSize, radius);
  // About one device pixel of antialiasing, whatever the pixel ratio.
  float coverage = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
  if (coverage <= 0.0) discard;

  // The picture starts magnified and settles as the mask opens.
  vec2 uv = (v_uv - 0.5) * mix(EMERGE_START, 1.0, u_emerge) + 0.5;
  uv = clamp(u_zoomOrigin + (uv - u_zoomOrigin) / u_zoom, 0.0, 1.0);

  vec4 color = vec4(u_highlight, 1.0);
  if (u_ready > 0.0) {
    vec4 texel = textureLod(u_map, u_mapRect.xy + uv * u_mapRect.zw, 0.0);
    color = mix(color, texel, u_ready);
  }
  gl_FragColor = color * coverage;
}
`;

export const screenVertexShader = /* glsl */ `
void main() {
  // A 1x1 PlaneGeometry scaled to cover the whole clip space.
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

export const screenFragmentShader = /* glsl */ `
uniform sampler2D u_scene;   // the items pass (premultiplied)
uniform vec2 u_resolution;   // drawing buffer, device px
uniform vec2 u_viewport;     // CSS px
uniform float u_opacity;     // the page's itemsOpacity
uniform float u_arch;        // speed arch amplitude, CSS px
uniform float u_ripple;      // speed ripple amplitude, CSS px (signed while it settles)
uniform vec2 u_ripplePhase;  // phase of each ripple sine, from the scroll position (rad)
uniform float u_blur;        // smear length along x, CSS px (signed: travel direction)
uniform float u_split;       // red/blue split along x, CSS px
uniform vec3 u_lens;         // cursor lens centre (CSS px) and strength 0..1
uniform vec2 u_lensDrag;     // how far the lens drags the picture along the cursor's motion, CSS px

#define TAPS 8
const float TAU = 6.28318531;
const vec2 WAVELENGTH = vec2(${float(RIPPLE_WAVELENGTHS[0])}, ${float(RIPPLE_WAVELENGTHS[1])});
const float SECOND_WEIGHT = ${float(RIPPLE_SECOND_WEIGHT)};
const float CENTRE_WEIGHT = ${float(RIPPLE_CENTRE_WEIGHT)};
const float LENS_RADIUS = ${float(LENS_RADIUS)};
const float LENS_BULGE = ${float(LENS_BULGE)};

// Interleaved gradient noise: a per-pixel offset for the smear taps, so a
// long smear reads as fine grain instead of 8 ghost copies.
float grain(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// The items pass at a point in CSS px (top-left origin).
vec4 scene(vec2 px) {
  return textureLod(u_scene, vec2(px.x / u_viewport.x, 1.0 - px.y / u_viewport.y), 0.0);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y) * (u_viewport / u_resolution);
  float x = px.x / u_viewport.x;

  // Speed wave, vertical only. The arch lifts the middle of the screen and
  // lowers its sides by the same amount; the ripple rolls across the screen
  // as the page scrolls (its phase follows the scroll position).
  float lift = -cos(TAU * x) * u_arch;
  if (u_ripple != 0.0) {
    float across = 2.0 * x - 1.0;
    float weight = mix(CENTRE_WEIGHT, 1.0, across * across);
    vec2 phase = TAU * px.x / (WAVELENGTH * u_viewport.x) + u_ripplePhase;
    float wave = (sin(phase.x) + SECOND_WEIGHT * sin(phase.y)) / (1.0 + SECOND_WEIGHT);
    lift += u_ripple * weight * wave;
  }
  // Content lifted by "lift" px is sampled that far below.
  vec2 p = vec2(px.x, px.y + lift);

  // Cursor lens: a small magnifying bulge that trails the cursor a little.
  if (u_lens.z > 0.0) {
    vec2 d = p - u_lens.xy;
    float q = dot(d, d) / (LENS_RADIUS * LENS_RADIUS);
    if (q < 1.0) {
      float falloff = (1.0 - q) * (1.0 - q);
      p -= (d * LENS_BULGE + u_lensDrag) * (falloff * u_lens.z);
    }
  }

  bool smear = abs(u_blur) >= 0.5;
  bool split = u_split >= 0.05;
  vec4 color;
  if (!smear && !split) {
    color = scene(p);
  } else {
    // Taps centred on the pixel along the travel direction. With a split,
    // red leads and blue trails, each with its own coverage: the output
    // alpha is the widest of the three, so a fringe never carries more
    // colour than coverage (which would composite as a glow).
    int taps = smear ? TAPS : 1;
    float jitter = grain(gl_FragCoord.xy);
    vec2 shift = vec2((u_blur < 0.0 ? -1.0 : 1.0) * u_split, 0.0);
    vec4 sum = vec4(0.0);
    vec2 edgeAlpha = vec2(0.0);
    for (int i = 0; i < TAPS; i++) {
      if (i >= taps) break;
      float k = smear ? (float(i) + jitter) / float(TAPS) - 0.5 : 0.0;
      vec2 q = p - vec2(u_blur * k, 0.0);
      vec4 g = scene(q);
      if (split) {
        vec4 r = scene(q + shift);
        vec4 b = scene(q - shift);
        sum += vec4(r.r, g.g, b.b, g.a);
        edgeAlpha += vec2(r.a, b.a);
      } else {
        sum += g;
        edgeAlpha += vec2(g.a);
      }
    }
    sum /= float(taps);
    edgeAlpha /= float(taps);
    color = vec4(sum.rgb, max(sum.a, max(edgeAlpha.x, edgeAlpha.y)));
  }
  gl_FragColor = color * u_opacity;
}
`;
