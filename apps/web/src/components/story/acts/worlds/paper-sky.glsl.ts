/**
 * World 01's sky and its far sea, as GLSL: the same functions paint Paper
 * Tide's sky layer and the other side of the wormhole, so the view through
 * the wormhole is the world she arrives in. Linear colours (the caller
 * encodes). Needs GLSL_COMMON.
 *
 * The sky runs from ink at the zenith through brand blue to a warm cream
 * horizon, with one big yellow sun half sunk in the sea and the card back's
 * guilloche as thin wind lines. The sea is a field of navy card backs with
 * white borders, rolling, fading into the horizon haze. Far away the cards
 * become their average colour (the card back's own, measured), so the
 * pattern never shimmers.
 */
export const PAPER_SKY_GLSL = /* glsl */ `
uniform vec3 uPaperZenith;
uniform vec3 uPaperSky;
uniform vec3 uPaperLow;
uniform vec3 uPaperHorizon;
uniform vec3 uPaperSun;
uniform vec3 uPaperNavy;
uniform vec3 uPaperCardAvg;
uniform vec3 uPaperSunDir;
uniform sampler2D tPaperBack;

const float PAPER_SUN_R = 0.078;

// The sky's gradient alone (no sun): also the haze the sea fades into.
vec3 paperSkyBase(vec3 d) {
  float y = d.y;
  vec3 col = mix(uPaperHorizon, uPaperLow, smoothstep(0.0, 0.09, y));
  col = mix(col, uPaperSky, smoothstep(0.05, 0.3, y));
  return mix(col, uPaperZenith, smoothstep(0.3, 0.95, y));
}

vec3 paperSky(vec3 d, float time) {
  float y = d.y;
  vec3 col = paperSkyBase(d);
  vec3 sd = normalize(uPaperSunDir);
  float c = dot(d, sd);
  // The sun: a flat brand disc with a hot core, and a wide warm glow on the horizon.
  float ang = acos(clamp(c, -1.0, 1.0));
  float disc = 1.0 - smoothstep(PAPER_SUN_R - 0.002, PAPER_SUN_R + 0.002, ang);
  float core = 1.0 - smoothstep(0.0, PAPER_SUN_R * 0.9, ang);
  float glow = exp(-ang * 4.0) * 0.45 + exp(-ang * 14.0) * 0.5;
  vec2 flat0 = normalize(vec2(d.x, d.z) + 1e-5);
  vec2 sflat = normalize(vec2(sd.x, sd.z));
  float horizonGlow = exp(-abs(y) * 10.0) * pow(max(dot(flat0, sflat), 0.0), 4.0);
  col = mix(col, uPaperHorizon * 1.1, horizonGlow * 0.55);
  col += uPaperSun * glow * 0.3;
  col = mix(col, mix(uPaperSun, vec3(1.0, 0.97, 0.88), core * core * 0.55), disc * smoothstep(-0.004, 0.004, y + 0.001));
  // Guilloche wind: thin white lines of summed sines across the sky, drifting.
  float az = atan(d.x, -d.z);
  float lines = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float wave = 0.16 + 0.07 * fi + 0.025 * sin(az * (3.0 + fi) + time * (0.05 + 0.02 * fi) + fi * 2.1) + 0.012 * sin(az * 11.0 - time * 0.08 + fi);
    lines += exp(-abs(y - wave) * (520.0 - fi * 90.0)) * (0.55 - 0.12 * fi);
  }
  col = mix(col, vec3(1.0), clamp(lines, 0.0, 1.0) * smoothstep(0.02, 0.12, y) * 0.45);
  return col;
}

// The haze over the sea: the horizon's colour far away, bluer looking down.
vec3 paperHaze(vec3 d) {
  vec3 horizon = paperSkyBase(normalize(vec3(d.x, 0.0, d.z)));
  return mix(horizon, uPaperLow * 0.9, smoothstep(0.02, 0.4, -d.y));
}

// The sea's cards at a point on the water plane: the real card back, filtered by its own
// mipmaps (so far cards melt into the back's average colour, exactly like the near ones),
// in dark gaps between the cards.
vec3 paperCard(vec2 xz, float shade) {
  vec2 cell = vec2(0.62, 0.98);
  vec2 card = vec2(0.56, 0.94);
  vec2 q = (fract(xz / cell) - 0.5) * cell;
  vec2 uv = q / card + 0.5;
  vec2 gx = dFdx(xz) / card;
  vec2 gy = dFdy(xz) / card;
  vec3 back = textureGrad(tPaperBack, vec2(uv.x, 1.0 - uv.y), gx, -gy).rgb;
  // Inside the card or in the gap, softened by the pixel footprint.
  vec2 fw = max(abs(gx), abs(gy)) * card;
  vec2 e = abs(q) - card * 0.5;
  float inside = 1.0 - smoothstep(-fw.x - 1e-4, fw.x + 1e-4, max(e.x, e.y * fw.x / max(fw.y, 1e-4)));
  float cover = clamp(card.x * card.y / (cell.x * cell.y), 0.0, 1.0);
  vec3 gap = uPaperNavy * 0.32;
  float far = smoothstep(0.3, 1.2, max(fw.x / card.x, fw.y / card.y));
  vec3 col = mix(mix(gap, back, inside), mix(gap, back, cover), far);
  return col * (0.8 + 0.24 * shade);
}

// The far sea: the water plane y = 0 seen from 'eye' along 'd' (call when d.y < 0).
vec3 paperSea(vec3 eye, vec3 d, float time, float flow) {
  float t = -eye.y / min(d.y, -1e-4);
  vec3 hit = eye + d * t;
  vec2 xz = hit.xz + vec2(0.0, -flow);
  float swell = sin(xz.x * 0.11 + time * 0.7) * 0.5 + sin(xz.y * 0.07 - time * 0.5 + xz.x * 0.03) * 0.5;
  vec3 col = paperCard(xz, swell * 0.5 + 0.5);
  // Sky reflection and the sun's glitter path.
  vec3 r = reflect(d, vec3(0.0, 1.0, 0.0));
  float fres = pow(1.0 - abs(d.y), 5.0);
  col = mix(col, paperSky(r, time), 0.08 + 0.5 * fres);
  vec3 sd = normalize(uPaperSunDir);
  float sparkle = smoothstep(0.62, 0.92, vnoise(xz * vec2(2.1, 1.3) + vec2(time * 1.3, -time * 0.9)));
  float glitter = pow(max(dot(r, sd), 0.0), 180.0) * sparkle * (1.0 - smoothstep(0.04, 0.3, -d.y));
  col += uPaperSun * glitter * 1.6;
  // Haze toward the sky's own horizon colour (without the sun), so sea and sky meet without a line.
  vec3 haze = paperHaze(d);
  float fog = 1.0 - exp(-t * 0.0019);
  return mix(col, haze, clamp(fog * 1.1, 0.0, 1.0));
}

vec3 paperWorld(vec3 eye, vec3 d, float time, float flow) {
  if (d.y < -0.0005) return paperSea(eye, d, time, flow);
  return paperSky(d, time);
}
`;

/** The Paper Tide palette, brand derived (sRGB hex). `cardAvg` is the card back's average colour. */
export const PAPER_PALETTE = {
  zenith: 0x141a46,
  sky: 0x3a6dc5,
  low: 0x9cbbea,
  horizon: 0xfbe6b8,
  sun: 0xf7bf33,
  navy: 0x2d318a,
  cardAvg: 0x5e5996,
} as const;
