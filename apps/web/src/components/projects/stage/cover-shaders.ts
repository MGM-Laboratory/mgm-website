/**
 * Shaders for the /projects cover stage. One subdivided quad per card,
 * positioned in CSS pixels straight into clip space (no camera math), with
 * a per-card perspective divide around the card's own centre (like CSS
 * `transform-perspective`), so tilting one card never skews another.
 *
 * Written against three's GLSL prefix (it compiles as GLSL ES 3.00 on
 * WebGL2 and maps `varying`/`gl_FragColor`). Colours stay in the covers'
 * own sRGB encoding end to end (no colour-space conversion), which is what
 * the DOM <img> shows, so a GL cover at rest matches its DOM cover.
 */

export const coverVertexShader = /* glsl */ `
uniform vec4 u_rect;      // the card's frame in the viewport: left, top, width, height (CSS px)
uniform vec2 u_pad;       // extra quad width left/right of the frame (room for the lens flare)
uniform vec2 u_viewport;  // viewport size in CSS px
uniform vec2 u_offset;    // opening slide (CSS px)
uniform float u_angle;    // opening rotation (rad, positive = clockwise on screen)
uniform vec2 u_tilt;      // hover tilt around the x and y axes (rad)
uniform float u_bow;      // scroll bend at the frame's centre (CSS px, positive = sags down)

varying vec2 v_uv;        // frame uv, (0,0) top-left; beyond 0..1 inside the padding

const float PERSPECTIVE = 1000.0;

void main() {
  // PlaneGeometry spans -0.5..0.5 with +y up; the stage works top-down.
  float s = position.x + 0.5;
  float t = 0.5 - position.y;
  vec2 size = u_rect.zw;
  vec2 local = vec2(
    -0.5 * size.x - u_pad.x + s * (size.x + u_pad.x + u_pad.y),
    (t - 0.5) * size.y
  );
  vec2 uv = local / size + 0.5;
  v_uv = uv;

  // The sheet bends like paper dragged by its side edges: the middle lags
  // the most, the left/right edges (and so the text beside them) not at
  // all, and the top/bottom edges a little less than the centre line so
  // the picture stretches like an elastic sheet rather than sliding.
  vec2 k = clamp(uv, 0.0, 1.0) * 2.0 - 1.0;
  float bend = (1.0 - k.x * k.x) * (1.0 - 0.35 * k.y * k.y);
  vec3 p = vec3(local.x, local.y + bend * u_bow, 0.0);

  float ca = cos(u_angle);
  float sa = sin(u_angle);
  p.xy = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);

  // Tilt: the side under the cursor recedes (matches the DOM cover tilt).
  float cy = cos(u_tilt.y);
  float sy = sin(u_tilt.y);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  float cx = cos(u_tilt.x);
  float sx = sin(u_tilt.x);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);

  vec2 centre = u_rect.xy + 0.5 * size + u_offset;
  float w = 1.0 - p.z / PERSPECTIVE;
  vec2 toNdc = vec2(2.0, -2.0) / u_viewport;
  vec2 ndcCentre = centre * toNdc + vec2(-1.0, 1.0);
  // Scaling xy by w before the hardware divide keeps the centre fixed and
  // makes texture interpolation perspective-correct.
  gl_Position = vec4(ndcCentre * w + p.xy * toNdc, 0.0, w);
}
`;

export const coverFragmentShader = /* glsl */ `
uniform sampler2D u_map;
uniform vec4 u_mapRect;     // frame uv -> texture uv: offset.xy, scale.zw
uniform vec4 u_rect;
uniform vec2 u_resolution;  // drawing buffer size in device px
uniform float u_show;       // opening progress 0..1 (eased)
uniform float u_lens;       // scroll lens strength
uniform float u_radius;     // corner radius, CSS px
uniform float u_mag;        // image magnification around the frame centre
uniform vec2 u_shift;       // image shift in frame uv (hover jolts + parallax)
uniform float u_focus;      // focus-blur (bokeh) radius, CSS px
uniform float u_streak;     // zoom motion-blur length at the edges, CSS px
uniform float u_split;      // chromatic split at warped edges, CSS px
uniform float u_alpha;      // the list's reveal opacity

varying vec2 v_uv;

#define TAPS 12
const float PI = 3.14159265;
const float GOLDEN_ANGLE = 2.39996323;

float sdRoundBox(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Interleaved gradient noise: a per-pixel rotation for the blur kernel, so
// 12 taps read as fine grain instead of 12 ghost copies.
float pixelNoise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

vec4 sampleCover(vec2 f) {
  return textureLod(u_map, u_mapRect.xy + f * u_mapRect.zw, 0.0);
}

void main() {
  vec2 screen = gl_FragCoord.xy / u_resolution;
  vec2 uv = v_uv;

  // Scroll lens (lusion's screen-space pincushion): horizontal only, zero
  // mid-screen, strongest at the top and bottom of the viewport, pushing
  // each card's outer edge outward. The mask below is evaluated in the
  // warped space, so the silhouette itself flares, not just the picture.
  float lensWeight = 1.0 - sin(screen.y * PI);
  uv.x -= (screen.x - 0.5) * lensWeight * u_lens;

  vec2 size = u_rect.zw;
  vec2 halfBox = 0.5 * size * mix(0.7, 1.0, u_show);
  vec2 p = (uv - 0.5) * size;
  float d = sdRoundBox(p, halfBox, min(u_radius, min(halfBox.x, halfBox.y)));
  float mask = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
  if (mask <= 0.0) discard;

  vec2 f = (uv - 0.5) / u_mag + 0.5 + u_shift;
  vec2 pxToUv = 1.0 / (size * u_mag);

  // Zoom motion blur, weighted toward the (current) edges so the centre
  // stays crisp while the picture pulls back.
  vec2 radial = p / max(halfBox, vec2(1.0));
  float streak = u_streak * smoothstep(0.35, 1.2, length(radial));

  vec4 color;
  if (u_focus + streak < 0.05) {
    color = sampleCover(f);
    if (u_split > 0.0) {
      // A hint of chromatic fringe where the lens bends the card the most.
      // Only on a sharp picture: splitting sharp red/blue taps off a
      // blurred green one would ring every edge in magenta and green.
      float amount = u_split * lensWeight * (screen.x - 0.5) * 2.0;
      vec2 o = vec2(amount * pxToUv.x, 0.0);
      color.r = sampleCover(f + o).r;
      color.b = sampleCover(f - o).b;
    }
  } else {
    // One kernel carries both blurs: a golden-angle (Vogel) spiral for the
    // focus blur plus a radial line for the zoom streak.
    float n = pixelNoise(gl_FragCoord.xy);
    vec2 dir = p / max(length(p), 1e-3);
    float angle = n * 2.0 * PI;
    color = vec4(0.0);
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i);
      angle += GOLDEN_ANGLE;
      float r = sqrt((fi + 0.5) / float(TAPS)) * u_focus;
      vec2 o = r * vec2(cos(angle), sin(angle)) + dir * streak * ((fi + n) / float(TAPS) - 0.5);
      color += sampleCover(f + o * pxToUv);
    }
    color /= float(TAPS);
  }

  // The texture is premultiplied, and so is the canvas.
  gl_FragColor = color * (mask * u_alpha);
}
`;
