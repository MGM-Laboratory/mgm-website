/**
 * World 01's sky and its far sea, as GLSL: the same functions paint Paper
 * Tide's sky layer and the other side of the wormhole, so the view through
 * the wormhole is the world she arrives in. Linear colours (the caller
 * encodes). Needs GLSL_COMMON.
 *
 * The sky runs from ink at the zenith through brand blue to a warm cream
 * horizon, with one big yellow sun half sunk in the sea and the card back's
 * guilloche as thin wind lines. The sea is a field of navy card backs with
 * white borders, rolling, fading into the horizon haze.
 */
export const PAPER_SKY_GLSL = /* glsl */ `
uniform vec3 uPaperZenith;
uniform vec3 uPaperSky;
uniform vec3 uPaperLow;
uniform vec3 uPaperHorizon;
uniform vec3 uPaperSun;
uniform vec3 uPaperNavy;
uniform vec3 uPaperSunDir;

vec3 paperSky(vec3 d, float time) {
  float y = d.y;
  vec3 col = mix(uPaperHorizon, uPaperLow, smoothstep(0.0, 0.1, y));
  col = mix(col, uPaperSky, smoothstep(0.06, 0.32, y));
  col = mix(col, uPaperZenith, smoothstep(0.32, 0.95, y));
  vec3 sd = normalize(uPaperSunDir);
  float c = dot(d, sd);
  // The sun: a flat brand disc with a hot core, and a wide warm glow on the horizon.
  float ang = acos(clamp(c, -1.0, 1.0));
  float disc = 1.0 - smoothstep(0.118, 0.122, ang);
  float core = 1.0 - smoothstep(0.0, 0.11, ang);
  float glow = exp(-ang * 3.2) * 0.55 + exp(-ang * 9.0) * 0.5;
  float horizonGlow = exp(-abs(y) * 9.0) * pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sd.x, 0.0, sd.z))), 0.0), 3.0);
  col = mix(col, uPaperHorizon * 1.15, horizonGlow * 0.6);
  col += uPaperSun * glow * 0.35;
  col = mix(col, mix(uPaperSun, vec3(1.0, 0.97, 0.88), core * core * 0.6), disc);
  // Guilloche wind: thin white lines of summed sines across the sky, drifting.
  float az = atan(d.x, -d.z);
  float lines = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float wave = 0.16 + 0.07 * fi + 0.025 * sin(az * (3.0 + fi) + time * (0.05 + 0.02 * fi) + fi * 2.1) + 0.012 * sin(az * 11.0 - time * 0.08 + fi);
    lines += exp(-abs(y - wave) * (520.0 - fi * 90.0)) * (0.55 - 0.12 * fi);
  }
  col = mix(col, vec3(1.0), clamp(lines, 0.0, 1.0) * smoothstep(0.02, 0.12, y) * 0.5);
  return col;
}

// One card cell of the sea at a point on the water plane: navy back, white border, a small star.
vec3 paperCard(vec2 xz, float shade) {
  vec2 cell = vec2(0.62, 0.98);
  vec2 g = xz / cell;
  vec2 f = fract(g) - 0.5;
  vec2 e = abs(f) * cell;
  float border = smoothstep(0.255, 0.27, max(e.x / cell.x * 0.98, e.y / cell.y * 0.98) * 1.0);
  float gap = smoothstep(0.47, 0.49, max(abs(f.x), abs(f.y)));
  vec3 navy = uPaperNavy * (0.75 + 0.35 * shade);
  vec3 col = mix(navy, vec3(0.92), border * 0.55);
  return mix(col, uPaperNavy * 0.35, gap);
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
  col = mix(col, paperSky(r, time), 0.12 + 0.6 * fres);
  vec3 sd = normalize(uPaperSunDir);
  float glitter = pow(max(dot(r, sd), 0.0), 220.0) * (0.6 + 0.4 * sin(xz.x * 3.0 + xz.y * 2.0 + time * 4.0));
  col += uPaperSun * glitter * 1.4;
  float fog = 1.0 - exp(-t * 0.0045);
  return mix(col, mix(uPaperHorizon, uPaperLow, 0.35), clamp(fog * 1.15, 0.0, 1.0));
}

vec3 paperWorld(vec3 eye, vec3 d, float time, float flow) {
  if (d.y < -0.002) return paperSea(eye, d, time, flow);
  return paperSky(d, time);
}
`;

/** The Paper Tide palette, brand derived (sRGB hex). */
export const PAPER_PALETTE = {
  zenith: 0x141a46,
  sky: 0x3a6dc5,
  low: 0x9cbbea,
  horizon: 0xfbe6b8,
  sun: 0xf7bf33,
  navy: 0x2d318a,
} as const;
